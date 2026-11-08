import { convertGeoToEts2, convertEts2ToGeo } from "../assets/utils/map/converters";

export type LngLat = [number, number];

/**
 * Proximity radius in game units (≈ m). Map degrees are NOT earth degrees: converters.ts uses
 * MERCATOR_R = 300000, so 1° lon ≈ 5236 m and a degree constant like 0.0005° would be ~2.6 m.
 * ETS2 and ATS share the same projection formula, so convertGeoToEts2 serves both games.
 */
export const WAYPOINT_REACHED_M = 50;
const REACHED_SQ = WAYPOINT_REACHED_M * WAYPOINT_REACHED_M;
/** Exact-visit tolerance when locating a waypoint on the path (game units). */
const EXACT_VISIT_M = 5;

export interface WaypointProgress {
    /** Fractional route position: segment index plus projection fraction. */
    indices: number[];
    /** Waypoint anchors projected onto the route, independent of vertex density. */
    points: LngLat[];
    /** True when the waypoint is a dead end (route turns back on itself). */
    deadEnd: boolean[];
    /** Truck came within WAYPOINT_REACHED_M of the waypoint. */
    reached: boolean[];
}

/** Squared distance in game units (meters), independent of Mercator latitude scaling. */
export function gameDistSq(a: LngLat, b: LngLat): number {
    const [ax, az] = convertGeoToEts2(a[0], a[1]);
    const [bx, bz] = convertGeoToEts2(b[0], b[1]);
    return (ax - bx) ** 2 + (az - bz) ** 2;
}
const sq = gameDistSq;

function project(point: LngLat, a: LngLat, b: LngLat, minimum = 0) {
    const [x, z] = convertGeoToEts2(...point);
    const [ax, az] = convertGeoToEts2(...a);
    const [bx, bz] = convertGeoToEts2(...b);
    const dx = bx - ax, dz = bz - az;
    const lengthSq = dx * dx + dz * dz;
    let t = Math.max(minimum, Math.min(1, lengthSq ? ((x - ax) * dx + (z - az) * dz) / lengthSq : 0));
    if (t < 1e-9) t = 0;
    if (t > 1 - 1e-9) t = 1;
    const px = ax + t * dx, pz = az + t * dz;
    return { t, distanceSq: (x - px) ** 2 + (z - pz) ** 2, point: convertEts2ToGeo(px, pz) };
}

/** Locate waypoints on the path in order, so a coordinate visited twice resolves to the right visit. */
export function buildWaypointProgress(path: readonly LngLat[], stops: readonly LngLat[]): WaypointProgress {
    const indices: number[] = [];
    const points: LngLat[] = [];
    const deadEnd: boolean[] = [];
    let from = 0;
    for (const stop of stops) {
        let best = from, bestD = Infinity, anchor = path[Math.floor(from)] ?? stop;
        for (let i = Math.floor(from); i < path.length - 1; i++) {
            const projection = project(stop, path[i]!, path[i + 1]!, Math.max(0, from - i));
            if (projection.distanceSq < bestD) { bestD = projection.distanceSq; best = i + projection.t; anchor = projection.point; }
            if (projection.distanceSq <= EXACT_VISIT_M * EXACT_VISIT_M) break; // first exact visit wins
        }
        indices.push(best);
        points.push(anchor);
        const vertex = Math.round(best);
        const prev = path[vertex - 2] ?? path[vertex - 1];
        const next = path[vertex + 2] ?? path[vertex + 1];
        deadEnd.push(!!prev && !!next && best > 0 && best < path.length - 1 && sq(prev, next) < REACHED_SQ);
        from = best;
    }
    return { indices, points, deadEnd, reached: stops.map(() => false) };
}

/**
 * Upper bound for the progress search window: never jump past a pending dead-end
 * waypoint, otherwise the outbound leg (same road, higher index) is matched while
 * the truck is still driving in.
 */
export function clampSearchLimit(p: WaypointProgress, limit: number): number {
    for (let k = 0; k < p.indices.length - 1; k++) {
        if (p.deadEnd[k] && !p.reached[k]) return Math.min(limit, p.indices[k]!);
    }
    return limit;
}

/**
 * Update reached flags and return how many leading intermediate waypoints are passed.
 * The destination (last entry) is never reported; arrival is handled elsewhere.
 */
export function countPassedWaypoints(
    p: WaypointProgress, path: readonly LngLat[], routeIndex: number, truck: LngLat,
): number {
    const last = p.indices.length - 1;
    for (let k = 0; k < last; k++) {
        const pt = p.points[k];
        if (pt && sq(truck, pt) <= REACHED_SQ) p.reached[k] = true;
    }
    let passed = 0;
    const segment = Math.max(0, Math.min(path.length - 2, Math.floor(routeIndex)));
    const position = path[segment] && path[segment + 1]
        ? segment + project(truck, path[segment]!, path[segment + 1]!).t : routeIndex;
    while (passed < last) {
        const idx = p.indices[passed]!;
        // A later nearest segment alone is not evidence that an off-route stop was visited.
        const ok = position + 1e-9 >= idx && p.reached[passed];
        if (!ok) break;
        passed++;
    }
    return passed;
}

/** Drop the first n entries from progress (after removing them from the waypoint list). */
export function dropWaypoints(p: WaypointProgress, n: number): void {
    p.indices.splice(0, n); p.points.splice(0, n); p.deadEnd.splice(0, n); p.reached.splice(0, n);
}
