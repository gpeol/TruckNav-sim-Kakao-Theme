import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { createGameRouteSource } from '../scripts/game-route-source.mjs';
import { createTmpNearbySource } from '../scripts/tmp-nearby-source.mjs';

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

for (const [name, factory, unavailable, recovered] of [
    ['game route', createGameRouteSource, { state: 'unavailable' }, { state: 'inactive' }],
    ['nearby', createTmpNearbySource, { state: 'unavailable', vehicles: [] }, { state: 'inactive', vehicles: [] }],
]) {
    test(`${name} permanent failures back off to sixty seconds and recovery resets the delay`, () => {
        let time = 0;
        const children = [];
        const source = factory({ now: () => time, spawnFn: () => {
            const child = new EventEmitter();
            child.stdout = new PassThrough(); child.stderr = new PassThrough();
            child.kill = () => { child.killed = true; };
            children.push(child); return child;
        } });
        for (const delay of [5000, 10000, 20000, 40000, 60000, 60000]) {
            const failed = children.at(-1);
            failed.stdout.write(JSON.stringify(unavailable) + '\n');
            failed.emit('error', new Error('fixture permanent failure'));
            failed.emit('exit'); // error + exit must count as one failed attempt.
            const count = children.length;
            time += delay - 1;
            for (let poll = 0; poll < 10; poll++) source.get();
            assert.equal(children.length, count);
            time++;
            source.get(); assert.equal(children.length, count + 1);
        }
        // At the cap, stale output must not reset the replacement's delay.
        const cappedChild = children.at(-1);
        children[0].stdout.write(JSON.stringify(recovered) + '\n');
        cappedChild.emit('exit');
        const cappedCount = children.length;
        time += 59999; source.get(); assert.equal(children.length, cappedCount);
        time++; source.get(); assert.equal(children.length, cappedCount + 1);
        const recoveredChild = children.at(-1);
        recoveredChild.stdout.write(JSON.stringify(recovered) + '\n');
        assert.deepEqual(source.get(), recovered);
        // Dead child output must not reset the recovered child's future backoff.
        children[0].stdout.write(JSON.stringify(recovered) + '\n');
        recoveredChild.emit('exit');
        const count = children.length;
        time += 4999; source.get(); assert.equal(children.length, count);
        time++; source.get(); assert.equal(children.length, count + 1);
        source.stop(); children.at(-1).emit('exit');
        time += 60000; source.get(); assert.equal(children.length, count + 1);
    });

    test(`${name} synchronous spawn failures retain the source and use the same backoff`, () => {
        let time = 0, attempts = 0;
        const source = factory({ now: () => time, spawnFn: () => { attempts++; throw Error('fixture spawn failure'); } });
        assert.equal(attempts, 1);
        time = 4999; source.get(); assert.equal(attempts, 1);
        time = 5000; source.get(); assert.equal(attempts, 2);
        time = 14999; source.get(); assert.equal(attempts, 2);
        time = 15000; source.get(); assert.equal(attempts, 3);
        source.stop(); time += 60000; source.get(); assert.equal(attempts, 3);
    });
}
