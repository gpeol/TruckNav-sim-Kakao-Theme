import test from 'node:test';
import assert from 'node:assert/strict';
import { parseRouteDuration, formatRouteDuration, formatRouteArrival } from '../app/utils/routeTime.ts';

test('formats remaining time without changing unknown estimates', () => {
    assert.equal(parseRouteDuration('~ 3h 39min'), 219);
    assert.equal(parseRouteDuration('3h 99min'), null);
    assert.equal(formatRouteDuration('3h 39min', 'ko'), '3시간 39분');
    assert.equal(formatRouteDuration('0h 7min', 'ko'), '7분');
    assert.equal(formatRouteDuration('~ 0h 44min', 'ko'), '44분');
    assert.equal(formatRouteDuration('~ 0h 44min', 'en'), '0h 44min');
    assert.equal(formatRouteDuration('Arriving...', 'ko'), 'Arriving...');
});

test('arrival uses the chosen clock and handles a day boundary', () => {
    const now = new Date(2026, 0, 2, 10, 15);
    assert.equal(formatRouteArrival('0h 45min', 'game', 'Mon 23:30', true, now, 'ko'), '오전 12:15 (+1일)');
    assert.equal(formatRouteArrival('0h 45min', 'game', 'Mon 23:30', false, now, 'ko'), null);
    assert.equal(formatRouteArrival('0h 45min', 'game', 'invalid', true, now, 'en'), null);
    assert.equal(formatRouteArrival('~ 1h 5min', 'real', '', false, now, 'en'), '11:20');
    assert.equal(formatRouteArrival('Arriving...', 'game', 'Mon 10:00', true, now, 'ko'), null);
});
