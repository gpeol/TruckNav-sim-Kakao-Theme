import test from 'node:test';
import assert from 'node:assert/strict';
import { routeProgress } from '../app/utils/routeProgress.ts';

test('route progress is derived from current and total path distances', () => {
    const stats = new Float32Array([0,0,0, 25,0,0, 100,0,0]);
    assert.equal(routeProgress(stats, 3, 1), 0.25);
    assert.equal(routeProgress(stats, 3, 7), 1);
    assert.equal(routeProgress(stats, 3, -1), 0);
    assert.equal(routeProgress(null, 3, 1), null);
    assert.equal(routeProgress(new Float32Array(6), 2, 0), null);
    assert.equal(routeProgress(stats, 4, 0), null);
});
