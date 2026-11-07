import type { BrowserWindow, IpcMain } from 'electron';
import { pathToFileURL } from 'url';
import { requireAppMainFrame } from './trustedIpc.cjs';

type Source = { get(): unknown; stop(): void };
type SourceModule = { createTmpNearbySource(): Source };

export function registerTmpNearbyIpc(
    ipc: IpcMain, getWindow: () => BrowserWindow | null, getScheme: () => string,
    getSourcePath: () => string, isSupported = () => process.platform === 'win32',
    loadModule: (path: string) => Promise<SourceModule> = path => import(pathToFileURL(path).href),
) {
    let source: Source | null = null;
    let pending: Promise<Source | null> | null = null;
    let revision = 0;
    const unavailable = { state: 'unavailable', vehicles: [] };
    function stop() { revision++; source?.stop(); source = null; pending = null; }
    async function getSource() {
        if (!isSupported()) return null;
        if (source) return source;
        if (!pending) {
            const expected = revision;
            const request = loadModule(getSourcePath()).then(module => {
                if (expected !== revision) return null;
                source = module.createTmpNearbySource();
                return source;
            }).finally(() => { if (pending === request) pending = null; });
            pending = request;
        }
        return pending;
    }
    ipc.handle('tmp-nearby-read', async event => {
        requireAppMainFrame(event, getWindow(), getScheme());
        try { return (await getSource())?.get() ?? unavailable; } catch { return unavailable; }
    });
    ipc.handle('tmp-nearby-stop', event => { requireAppMainFrame(event, getWindow(), getScheme()); stop(); });
    return stop;
}
