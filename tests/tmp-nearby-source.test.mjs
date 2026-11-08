import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { createTmpNearbySource } from '../scripts/tmp-nearby-source.mjs';

test('nearby source validates snapshots and expires or clears stale positions', () => {
    let time = 10000;
    const child = new EventEmitter();
    child.stdout = new PassThrough();
    child.kill = () => { child.killed = true; };
    const source = createTmpNearbySource({ spawnFn: () => child, now: () => time });
    const unavailable = { state: 'unavailable', vehicles: [] };
    assert.deepEqual(source.get(), unavailable);
    child.stdout.write('{"state":"active","vehicles":[[1,2]]}\n');
    assert.deepEqual(source.get(), { state: 'active', vehicles: [[1, 2]] });
    time += 2000;
    assert.deepEqual(source.get(), unavailable);
    child.stdout.write('{"state":"inactive","vehicles":[]}\n');
    assert.deepEqual(source.get(), { state: 'inactive', vehicles: [] });
    child.stdout.write('{"state":"active","vehicles":[[1,100001]]}\n');
    assert.deepEqual(source.get(), unavailable);
    child.stdout.write('{"state":"inactive","vehicles":[[1,2]]}\n');
    assert.deepEqual(source.get(), unavailable);
    child.stdout.write('{"state":"active","vehicles":[[1,2]]}\n');
    child.emit('exit');
    assert.deepEqual(source.get(), unavailable);
    source.stop();
    assert.equal(child.killed, undefined); // The child already exited.
});

test('nearby helper retries after backoff but never after stop', () => {
    let time = 0, spawned = 0;
    const children = [];
    const source = createTmpNearbySource({ now: () => time, spawnFn: (_exe, args, options) => {
        assert.ok(args.includes('Bypass'));
        assert.ok(args.includes('-ParentProcessId'));
        assert.equal(options.windowsHide, true);
        const child = new EventEmitter(); child.stdout = new PassThrough(); child.stderr = new PassThrough(); child.kill = () => {};
        children.push(child); spawned++; return child;
    } });
    children[0].emit('exit'); source.get(); assert.equal(spawned, 1);
    time = 5000; source.get(); assert.equal(spawned, 2);
    source.stop(); time = 10000; children[1].emit('exit'); source.get(); assert.equal(spawned, 2);
});
