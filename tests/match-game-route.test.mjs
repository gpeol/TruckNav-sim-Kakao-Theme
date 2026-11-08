import test from 'node:test';
import assert from 'node:assert/strict';
import { matchGameRouteNodes } from '../app/utils/matchGameRoute.ts';

test('matches the connected game route even when closer nodes belong to another road', () => {
    const graph = new Map([[1,[{to:2}]], [2,[{to:3}]], [4,[{to:5}]]]);
    const groups = [
        [{id:1,distance:3}, {id:4,distance:1}],
        [{id:2,distance:3}, {id:5,distance:1}],
        [{id:3,distance:3}],
    ];
    assert.deepEqual(matchGameRouteNodes(groups, graph)?.nodes, [1,2,3]);
    assert.equal(matchGameRouteNodes(groups.slice().reverse(), graph), null);
    // A point without a nearby graph node is skipped (robustness check, not the observed cause).
    assert.deepEqual(matchGameRouteNodes([groups[0], [], groups[2]], graph)?.nodes, [1,2,3]);
    assert.equal(matchGameRouteNodes([groups[0]], graph), null);
});

test('allows a long loop that legitimately passes the same junction twice', () => {
    // 0 -> 1 -> ... -> 19 -> 0 -> 100 (loop of 20 nodes, longer than the 16-node U-turn window)
    const graph = new Map();
    for (let i = 0; i < 20; i++) graph.set(i, [{ to: (i + 1) % 20 }]);
    graph.get(0).push({ to: 100 });
    const ids = [...Array(20).keys(), 0, 100];
    const groups = ids.map(id => [{ id, distance: 0 }]);
    assert.deepEqual(matchGameRouteNodes(groups, graph)?.nodes, ids);
});

test('rejects an immediate A->B->A U-turn', () => {
    const graph = new Map([[1, [{ to: 2 }]], [2, [{ to: 1 }, { to: 3 }]], [3, []]]);
    const groups = [[{ id: 1, distance: 0 }], [{ id: 2, distance: 0 }], [{ id: 1, distance: 0 }], [{ id: 3, distance: 0 }]];
    const m = matchGameRouteNodes(groups, graph);
    assert.ok(m);
    for (let k = 2; k < m.nodes.length; k++) assert.notEqual(m.nodes[k], m.nodes[k - 2]);
});
