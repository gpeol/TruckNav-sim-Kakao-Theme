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


test('keeps converged paths with distinct recent-node histories', () => {
    const expected = [2, 4, 5, 6, 7, 8, 9, 10, 11, 3, 12];
    const edges = [[1,3],[3,5],[2,4],[4,5],[5,6],[6,7],[7,8],[8,9],[9,10],[10,11],[11,3],[3,12]];
    const graph = new Map();
    for (const [from,to] of edges) { if (!graph.has(from)) graph.set(from,[]); graph.get(from).push({to}); }
    const groups = [[{id:1,distance:0},{id:2,distance:1}], [{id:3,distance:0},{id:4,distance:1}],
        ...expected.slice(2).map(id => [{id,distance:0}])];
    assert.deepEqual(matchGameRouteNodes(groups, graph)?.nodes, expected);
});

test('preserves the more expensive reset state when cheaper skip state exhausts its budget', () => {
    const groups = [[{id:1,distance:0}], [{id:1,distance:50}], [], [], [], [{id:2,distance:0}]];
    const result = matchGameRouteNodes(groups, new Map([[1,[{to:2}]]]));
    assert.deepEqual(result?.nodes, [1,2]);
    assert.deepEqual(result?.pointIndex, [0,0,-1,-1,-1,1]);
});


test('bounded search rejects combinatorial ambiguity rather than silently merging histories', {timeout: 5000}, () => {
    const groups = Array.from({length:20},(_,level)=>Array.from({length:8},(_,branch)=>({id:level*8+branch,distance:branch})));
    const graph = new Map();
    for(let level=0;level<19;level++) for(const candidate of groups[level])
        graph.set(candidate.id,groups[level+1].map(c=>({to:c.id})));
    assert.equal(matchGameRouteNodes(groups,graph),null);
});

test('matches the reader maximum of 6000 points with connected output', () => {
    const groups=Array.from({length:6000},(_,id)=>[{id,distance:0}]);
    const graph=new Map(groups.slice(0,-1).map(([c])=>[c.id,[{to:c.id+1}]]));
    const match=matchGameRouteNodes(groups,graph);
    assert.deepEqual(match?.nodes,groups.map(([c])=>c.id));
    assert.deepEqual(match?.pointIndex,groups.map(([c])=>c.id));
});


test('keeps distinct detour histories that converge before a future revisit', () => {
    const graph=new Map([[1,[{to:2},{to:3}]],[2,[{to:4},{to:5}]],[3,[{to:4}]],[4,[{to:2}]]]);
    const groups=[1,4,2,5].map(id=>[{id,distance:0}]);
    assert.deepEqual(matchGameRouteNodes(groups,graph,{maxSkips:0})?.nodes,[1,3,4,2,5]);
});
