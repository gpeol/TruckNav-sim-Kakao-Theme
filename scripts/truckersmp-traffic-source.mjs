import { createHmac, randomBytes } from 'node:crypto';

const SERVER_URL = 'https://truckersmp.krashnz.com/servers';
const AREA_URL = 'https://tracker.ets2map.com/v3/area';
const MAX_RESPONSE_BYTES = 4 * 1024 * 1024;
const SERVER_CACHE_MS = 30_000;
const SNAPSHOT_CACHE_MS = 5_000;

// Query a fixed map-wide rectangle: no user's route or position leaves TruckNav.
const ETS2_AREA = Object.freeze({ x1: '-100000', y1: '100000', x2: '100000', y2: '-100000' });

async function readJson(fetchFn, url) {
    const response = await fetchFn(url, {
        headers: { accept: 'application/json' },
        redirect: 'error',
        signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok || !response.body) throw new Error('TruckersMP data unavailable');
    const reader = response.body.getReader();
    const chunks = [];
    let total = 0;
    try {
        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            total += value.byteLength;
            if (total > MAX_RESPONSE_BYTES) throw new Error('TruckersMP response too large');
            chunks.push(value);
        }
    } finally {
        await reader.cancel().catch(() => {});
    }
    return JSON.parse(Buffer.concat(chunks, total).toString('utf8'));
}

/** Read-only, opt-in provider. It starts no polling and opens no listener. */
export function createTruckersMpTrafficSource({ fetchFn = fetch, now = Date.now } = {}) {
    const identityKey = randomBytes(32);
    let serverCache = null;
    let pendingServers = null;
    const snapshots = new Map();
    const pending = new Map();

    async function servers() {
        if (serverCache && now() - serverCache.at < SERVER_CACHE_MS) return serverCache.value;
        if (pendingServers) return pendingServers;
        const request = (async () => {
            const json = await readJson(fetchFn, SERVER_URL);
            if (!Array.isArray(json?.servers)) throw new Error('Invalid TruckersMP server list');
            const seen = new Set();
            const value = json.servers.flatMap(server => {
                if (server?.game !== 'ets2' || server.status !== true ||
                    !Number.isSafeInteger(server.map) || server.map < 1 || server.map > 9999 ||
                    typeof server.name !== 'string' || server.name.length > 100 || seen.has(server.map)) return [];
                seen.add(server.map);
                return [{ id: server.map, name: server.name }];
            });
            serverCache = { at: now(), value };
            return value;
        })();
        pendingServers = request;
        try { return await request; } finally { if (pendingServers === request) pendingServers = null; }
    }

    async function snapshot(serverId) {
        if (!Number.isSafeInteger(serverId) || serverId < 1 || serverId > 9999) throw new Error('Invalid server');
        if (!(await servers()).some(server => server.id === serverId)) throw new Error('Unknown ETS2 server');
        const cached = snapshots.get(serverId);
        if (cached && now() - cached.at < SNAPSHOT_CACHE_MS) return cached.value;
        if (pending.has(serverId)) return pending.get(serverId);
        const request = (async () => {
            const params = new URLSearchParams({ ...ETS2_AREA, server: String(serverId) });
            const json = await readJson(fetchFn, `${AREA_URL}?${params}`);
            if (json?.Success !== true || !Array.isArray(json.Data) || json.Data.length > 10_000) {
                throw new Error('Invalid TruckersMP positions');
            }
            const vehicles = json.Data.flatMap(row => {
                const id = row?.MpId;
                const x = row?.X;
                const z = row?.Y;
                const time = row?.Time;
                if (!Number.isSafeInteger(id) || id <= 0 || !Number.isFinite(x) || !Number.isFinite(z) ||
                    Math.abs(x) > 100_000 || Math.abs(z) > 100_000 || !Number.isSafeInteger(time) || time <= 0) return [];
                const anonymousId = createHmac('sha256', identityKey).update(`${serverId}:${id}`).digest('base64url');
                return [{ id: anonymousId, x, z, time }];
            });
            const value = { serverId, observedAt: now(), vehicles };
            snapshots.set(serverId, { at: now(), value });
            return value;
        })();
        pending.set(serverId, request);
        try { return await request; } finally { pending.delete(serverId); }
    }

    return { servers, snapshot };
}
