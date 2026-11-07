// Exercises the exact mapping producer against the PowerShell reader without a game.
#include "../../plugins/tmp-nearby/nearby.cxx"
#include <cstdio>

int main() {
    if (!openSnapshot()) return 1;
    InterlockedIncrement(&snapshot->sequence);
    snapshot->magic = kMagic;
    snapshot->version = kVersion;
    snapshot->connected = 1;
    snapshot->count = 2;
    snapshot->tick = GetTickCount64();
    snapshot->players[0] = {123.25, -456.75};
    snapshot->players[1] = {-100, 200};
    InterlockedIncrement(&snapshot->sequence);
    std::puts("ready");
    std::fflush(stdout);
    Sleep(10000);
    closeSnapshot();
    return 0;
}
