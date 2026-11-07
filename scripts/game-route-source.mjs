import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

// The child can only read a verified game process; it never opens a port or
// accepts commands. An unavailable or stale snapshot must not be used.
export function createGameRouteSource() {
    const script = fileURLToPath(new URL('./ets2-route-reader.ps1', import.meta.url));
    const child = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-File', script], {
        windowsHide: true,
        stdio: ['ignore', 'pipe', 'ignore'],
    });
    let pending = '';
    let current = null;
    let updatedAt = 0;
    let stopped = false;

    const invalidate = () => { current = null; updatedAt = 0; };
    child.stdout.setEncoding('utf8');
    child.stdout.on('data', chunk => {
        pending += chunk;
        if (pending.length > 1_000_000) { invalidate(); child.kill(); return; }
        let end;
        while ((end = pending.indexOf('\n')) !== -1) {
            const line = pending.slice(0, end);
            pending = pending.slice(end + 1);
            try {
                const next = JSON.parse(line);
                if (!next || !['active', 'inactive', 'unavailable'].includes(next.state)) throw new Error();
                current = next;
                updatedAt = Date.now();
            } catch { invalidate(); }
        }
    });
    child.on('error', invalidate);
    child.on('exit', invalidate);

    return {
        get() {
            return current && Date.now() - updatedAt < 5000 ? current : { state: 'unavailable' };
        },
        stop() {
            if (!stopped) { stopped = true; invalidate(); child.kill(); }
        },
    };
}
