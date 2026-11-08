import { convertGeoToEts2 } from "../assets/utils/map/converters.ts";

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
/** Path points beyond a waypoint that count as "surely passed" on a through road. */
export const WAYPOINT_PASS_MARGIN = 10;

export interface WaypointProgress {
    /** Route path index of each waypoint, in order (last = destination). */
    indices: number[];
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

/** Locate waypoints on the path in order, so a coordinate visited twice resolves to the right visit. */
export function buildWaypointProgress(path: readonly LngLat[], stops: readonly LngLat[]): WaypointProgress {
    const indices: number[] = [];
    const deadEnd: boolean[] = [];
    let from = 0;
    for (const stop of stops) {
        let best = from, bestD = Infinity;
        for (let i = from; i < path.length; i++) {
            const d = sq(path[i]!, stop);
            if (d < bestD) { bestD = d; best = i; }
            if (d <= EXACT_VISIT_M * EXACT_VISIT_M) break; // first exact visit wins
        }
        indices.push(best);
        const prev = path[best - 2] ?? path[best - 1];
        const next = path[best + 2] ?? path[best + 1];
        deadEnd.push(!!prev && !!next && best > 0 && best < path.length - 1 && sq(prev, next) < REACHED_SQ);
        from = best;
    }
    return { indices, deadEnd, reached: stops.map(() => false) };
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
        const pt = path[p.indices[k]!];
        if (pt && sq(truck, pt) <= REACHED_SQ) p.reached[k] = true;
    }
    let passed = 0;
    while (passed < last) {
        const idx = p.indices[passed]!;
        const ok = routeIndex >= idx && (p.reached[passed] || (!p.deadEnd[passed] && routeIndex >= idx + WAYPOINT_PASS_MARGIN));
        if (!ok) break;
        passed++;
    }
    return passed;
}

/** Drop the first n entries from progress (after removing them from the waypoint list). */
export function dropWaypoints(p: WaypointProgress, n: number): void {
    p.indices.splice(0, n); p.deadEnd.splice(0, n); p.reached.splice(0, n);
}
