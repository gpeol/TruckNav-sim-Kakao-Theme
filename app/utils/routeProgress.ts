/** Returns the proportion of the current calculated route already travelled. */
export function routeProgress(cache: Float32Array | null, pointCount: number, currentIndex: number): number | null {
    if (!cache || pointCount < 2 || cache.length < pointCount * 3) return null;
    const index = Math.max(0, Math.min(pointCount - 1, Math.floor(currentIndex)));
    const total = cache[(pointCount - 1) * 3];
    const current = cache[index * 3];
    if (total === undefined || current === undefined || !Number.isFinite(total) || !Number.isFinite(current) || total <= 0) return null;
    return Math.max(0, Math.min(1, current / total));
}
