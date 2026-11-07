$ErrorActionPreference = 'Stop'
Add-Type -TypeDefinition @'
using System;
using System.IO.MemoryMappedFiles;
using System.Runtime.InteropServices;

public static class TruckNavNearbyReader {
    [DllImport("kernel32.dll")] private static extern ulong GetTickCount64();
    public sealed class Snapshot {
        public string state;
        public double[][] vehicles;
    }
    public static Snapshot Read() {
        using (var map = MemoryMappedFile.OpenExisting(@"Local\TruckNavTMPNearbyV1", MemoryMappedFileRights.Read))
        using (var view = map.CreateViewAccessor(0, 16416, MemoryMappedFileAccess.Read)) {
            int first = view.ReadInt32(0);
            if ((first & 1) != 0) throw new InvalidOperationException();
            uint magic = view.ReadUInt32(4), version = view.ReadUInt32(8), count = view.ReadUInt32(12);
            uint connected = view.ReadUInt32(16);
            ulong tick = view.ReadUInt64(24), now = GetTickCount64();
            if (magic != 0x504d544e || version != 1 || count > 1024 || connected > 1 || tick > now || now - tick > 2000)
                throw new InvalidOperationException();
            var vehicles = new double[count][];
            for (int i = 0; i < count; i++) {
                double x = view.ReadDouble(32 + i * 16), z = view.ReadDouble(40 + i * 16);
                if (double.IsNaN(x) || double.IsInfinity(x) || Math.Abs(x) > 100000 ||
                    double.IsNaN(z) || double.IsInfinity(z) || Math.Abs(z) > 100000)
                    throw new InvalidOperationException();
                vehicles[i] = new double[] { x, z };
            }
            int last = view.ReadInt32(0);
            if (first != last || (last & 1) != 0 || (connected == 0 && count != 0))
                throw new InvalidOperationException();
            return new Snapshot { state = connected == 1 ? "active" : "inactive", vehicles = vehicles };
        }
    }
}
'@

while ($true) {
    try { $data = [TruckNavNearbyReader]::Read() }
    catch { $data = @{ state = 'unavailable'; vehicles = @() } }
    [Console]::Out.WriteLine((ConvertTo-Json -InputObject $data -Depth 4 -Compress))
    Start-Sleep -Milliseconds 250
}
