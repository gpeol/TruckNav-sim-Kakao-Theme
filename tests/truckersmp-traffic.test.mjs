import test from 'node:test';
import assert from 'node:assert/strict';
import { estimateTruckersMpTraffic, updateTrafficHistory } from '../app/utils/truckersMpTraffic.ts';

const now = 1_700_000_030_000;
const route = [[0, 0], [500, 0], [1000, 0]];
const sample = (vehicles, observedAt = now, serverId = 2) => ({ serverId, observedAt, vehicles });
const vehicle = (id, x, z, time) => ({ id, x, z, time });

test('fast marker updates retain a sufficiently old baseline for congestion', () => {
    let history = [];
    for (const seconds of [0, 6, 12, 18, 24]) {
        const updated = updateTrafficHistory(history, sample([], now + seconds * 1000));
        history = updated.history;
        if (seconds < 18) assert.equal(updated.previous, null);
        if (seconds === 18) assert.equal(updated.previous.observedAt, now);
        if (seconds === 24) assert.equal(updated.previous.observedAt, now + 6000);
    }
    const switched = updateTrafficHistory(history, sample([], now + 30_000, 3));
    assert.equal(switched.previous, null);
    assert.equal(switched.history.length, 1);
});

test('classifies only a route section with several observed slow vehicles', () => {
    const previous = sample([1, 2, 3].map(id => vehicle(id, 50 * id, 0, 1_700_000_000)), now - 30_000);
    const current = sample([...previous.vehicles.map(v => ({ ...v, x: v.x + 2, time: v.time + 30 })),
        vehicle(4, 900, 100, 1_700_000_030)]);
    assert.deepEqual(estimateTruckersMpTraffic(route, previous, current, now), [{
        coordinates: [[0, 0], [400, 0]], level: 'congested', vehicles: 3, slowVehicles: 3, startProgress: 0, endProgress: 0.4,
    }]);
});

test('does not report congestion for moving, stale, duplicate or unrelated observations', () => {
    const previous = sample([1, 2, 3].map(id => vehicle(id, 40 * id, 0, 1_700_000_000)), now - 30_000);
    const moving = sample(previous.vehicles.map(v => ({ ...v, x: v.x + 60, time: v.time + 30 })));
    assert.deepEqual(estimateTruckersMpTraffic(route, previous, moving, now), []);
    const duplicates = sample(Array(3).fill({ ...previous.vehicles[0], time: 1_700_000_030 }));
    assert.deepEqual(estimateTruckersMpTraffic(route, previous, duplicates, now), []);
    assert.deepEqual(estimateTruckersMpTraffic(route, previous, sample(moving.vehicles, now, 3), now), []);
    assert.deepEqual(estimateTruckersMpTraffic(route, previous, moving, now + 91_000), []);
    assert.deepEqual(estimateTruckersMpTraffic(route, previous, sample(previous.vehicles), now), []);
});

test('does not show observed traffic behind the vehicle', () => {
    const previous = sample([1, 2, 3].map(id => vehicle(id, 40 * id, 0, 1_700_000_000)), now - 30_000);
    const current = sample(previous.vehicles.map(v => ({ ...v, time: v.time + 30 })));
    assert.equal(estimateTruckersMpTraffic(route, previous, current, now).length, 1);
    assert.deepEqual(estimateTruckersMpTraffic(route, previous, current, now, 1), []);
});

test('keeps route-distance sections stable as the vehicle advances', () => {
    const longRoute = [[0, 0], [300, 0], [600, 0], [900, 0]];
    const previous = sample([1, 2, 3].map(id => vehicle(id, 400 + 40 * id, 0, 1_700_000_000)), now - 30_000);
    const current = sample(previous.vehicles.map(v => ({ ...v, time: v.time + 30 })));
    const full = estimateTruckersMpTraffic(longRoute, previous, current, now);
    const ahead = estimateTruckersMpTraffic(longRoute, previous, current, now, 1);
    assert.deepEqual(ahead, full);
    assert.deepEqual(ahead[0].coordinates, [[400, 0], [600, 0], [800, 0]]);
});

test('does not extend a partly travelled traffic section into the next section', () => {
    const longRoute = [[0, 0], [300, 0], [600, 0], [900, 0]];
    const previous = sample([1, 2, 3].map(id => vehicle(id, 320 + 20 * id, 0, 1_700_000_000)), now - 30_000);
    const current = sample(previous.vehicles.map(v => ({ ...v, time: v.time + 30 })));
    const ahead = estimateTruckersMpTraffic(longRoute, previous, current, now, 1);
    assert.deepEqual(ahead[0].coordinates, [[300, 0], [400, 0]]);
});

test('positions congestion using the same scaled route distance as the progress marker', () => {
    const previous = sample([1, 2, 3].map(id => vehicle(id, 40 * id, 0, 1_700_000_000)), now - 30_000);
    const current = sample(previous.vehicles.map(v => ({ ...v, time: v.time + 30 })));
    const stats = new Float32Array([0, 0, 0, 10, 0, 0, 30, 0, 0]);
    const [segment] = estimateTruckersMpTraffic(route, previous, current, now, 0, stats);
    assert.equal(segment.startProgress, 0);
    assert.ok(Math.abs(segment.endProgress - 8 / 30) < 1e-6);
});

test('uses the same movement rate for different observation intervals', () => {
    const currentTime = 1_700_000_030;
    function observations(seconds, displacement) {
        const current = sample([1, 2, 3].map(id => vehicle(id, 50 * id, 0, currentTime)));
        const previous = sample(current.vehicles.map(v => ({ ...v, x: v.x - displacement, time: v.time - seconds })), now - seconds * 1000);
        return [previous, current];
    }
    const [shortPrevious, shortCurrent] = observations(15, 3);
    const [longPrevious, longCurrent] = observations(60, 12);
    const [fastPrevious, fastCurrent] = observations(60, 30);
    assert.equal(estimateTruckersMpTraffic(route, shortPrevious, shortCurrent, now).length, 1);
    assert.equal(estimateTruckersMpTraffic(route, longPrevious, longCurrent, now).length, 1);
    assert.equal(estimateTruckersMpTraffic(route, fastPrevious, fastCurrent, now).length, 0);
});
