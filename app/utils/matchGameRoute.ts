export interface GameRouteMatch {
    /** Connected directed node sequence (every consecutive pair is an edge, no A→B→A U-turns). */
    nodes: number[];
    /** For every input group: index into `nodes`, or -1 when the point was skipped. */
    pointIndex: number[];
}

export interface MatchOptions {
    /** Max consecutive points that may be skipped (unmatched or not directly connected). */
    maxSkips?: number;
    /** Cost added per skipped point (squared metres). */
    skipPenalty?: number;
    /** Max edges of a detour, used only when neither a direct edge nor a skip works. */
    maxDetourHops?: number;
}

type State = {
    id: number;
    cost: number;
    /** consecutive skipped points ending at this state */
    run: number;
    /** nodes appended since the previous state (detour intermediates + id) */
    added: number[];
    group: number;
    parent?: State;
};

/** U-turn guard window: number of most recent path nodes checked for revisits. */
const RECENT_WINDOW = 16;

/** True when `node` is among the last `window` nodes of the path ending at `s`. */
function inRecent(s: State | undefined, node: number, window = RECENT_WINDOW): boolean {
    let seen = 0;
    for (let cur = s; cur && seen < window; cur = cur.parent) {
        const a = cur.added;
        for (let i = a.length - 1; i >= 0 && seen < window; i--, seen++) if (a[i] === node) return true;
    }
    return false;
}

/**
 * Matches the game's ordered route points to a directed path in the local graph.
 *
 * Game route nodes and local graph nodes are almost 1:1, so the default
 * transition is a direct edge between consecutive points' candidates (or the
 * same node). A point whose candidates are not directly reachable — e.g. a
 * point that snapped to a dead-end side branch — may be skipped with a
 * penalty, at most `maxSkips` in a row. Only when no candidate can be reached
 * directly or by skipping is a short detour (≤ `maxDetourHops` edges) tried.
 * A node may not reappear within the last 16 path nodes (detour nodes
 * included), so U-turn spikes are impossible while long loops remain legal. The first and
 * last points must always be matched.
 */
export function matchGameRouteNodes(
    groups: { id: number; distance: number }[][],
    adjacency: Map<number, { to: number }[]>,
    options: MatchOptions = {},
): GameRouteMatch | null {
    const maxSkips = options.maxSkips ?? 3;
    const skipPenalty = options.skipPenalty ?? 40 ** 2;
    const maxDetourHops = options.maxDetourHops ?? 3;
    const last = groups.length - 1;
    if (groups.length < 2 || !groups[0]!.length || !groups[last]!.length) return null;

    let states = new Map<number, State>();
    for (const c of groups[0]!) {
        const prev = states.get(c.id);
        const cost = c.distance ** 2;
        if (!prev || prev.cost > cost) states.set(c.id, { id: c.id, cost, run: 0, added: [c.id], group: 0 });
    }

    const offer = (next: Map<number, State>, s: State) => {
        const existing = next.get(s.id);
        if (!existing || existing.cost > s.cost) next.set(s.id, s);
    };

    for (let g = 1; g <= last; g++) {
        const wanted = new Map<number, number>();
        for (const c of groups[g]!) if (!wanted.has(c.id) || wanted.get(c.id)! > c.distance) wanted.set(c.id, c.distance);
        const next = new Map<number, State>();

        // 1) direct edge or same node
        for (const s of states.values()) {
            if (wanted.has(s.id)) {
                offer(next, { ...s, cost: s.cost + wanted.get(s.id)! ** 2, run: 0, added: [], group: g, parent: s });
            }
            for (const e of adjacency.get(s.id) ?? []) {
                const d = wanted.get(e.to);
                if (d === undefined || inRecent(s, e.to)) continue;
                offer(next, { id: e.to, cost: s.cost + d ** 2, run: 0, added: [e.to], group: g, parent: s });
            }
        }
        // 2) skip this point (never the last one)
        if (g < last) {
            for (const s of states.values()) {
                if (s.run >= maxSkips) continue;
                // keep the cheaper of matched/skipped for this node; skipped states carry run+1
                if (!next.has(s.id) || next.get(s.id)!.cost > s.cost + skipPenalty) {
                    next.set(s.id, { ...s, cost: s.cost + skipPenalty, run: s.run + 1 });
                }
            }
        }
        // 3) short detour, only if nothing else connects
        if (!next.size) {
            for (const s of states.values()) {
                const parents = new Map<number, number>([[s.id, -1]]);
                let frontier = [s.id];
                for (let hop = 1; hop <= maxDetourHops && frontier.length; hop++) {
                    const nf: number[] = [];
                    for (const n of frontier) for (const e of adjacency.get(n) ?? []) {
                        // BFS parents prevent loops inside the detour; window guards against the path before it
                        if (parents.has(e.to) || inRecent(s, e.to)) continue;
                        parents.set(e.to, n);
                        nf.push(e.to);
                        const d = wanted.get(e.to);
                        if (d === undefined) continue;
                        const added: number[] = [];
                        for (let x = e.to; x !== s.id; x = parents.get(x)!) added.push(x);
                        added.reverse();
                        offer(next, { id: e.to, cost: s.cost + d ** 2 + hop, run: 0, added, group: g, parent: s });
                    }
                    frontier = nf;
                }
            }
        }
        if (!next.size) return null;
        states = next;
    }

    const finals = [...states.values()].filter(s => s.group === last);
    if (!finals.length) return null;
    let s: State | undefined = finals.reduce((a, b) => (b.cost < a.cost ? b : a));
    const chain: State[] = [];
    for (; s; s = s.parent) chain.push(s);
    chain.reverse();

    const nodes: number[] = [];
    const pointIndex = new Array<number>(groups.length).fill(-1);
    for (const item of chain) {
        nodes.push(...item.added);
        pointIndex[item.group] = nodes.length - 1;
    }
    for (let i = 1; i < nodes.length; i++) {
        if (nodes[i] === nodes[i - 1] || (i >= 2 && nodes[i] === nodes[i - 2])) {
            throw new Error("matchGameRouteNodes: path contains an immediate U-turn");
        }
    }
    return nodes.length >= 2 ? { nodes, pointIndex } : null;
}
