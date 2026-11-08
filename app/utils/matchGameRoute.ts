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
    /** Ordered recent nodes determine which future transitions remain legal. */
    recent: number[];
    parent?: State;
};

/** U-turn guard window: number of most recent path nodes checked for revisits. */
const RECENT_WINDOW = 16;
// Ambiguous dense graphs can have exponentially many legal histories. Fail the
// whole match (caller reports/falls back) instead of discarding an arbitrary
// history and claiming a result from a lossy beam search.
const MAX_STATES_PER_POINT = 4096;
const MAX_TRANSITION_CHECKS = 2_000_000;

/** True when `node` is among the last `window` nodes of the path ending at `s`. */
function inRecent(s: State, node: number): boolean {
    return s.recent.includes(node);
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

    let exhausted = false, transitionChecks = 0;
    const stateKey = (s: State) => `${s.id}|${s.run}|${s.recent.join(",")}`;
    // Cost dominance is valid only when history and remaining skip budget agree.
    const offer = (next: Map<string, State>, s: State) => {
        const key = stateKey(s);
        const existing = next.get(key);
        if (!existing && next.size >= MAX_STATES_PER_POINT) { exhausted = true; return; }
        if (!existing || existing.cost > s.cost) next.set(key, s);
    };
    let states = new Map<string, State>();
    for (const c of groups[0]!) {
        const cost = c.distance ** 2;
        offer(states, { id: c.id, cost, run: 0, added: [c.id], group: 0, recent: [c.id] });
        if (exhausted) return null;
    }

    for (let g = 1; g <= last; g++) {
        const wanted = new Map<number, number>();
        for (const c of groups[g]!) if (!wanted.has(c.id) || wanted.get(c.id)! > c.distance) wanted.set(c.id, c.distance);
        const next = new Map<string, State>();

        // 1) direct edge or same node
        for (const s of states.values()) {
            if (++transitionChecks > MAX_TRANSITION_CHECKS || exhausted) return null;
            if (wanted.has(s.id)) {
                offer(next, { ...s, cost: s.cost + wanted.get(s.id)! ** 2, run: 0, added: [], group: g, parent: s });
            }
            for (const e of adjacency.get(s.id) ?? []) {
                if (++transitionChecks > MAX_TRANSITION_CHECKS || exhausted) return null;
                const d = wanted.get(e.to);
                if (d === undefined || inRecent(s, e.to)) continue;
                offer(next, { id: e.to, cost: s.cost + d ** 2, run: 0, added: [e.to], group: g, parent: s,
                    recent: [...s.recent.slice(-(RECENT_WINDOW - 1)), e.to] });
            }
        }
        // 2) skip this point (never the last one)
        if (g < last) {
            for (const s of states.values()) {
                if (s.run >= maxSkips) continue;
                offer(next, { ...s, cost: s.cost + skipPenalty, run: s.run + 1 });
                if (exhausted) return null;
            }
        }
        // 3) short detour, only if nothing else connects
        if (!next.size) {
            for (const s of states.values()) {
                // A node-level visited set would lose different detour histories
                // with different legal continuations after they converge.
                let frontier: number[][] = [[]];
                for (let hop = 1; hop <= maxDetourHops && frontier.length; hop++) {
                    const nf: number[][] = [];
                    for (const path of frontier) for (const e of adjacency.get(path[path.length - 1] ?? s.id) ?? []) {
                        if (++transitionChecks > MAX_TRANSITION_CHECKS || exhausted) return null;
                        if (path.includes(e.to) || inRecent(s, e.to)) continue;
                        const added = [...path, e.to];
                        if (nf.length >= MAX_STATES_PER_POINT) return null;
                        nf.push(added);
                        const d = wanted.get(e.to);
                        if (d === undefined) continue;
                        offer(next, { id: e.to, cost: s.cost + d ** 2 + hop, run: 0, added, group: g, parent: s,
                            recent: [...s.recent, ...added].slice(-RECENT_WINDOW) });
                    }
                    frontier = nf;
                }
            }
        }
        if (!next.size || exhausted) return null;
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
