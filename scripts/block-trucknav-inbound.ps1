[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
$resultFile = Join-Path $env:TEMP 'trucknav-inbound-block-result.txt'
$created = @()

function Test-LoopbackPort([int]$Port) {
    $client = [System.Net.Sockets.TcpClient]::new()
    try {
        $task = $client.ConnectAsync('127.0.0.1', $Port)
        return $task.Wait(2000) -and $client.Connected
    } catch { return $false } finally { $client.Dispose() }
}

try {
    $identity = [System.Security.Principal.WindowsIdentity]::GetCurrent()
    $principal = [System.Security.Principal.WindowsPrincipal]::new($identity)
    if (-not $principal.IsInRole([System.Security.Principal.WindowsBuiltInRole]::Administrator)) {
        throw 'Administrator rights are required.'
    }
    $repositoryRoot = Split-Path -Parent $PSScriptRoot
    $rules = @(
        @{ Name='TruckNavPreview-BlockDirectMapApi'; Program='C:\Program Files\TruckNav\TruckNav.exe'; Port='8628' },
        @{ Name='TruckNavPreview-BlockDirectInstalledTelemetry'; Program='C:\Program Files\TruckNav\resources\bin\TruckNavTelemetry.exe'; Port='30001' },
        @{ Name='TruckNavPreview-BlockDirectDevTelemetry'; Program=(Join-Path $repositoryRoot 'electron\bin\TruckNavTelemetry.exe'); Port='30001' }
    )
    foreach ($rule in $rules) {
        if (Get-NetFirewallRule -Name $rule.Name -ErrorAction SilentlyContinue) { throw "Rule already exists: $($rule.Name)" }
        if (-not (Test-Path -LiteralPath $rule.Program -PathType Leaf)) { throw "Program not found: $($rule.Program)" }
    }
    if (-not (Test-LoopbackPort 8628) -or -not (Test-LoopbackPort 30001)) {
        throw 'The existing local map or telemetry service is unavailable. No rules were changed.'
    }
    foreach ($rule in $rules) {
        New-NetFirewallRule -Name $rule.Name -DisplayName "TruckNav preview: block direct $($rule.Port)" `
            -Description 'Blocks direct inbound network access; the local Tailscale preview gateway remains available.' `
            -Direction Inbound -Action Block -Enabled True -Profile Any -Program $rule.Program `
            -Protocol TCP -LocalPort $rule.Port | Out-Null
        $created += $rule.Name
    }
    if (-not (Test-LoopbackPort 8628) -or -not (Test-LoopbackPort 30001)) {
        throw 'The rules interrupted a required loopback service; rolling them back.'
    }
    'SUCCESS: Three program-specific TCP block rules were created; both loopback services still respond.' |
        Set-Content -LiteralPath $resultFile -Encoding UTF8
} catch {
    foreach ($name in $created) { Remove-NetFirewallRule -Name $name -ErrorAction SilentlyContinue }
    ('ERROR: ' + $_.Exception.Message) | Set-Content -LiteralPath $resultFile -Encoding UTF8
    throw
}
