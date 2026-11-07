# TruckNav nearby players plugin

This read-only Windows x64 TruckersMP SDK plugin publishes only anonymous X/Z
positions for players streamed into the current client. It does not write to
the game or open a network port. The session-local shared mapping is restricted
to its Windows owner and SYSTEM, is discarded on exit, and carries a monotonic
timestamp so readers reject old data. If the mapping already exists, plugin
initialization fails rather than attaching to it.

Build with the TruckersMP GameClientSDK checkout at commit
`bee3b9e2b314c2b47fee9f94635e9945a71924e1` (MIT, Copyright 2026 TruckersMP):

```powershell
cmake -S plugins/tmp-nearby -B build/tmp-nearby -A x64 -DTRUCKERSMP_SDK_DIR=C:/path/to/GameClientSDK
cmake --build build/tmp-nearby --config Release
```

TruckersMP loads its SDK plugins from the game's `bin/win_x64/plugins` folder
after the player accepts the telemetry disclaimer. Installing or updating the
plugin requires a game restart or an officially supported plugin reload. The
plugin needs the TruckersMP client SDK; standard single-player telemetry does
not contain these streamed player positions.
