param([switch]$Diagnostic, [int]$ParentProcessId = 0)
# Experimental, read-only route source for the explicitly verified ETS2 build below.
# It opens no network port and never writes to the game process.
# Route structure reference: ETS2LA/plugin, Copyright (c) 2024 Dario Wouters,
# MIT license. See licenses/ETS2LA-plugin-MIT.txt for the full notice.
# https://github.com/ETS2LA/plugin/tree/8a78f1509445278ce4448ae150c75121becd1383
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'ets2-route-validation.ps1')
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public static class TruckNavGameReader {
  [DllImport("kernel32.dll", SetLastError=true)] public static extern IntPtr OpenProcess(uint access, bool inherit, int pid);
  [DllImport("kernel32.dll", SetLastError=true)] public static extern bool ReadProcessMemory(IntPtr process, IntPtr address, byte[] buffer, UIntPtr size, out UIntPtr count);
  [DllImport("kernel32.dll")] public static extern bool CloseHandle(IntPtr handle);
}
'@

$verifiedHash = 'A938CB388121F9B884A2E1B0F048C230A7BC19638EF6D641A70775F8C7FEA956'
$expectedControllerCode = '488B05B927DA02488BF2488BF9488B80B03100004885C074'
$expectedGpsCode = '488D88284100004885C974EC488B01488D542440FF90A000'
$game = $null
$hashCache = @{}
$handle = [IntPtr]::Zero

