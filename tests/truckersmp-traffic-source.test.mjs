import test from 'node:test';
import assert from 'node:assert/strict';
import { createTruckersMpTrafficSource } from '../scripts/truckersmp-traffic-source.mjs';

test('fetches only a fixed ETS2 area and strips player names', async () => {
    const requests = [];
    let clock = 1_000;
    const source = createTruckersMpTrafficSource({ now: () => clock, fetchFn: async url => {
        requests.push(String(url));
        return Response.json(String(url).endsWith('/servers') ? {
            servers: [{ game: 'ets2', status: true, map: 2, name: 'Simulation 1' }, { game: 'ats', status: true, map: 3, name: 'ATS' }],
        } : { Success: true, Data: [{ MpId: 42, X: -10, Y: 20, Time: 1700000000, Name: 'private' }, { MpId: 0, X: 1, Y: 2, Time: 1 }] });
    }});
    assert.deepEqual(await source.servers(), [{ id: 2, name: 'Simulation 1' }]);
    const first = await source.snapshot(2);
    assert.deepEqual({ ...first.vehicles[0], id: 'anonymous' }, { id: 'anonymous', x: -10, z: 20, time: 1700000000 });
    assert.notEqual(first.vehicles[0].id, '42');
    assert.equal(await source.snapshot(2), first);
    assert.equal(requests.length, 2);
    assert.equal(new URL(requests[1]).search, '?x1=-100000&y1=100000&x2=100000&y2=-100000&server=2');
    await assert.rejects(source.snapshot(3), /Unknown ETS2 server/);
    clock += 5_001;
    const second = await source.snapshot(2);
    assert.equal(second.vehicles[0].id, first.vehicles[0].id);
    assert.equal(requests.length, 3);
    clock += 30_001;
    await source.snapshot(2);
    assert.equal(requests.length, 5);
});

test('rejects unavailable and malformed provider responses', async () => {
    const offline = createTruckersMpTrafficSource({ fetchFn: async () => new Response('', { status: 503 }) });
    await assert.rejects(offline.servers(), /unavailable/);
    const bad = createTruckersMpTrafficSource({ fetchFn: async url => Response.json(String(url).endsWith('/servers')
        ? { servers: [{ game: 'ets2', status: true, map: 2, name: 'Simulation 1' }] }
        : { Success: false, Data: [] }) });
    await assert.rejects(bad.snapshot(2), /Invalid TruckersMP positions/);
    await assert.rejects(bad.snapshot('2'), /Invalid server/);
});

test('coalesces simultaneous clients and rejects oversized responses', async () => {
    const requests = [];
    const source = createTruckersMpTrafficSource({ fetchFn: async (url, options) => {
        requests.push({url:String(url), options});
        await new Promise(resolve => setImmediate(resolve));
        return Response.json(String(url).endsWith('/servers')
            ? {servers:[{game:'ets2',status:true,map:2,name:'Simulation 1'}]}
            : {Success:true,Data:[]});
    }});
    const [first, second] = await Promise.all([source.snapshot(2), source.snapshot(2)]);
    assert.equal(first, second);
    assert.equal(requests.length, 2);
    assert.equal(requests[0].options.redirect, 'error');
    assert.equal(requests[1].options.redirect, 'error');
    const huge = createTruckersMpTrafficSource({ fetchFn: async () => new Response('x'.repeat(4 * 1024 * 1024 + 1)) });
    await assert.rejects(huge.servers(), /too large/);
});

test('retries a failed shared server-list request', async () => {
    let calls = 0;
    const source = createTruckersMpTrafficSource({ fetchFn: async () => {
        calls++;
        await new Promise(resolve => setImmediate(resolve));
        return calls === 1
            ? new Response('', {status:503})
            : Response.json({servers:[{game:'ets2',status:true,map:2,name:'Simulation 1'}]});
    }});
    const failures = await Promise.allSettled([source.servers(), source.servers()]);
    assert.ok(failures.every(result => result.status === 'rejected'));
    assert.equal(calls, 1);
    assert.deepEqual(await source.servers(), [{id:2,name:'Simulation 1'}]);
    assert.equal(calls, 2);
});
