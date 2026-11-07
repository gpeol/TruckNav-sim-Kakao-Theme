// A minimal SDK host exercises initialization, membership and connection events.
#include "../../plugins/tmp-nearby/nearby.cxx"
#include <cstdio>
#include <cstdlib>
#include <utility>

static std::map<std::uint64_t, std::pair<TruckersMP_EventFn, void*>> listeners;
static TruckersMP_Core core{};
static TruckersMP_Network network{};
static TruckersMP_Players playerTable{};
static TruckersMP_PlayerHandle playerHandle{};
static TruckersMP_Vehicle vehicleTable{};
static TruckersMP_Render renderTable{};

static TruckersMP_EResult TMP_API add(TruckersMP_PluginContext*, uint64_t id, TruckersMP_EventFn fn, void* context) {
    listeners[id] = {fn, context}; return TruckersMP_Result_Ok;
}
static TruckersMP_EResult TMP_API remove(TruckersMP_PluginContext*, uint64_t id, TruckersMP_EventFn, void*) {
    listeners.erase(id); return TruckersMP_Result_Ok;
}
static TruckersMP_EResult TMP_API declareVersion(TruckersMP_PluginContext*, uint32_t) { return TruckersMP_Result_Ok; }
static void TMP_API freeList(TruckersMP_PluginContext*, void* ptr) { std::free(ptr); }
static bool TMP_API isConnected(TruckersMP_PluginContext*, bool* out) { *out = true; return true; }
static bool TMP_API localPlayer(TruckersMP_PluginContext*, TruckersMP_Player_Handle* out) { out->m_value = 1; return true; }
static bool TMP_API allPlayers(TruckersMP_PluginContext*, TruckersMP_List* out) {
    auto p = static_cast<TruckersMP_Player_Handle*>(std::malloc(2 * sizeof(TruckersMP_Player_Handle)));
    p[0].m_value = 1; p[1].m_value = 2;
    *out = {p, 2, sizeof(TruckersMP_Player_Handle)}; return true;
}
static bool TMP_API getVehicle(TruckersMP_PluginContext*, TruckersMP_Player_Handle self, TruckersMP_Vehicle_Handle* out) {
    out->m_value = self.m_value; return true;
}
static bool TMP_API getPlacement(TruckersMP_PluginContext*, TruckersMP_Vehicle_Handle self, TruckersMP_Placement* out) {
    *out = {}; out->position.x = static_cast<double>(self.m_value * 100); out->position.z = -50; return true;
}
static const void* TMP_API getApi(TruckersMP_PluginContext*, uint64_t id) {
    if (id == TRUCKERSMP_API_CORE) return &core;
    if (id == TRUCKERSMP_API_NETWORK) return &network;
    if (id == TRUCKERSMP_API_PLAYERS) return &playerTable;
    if (id == TRUCKERSMP_API_PLAYER_HANDLE) return &playerHandle;
    if (id == TRUCKERSMP_API_VEHICLE) return &vehicleTable;
    if (id == TRUCKERSMP_API_RENDER) return &renderTable;
    return nullptr;
}
static void fire(uint64_t id, void* data = nullptr, uint32_t size = 0) {
    if (!listeners.count(id)) { std::fprintf(stderr, "Missing listener: %llu\n", static_cast<unsigned long long>(id)); std::abort(); }
    const auto listener = listeners.at(id);
    listener.first(listener.second, id, data, size);
}
int main() {
    core.AddListener = add; core.RemoveListener = remove;
    network.IsConnected = isConnected; playerTable.GetLocalPlayer = localPlayer;
    playerTable.GetAllPlayers = allPlayers; playerHandle.GetVehicle = getVehicle;
    vehicleTable.GetPlacement = getPlacement;
    TruckersMP_Host host{}; host.m_size = sizeof(host); host.DeclareVersion = declareVersion;
    host.GetApi = getApi; host.Free = freeList;
    TruckersMP_PluginDesc desc{}; desc.m_size = sizeof(desc);
    const bool initialized = truckersmp_init(&host, &desc);
    if (!initialized) return 1;
    if (snapshot->connected != 1 || snapshot->count != 1 || snapshot->players[0].x != 200) return 2;
    TruckersMP_Evt_PlayerStreamIn enter{{3}};
    fire(TRUCKERSMP_EVT_PLAYER_STREAM_IN, &enter, sizeof(enter));
    lastRefresh = 0; fire(TRUCKERSMP_EVT_RENDER_PRE_RENDER);
    if (snapshot->count != 2 || snapshot->players[1].x != 300) return 3;
    TruckersMP_Evt_PlayerStreamOut leave{{2}};
    fire(TRUCKERSMP_EVT_PLAYER_STREAM_OUT, &leave, sizeof(leave));
    lastRefresh = 0; fire(TRUCKERSMP_EVT_RENDER_PRE_RENDER);
    if (snapshot->count != 1 || snapshot->players[0].x != 300) return 4;
    fire(TRUCKERSMP_EVT_NETWORK_DISCONNECTED);
    if (snapshot->connected != 0 || snapshot->count != 0) return 5;
    truckersmp_shutdown();
    if (!listeners.empty()) return 6;
    return 0;
}
