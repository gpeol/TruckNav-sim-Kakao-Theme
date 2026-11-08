import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

test('waypoint copies must agree in either order and follow the physical route', {skip:process.platform !== 'win32'}, () => {
    const script = fileURLToPath(new URL('../scripts/ets2-route-validation.ps1', import.meta.url)).replaceAll("'", "''");
    const code = `
      $ErrorActionPreference = 'Stop'
      . '${script}'
      $nodes = [long[]]@(10,20,30,40)
      $points = [System.Collections.Generic.List[object]]::new()
      $points.Add(@(1,1)); $points.Add(@(2,2)); $points.Add(@(3,3)); $points.Add(@(4,4))
      function Check([long[]]$a,[long[]]$b) {
        $r = Resolve-VerifiedWaypoints -First $a -Second $b -RouteNodes $nodes -RoutePoints $points.ToArray()
        if ($null -eq $r) { return 'invalid' }
        return (($r.waypoints | ForEach-Object { $_[0] }) -join ',')
      }
      @{
        forward = Check @(20,40) @(20,40)
        reverseSecond = Check @(20,40) @(40,20)
        reverseFirst = Check @(40,20) @(20,40)
        mismatch = Check @(20,40) @(30,40)
        wrongOrder = Check @(40,20) @(40,20)
        wrongEnd = Check @(10,20) @(10,20)
        empty = Check @() @()
      } | ConvertTo-Json -Compress
    `;
    const result = spawnSync('powershell.exe',['-NoProfile','-NonInteractive','-Command',code],{encoding:'utf8',windowsHide:true});
    assert.equal(result.status,0,result.stderr);
    assert.deepEqual(JSON.parse(result.stdout), {
        forward:'2,4', reverseSecond:'2,4', reverseFirst:'2,4', mismatch:'invalid',
        wrongOrder:'invalid', wrongEnd:'invalid', empty:'4',
    });
});
