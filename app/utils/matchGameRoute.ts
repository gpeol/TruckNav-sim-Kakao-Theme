/** Finds a connected directed graph path through the game's ordered route nodes. */
export function matchGameRouteNodes(
    groups: { id: number; distance: number }[][],
    adjacency: Map<number, { to: number }[]>,
): number[] | null {
    if (groups.length < 2) return null;
    type Entry = { id: number; cost: number; previous?: Entry };
    let previous = new Map<number, Entry>();
    for (const candidate of groups[0]!) {
        previous.set(candidate.id, { id: candidate.id, cost: candidate.distance ** 2 });
    }
    for (const group of groups.slice(1)) {
        const next = new Map<number, Entry>();
        for (const candidate of group) {
            for (const [id, entry] of previous) {
                if (!adjacency.get(id)?.some(edge => edge.to === candidate.id)) continue;
                const cost = entry.cost + candidate.distance ** 2;
                if (!next.has(candidate.id) || next.get(candidate.id)!.cost > cost) {
                    next.set(candidate.id, { id: candidate.id, cost, previous: entry });
                }
            }
        }
        if (!next.size) return null;
        previous = next;
    }
    let entry: Entry | undefined = [...previous.values()].reduce((best, item) => item.cost < best.cost ? item : best);
    const path: number[] = [];
    while (entry) { path.push(entry.id); entry = entry.previous; }
    return path.reverse();
}
