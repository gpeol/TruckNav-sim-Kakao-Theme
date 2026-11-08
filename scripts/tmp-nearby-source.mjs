import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

// Read-only local shared memory. The helper has no listener or input channel.
export function createTmpNearbySource({ spawnFn = spawn, now = Date.now, testMappingName = '' } = {}) {
    if (testMappingName && !/^Local\\TruckNavTMPNearbyTest_[a-z0-9]+$/.test(testMappingName)) throw new Error('Invalid test mapping name');
    const script = fileURLToPath(new URL('./tmp-nearby-reader.ps1', import.meta.url));

    let pending = '';
    let current = null;
    let updatedAt = 0;
    let stopped = false;
    const invalidate = () => { current = null; updatedAt = 0; };
    let child = null;
    let nextStart = 0;
    let retryDelay = 5000;
    const backoff = () => { invalidate(); nextStart = now() + retryDelay; retryDelay = Math.min(retryDelay * 2, 60000); };
    function start() {
    if (stopped || child || now() < nextStart) return;
    pending = '';
    let owned;
    try { owned = spawnFn('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', script, '-ParentProcessId', String(process.pid), ...(testMappingName ? ['-TestMappingName', testMappingName] : [])], { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] }); }
    catch { backoff(); return; }
    child = owned;
    let reported = false;
    child.stderr?.on('data', data => {
        if (!reported) { reported = true; console.warn('[TruckNav] Nearby reader:', String(data).split(/\r?\n/, 1)[0].slice(0, 300)); }
    });
    child.stdout.setEncoding('utf8');
    child.stdout.on('data', chunk => {
        if (stopped || child !== owned) return;
        pending += chunk;
        if (pending.length > 100_000) { invalidate(); child?.kill(); return; }
        let end;
        while ((end = pending.indexOf('\n')) !== -1) {
            const line = pending.slice(0, end);
            pending = pending.slice(end + 1);
            try {
                const next = JSON.parse(line);
                if (!next || !['active', 'inactive', 'unavailable'].includes(next.state) ||
                    !Array.isArray(next.vehicles) || next.vehicles.length > 1024 ||
                    (next.state !== 'active' && next.vehicles.length) ||
                    !next.vehicles.every(point => Array.isArray(point) && point.length === 2 &&
                        point.every(n => Number.isFinite(n) && Math.abs(n) <= 100_000))) throw new Error();
                current = next;
                updatedAt = now();
                // An unavailable heartbeat is not evidence of recovery.
                if (next.state !== 'unavailable') retryDelay = 5000;
            } catch { invalidate(); }
        }
    });
    const died = () => { if (child !== owned) return; child = null; backoff(); };
    child.on('error', died);
    child.on('exit', died);
    }
    start();
    return {
        get() { start(); return current && now() - updatedAt < 2000 ? current : { state: 'unavailable', vehicles: [] }; },
        stop() { if (!stopped) { stopped = true; invalidate(); child?.kill(); } },
    };
}
