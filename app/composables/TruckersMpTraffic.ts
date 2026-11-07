import type { Map as MapLibreMap, GeoJSONSource } from 'maplibre-gl';
import { convertEts2ToGeo, convertGeoToEts2 } from '~/assets/utils/map/converters';
import { estimateTruckersMpTraffic, updateTrafficHistory, type TrafficObservation, type TrafficSegment } from '~/utils/truckersMpTraffic';
import { hasTrafficTransport, trafficSnapshot } from '~/utils/trafficTransport';

const SOURCE = 'tmp-traffic';
const INTERVAL = 6_000;
const empty = { type: 'FeatureCollection', features: [] } as const;

export function useTruckersMpTraffic(map: Ref<MapLibreMap | null>, route: Ref<[number, number][] | null>, routeIndex: Ref<number>, stats: Ref<Float32Array | null>) {
    const { settings, activeSettings } = useSettings();
    const status = useState<'off' | 'waiting' | 'ready' | 'unavailable'>('tmp-traffic-status', () => 'off');
    let previous: TrafficObservation | null = null;
    let current: TrafficObservation | null = null;
    let history: TrafficObservation[] = [];
    let timer: ReturnType<typeof setTimeout> | null = null;
    let renderTimer: ReturnType<typeof setTimeout> | null = null;
    let generation = 0;
    let receivedAt = 0;
    let selectedId: number | null = null;
    const trafficSegments = shallowRef<TrafficSegment[]>([]);
    let expiryTimer: ReturnType<typeof setInterval> | null = null;
    let watchedMap: MapLibreMap | null = null;

    function clear() {
        trafficSegments.value = [];
        const source = map.value?.getSource(SOURCE) as GeoJSONSource | undefined;
        source?.setData(empty as any);
    }

    function render() {
        const target = map.value;
        if (!target || !target.getSource('route-line')) { trafficSegments.value = []; return; }
        if (!previous || !current || !route.value || status.value !== 'ready') { clear(); return; }
        if (!target.getSource(SOURCE)) {
            target.addSource(SOURCE, { type: 'geojson', data: empty as any });
            target.addLayer({
                id: SOURCE, type: 'line', source: SOURCE,
                layout: { 'line-join': 'round', 'line-cap': 'round' },
                paint: {
                    'line-color': ['match', ['get', 'level'], 'heavy', '#e02c22', '#f5a623'],
                    'line-width': ['interpolate', ['linear'], ['zoom'], 10, 8, 10.2, 9, 10.5, 6, 11.5, 11],
                },
            }, target.getLayer('all-sprites') ? 'all-sprites' : undefined);
        }
        const worldRoute = route.value.map(([lng, lat]) => convertGeoToEts2(lng, lat));
        // Server and phone clocks may differ; freshness is based on local elapsed time.
        const estimatedServerNow = current.observedAt + Math.max(0, Date.now() - receivedAt);
        const traffic = estimateTruckersMpTraffic(worldRoute, previous, current, estimatedServerNow, routeIndex.value, stats.value);
        trafficSegments.value = traffic;
        const features = traffic.map(segment => ({
            type: 'Feature' as const,
            properties: { level: segment.level },
            geometry: { type: 'LineString' as const, coordinates: segment.coordinates.map(([x, z]) => convertEts2ToGeo(x, z)) },
        }));
        (target.getSource(SOURCE) as GeoJSONSource).setData({ type: 'FeatureCollection', features });
    }

    async function poll(id: number, token: number) {
        try {
            const observation = await trafficSnapshot(id);
            if (token !== generation) return;
            if (observation.serverId !== id || !Array.isArray(observation.vehicles) || !Number.isFinite(observation.observedAt)) throw new Error('Invalid traffic response');
            const updated = updateTrafficHistory(history, observation);
            history = updated.history;
            previous = updated.previous;
            current = observation;
            receivedAt = Date.now();
            status.value = previous ? 'ready' : 'waiting';
            render();
        } catch {
            if (token !== generation) return;
            previous = current = null;
            history = [];
            receivedAt = 0;
            status.value = 'unavailable';
            clear();
        }
        if (token === generation) timer = setTimeout(() => poll(id, token), INTERVAL);
    }

    function onVisibilityChange() {
        if (document.visibilityState !== 'visible' || !selectedId || !receivedAt || Date.now() - receivedAt <= 90_000) return;
        generation++;
        if (timer) clearTimeout(timer);
        previous = current = null;
        history = [];
        receivedAt = 0;
        clear();
        status.value = 'waiting';
        void poll(selectedId, generation);
    }

    onMounted(() => {
        document.addEventListener('visibilitychange', onVisibilityChange);
        const enabled = hasTrafficTransport();
        watch([() => settings.value.trafficServerId, () => settings.value.selectedGame, () => activeSettings.value.activeMod], ([serverId, game, mod]) => {
            generation++;
            if (timer) clearTimeout(timer);
            previous = current = null;
            history = [];
            receivedAt = 0;
            selectedId = null;
            clear();
            if (!enabled || game !== 'ets2' || mod !== 'none' || !Number.isSafeInteger(serverId) || !serverId || serverId < 1) { status.value = 'off'; return; }
            selectedId = serverId;
            status.value = 'waiting';
            void poll(serverId, generation);
        }, { immediate: true });
        watch(map, (next, old) => {
            if (old) old.off('load', renderAll);
            watchedMap = next;
            if (next) { next.on('load', renderAll); renderAll(); }
        }, { immediate: true });
        watch([route, stats], render);
        watch(routeIndex, () => {
            if (renderTimer || status.value !== 'ready') return;
            renderTimer = setTimeout(() => { renderTimer = null; render(); }, 2000);
        });
        expiryTimer = setInterval(() => {
            if (!current || Date.now() - receivedAt <= 90_000) return;
            previous = current = null;
            history = [];
            receivedAt = 0;
            status.value = 'waiting';
            clear();
        }, 5000);
    });
    function renderAll() { render(); }
    onUnmounted(() => { generation++; document.removeEventListener('visibilitychange', onVisibilityChange); if (timer) clearTimeout(timer); if (renderTimer) clearTimeout(renderTimer); if (expiryTimer) clearInterval(expiryTimer); watchedMap?.off('load', renderAll); clear(); status.value = 'off'; });
    return { trafficSegments };
}
