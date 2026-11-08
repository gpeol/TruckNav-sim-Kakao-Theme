// TruckersMP SDK nearby-player snapshot producer. No player identity leaves the game.
#include <TruckersMP/TruckersMP.hxx>
#include <windows.h>
#include <sddl.h>

#include <cmath>
#include <cstdint>
#include <set>
#include <memory>
#include <string>
#include <vector>

namespace {
constexpr std::uint32_t kMagic = 0x504d544e; // NTMP
constexpr std::uint32_t kVersion = 1;
constexpr std::size_t kMaxPlayers = 1024;
constexpr ULONGLONG kRefreshMs = 250;

struct Point { double x, z; };
struct SharedSnapshot {
    volatile LONG sequence;
    std::uint32_t magic;
    std::uint32_t version;
    std::uint32_t count;
    std::uint32_t connected;
    std::uint32_t reserved;
    std::uint64_t tick;
    Point players[kMaxPlayers];
};
static_assert(offsetof(SharedSnapshot, tick) == 24);
static_assert(offsetof(SharedSnapshot, players) == 32);

std::unique_ptr<TruckersMP::Session> session;
std::set<TruckersMP::Int32> players;
HANDLE mapping = nullptr;
SharedSnapshot* snapshot = nullptr;
ULONGLONG lastRefresh = 0;
bool connected = false;

bool openSnapshot() {
    // Explicit user SID permits a non-elevated reader when the game is elevated.
    HANDLE token = nullptr;
    if (!OpenProcessToken(GetCurrentProcess(), TOKEN_QUERY, &token)) return false;
    DWORD bytes = 0;
    GetTokenInformation(token, TokenUser, nullptr, 0, &bytes);
    std::vector<BYTE> user(bytes);
    if (!bytes || !GetTokenInformation(token, TokenUser, user.data(), bytes, &bytes)) {
        CloseHandle(token); return false;
    }
    CloseHandle(token);
    LPWSTR sid = nullptr;
    if (!ConvertSidToStringSidW(reinterpret_cast<TOKEN_USER*>(user.data())->User.Sid, &sid)) return false;
    const std::wstring acl = L"D:P(A;;GA;;;OW)(A;;GA;;;SY)(A;;GR;;;" + std::wstring(sid) + L")";
    LocalFree(sid);
    PSECURITY_DESCRIPTOR descriptor = nullptr;
    if (!ConvertStringSecurityDescriptorToSecurityDescriptorW(
            acl.c_str(), SDDL_REVISION_1, &descriptor, nullptr)) return false;
    SECURITY_ATTRIBUTES attributes{sizeof(attributes), descriptor, FALSE};
    SetLastError(ERROR_SUCCESS);
    mapping = CreateFileMappingW(INVALID_HANDLE_VALUE, &attributes, PAGE_READWRITE, 0,
                                 sizeof(SharedSnapshot), L"Local\\TruckNavTMPNearbyV1");
    const DWORD error = GetLastError();
    LocalFree(descriptor);
    if (!mapping || error == ERROR_ALREADY_EXISTS) {
        if (mapping) CloseHandle(mapping);
        mapping = nullptr;
        return false;
    }
    snapshot = static_cast<SharedSnapshot*>(MapViewOfFile(mapping, FILE_MAP_WRITE, 0, 0, sizeof(SharedSnapshot)));
    if (!snapshot) { CloseHandle(mapping); mapping = nullptr; return false; }
    return true;
}

void publish() {
    if (!snapshot) return;
    Point points[kMaxPlayers];
    std::uint32_t count = 0;
    auto local = session->Player().GetLocalPlayer();
    const auto localId = local ? local->GetPlayerID() : std::nullopt;
    if (connected && localId) {
        for (auto it = players.begin(); it != players.end();) {
            const auto id = *it;
            const auto player = session->Player().GetPlayerByID(id);
            if (!player) { it = players.erase(it); continue; }
            ++it;
            if (id == *localId || count == kMaxPlayers) continue;
            const auto vehicle = player ? player->GetVehicle() : std::nullopt;
            const auto placement = vehicle ? vehicle->GetPlacement() : std::nullopt;
            if (!placement) continue;
            const double x = placement->position.x;
            const double z = placement->position.z;
            if (!std::isfinite(x) || !std::isfinite(z) || std::abs(x) > 100000 || std::abs(z) > 100000) continue;
            points[count++] = {x, z};
        }
    }
    InterlockedIncrement(&snapshot->sequence);
    snapshot->magic = kMagic;
    snapshot->version = kVersion;
    snapshot->count = count;
    snapshot->connected = connected && localId ? 1 : 0;
    snapshot->tick = GetTickCount64();
    for (std::uint32_t i = 0; i < count; ++i) snapshot->players[i] = points[i];
    MemoryBarrier();
    InterlockedIncrement(&snapshot->sequence);
}

void seed() {
    players.clear();
    if (const auto all = session->Player().GetAllPlayers()) {
        for (const auto& player : *all) if (const auto id = player.GetPlayerID()) players.insert(*id);
    }
}

void closeSnapshot() {
    if (snapshot) { UnmapViewOfFile(snapshot); snapshot = nullptr; }
    if (mapping) { CloseHandle(mapping); mapping = nullptr; }
}
} // namespace

TMP_EXPORT bool TMP_API truckersmp_init(const TruckersMP_Host* host, TruckersMP_PluginDesc* desc) {
    TruckersMP::PluginInfo info;
    info.m_name = "TruckNav Nearby";
    info.m_author = "TruckNav";
    info.m_version = "1.0.0";
    info.m_description = "Read-only nearby vehicle positions for TruckNav.";
    TruckersMP::FillPluginDesc(desc, info);
    session = TruckersMP::Session::Create(host);
    if (!session || !session->Network().IsAvailable() || !session->Player().IsAvailable() ||
        !session->Vehicle().IsAvailable() || !session->Render().IsAvailable() || !openSnapshot()) {
        session.reset(); closeSnapshot(); return false;
    }
    connected = session->Network().IsConnected().value_or(false);
    if (connected) seed();
    session->Network().OnConnected.Register([] { connected = true; seed(); lastRefresh = 0; });
    session->Network().OnDisconnected.Register([] { connected = false; players.clear(); publish(); });
    session->Player().OnStreamIn.Register([](TruckersMP::PlayerStreamInEvent& event) {
        const auto player = event.GetPlayer();
        if (const auto id = player.GetPlayerID()) players.insert(*id);
    });
    session->Player().OnStreamOut.Register([](TruckersMP::PlayerStreamOutEvent& event) {
        if (const auto id = event.GetPlayer().GetPlayerID()) players.erase(*id);
    });
    session->Render().OnPreRender.Register([] {
        const auto now = GetTickCount64();
        if (now - lastRefresh < kRefreshMs) return;
        lastRefresh = now;
        publish();
    });
    publish();
    return true;
}

TMP_EXPORT void TMP_API truckersmp_shutdown() {
    connected = false;
    players.clear();
    if (session) publish();
    session.reset();
    closeSnapshot();
}
