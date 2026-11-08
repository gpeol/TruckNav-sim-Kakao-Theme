import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import vm from 'node:vm';
const require = createRequire(import.meta.url);
const ts = require('typescript');
const compiled = ts.transpileModule(await readFile(new URL('../app/composables/EtsTelemetry.ts', import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;

function fixture() {
    const sockets = [], timers = new Map(); let nextId = 0;
    class Socket { constructor() { sockets.push(this); } close() { this.closed = true; } }
    const exports = {};
    const helpers = {
        getGameState: () => ({gameConnected:true,gameTime:'12:00',hasInGameMarker:true,scale:19}),
        getTruckState: () => ({truckCoords:[1,2],truckSpeed:50,truckHeading:2,headingOffset:0,avgSpeed:50}),
        getNavigationState: () => ({fuel:100,speedLimit:80,restStoptime:'01:00',restStopMinutes:60}),
        getJobState: () => ({hasActiveJob:true,cityTarget:'A',companyTarget:'B'}),
    };
    vm.runInNewContext(compiled, {
        exports, require: name => name === '@capacitor/core' ? {Capacitor:{isNativePlatform:()=>false}}
            : name.includes('previewTransport') ? {telemetrySocketUrl:()=> 'ws://mock',isSecurePreviewDocument:()=>false} : helpers,
        reactive: x=>x, shallowRef: value=>({value}),
        toRefs: obj=>Object.fromEntries(Object.keys(obj).map(k=>[k,{get value(){return obj[k];}}])),
        useSettings:()=>({settings:{value:{selectedGame:'ets2',savedIP:null}}}),
        window:{location:{hostname:'test',protocol:'http:',host:'test'}},WebSocket:Socket,console,
        setTimeout: fn=>{const id=++nextId;timers.set(id,fn);return id;},clearTimeout:id=>timers.delete(id),
    });
    return { api:exports.useEtsTelemetry(), sockets, timers };
}

test('explicit telemetry stop clears connected game, time, speed and raw packet', () => {
    const f=fixture();f.api.startTelemetry();
    f.sockets[0].onmessage({data:JSON.stringify({game:'ets2',job:{},truck:{constants:{}}})});
    assert.equal(f.api.gameConnected.value,true);assert.equal(f.api.truckSpeed.value,50);
    f.api.stopTelemetry();
    assert.equal(f.api.gameConnected.value,false);assert.equal(f.api.gameTime.value,'');
    assert.equal(f.api.truckSpeed.value,0);assert.equal(f.api.rawTelemetry.value,null);
    assert.equal(f.sockets[0].closed,true);assert.equal(f.sockets[0].onclose,null);
    assert.equal(f.timers.size,0);
});

test('explicit stop cancels an already scheduled reconnect and permits deliberate restart', () => {
    const f=fixture();f.api.startTelemetry();f.sockets[0].onclose();
    assert.equal(f.timers.size,1);
    f.api.stopTelemetry();assert.equal(f.timers.size,0);assert.equal(f.sockets.length,1);
    f.api.startTelemetry();assert.equal(f.sockets.length,2);
    f.api.stopTelemetry();assert.equal(f.sockets[1].closed,true);
});

test('queued callbacks from a stopped socket cannot overwrite its replacement', () => {
    const f=fixture();f.api.startTelemetry();
    const old=f.sockets[0]; const queuedMessage=old.onmessage; const queuedClose=old.onclose;
    const packet={game:'ets2',job:{},truck:{constants:{}}};
    f.api.stopTelemetry();
    assert.equal(old.onmessage,null);assert.equal(old.onopen,null);assert.equal(old.onclose,null);
    queuedMessage({data:JSON.stringify(packet)});
    assert.equal(f.api.gameConnected.value,false);assert.equal(f.api.rawTelemetry.value,null);
    f.api.startTelemetry();
    const replacement=f.sockets[1]; replacement.onmessage({data:JSON.stringify(packet)});
    assert.equal(f.api.gameConnected.value,true);
    const raw=f.api.rawTelemetry.value;
    queuedMessage({data:JSON.stringify({game:'Unknown'})}); queuedClose();
    assert.equal(f.api.gameConnected.value,true);assert.equal(f.api.rawTelemetry.value,raw);
    assert.equal(f.timers.size,0);assert.equal(f.sockets.length,2);
    f.api.stopTelemetry();assert.equal(replacement.closed,true);
});
