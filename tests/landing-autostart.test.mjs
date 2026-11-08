import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import vm from 'node:vm';
const require = createRequire(import.meta.url);
const ts = require('typescript');
const code = ts.transpileModule(await readFile(new URL('../app/composables/LandingAutoStart.ts', import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;

function fixture(initialView = 'gameManager') {
    let clock = 0, launches = 0, installed = true, nextId = 0, checks = 0;
    const selection = { value: null };
    const timers = new Map(), events = new Map(), sockets = [], mounts = [];
    const settings = { value: { savedIP: null, selectedGame: null } };
    const view = { value: initialView };
    const document = { visibilityState: 'visible', addEventListener: (n, f) => events.set(n, f), removeEventListener: n => events.delete(n) };
    class Socket { constructor() { sockets.push(this); } close() {} send(game) { this.onmessage({ data: JSON.stringify({ game }) }); } }
    const exports = {};
    vm.runInNewContext(code, {
        exports, require: name => name === '@capacitor/core' ? { Capacitor: { isNativePlatform: () => false } }
            : name.includes('previewTransport') ? { isSecurePreviewDocument: () => true, telemetrySocketUrl: () => 'wss://test' }
            : { isMapDownloaded: async () => { checks++; return installed; } },
        useSettings: () => ({ settings, activeSettings: { value: { activeMod: 'none' } }, updateGlobal: (k, v) => { settings.value[k] = v; } }),
        useGameSelection: () => ({ selectedGame: selection, selectGame: game => { selection.value = game; } }),
        window: { addEventListener: (n, f) => events.set(n, f), removeEventListener: n => events.delete(n) }, document,
        location: { hostname: 'test', protocol: 'https:', host: 'test' }, WebSocket: Socket,
        Date: class extends Date { static now() { return clock; } },
        setTimeout: (fn, delay) => { const id = ++nextId; timers.set(id, { fn, at: clock + delay }); return id; },
        clearTimeout: id => timers.delete(id), onMounted: fn => mounts.push(fn), onUnmounted: () => {},
        watch: (_s, fn) => fn(),
    });
    exports.useLandingAutoStart(view, () => { launches++; }); mounts.forEach(fn => fn());
    return { sockets, events, document, settings, selection, get checks() { return checks; }, get launches() { return launches; }, set installed(v) { installed = v; },
        async tick(ms) { clock += ms; for (const [id, timer] of [...timers]) if (timer.at <= clock) { timers.delete(id); await timer.fn(); } },
    };
}

test('detects ETS/ATS and enters only after ten seconds without user input', async () => {
    for (const game of ['Ets2', 'Ats']) {
        const f = fixture(); f.sockets[0].send(game);
        assert.equal(f.settings.value.selectedGame, game.toLowerCase());
        await f.tick(9999); assert.equal(f.launches, 0); f.sockets[0].send(game);
        await f.tick(1); assert.equal(f.launches, 1);
    }
    const touched = fixture(); touched.sockets[0].send('ets2'); touched.events.get('pointerdown')();
    await touched.tick(9999); assert.equal(touched.launches, 0);
    touched.sockets[0].send('ets2'); await touched.tick(1);
    assert.equal(touched.launches, 1);
});

test('missing maps and disconnected games do not auto-enter; foreground gets a fresh ten seconds', async () => {
    const missing = fixture(); missing.installed = false; missing.sockets[0].send('ets2'); await missing.tick(10000);
    assert.equal(missing.launches, 0);
    const offline = fixture(); offline.sockets[0].send('ets2'); offline.sockets[0].onclose(); await offline.tick(10000);
    assert.equal(offline.launches, 0);
    const hidden = fixture(); hidden.sockets[0].send('ets2'); await hidden.tick(5000);
    hidden.document.visibilityState = 'hidden'; hidden.events.get('visibilitychange')(); await hidden.tick(10000);
    hidden.document.visibilityState = 'visible'; hidden.events.get('visibilitychange')(); hidden.sockets[0].send('ets2');
    await hidden.tick(9999); assert.equal(hidden.launches, 0); hidden.sockets[0].send('ets2'); await hidden.tick(1); assert.equal(hidden.launches, 1);
});

test('desktop landing detects games too, and neither landing enters without a detected game', async () => {
    const desktop = fixture('desktopHome'); desktop.sockets[0].send('Ats'); await desktop.tick(9999); desktop.sockets[0].send('Ats'); await desktop.tick(1);
    assert.equal(desktop.settings.value.selectedGame, 'ats'); assert.equal(desktop.launches, 1);
    for (const view of ['desktopHome', 'gameManager']) {
        const absent = fixture(view); await absent.tick(10000); assert.equal(absent.launches, 0);
        absent.sockets[0].send('Unknown'); await absent.tick(10000); assert.equal(absent.launches, 0);
    }
});

test('an open socket with stale telemetry cannot trigger navigation', async () => {
    const f = fixture(); f.sockets[0].send('ets2'); await f.tick(10000);
    assert.equal(f.launches, 0);
});

test('input before detection still detects, manual selection is preserved, and missing-map checks are bounded', async () => {
    const early = fixture(); early.events.get('wheel')(); early.sockets[0].send('ets2');
    assert.equal(early.settings.value.selectedGame, 'ets2');
    const manual = fixture(); manual.sockets[0].send('ets2'); manual.events.get('pointerdown')(); manual.selection.value = 'ats';
    manual.sockets[0].send('ets2'); await manual.tick(10000); assert.equal(manual.launches, 0); assert.equal(manual.selection.value, 'ats');
    const missing = fixture(); missing.installed = false; missing.sockets[0].send('ets2');
    await missing.tick(9999); missing.sockets[0].send('ets2'); await missing.tick(1);
    for (let i = 0; i < 100; i++) { missing.sockets[0].send('ets2'); await missing.tick(1); }
    assert.equal(missing.checks, 1);
});
