import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { ref, computed, shallowRef, watch, effectScope, nextTick } from 'vue';
import { gameRouteWaypoints } from '../app/utils/gameRoute.ts';
import { matchGameRouteNodes } from '../app/utils/matchGameRoute.ts';
const source = fs.readFileSync(new URL('../app/composables/PreviewGameRoute.ts', import.meta.url), 'utf8');
const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const settle = async () => { await nextTick(); await new Promise(resolve => setImmediate(resolve)); await nextTick(); };
const points = [[-10,0,1000],[0,0,900],[10,0,800],[20,0,0]];
function fixture() {
    const scope=effectScope(), mounted=[], sockets=[];
    const failed=ref(''); let now=0;
    const telemetry=ref({game:'Ets2',navigation:{distance:900},truck:{current:{position:{x:0,z:0}}}});
    class Socket { constructor(){sockets.push(this);} close(){} }
    const exports={};
    vm.runInNewContext(code,{exports,require:name=>name==='vue'?{computed,shallowRef,watch,onMounted:fn=>mounted.push(fn),onUnmounted:()=>{}}:{gameRouteWaypoints},
        window:{location:{protocol:'https:',host:'test'}},document:{querySelector:()=>true},WebSocket:Socket,
        Date:class extends Date{static now(){return now;}},setInterval:()=>1,clearInterval:()=>{},setTimeout:()=>1,clearTimeout:()=>{}});
    let route;scope.run(()=>{route=exports.usePreviewGameRoute(telemetry,failed);mounted.forEach(fn=>fn());});
    test.after(()=>scope.stop());
    return {route,failed,scope,send(p=points,state='active'){sockets[0].onmessage({data:JSON.stringify({state,points:p})});},advance(ms){now+=ms;}};
}

test('a failed prefix match retries after trimming while identical failures do not loop',async()=>{
    const f=fixture();let attempts=0;const accepted=[];
    const graph=new Map([[1,[{to:2}]],[2,[{to:3}]]]);
    const component=fs.readFileSync(new URL('../app/components/map/map.vue',import.meta.url),'utf8');
    const start=component.indexOf('// Match the validated game route');
    const end=component.indexOf('// We check if it has active job',start);
    assert.ok(start>=0&&end>start);
    const state={
        gameRouteKey:f.route.gameRouteKey,gameRoutePoints:f.route.gameRoutePoints,gameRouteWaypoints:f.route.gameRouteWaypoints,
        failedGameRouteKey:f.failed,appliedGameRouteKey:'',gameRouteOwned:ref(false),currentJobKey:ref(''),waypointList:ref([]),
        loading:ref(false),isWorkerReady:ref(true),isCalculatingRoute:ref(false),isTruckSpawned:ref(true),gameConnected:ref(true),
        truckCoords:ref([0,0]),truckHeading:ref(0),scale:ref(19),mapScaleConfig:ref({ruralScale:19}),averageSpeed:ref(0),routeFound:ref(null),
        convertEts2ToGeo:(x,z)=>[x,z],clearRouteState:()=>{},watch,
        handleMultiRouteCalculation:async()=>{
            attempts++;
            const groups=f.route.gameRoutePoints.value.map(([x])=>x<0?[]:[{id:x/10+1,distance:0}]);
            const match=matchGameRouteNodes(groups,graph);
            state.routeFound.value=Boolean(match);if(match)accepted.push(match.nodes);
        },
    };
    f.scope.run(()=>vm.runInNewContext(component.slice(start,end),state));
    f.send();await settle();assert.equal(attempts,1);assert.ok(f.failed.value);
    f.send();await settle();assert.equal(attempts,1);
    f.send(points.slice(1));await settle();
    assert.equal(attempts,2);assert.deepEqual(accepted,[[1,2,3]]);assert.equal(f.failed.value,'');
});

