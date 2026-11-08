import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { registerGameRouteIpc } from '../electron/src/gameRouteIpc.ts';

function fixture(load, supported = () => true) {
    const handlers = new Map();
    const frame = {url:'capacitor-electron://-/index.html'};
    const contents = {mainFrame:frame};
    const stop = registerGameRouteIpc({handle:(name,fn) => handlers.set(name,fn)}, () => ({webContents:contents}), () => 'capacitor-electron', () => '/source.mjs', supported, load);
    return {handlers, event:{sender:contents,senderFrame:frame}, frame, contents, stop};
}

test('route IPC starts lazily, trusts only the main frame, and stops the reader', async () => {
    let created = 0, stopped = 0;
    const f = fixture(async () => ({createGameRouteSource:() => {created++;return {get:() => ({state:'active'}), stop:() => {stopped++;}};}}));
    const read = f.handlers.get('game-route-read');
    const stop = f.handlers.get('game-route-stop');
    await assert.rejects(read({sender:{},senderFrame:f.frame}), /Untrusted/);
    f.frame.url = 'https://example.test/';
    await assert.rejects(read(f.event), /Untrusted/);
    f.frame.url = 'capacitor-electron://-/';
    assert.equal(created, 0);
    assert.deepEqual(await read(f.event), {state:'active'});
    assert.deepEqual(await read(f.event), {state:'active'});
    assert.equal(created, 1);
    await stop(f.event);
    f.stop();
    assert.equal(stopped, 1);
});

test('stop during module loading prevents a reader from starting later', async () => {
    let release, created = 0;
    const delayed = new Promise(resolve => {release = resolve;});
    const f = fixture(() => delayed);
    const read = f.handlers.get('game-route-read')(f.event);
    await f.handlers.get('game-route-stop')(f.event);
    release({createGameRouteSource:() => {created++; return {get:() => ({state:'active'}),stop:() => {}};}});
    assert.deepEqual(await read, {state:'unavailable'});
    assert.equal(created, 0);
});

test('unsupported platforms do not start the reader and packaging includes all required files', async () => {
    const f = fixture(async () => {throw new Error('must not load');}, () => false);
    assert.deepEqual(await f.handlers.get('game-route-read')(f.event), {state:'unavailable'});
    const electronDir = fileURLToPath(new URL('../electron/', import.meta.url));
    const config = JSON.parse(await readFile(path.join(electronDir,'electron-builder.config.json'),'utf8'));
    for (const target of ['game-route-source.mjs','ets2-route-reader.ps1','ets2-route-validation.ps1','licenses/ETS2LA-plugin-MIT.txt']) {
        const entry = config.extraResources.find(item => item.to === target);
        assert.ok(entry, `${target} missing`);
        assert.ok((await readFile(path.resolve(electronDir,entry.from))).length > 0);
    }
});
