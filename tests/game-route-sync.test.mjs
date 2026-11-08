import test from 'node:test';
import assert from 'node:assert/strict';
import { matchGameRouteNodes } from '../app/utils/matchGameRoute.ts';
import { convertEts2ToGeo, convertGeoToEts2 } from '../app/assets/utils/map/converters.ts';

import fs from 'node:fs';

// Synthetic graph: A(1) -> B(2) -> C(3) -> D(4). Kept as a robustness check for
// unmatched points; real ETS2 data (see fixture test below) is almost 1:1.
const graph = new Map([[1, [{ to: 2 }]], [2, [{ to: 3 }]], [3, [{ to: 4 }]]]);

test('up to three consecutive unmatched points are skipped', () => {
    const groups = [[{ id: 1, distance: 2 }], [], [], [], [{ id: 2, distance: 3 }], [], [{ id: 4, distance: 1 }]];
    const match = matchGameRouteNodes(groups, graph);
    assert.deepEqual(match?.nodes, [1, 2, 3, 4]);
    assert.deepEqual(match?.pointIndex, [0, -1, -1, -1, 1, -1, 3]);
});

test('consecutive game points mapping to the same graph node are accepted', () => {
    const groups = [[{ id: 1, distance: 2 }], [{ id: 1, distance: 30 }], [{ id: 2, distance: 1 }]];
    assert.deepEqual(matchGameRouteNodes(groups, graph)?.nodes, [1, 2]);
});

test('still rejects routes that go against edge direction or end off-graph', () => {
    assert.equal(matchGameRouteNodes([[{ id: 4, distance: 1 }], [{ id: 1, distance: 1 }]], graph), null);
    assert.equal(matchGameRouteNodes([[{ id: 1, distance: 1 }], []], graph), null);
    assert.equal(matchGameRouteNodes([[{ id: 1, distance: 1 }]], graph), null);
});

test('waypoint coordinates survive the geo round trip within the 0.01 stop tolerance', () => {
    let worst = 0;
    for (const [x, z] of [[-31337.25, -12000.5], [70000.00390625, -60000.99609375], [12.5, 5.25]]) {
        const [gx, gz] = convertGeoToEts2(...convertEts2ToGeo(x, z));
        worst = Math.max(worst, Math.hypot(gx - x, gz - z));
    }
    assert.ok(worst < 0.01, `round trip error ${worst}`);
});

test('more than three consecutive unmatched points fail', () => {
    const groups = [[{ id: 1, distance: 2 }], [], [], [], [], [{ id: 2, distance: 3 }]];
    assert.equal(matchGameRouteNodes(groups, graph), null);
});

test('real ETS2 points 512-517: side-branch point 515 is skipped without a U-turn', () => {
    const fx = JSON.parse(fs.readFileSync(new URL('./fixtures/game-route-fixture-p515.json', import.meta.url), 'utf8'));
    const adjacency = new Map(Object.entries(fx.edges).map(([u, vs]) => [Number(u), vs.map(to => ({ to }))]));
    const groups = fx.points.map(([x, z]) => Object.entries(fx.nodes)
        .map(([id, [nx, nz]]) => ({ id: Number(id), distance: Math.hypot(nx - x, nz - z) }))
        .filter(c => c.distance <= 40).sort((a, b) => a.distance - b.distance));
    assert.deepEqual(groups[3].map(c => c.id), [101776]);
    const match = matchGameRouteNodes(groups, adjacency);
    assert.ok(match);
    for (let k = 2; k < match.nodes.length; k++) assert.notEqual(match.nodes[k], match.nodes[k - 2], 'no A->B->A U-turn');
    assert.ok(!match.nodes.includes(101776), 'no detour into the 101776 side branch');
    const i = match.nodes.indexOf(68379);
    assert.equal(match.nodes[i + 1], 101777);
    assert.equal(match.pointIndex[3], -1);
    assert.deepEqual(match.pointIndex.filter(k => k < 0).length, 1);
    for (let k = 1; k < match.nodes.length; k++) {
        assert.ok(adjacency.get(match.nodes[k - 1]).some(e => e.to === match.nodes[k]));
    }
});
