import test from 'node:test';
import assert from 'node:assert/strict';
import { hasTrafficTransport, trafficServers, trafficSnapshot } from '../app/utils/trafficTransport.ts';

test('uses only the explicit Electron bridge when it is present', async () => {
    const calls = [];
    globalThis.window = { electronAPI: {
        getTruckersMpServers: async () => { calls.push('servers'); return [{id:2,name:'Simulation 1'}]; },
        getTruckersMpSnapshot: async id => { calls.push(id); return {serverId:id,observedAt:1,vehicles:[]}; },
    }};
    try {
        assert.equal(hasTrafficTransport(), true);
        assert.deepEqual(await trafficServers(), [{id:2,name:'Simulation 1'}]);
        assert.equal((await trafficSnapshot(2)).serverId, 2);
        await assert.rejects(trafficSnapshot(-1), /Invalid traffic server/);
        assert.deepEqual(calls, ['servers', 2]);
    } finally { delete globalThis.window; }
});

test('does not issue a preview request without its explicit marker', async () => {
    assert.equal(hasTrafficTransport(), false);
    await assert.rejects(trafficServers(), /Traffic unavailable/);
});
