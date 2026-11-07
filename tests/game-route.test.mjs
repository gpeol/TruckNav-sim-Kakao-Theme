import test from 'node:test';
import assert from 'node:assert/strict';
import { gameRouteWaypoints } from '../app/utils/gameRoute.ts';

const telemetry = { game: 'Ets2', navigation: { distance: 10000 }, truck: { current: { position: { x: 10, z: 20 } } } };
const active = { state: 'active', points: [[10, 20, 9900], [30, 40, 6000], [60, 80, 0]] };

test('uses validated game waypoints only when the route matches current telemetry', () => {
    assert.deepEqual(gameRouteWaypoints(active, telemetry), [[60, 80]]);
    assert.deepEqual(gameRouteWaypoints({ ...active, waypoints:[[30, 40], [60, 80]] }, telemetry), [[30, 40], [60, 80]]);
    assert.equal(gameRouteWaypoints({ ...active, waypoints:[[60, 80], [30, 40]] }, telemetry), null);
    assert.equal(gameRouteWaypoints({ ...active, waypoints:[[999, 999], [60, 80]] }, telemetry), null);
    assert.equal(gameRouteWaypoints({ state: 'inactive' }, telemetry), null);
    assert.equal(gameRouteWaypoints(active, { ...telemetry, game: 'Ats' }), null);
    assert.equal(gameRouteWaypoints(active, { ...telemetry, navigation: { distance: 0 } }), null);
    assert.equal(gameRouteWaypoints(active, { ...telemetry, truck: { current: { position: { x: 50000, z: 20 } } } }), null);
    assert.equal(gameRouteWaypoints({ ...active, points: [[10, 20, 500], [30, 40, 9000], [60, 80, 0]] }, telemetry), null);
    assert.equal(gameRouteWaypoints({ ...active, points: [[10, 20, 10000], [60, NaN, 0]] }, telemetry), null);
});