function Close-Game {
  if ($script:handle -ne [IntPtr]::Zero) { [void][TruckNavGameReader]::CloseHandle($script:handle) }
  $script:handle = [IntPtr]::Zero
  $script:game = $null
}
function Read-GameBytes([long]$address, [int]$length) {
  if ($address -le 65536 -or $length -le 0 -or $length -gt 200000) { throw 'Invalid read bounds.' }
  $buffer = [byte[]]::new($length)
  $count = [UIntPtr]::Zero
  if (-not [TruckNavGameReader]::ReadProcessMemory($script:handle, [IntPtr]::new($address), $buffer, [UIntPtr]::new([uint64]$length), [ref]$count) -or $count.ToUInt64() -ne $length) { throw 'Read failed.' }
  return ,$buffer
}
function Bytes-Hex([byte[]]$bytes) { return [BitConverter]::ToString($bytes).Replace('-', '') }
function File-Hash([string]$path) {
  $info = Get-Item -LiteralPath $path
  $cacheKey = "$path|$($info.Length)|$($info.LastWriteTimeUtc.Ticks)"
  if ($script:hashCache.ContainsKey($cacheKey)) { return $script:hashCache[$cacheKey] }
  $file = [System.IO.File]::OpenRead($path)
  $hasher = [System.Security.Cryptography.SHA256]::Create()
  try { $result = Bytes-Hex ($hasher.ComputeHash($file)); $script:hashCache[$cacheKey] = $result; return $result } finally { $hasher.Dispose(); $file.Dispose() }
}
function Connect-Game {
  $gameProcesses = @(Get-Process -Name eurotrucks2 -ErrorAction SilentlyContinue)
  if ($gameProcesses.Count -ne 1) { throw 'Game unavailable.' }
  $candidate = $gameProcesses[0]
  if ($candidate.MainModule.FileVersionInfo.ProductVersion -ne '1.62.1' -or (File-Hash $candidate.MainModule.FileName) -ne $verifiedHash) { throw 'Unsupported game build.' }
  $script:handle = [TruckNavGameReader]::OpenProcess(0x1010, $false, $candidate.Id)
  if ($script:handle -eq [IntPtr]::Zero) { throw 'Read-only access unavailable.' }
  $base = $candidate.MainModule.BaseAddress.ToInt64()
  if ((Bytes-Hex (Read-GameBytes ($base + 0x972770) 24)) -ne $expectedControllerCode -or (Bytes-Hex (Read-GameBytes ($base + 0x5dfc08) 24)) -ne $expectedGpsCode) { throw 'Loaded game code does not match the verified build.' }
  $script:game = $candidate
}
function Read-Route {
  if ($null -eq $script:game -or $script:game.HasExited) { Close-Game; Connect-Game }
  $base = $script:game.MainModule.BaseAddress.ToInt64()
  $controller = [BitConverter]::ToInt64((Read-GameBytes ($base + 0x3714f30) 8), 0)
  $taskAddress = $controller + 0x4128 + 0x28
  $task = [BitConverter]::ToInt64((Read-GameBytes $taskAddress 8), 0)
  if ($task -eq 0) { return @{state='inactive'} }
  $header = Read-GameBytes ($task + 0x50) 32
  $items = [BitConverter]::ToInt64($header, 8)
  $count = [BitConverter]::ToUInt64($header, 16)
  $capacity = [BitConverter]::ToUInt64($header, 24)
  if ($count -lt 2 -or $count -gt 6000 -or $capacity -lt $count -or $capacity -gt 100000) { throw 'Invalid route array.' }
  $route = Read-GameBytes $items ([int]($count * 32))
  $points = [System.Collections.Generic.List[object]]::new()
  $nodes = [System.Collections.Generic.List[object]]::new()
  $nodeAddresses = [System.Collections.Generic.List[long]]::new()
  $previous = [single]::PositiveInfinity
  for ($i=0; $i -lt $count; $i++) {
    $offset = $i * 32
    $distance = [BitConverter]::ToSingle($route, $offset + 20)
    $time = [BitConverter]::ToSingle($route, $offset + 24)
    if ([single]::IsNaN($distance) -or [single]::IsInfinity($distance) -or $distance -lt 0 -or $distance -gt ($previous + 1) -or [single]::IsNaN($time) -or [single]::IsInfinity($time) -or $time -lt 0) { throw 'Invalid route metrics.' }
    $address = [BitConverter]::ToInt64($route, $offset)
    $node = Read-GameBytes $address 56
    if ([BitConverter]::ToUInt64($node, 48) -eq 0) { throw 'Invalid route node.' }
    $nodes.Add(@($address, (Bytes-Hex $node)))
    $nodeAddresses.Add($address)
    $points.Add(@(([BitConverter]::ToInt32($node, 0) / 256.0), ([BitConverter]::ToInt32($node, 8) / 256.0), $distance))
    $previous = $distance
  }
  if ([BitConverter]::ToInt64((Read-GameBytes $taskAddress 8), 0) -ne $task -or (Bytes-Hex (Read-GameBytes ($task + 0x50) 32)) -ne (Bytes-Hex $header) -or (Bytes-Hex (Read-GameBytes $items ([int]($count * 32)))) -ne (Bytes-Hex $route)) { throw 'Route changed while reading.' }
  foreach ($node in $nodes) {
    if ((Bytes-Hex (Read-GameBytes $node[0] 56)) -ne $node[1]) { throw 'Route node changed while reading.' }
  }
  # Both copies must agree, and every waypoint must appear in order on the
  # validated physical route. Otherwise the application receives no route.
  $headers = @((Read-GameBytes ($controller + 0x4128 + 0x208) 32), (Read-GameBytes ($controller + 0x4128 + 0x258) 32))
  $waypointLists = [System.Collections.Generic.List[object]]::new()
  foreach ($waypointHeader in $headers) {
    $waypointCount = [BitConverter]::ToUInt64($waypointHeader, 16)
    $waypointCapacity = [BitConverter]::ToUInt64($waypointHeader, 24)
    if ($waypointCount -gt 50 -or $waypointCapacity -lt $waypointCount -or $waypointCapacity -gt 10000) { throw 'Invalid waypoint array.' }
    if ($waypointCount -eq 0) { $waypointLists.Add(@()); continue }
    $waypointPointer = [BitConverter]::ToInt64($waypointHeader, 8)
    $waypointBytes = Read-GameBytes $waypointPointer ([int]($waypointCount * 24))
    $addresses = [System.Collections.Generic.List[long]]::new()
    for ($i=0; $i -lt $waypointCount; $i++) { $addresses.Add([BitConverter]::ToInt64($waypointBytes, ($i * 24) + 8)) }
    if ((Bytes-Hex (Read-GameBytes $waypointPointer ([int]($waypointCount * 24)))) -ne (Bytes-Hex $waypointBytes)) { throw 'Waypoints changed while reading.' }
    $waypointLists.Add(@($addresses.ToArray()))
  }
  if ((Bytes-Hex (Read-GameBytes ($controller + 0x4128 + 0x208) 32)) -ne (Bytes-Hex $headers[0]) -or (Bytes-Hex (Read-GameBytes ($controller + 0x4128 + 0x258) 32)) -ne (Bytes-Hex $headers[1])) { throw 'Waypoints changed while reading.' }
  $verified = Resolve-VerifiedWaypoints -First ([long[]]$waypointLists[0]) -Second ([long[]]$waypointLists[1]) -RouteNodes $nodeAddresses.ToArray() -RoutePoints $points.ToArray()
  if ($null -eq $verified) { throw 'Waypoints do not match the physical route.' }
  $waypoints = $verified.waypoints
  if ([BitConverter]::ToInt64((Read-GameBytes $taskAddress 8), 0) -ne $task -or (Bytes-Hex (Read-GameBytes ($task + 0x50) 32)) -ne (Bytes-Hex $header) -or (Bytes-Hex (Read-GameBytes $items ([int]($count * 32)))) -ne (Bytes-Hex $route)) { throw 'Route changed while reading waypoints.' }
  return @{state='active'; points=$points; waypoints=$waypoints}
}

try {
  while ($true) {
    if ($ParentProcessId -gt 0 -and -not (Get-Process -Id $ParentProcessId -ErrorAction SilentlyContinue)) { break }
    try { $snapshot = Read-Route } catch {
      if ($Diagnostic) { [Console]::Error.WriteLine($_.Exception.Message) }
      Close-Game
      $snapshot = @{state='unavailable'}
    }
    [Console]::Out.WriteLine(($snapshot | ConvertTo-Json -Depth 5 -Compress))
    [Console]::Out.Flush()
    Start-Sleep -Milliseconds 1000
  }
} finally { Close-Game }
