import type { GeoJSONSource, Map as MapLibreMap } from 'maplibre-gl';
import { convertEts2ToGeo } from '~/assets/utils/map/converters';

const SOURCE = 'tmp-vehicles';
const empty = { type: 'FeatureCollection', features: [] } as const;
type NearbySnapshot = { state: 'active' | 'inactive' | 'unavailable'; vehicles: [number, number][] };

export function useTmpNearby(map: Ref<MapLibreMap | null>) {
    const { settings } = useSettings();
    let current: NearbySnapshot | null = null;
    let received = 0;
    let socket: WebSocket | null = null;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let expiry: ReturnType<typeof setInterval> | null = null;
    let generation = 0;
    let watchedMap: MapLibreMap | null = null;
    const bridge = typeof window === 'undefined' ? null : (window as any).electronAPI;

    function render() {
        const target = map.value;
        if (!target?.getStyle()?.layers) return;
        if (!target.getSource(SOURCE)) {
            if (!current || current.state !== 'active' || !current.vehicles.length) return;
            target.addSource(SOURCE, { type: 'geojson', data: empty as any });
            target.addLayer({
                id: SOURCE, type: 'circle', source: SOURCE,
                paint: {
                    'circle-radius': ['interpolate', ['linear'], ['zoom'], 4, 2.5, 10, 4.5, 15, 6],
                    'circle-color': '#2588ef', 'circle-stroke-color': '#ffffff', 'circle-stroke-width': 1.5,
                },
            }, target.getLayer('all-sprites') ? 'all-sprites' : undefined);
        }
        const features = current?.state === 'active' && Date.now() - received < 2000
            ? current.vehicles.map(([x, z]) => ({ type: 'Feature' as const, properties: {}, geometry: { type: 'Point' as const, coordinates: convertEts2ToGeo(x, z) } }))
            : [];
        (target.getSource(SOURCE) as GeoJSONSource).setData({ type: 'FeatureCollection', features });
    }

    function update(value: any) {
        if (!value || !['active', 'inactive', 'unavailable'].includes(value.state) ||
            !Array.isArray(value.vehicles) || value.vehicles.length > 1024 ||
            (value.state !== 'active' && value.vehicles.length) ||
            !value.vehicles.every((point: unknown) => Array.isArray(point) && point.length === 2 &&
                point.every(n => typeof n === 'number' && Number.isFinite(n) && Math.abs(n) <= 100_000))) {
            current = null;
        } else current = value;
        received = Date.now();
        render();
    }

    function stop() {
        generation++;
        if (timer) clearTimeout(timer);
        timer = null;
        if (socket) { socket.onclose = null; socket.onmessage = null; socket.onerror = null; socket.close(); socket = null; }
        if (typeof bridge?.stopTmpNearby === 'function') void bridge.stopTmpNearby().catch(() => {});
        current = null;
        received = 0;
        render();
    }

    function start() {
        stop();
        if (settings.value.selectedGame !== 'ets2') return;
        const token = generation;
        if (typeof bridge?.getTmpNearby === 'function') {
            const poll = async () => {
                try { const next = await bridge.getTmpNearby(); if (token === generation) update(next); }
                catch { if (token === generation) update(null); }
                if (token === generation) timer = setTimeout(poll, 250);
            };
            void poll();
            return;
        }
        if (!document.querySelector('meta[name="trucknav-tmp-nearby"][content="1"]')) return;
        const connect = () => {
            if (token !== generation) return;
            const scheme = location.protocol === 'https:' ? 'wss:' : 'ws:';
            const connection = new WebSocket(`${scheme}//${location.host}/__trucknav/tmp-nearby`);
            socket = connection;
            connection.onmessage = event => { if (token === generation) { try { update(JSON.parse(event.data)); } catch { update(null); } } };
            connection.onerror = () => connection.close();
            connection.onclose = () => { if (token === generation) { socket = null; update(null); timer = setTimeout(connect, 2000); } };
        };
        connect();
    }

    onMounted(() => {
        watch(() => settings.value.selectedGame, start, { immediate: true });
        watch(map, (next, old) => {
            old?.off('load', render);
            watchedMap = next;
            if (next) { next.on('load', render); render(); }
        }, { immediate: true });
        expiry = setInterval(() => { if (current && Date.now() - received >= 2000) { current = null; render(); } }, 1000);
    });
    onUnmounted(() => { stop(); if (expiry) clearInterval(expiry); watchedMap?.off('load', render); });
}
