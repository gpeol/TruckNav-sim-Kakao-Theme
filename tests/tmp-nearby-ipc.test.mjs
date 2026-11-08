import test from 'node:test';
import assert from 'node:assert/strict';
import { registerTmpNearbyIpc } from '../electron/src/tmpNearbyIpc.ts';

function fixture(load, supported = () => true) {
    const handlers = new Map();
    const frame = { url: 'capacitor-electron://-/' };
    const contents = { mainFrame: frame };
    const stop = registerTmpNearbyIpc({ handle: (name, fn) => handlers.set(name, fn) },
        () => ({ webContents: contents }), () => 'capacitor-electron', () => '/source.mjs', supported, load);
    return { handlers, frame, event: { sender: contents, senderFrame: frame }, stop };
}

test('nearby IPC rejects untrusted frames and lazily stops its source', async () => {
    let created = 0, stopped = 0;
    const f = fixture(async () => ({ createTmpNearbySource: () => {
        created++; return { get: () => ({ state: 'active', vehicles: [[1, 2]] }), stop: () => { stopped++; } };
    } }));
    const read = f.handlers.get('tmp-nearby-read');
    await assert.rejects(read({ sender: {}, senderFrame: f.frame }), /Untrusted/);
    assert.equal(created, 0);
    assert.deepEqual(await read(f.event), { state: 'active', vehicles: [[1, 2]] });
    assert.equal(created, 1);
    await f.handlers.get('tmp-nearby-stop')(f.event);
    f.stop();
    assert.equal(stopped, 1);
});

test('stopping while loading or running on an unsupported platform returns unavailable', async () => {
    let release, created = 0;
    const delayed = new Promise(resolve => { release = resolve; });
    const f = fixture(() => delayed);
    const read = f.handlers.get('tmp-nearby-read')(f.event);
    await f.handlers.get('tmp-nearby-stop')(f.event);
    release({ createTmpNearbySource: () => { created++; } });
    assert.deepEqual(await read, { state: 'unavailable', vehicles: [] });
    assert.equal(created, 0);
    const unsupported = fixture(() => { throw new Error('must not load'); }, () => false);
    assert.deepEqual(await unsupported.handlers.get('tmp-nearby-read')(unsupported.event), { state: 'unavailable', vehicles: [] });
});
