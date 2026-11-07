import RBush from 'rbush';

export type WorldPoint = [number, number];
export interface TrafficVehicle { id: string; x: number; z: number; time: number }
export interface TrafficObservation { serverId: number; observedAt: number; vehicles: TrafficVehicle[] }
export interface TrafficSegment {
    coordinates: WorldPoint[];
    level: 'congested' | 'heavy';
    vehicles: number;
    slowVehicles: number;
    startProgress: number;
    endProgress: number;
}

interface IndexedSegment {
    minX: number; minY: number; maxX: number; maxY: number;
    start: WorldPoint; end: WorldPoint; distance: number; length: number; index: number;
}

// These are deliberately conservative estimates in game-world units, not
// measured road speeds. Unobserved stretches are left unclassified.
const MATCH_DISTANCE = 30;
const BUCKET_LENGTH = 400;
// Equivalent to travelling less than 10 world units in 30 seconds, regardless
// of small polling delays or a missed observation.
const SLOW_DISPLACEMENT_PER_SECOND = 10 / 30;
const MAX_SAMPLE_AGE_SECONDS = 90;
const MIN_INTERVAL_SECONDS = 15;
const MAX_INTERVAL_SECONDS = 90;

/** Keep a recent observation old enough to measure movement independently of display updates. */
export function updateTrafficHistory(history: TrafficObservation[], next: TrafficObservation): {
    history: TrafficObservation[]; previous: TrafficObservation | null;
} {
    const retained = history.filter(item => item.serverId === next.serverId &&
        item.observedAt <= next.observedAt && next.observedAt - item.observedAt <= MAX_INTERVAL_SECONDS * 1000 &&
        item.observedAt !== next.observedAt);
    retained.push(next);
    const previous = [...retained].reverse().find(item => next.observedAt - item.observedAt >= MIN_INTERVAL_SECONDS * 1000) ?? null;
    return { history: retained.slice(-32), previous };
}

function pointAt(segment: IndexedSegment, distance: number): WorldPoint {
    const ratio = Math.max(0, Math.min(1, (distance - segment.distance) / segment.length));
    return [segment.start[0] + (segment.end[0] - segment.start[0]) * ratio,
        segment.start[1] + (segment.end[1] - segment.start[1]) * ratio];
}

