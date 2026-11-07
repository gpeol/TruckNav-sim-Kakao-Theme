import test from 'node:test';
import assert from 'node:assert/strict';
import { registerTrafficIpc } from '../electron/src/trafficIpc.ts';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

test('traffic IPC admits only the app main frame and validates server IDs', async () => {
    const handlers = new Map();
    const frame = {url:'capacitor-electron://-/index.html'};
    const contents = {mainFrame:frame};
    const calls = [];
    let loads = 0;
    registerTrafficIpc({handle:(name,fn) => handlers.set(name,fn)}, () => ({webContents:contents}), () => 'capacitor-electron', () => '/fixed/source.mjs', async () => {
        loads++;
        return {createTruckersMpTrafficSource:() => ({
            servers:async () => {calls.push('servers');return [{id:2,name:'Simulation 1'}];},
            snapshot:async id => {calls.push(id);return {serverId:id,vehicles:[]};},
        })};
    });
    const servers = handlers.get('tmp-traffic-servers');
    const snapshot = handlers.get('tmp-traffic-snapshot');
    const event = {sender:contents,senderFrame:frame};
    await assert.rejects(servers({sender:{},senderFrame:frame}), /Untrusted/);
    await assert.rejects(servers({sender:contents,senderFrame:{url:frame.url}}), /Untrusted/);
    frame.url = 'https://example.test/';
    await assert.rejects(servers(event), /Untrusted/);
    frame.url = 'capacitor-electron://evil/index.html';
    await assert.rejects(servers(event), /Untrusted/);
    frame.url = 'capacitor-electron://-/index.html';
    await assert.rejects(snapshot(event, '2'), /Invalid/);
    await assert.rejects(snapshot(event, 10000), /Invalid/);
    assert.equal(loads, 0);
    assert.deepEqual(await servers(event), [{id:2,name:'Simulation 1'}]);
    assert.deepEqual(await snapshot(event, 2), {serverId:2,vehicles:[]});
    assert.equal(loads, 1);
    assert.deepEqual(calls, ['servers',2]);
});

test('the packaged resource path loads the actual read-only provider', async () => {
    const electronDir = fileURLToPath(new URL('../electron/', import.meta.url));
    const config = JSON.parse(await readFile(path.join(electronDir, 'electron-builder.config.json'), 'utf8'));
    const resource = config.extraResources.find(item => item.to === 'truckersmp-traffic-source.mjs');
    assert.ok(resource);
    const sourcePath = path.resolve(electronDir, resource.from);
    const handlers = new Map();
    const frame = {url:'capacitor-electron://-/'};
    const contents = {mainFrame:frame};
    const savedFetch = globalThis.fetch;
    const requests = [];
    globalThis.fetch = async url => {
        requests.push(String(url));
        return Response.json(String(url).endsWith('/servers')
            ? {servers:[{game:'ets2',status:true,map:2,name:'Simulation 1'}]}
            : {Success:true,Data:[{MpId:42,X:10,Y:20,Time:1700000000,Name:'private'}]});
    };
    try {
        registerTrafficIpc({handle:(name,fn) => handlers.set(name,fn)}, () => ({webContents:contents}), () => 'capacitor-electron', () => sourcePath);
        const event = {sender:contents,senderFrame:frame};
        assert.equal((await handlers.get('tmp-traffic-servers')(event))[0].id, 2);
        const result = await handlers.get('tmp-traffic-snapshot')(event, 2);
        assert.equal(result.vehicles[0].x, 10);
        assert.notEqual(result.vehicles[0].id, '42');
        assert.equal(Object.hasOwn(result.vehicles[0], 'Name'), false);
        assert.equal(requests.length, 2);
    } finally { globalThis.fetch = savedFetch; }
});
