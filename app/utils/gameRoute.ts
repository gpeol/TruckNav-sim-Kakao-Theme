export interface GameRouteSnapshot {
    state: "active" | "inactive" | "unavailable";
    points?: unknown;
    waypoints?: unknown;
}

/** Returns ordered game waypoints only when the route agrees with live telemetry. */
export function gameRouteWaypoints(
    snapshot: GameRouteSnapshot | null,
    telemetry: any,
): [number, number][] | null {
    if (snapshot?.state !== "active" || !Array.isArray(snapshot.points) ||
        snapshot.points.length < 2 || snapshot.points.length > 6000 ||
        String(telemetry?.game || "").toLowerCase() !== "ets2") return null;

    const x = telemetry?.truck?.current?.position?.x;
    const z = telemetry?.truck?.current?.position?.z;
    const remaining = telemetry?.navigation?.distance;
    if (![x, z, remaining].every(Number.isFinite) || remaining <= 100) return null;

    let previous = Infinity;
    let nearestDistance = Infinity;
    let remainingAtNearest = 0;
    for (const point of snapshot.points) {
        if (!Array.isArray(point) || point.length !== 3 || !point.every(Number.isFinite)) return null;
        const [px, pz, distance] = point;
        if (Math.abs(px) > 1_000_000 || Math.abs(pz) > 1_000_000 ||
            distance < 0 || distance > previous + 1) return null;
        previous = distance;
        const separation = Math.hypot(px - x, pz - z);
        if (separation < nearestDistance) {
            nearestDistance = separation;
            remainingAtNearest = distance;
        }
    }
    if (nearestDistance > 2500 || Math.abs(remainingAtNearest - remaining) > Math.max(5000, remaining * 0.3) || previous > 100) return null;
    const last = snapshot.points[snapshot.points.length - 1] as number[];
    if (snapshot.waypoints === undefined) return [[last[0]!, last[1]!]];
    if (!Array.isArray(snapshot.waypoints) || snapshot.waypoints.length < 1 || snapshot.waypoints.length > 50) return null;
    const result: [number, number][] = [];
    let previousIndex = -1;
    for (const [index, waypoint] of snapshot.waypoints.entries()) {
        if (!Array.isArray(waypoint) || waypoint.length !== 2 || !waypoint.every(Number.isFinite)) return null;
        const routeIndex = index === snapshot.waypoints.length - 1
            ? snapshot.points.length - 1
            : snapshot.points.findIndex((point, i) => i > previousIndex && point[0] === waypoint[0] && point[1] === waypoint[1]);
        const point = snapshot.points[routeIndex];
        if (!point || routeIndex <= previousIndex || point[0] !== waypoint[0] || point[1] !== waypoint[1]) return null;
        result.push([waypoint[0], waypoint[1]]);
        previousIndex = routeIndex;
    }
    return result;
}