test('successful route identity survives prefix trimming and transient unavailable reads',async()=>{
    const f=fixture();f.send();const initial=f.route.gameRouteKey.value;
    f.send(points.slice(1));assert.equal(f.route.gameRouteKey.value,initial);
    f.send(undefined,'unavailable');assert.equal(f.route.gameRouteKey.value,initial);
    f.send(undefined,'inactive');assert.equal(f.route.gameRouteKey.value,'');
});


test('a prefix trimmed during a pending failed match retries exactly once without job fallback racing it', async () => {
    const f = fixture();
    const component = fs.readFileSync(new URL('../app/components/map/map.vue', import.meta.url), 'utf8').replace(/\r/g, '');
    const start = component.indexOf('// Match the validated game route');
    const end = component.indexOf('watch(\n    () => activeSettings.value.themeColor', start);
    assert.ok(start >= 0 && end > start);
    let finishFirst;
    const pendingFirst = new Promise(resolve => { finishFirst = resolve; });
    const attempts = [], accepted = [], fallback = [];
    const graph = new Map([[1, [{to:2}]], [2, [{to:3}]]]);
    const state = {
        gameRouteKey:f.route.gameRouteKey, gameRoutePoints:f.route.gameRoutePoints, gameRouteWaypoints:f.route.gameRouteWaypoints,
        failedGameRouteKey:f.failed, appliedGameRouteKey:'', gameRouteOwned:ref(false), currentJobKey:ref(''), waypointList:ref([]),
        loading:ref(false), isWorkerReady:ref(true), isCalculatingRoute:ref(false), isTruckSpawned:ref(true), gameConnected:ref(true),
        truckCoords:ref([0,0]), truckHeading:ref(0), scale:ref(19), mapScaleConfig:ref({ruralScale:19}), averageSpeed:ref(0), routeFound:ref(null),
        hasActiveJob:ref(true), destinationCity:ref('city'), destinationCompany:ref('company'), isClickingEnabled:ref(true),
        isRouteActive:ref(false), activeSettings:ref({lastDestination:null}), routeTimer:null, clearTimeout,
        findDestinationCoords:()=>[100,200], handleRouteClick:async(...args)=>fallback.push(args), stopNavigationMode:()=>{},
        convertEts2ToGeo:(x,z)=>[x,z], clearRouteState:()=>{}, watch,
        handleMultiRouteCalculation:async(...args)=>{
            // Capture the input of each real watcher invocation, not the newest
            // reactive snapshot when the simulated worker eventually replies.
            const input = args.at(-1).map(point=>[...point]);
            attempts.push(input); state.isCalculatingRoute.value = true;
            if (attempts.length === 1) await pendingFirst;
            const groups=input.map(([x])=>x<0?[]:[{id:x/10+1,distance:0}]);
            const match=matchGameRouteNodes(groups,graph);
            state.routeFound.value=Boolean(match);
            if (match) accepted.push(match.nodes);
            state.isCalculatingRoute.value=false;
        },
    };
    f.scope.run(()=>vm.runInNewContext(component.slice(start,end),state));
    f.send(); await settle();
    const originalKey=f.route.gameRouteKey.value;
    assert.equal(attempts.length,1); assert.equal(state.isCalculatingRoute.value,true);
    f.send(points.slice(1)); await settle();
    assert.equal(f.route.gameRouteKey.value,originalKey);
    assert.equal(attempts.length,1); assert.equal(fallback.length,0);
    finishFirst(); await settle(); await settle();
    assert.equal(attempts.length,2);
    assert.deepEqual(attempts.map(input=>input.length),[4,3]);
    assert.deepEqual(accepted,[[1,2,3]]);
    assert.equal(f.failed.value,''); assert.equal(state.gameRouteOwned.value,true);
    assert.equal(fallback.length,0,'fallback watchers must not launch a job route over the successful retry');
    f.send(points.slice(1)); await settle();
    assert.equal(attempts.length,2); assert.equal(fallback.length,0);
});
