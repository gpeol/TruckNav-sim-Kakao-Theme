import type { TrafficObservation } from './truckersMpTraffic';

export interface TrafficServer { id: number; name: string }
interface TrafficBridge {
    getTruckersMpServers(): Promise<TrafficServer[]>;
    getTruckersMpSnapshot(serverId: number): Promise<TrafficObservation>;
}

function bridge(): TrafficBridge | null {
    if (typeof window === 'undefined') return null;
    const value = (window as any).electronAPI;
    return typeof value?.getTruckersMpServers === 'function' && typeof value?.getTruckersMpSnapshot === 'function' ? value : null;
}

export function hasTrafficTransport(): boolean {
    return Boolean(bridge()) || (typeof document !== 'undefined' && document.querySelector('meta[name="trucknav-traffic"][content="1"]') !== null);
}

async function previewJson<T>(path: string): Promise<T> {
    if (!hasTrafficTransport()) throw new Error('Traffic unavailable');
    const response = await fetch(path, { cache: 'no-store' });
    if (!response.ok) throw new Error('Traffic unavailable');
    return response.json() as Promise<T>;
}

export async function trafficServers(): Promise<TrafficServer[]> {
    const ipc = bridge();
    return ipc ? ipc.getTruckersMpServers() : previewJson<TrafficServer[]>('/__trucknav/traffic/servers');
}

export async function trafficSnapshot(serverId: number): Promise<TrafficObservation> {
    if (!Number.isSafeInteger(serverId) || serverId < 1 || serverId > 9999) throw new Error('Invalid traffic server');
    const ipc = bridge();
    return ipc ? ipc.getTruckersMpSnapshot(serverId) : previewJson<TrafficObservation>(`/__trucknav/traffic/snapshot?server=${serverId}`);
}