/** Estimate slow groups on the route from two independent live observations. */
export function estimateTruckersMpTraffic(
    route: WorldPoint[], previous: TrafficObservation, current: TrafficObservation, now: number, startIndex = 0,
    stats?: Float32Array | null,
): TrafficSegment[] {
    if (previous.serverId !== current.serverId || !Number.isFinite(now) ||
        now - current.observedAt < 0 || now - current.observedAt > MAX_SAMPLE_AGE_SECONDS * 1000 ||
        current.observedAt <= previous.observedAt) return [];

    const segments: IndexedSegment[] = [];
    let totalDistance = 0;
    let startDistance = 0;
    const firstIndex = Math.max(0, Math.min(route.length - 1, Math.floor(startIndex)));
    for (let index = 1; index < route.length; index++) {
        const start = route[index - 1]!;
        const end = route[index]!;
        if (!start.every(Number.isFinite) || !end.every(Number.isFinite)) return [];
        const length = Math.hypot(end[0] - start[0], end[1] - start[1]);
        if (!length) continue;
        if (index > firstIndex) segments.push({
            start, end, length, distance: totalDistance, index: index - 1,
            minX: Math.min(start[0], end[0]) - MATCH_DISTANCE,
            minY: Math.min(start[1], end[1]) - MATCH_DISTANCE,
            maxX: Math.max(start[0], end[0]) + MATCH_DISTANCE,
            maxY: Math.max(start[1], end[1]) + MATCH_DISTANCE,
        });
        totalDistance += length;
        if (index <= firstIndex) startDistance = totalDistance;
    }
    if (!segments.length) return [];
    const tree = new RBush<IndexedSegment>();
    tree.load(segments);
    const earlier = new Map(previous.vehicles.map(vehicle => [vehicle.id, vehicle]));
    const seen = new Set<string>();
    const buckets = new Map<number, { vehicles: number; slowVehicles: number }>();
    for (const vehicle of current.vehicles) {
        if (seen.has(vehicle.id)) continue;
        seen.add(vehicle.id);
        const old = earlier.get(vehicle.id);
        if (!old || ![vehicle.x, vehicle.z, vehicle.time, old.x, old.z, old.time].every(Number.isFinite)) continue;
        const elapsed = vehicle.time - old.time;
        if (elapsed < MIN_INTERVAL_SECONDS || elapsed > MAX_INTERVAL_SECONDS ||
            Math.abs(current.observedAt / 1000 - vehicle.time) > MAX_SAMPLE_AGE_SECONDS) continue;
        let nearestDistance = MATCH_DISTANCE * MATCH_DISTANCE;
        let position: number | null = null;
        for (const segment of tree.search({ minX: vehicle.x, minY: vehicle.z, maxX: vehicle.x, maxY: vehicle.z })) {
            const dx = segment.end[0] - segment.start[0];
            const dz = segment.end[1] - segment.start[1];
            const t = Math.max(0, Math.min(1, ((vehicle.x - segment.start[0]) * dx + (vehicle.z - segment.start[1]) * dz) / (segment.length * segment.length)));
            const separation = (vehicle.x - segment.start[0] - t * dx) ** 2 + (vehicle.z - segment.start[1] - t * dz) ** 2;
            if (separation < nearestDistance) {
                nearestDistance = separation;
                position = segment.distance + t * segment.length;
            }
        }
        if (position === null) continue;
        const bucketIndex = Math.min(Math.floor(position / BUCKET_LENGTH), Math.ceil(totalDistance / BUCKET_LENGTH) - 1);
        const bucket = buckets.get(bucketIndex) ?? { vehicles: 0, slowVehicles: 0 };
        bucket.vehicles++;
        if (Math.hypot(vehicle.x - old.x, vehicle.z - old.z) / elapsed < SLOW_DISPLACEMENT_PER_SECOND) bucket.slowVehicles++;
        buckets.set(bucketIndex, bucket);
    }
    const result: TrafficSegment[] = [];
    const totalKm = stats && stats.length >= route.length * 3 ? stats[(route.length - 1) * 3] : undefined;
    const progressAt = (segment: IndexedSegment, distance: number) => {
        const fraction = Math.max(0, Math.min(1, (distance - segment.distance) / segment.length));
        const a = stats?.[segment.index * 3];
        const b = stats?.[(segment.index + 1) * 3];
        if (totalKm !== undefined && totalKm > 0 && a !== undefined && b !== undefined && Number.isFinite(a) && Number.isFinite(b)) {
            return Math.max(0, Math.min(1, (a + (b - a) * fraction) / totalKm));
        }
        return distance / totalDistance;
    };
    for (const [bucketIndex, bucket] of [...buckets].sort(([a], [b]) => a - b)) {
        if (bucket.slowVehicles < 3 || bucket.slowVehicles / bucket.vehicles < 0.6) continue;
        const from = Math.max(startDistance, bucketIndex * BUCKET_LENGTH);
        const to = Math.min(totalDistance, (bucketIndex + 1) * BUCKET_LENGTH);
        const coordinates: WorldPoint[] = [];
        let startProgress: number | undefined;
        let endProgress: number | undefined;
        for (const segment of segments) {
            if (segment.distance + segment.length <= from || segment.distance >= to) continue;
            const start = pointAt(segment, Math.max(from, segment.distance));
            const end = pointAt(segment, Math.min(to, segment.distance + segment.length));
            if (!coordinates.length) {
                coordinates.push(start);
                startProgress = progressAt(segment, Math.max(from, segment.distance));
            }
            coordinates.push(end);
            endProgress = progressAt(segment, Math.min(to, segment.distance + segment.length));
        }
        if (coordinates.length > 1 && startProgress !== undefined && endProgress !== undefined) result.push({
            coordinates, level: bucket.slowVehicles >= 6 ? 'heavy' : 'congested', ...bucket, startProgress, endProgress,
        });
    }
    return result;
}
