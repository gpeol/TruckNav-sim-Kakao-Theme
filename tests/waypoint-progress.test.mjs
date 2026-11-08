import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { convertEts2ToGeo } from '../app/assets/utils/map/converters.ts';
const require = createRequire(import.meta.url);
const ts = require('typescript');
// App imports use Nuxt's extensionless resolution; resolve this dependency only
// in the isolated Node test module, without changing application compiler options.
const source = await readFile(new URL('../app/utils/waypointProgress.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText
    .replace('"../assets/utils/map/converters"', JSON.stringify(new URL('../app/assets/utils/map/converters.ts', import.meta.url).href));
const { buildWaypointProgress, clampSearchLimit, countPassedWaypoints, dropWaypoints, gameDistSq, WAYPOINT_REACHED_M } = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`);

// Real ETS2 scale: built in game units (m) near a PowerShell.txt sample point, then projected.
const X0 = 6000, Z0 = -21000;
const STEP = 20; // m between path points
const g = (x, z) => convertEts2ToGeo(X0 + x, Z0 + z);
// Road along +x at lateral offset z (m)
const line = (n, z = 0, x0 = 0) => Array.from({ length: n }, (_, i) => g(x0 + i * STEP, z));
const OFF_ROAD = 2000; // m lateral jump = deviation

// Mirrors RouteController.updateRouteProgress search + waypoint pruning; returns the stops a recalculation would use.
function drive(path, stops, positions, { fixed = true } = {}) {
    const list = stops.slice();
    const p = buildWaypointProgress(path, list);
    let best = 0;
    for (const truck of positions) {
        let limit = Math.min(path.length - 1, best + 500);
        if (fixed) limit = Math.max(Math.min(limit, best + 1), clampSearchLimit(p, limit));
        let min = Infinity, idx = best;
        for (let i = Math.max(0, best - 5); i < limit; i++) {
            const d = (truck[0] - path[i][0]) ** 2 + (truck[1] - path[i][1]) ** 2;
            if (d < min) { min = d; idx = i; }
        }
        best = idx;
        if (fixed) { const n = countPassedWaypoints(p, path, best, truck); list.splice(0, n); dropWaypoints(p, n); }
    }
    return list;
}

test('reproduces bug: without pruning, a passed waypoint is still in the recalculation list', () => {
    const path = line(100);
    const stops = [path[30], path[60], path[99]];
    const after = drive(path, stops, path.slice(0, 45), { fixed: false });
    assert.deepEqual(after[0], path[30]); // recalculation would route back to stop 1
});

test('2 waypoints + destination: first waypoint passed then deviation keeps only remaining stops', () => {
    const path = line(100);
    const stops = [path[30], path[60], path[99]];
    const drivePos = [...path.slice(0, 45), g(45 * STEP, OFF_ROAD)]; // then leaves the road (deviation)
    assert.deepEqual(drive(path, stops, drivePos), [path[60], path[99]]);
});

test('dead-end waypoint (yard in and out on same road)', () => {
    const inbound = line(40);                    // 0..39, tip at 39
    const outbound = line(39, 3).reverse();      // back out on the opposite lane (3 m)
    const onward = Array.from({ length: 30 }, (_, i) => g(-(i + 1) * STEP, 3));
    const path = [...inbound, ...outbound, ...onward];
    const stops = [inbound[39], path[path.length - 1]];
    const p = buildWaypointProgress(path, stops);
    assert.equal(p.indices[0], 39);
    assert.equal(p.deadEnd[0], true);
    // Driving in up to 200 m before the tip must not mark it passed (outbound leg is right next to us)
    assert.equal(drive(path, stops, inbound.slice(0, 30)).length, 2);
    // Reaching the tip and driving out removes it
    assert.deepEqual(drive(path, stops, [...inbound, ...outbound.slice(0, 10)]), [path[path.length - 1]]);
});

test('scale sanity: map degrees are game-scale, not earth-scale', () => {
    const d = Math.sqrt(gameDistSq(g(0, 0), g(30, 0)));
    assert.ok(Math.abs(d - 30) < 0.01, `30 m in game units, got ${d}`);
    assert.equal(WAYPOINT_REACHED_M, 50);
});

test('dead-end yard: truck loops through yard 30 m from the waypoint node and leaves on the same road', () => {
    const tipX = 39 * STEP;
    const inbound = line(40);
    const outbound = line(39, 3).reverse();
    const onward = Array.from({ length: 30 }, (_, i) => g(-(i + 1) * STEP, 3));
    const path = [...inbound, ...outbound, ...onward];
    const stops = [inbound[39], path[path.length - 1]];
    // Truck stops 30 m short of the node, swings through the yard, never touches the node
    const yard = [g(tipX - 30, 0), g(tipX - 30, 15), g(tipX - 35, 5)];
    const drivePos = [...inbound.slice(0, 38), ...yard, ...outbound.slice(3, 20)];
    assert.deepEqual(drive(path, stops, drivePos), [path[path.length - 1]]);
});

test('passing on a parallel road 60 m away does not count as reaching a dead-end waypoint', () => {
    const inbound = line(40);
    const outbound = line(39, 3).reverse();
    const onward = Array.from({ length: 30 }, (_, i) => g(-(i + 1) * STEP, 3));
    const path = [...inbound, ...outbound, ...onward];
    const stops = [inbound[39], path[path.length - 1]];
    const p = buildWaypointProgress(path, stops);
    const side = line(60, 60); // parallel road 60 m off, runs past the tip
    for (const truck of side) countPassedWaypoints(p, path, 0, truck);
    assert.equal(p.reached[0], false);
    assert.equal(drive(path, stops, side).length, 2);
});

test('deviation before reaching a waypoint keeps it', () => {
    const path = line(100);
    const stops = [path[30], path[60], path[99]];
    assert.deepEqual(drive(path, stops, [...path.slice(0, 20), g(20 * STEP, OFF_ROAD)]), stops);
});

test('destination is never pruned by waypoint progress', () => {
    const path = line(50);
    const stops = [path[49]];
    assert.deepEqual(drive(path, stops, path), stops);
});

test('sparse straight segment locates and visits the actual projected waypoint, not a distant vertex', () => {
    const path = [g(0, 0), g(1000, 0), g(2000, 0)];
    const stops = [g(500, 0), path[2]];
    const p = buildWaypointProgress(path, stops);
    assert.ok(Math.abs(p.indices[0] - 0.5) < 1e-8);
    assert.ok(gameDistSq(p.points[0], stops[0]) < 1e-6);
    assert.equal(countPassedWaypoints(p, path, 0, g(0, 0)), 0);
    assert.equal(p.reached[0], false);
    assert.equal(countPassedWaypoints(p, path, 0, g(520, 0)), 1);
    dropWaypoints(p, 1);
    assert.equal(p.points.length, 1);
    assert.equal(countPassedWaypoints(p, path, 1, path[2]), 0);
});

test('waypoints in the same sparse segment are projected in order', () => {
    const path = [g(0, 0), g(2000, 0)];
    const p = buildWaypointProgress(path, [g(500, 0), g(1500, 0), path[1]]);
    assert.ok(Math.abs(p.indices[0] - 0.25) < 1e-8);
    assert.ok(Math.abs(p.indices[1] - 0.75) < 1e-8);
    assert.equal(countPassedWaypoints(p, path, 0, g(510, 0)), 1);
    assert.equal(countPassedWaypoints(p, path, 0, g(1510, 0)), 2);
});

test('detouring past a through waypoint preserves it until it was actually visited', () => {
    const path = line(100);
    const stops = [path[30], path[60], path[99]];
    const p = buildWaypointProgress(path, stops);
    assert.equal(p.deadEnd[0], false);
    assert.equal(countPassedWaypoints(p, path, 55, g(55 * STEP, OFF_ROAD)), 0);
    assert.equal(countPassedWaypoints(p, path, 55, path[55]), 0);
    assert.equal(p.reached[0], false);
    assert.deepEqual(drive(path, stops, [...path.slice(0, 20), g(55 * STEP, OFF_ROAD), path[55]]), stops);
});

test('repeated final-vertex stops retain the final anchor when no segments remain', () => {
    const path = [g(0, 0), g(1000, 0)];
    const p = buildWaypointProgress(path, [path[1], path[1], path[1]]);
    assert.deepEqual(p.indices, [1, 1, 1]);
    for (const point of p.points) assert.ok(gameDistSq(point, path[1]) < 1e-6);
    assert.equal(countPassedWaypoints(p, path, 0, path[0]), 0);
    assert.deepEqual(p.reached, [false, false, false]);
    assert.equal(countPassedWaypoints(p, path, 0, path[1]), 2);
});
