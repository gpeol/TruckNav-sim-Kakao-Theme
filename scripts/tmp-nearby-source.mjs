import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

// Read-only local shared memory. The helper has no listener or input channel.
export function createTmpNearbySource({ spawnFn = spawn, now = Date.now } = {}) {
    const script = fileURLToPath(new URL('./tmp-nearby-reader.ps1', import.meta.url));
    const child = spawnFn('powershell.exe', ['-NoProfile', '-NonInteractive', '-File', script], {
        windowsHide: true, stdio: ['ignore', 'pipe', 'ignore'],
    });
    let pending = '';
    let current = null;
    let updatedAt = 0;
    let stopped = false;
    const invalidate = () => { current = null; updatedAt = 0; };
    child.stdout.setEncoding('utf8');
    child.stdout.on('data', chunk => {
        pending += chunk;
        if (pending.length > 100_000) { invalidate(); child.kill(); return; }
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
            } catch { invalidate(); }
        }
    });
    child.on('error', invalidate);
    child.on('exit', invalidate);
    return {
        get() { return current && now() - updatedAt < 2000 ? current : { state: 'unavailable', vehicles: [] }; },
        stop() { if (!stopped) { stopped = true; invalidate(); child.kill(); } },
    };
}
