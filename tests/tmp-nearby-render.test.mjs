import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import vm from 'node:vm';

const require = createRequire(import.meta.url);
const ts = require('typescript');

test('SDK positions render for ETS2 map mods and are cleared on invalid, stale, or wrong-game data', async () => {
    const code = await readFile(new URL('../app/composables/TmpNearby.ts', import.meta.url), 'utf8');
    const compiled = ts.transpileModule(code, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
    const mounts = [], unmounts = [], watchers = [], intervals = [], sockets = [];
    const settings = { value: { selectedGame: 'ets2' } };
    let clock = 10000;
    const sources = new Map();
    const map = {
        getStyle: () => ({ layers: [] }), getLayer: () => null,
        getSource: name => sources.get(name),
        addSource: (name, value) => sources.set(name, { data: value.data, setData(data) { this.data = data; } }),
        addLayer: () => {}, on: () => {}, off: () => {},
    };
    class Socket {
        constructor() { sockets.push(this); }
        close() { this.closed = true; }
        sendData(value) { this.onmessage({ data: JSON.stringify(value) }); }
    }
    const module = { exports: {} };
    const sandbox = {
        module, exports: module.exports,
        require: name => {
            if (name === '~/assets/utils/map/converters') return { convertEts2ToGeo: (x, z) => [x, z] };
            throw new Error(`Unexpected import ${name}`);
        },
        useSettings: () => ({ settings, activeSettings: { value: { activeMod: 'promods-europe' } } }),
        window: {}, location: { protocol: 'https:', host: 'preview.test' }, WebSocket: Socket,
        document: { querySelector: () => ({}) },
        Date: class extends Date { static now() { return clock; } },
        onMounted: fn => mounts.push(fn), onUnmounted: fn => unmounts.push(fn),
        watch: (source, callback, options) => {
            watchers.push({ source, callback });
            if (options?.immediate) callback(typeof source === 'function' ? source() : source.value, undefined);
        },
        setInterval: fn => { intervals.push(fn); return 1; }, clearInterval: () => {},
        setTimeout: () => 1, clearTimeout: () => {},
    };
    vm.runInNewContext(compiled, sandbox);
    module.exports.useTmpNearby({ value: map });
    mounts.forEach(fn => fn());
    assert.equal(sockets.length, 1);
    const active = { state: 'active', vehicles: [[20, 30], [40, 50]] };
    sockets[0].sendData(active);
    assert.equal(sources.get('tmp-vehicles').data.features.length, 2);
    sockets[0].sendData({ state: 'active', vehicles: [[1, 2, 3]] });
    assert.equal(sources.get('tmp-vehicles').data.features.length, 0);
    sockets[0].sendData(active);
    clock += 2001;
    intervals[0]();
    assert.equal(sources.get('tmp-vehicles').data.features.length, 0);
    sockets[0].sendData(active);
    settings.value.selectedGame = 'ats';
    watchers[0].callback('ats', 'ets2');
    assert.equal(sockets[0].closed, true);
    assert.equal(sources.get('tmp-vehicles').data.features.length, 0);
    assert.equal(sockets.length, 1);
    unmounts.forEach(fn => fn());
});
