import test from 'node:test';
import assert from 'node:assert/strict';
import { generateDirectionsList, roundaboutExitClock, roundaboutClockFromEdges } from '../app/assets/utils/routing/directions.ts';

test('roundabout clock directions are relative to the approach', () => {
    const before = [0, -1], entry = [0, 0], center = [0, 1];
    assert.equal(roundaboutExitClock(before, entry, center, [1, 1]), 3);
    assert.equal(roundaboutExitClock(before, entry, center, [-1, 1]), 9);
    assert.equal(roundaboutExitClock(before, entry, center, [0, 2]), 12);
    assert.equal(roundaboutExitClock(before, entry, center, [0, 0]), 6);
    assert.equal(roundaboutExitClock(before, before, center, [0, 0]), undefined);
});

test('untagged roundabout exits use road geometry rather than node-to-node shortcuts', () => {
    const geometry = new Float32Array([0,-2, 0,-1, 0,0, 1,0, 2,0]);
    const clock = roundaboutClockFromEdges(geometry, {startIndex:0,pointCount:3}, {startIndex:4,pointCount:3});
    assert.equal(clock, 3);
    const steps = generateDirectionsList([1,2,3,4], new Float32Array([0,1,2,3]), new Int8Array([0,3,0,0]), new Int8Array([0,0,0,0]), new Map([[1,[0,-1]],[2,[0,0]],[3,[1,1]],[4,[2,1]]]), new Int8Array([0,clock,0,0]));
    assert.equal(steps[1].exitClock, 3);
    assert.equal(steps[1].exitCumulativeKm, 2);
    assert.equal(roundaboutClockFromEdges(geometry, {startIndex:0,pointCount:99}, {startIndex:4,pointCount:3}), undefined);
    assert.equal(roundaboutClockFromEdges(new Float32Array([1,1,1,1]), {startIndex:0,pointCount:2}, {startIndex:0,pointCount:2}), undefined);
});

test('roundabout directions use the tagged exit and fall back when it is missing', () => {
    const points = new Map([[1,[0,-1]],[2,[0,0]],[3,[0,1]],[4,[1,1]],[5,[2,1]]]);
    const make = exits => generateDirectionsList([1,2,3,4,5], new Float32Array([0,1,2,3,4]), new Int8Array([0,3,3,0,0]), new Int8Array(exits), points);
    const turn = make([0,1,-2,0,0])[1];
    assert.equal(turn.type, 'roundabout');
    assert.equal(turn.exitClock, 3);
    assert.equal(turn.exitCount, 1);
    assert.equal(turn.exitCumulativeKm, 3);
    assert.deepEqual(turn.exitCoords, [1,1]);
    assert.equal(make([0,0,-1,0,0])[1].exitClock, undefined);
});

test('starting inside a roundabout does not announce a new entry or hide later roundabouts', () => {
    for (const initialExit of [-1, -2]) {
        const steps = generateDirectionsList(
            [1,2,3,4,5,6,7], new Float32Array([0,1,2,3,4,5,6]),
            new Int8Array([3,3,0,3,3,0,0]), new Int8Array([initialExit,-2,0,2,-2,0,0]),
            new Map([[1,[0,0]],[2,[0,1]],[3,[1,1]],[4,[2,1]],[5,[2,2]],[6,[3,2]],[7,[4,2]]]),
        );
        const roundabouts = steps.filter(step => step.type === 'roundabout');
        assert.equal(roundabouts.length, 1);
        assert.equal(roundabouts[0].id, 4);
        assert.equal(roundabouts[0].exitCount, 2);
    }
});
