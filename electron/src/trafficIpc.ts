import type { BrowserWindow, IpcMain, IpcMainInvokeEvent } from 'electron';
import { pathToFileURL } from 'url';
import { requireAppMainFrame } from './trustedIpc.cjs';

type TrafficSource = {
    servers(): Promise<unknown>;
    snapshot(serverId: number): Promise<unknown>;
};

/** Register read-only IPC accessible only to the app's own main frame. */
export function registerTrafficIpc(
    ipc: IpcMain,
    getWindow: () => BrowserWindow | null,
    getScheme: () => string,
    getSourcePath: () => string,
    loadModule: (sourcePath: string) => Promise<{ createTruckersMpTrafficSource(): TrafficSource }> =
        sourcePath => import(pathToFileURL(sourcePath).href),
) {
    let sourcePromise: Promise<TrafficSource> | undefined;
    function requireMainFrame(event: IpcMainInvokeEvent) {
        requireAppMainFrame(event, getWindow(), getScheme());
    }
    function source() {
        if (!sourcePromise) {
            sourcePromise = loadModule(getSourcePath())
                .then(module => module.createTruckersMpTrafficSource() as TrafficSource)
                .catch(error => { sourcePromise = undefined; throw error; });
        }
        return sourcePromise;
    }
    ipc.handle('tmp-traffic-servers', async event => {
        requireMainFrame(event);
        return (await source()).servers();
    });
    ipc.handle('tmp-traffic-snapshot', async (event, serverId: unknown) => {
        requireMainFrame(event);
        if (typeof serverId !== 'number' || !Number.isSafeInteger(serverId) || serverId < 1 || serverId > 9999) throw new Error('Invalid traffic server');
        return (await source()).snapshot(serverId);
    });
}
