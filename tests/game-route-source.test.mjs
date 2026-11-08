import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { createGameRouteSource } from '../scripts/game-route-source.mjs';

test('game route helper retries after backoff, ignores dead output, and never restarts after stop', () => {
    let time = 0;
    const children = [];
    const source = createGameRouteSource({ now: () => time, spawnFn: (_exe, args, options) => {
        assert.ok(args.includes('Bypass'));
        assert.ok(args.includes('-ParentProcessId'));
        assert.equal(options.windowsHide, true);
        const child = new EventEmitter();
        child.stdout = new PassThrough(); child.stderr = new PassThrough();
        child.kill = () => { child.killed = true; };
        children.push(child); return child;
    } });
    children[0].stdout.write('{"state":"active","points":[]}\n');
    assert.equal(source.get().state, 'active');
    children[0].emit('exit');
    assert.deepEqual(source.get(), {state:'unavailable'});
    time = 4999; source.get(); assert.equal(children.length, 1);
    time = 5000; source.get(); assert.equal(children.length, 2);
    children[0].stdout.write('{"state":"active","points":[]}\n');
    assert.deepEqual(source.get(), {state:'unavailable'});
    children[1].stdout.write('{"state":"inactive"}\n');
    assert.equal(source.get().state, 'inactive');
    source.stop(); assert.equal(children[1].killed, true);
    children[1].emit('exit'); time = 20000;
    assert.deepEqual(source.get(), {state:'unavailable'});
    assert.equal(children.length, 2);
});
