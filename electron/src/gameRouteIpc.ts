import type { BrowserWindow, IpcMain } from 'electron';
import { pathToFileURL } from 'url';
import { requireAppMainFrame } from './trustedIpc.cjs';

type RouteSource = { get(): unknown; stop(): void };
type RouteModule = { createGameRouteSource(): RouteSource };

/** The game reader is lazy, read-only, and confined to the app's main frame. */
export function registerGameRouteIpc(
    ipc: IpcMain,
    getWindow: () => BrowserWindow | null,
    getScheme: () => string,
    getSourcePath: () => string,
    isSupported: () => boolean = () => process.platform === 'win32',
    loadModule: (path: string) => Promise<RouteModule> = path => import(pathToFileURL(path).href),
) {
    let source: RouteSource | null = null;
    let pending: Promise<RouteSource | null> | null = null;
    let revision = 0;

    function stop() {
        revision++;
        source?.stop();
        source = null;
        pending = null;
    }

    async function getSource() {
        if (!isSupported()) return null;
        if (source) return source;
        if (!pending) {
            const currentRevision = revision;
            const request = loadModule(getSourcePath()).then(module => {
                if (currentRevision !== revision) return null;
                source = module.createGameRouteSource();
                return source;
            }).finally(() => { if (pending === request) pending = null; });
            pending = request;
        }
        return pending;
    }

    ipc.handle('game-route-read', async event => {
        requireAppMainFrame(event, getWindow(), getScheme());
        try { return (await getSource())?.get() ?? {state:'unavailable'}; }
        catch { return {state:'unavailable'}; }
    });
    ipc.handle('game-route-stop', event => {
        requireAppMainFrame(event, getWindow(), getScheme());
        stop();
    });
    return stop;
}
