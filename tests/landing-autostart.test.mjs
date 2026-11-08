import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import { ref, computed, watch, nextTick, effectScope } from 'vue';
const require = createRequire(import.meta.url);
const ts = require('typescript');
const code = ts.transpileModule(await readFile(new URL('../app/composables/LandingAutoStart.ts', import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;

function fixture(initialView = 'gameManager', initialGame = null) {
    let clock = 0, launches = 0, installed = true, nextId = 0, checks = 0, deferredMap = null;
    let actions;
    const scope = effectScope();
    const selection = ref(initialGame);
    const timers = new Map(), events = new Map(), sockets = [], mounts = [];
    const settings = ref({ savedIP: null, selectedGame: initialGame });
    const view = ref(initialView), blocked = ref(false);
    const document = { visibilityState: 'visible', addEventListener: (n, f) => events.set(n, f), removeEventListener: n => events.delete(n) };
    class Socket { constructor() { sockets.push(this); } close() { this.closeCalls = (this.closeCalls || 0) + 1; } send(game) { this.onmessage({ data: JSON.stringify({ game }) }); } }
    const exports = {};
    scope.run(() => {
    // Match useGameSelection: settings changes mirror into selection on Vue's
    // default watcher queue; selectGame changes only the local selection ref.
    watch(() => settings.value.selectedGame, game => { if (game !== null) selection.value = game; });
    vm.runInNewContext(code, {
        exports, require: name => name === '@capacitor/core' ? { Capacitor: { isNativePlatform: () => false } }
            : name.includes('previewTransport') ? { isSecurePreviewDocument: () => true, telemetrySocketUrl: () => 'wss://test' }
            : { isMapDownloaded: async () => { checks++; return deferredMap || installed; } },
        useSettings: () => ({ settings, activeSettings: { value: { activeMod: 'none' } }, updateGlobal: (k, v) => { settings.value[k] = v; } }),
        useGameSelection: () => ({ selectedGame: selection, selectGame: game => { selection.value = game; } }),
        window: { addEventListener: (n, f) => events.set(n, f), removeEventListener: n => events.delete(n) }, document,
        location: { hostname: 'test', protocol: 'https:', host: 'test' }, WebSocket: Socket,
        Date: class extends Date { static now() { return clock; } },
        setTimeout: (fn, delay) => { const id = ++nextId; timers.set(id, { fn, at: clock + delay }); return id; },
        clearTimeout: id => timers.delete(id), onMounted: fn => mounts.push(fn), onUnmounted: () => {},
        watch,
    });
    const activeBlocked = computed(() => view.value === 'gameManager' && blocked.value);
    actions = exports.useLandingAutoStart(view, () => { launches++; }, activeBlocked); mounts.forEach(fn => fn());
    });
    test.after(() => scope.stop());
    return { sockets, events, document, settings, selection, blocked, selectManually: actions.selectManually,
        deferMap() { let finish; deferredMap = new Promise(resolve => { finish = resolve; }); return finish; },
        async changeView(value) { view.value = value; await nextTick(); }, get checks() { return checks; }, get launches() { return launches; }, set installed(v) { installed = v; },
        async tick(ms) { clock += ms; await nextTick(); for (const [id, timer] of [...timers]) if (timer.at <= clock) { timers.delete(id); await timer.fn(); } await nextTick(); },
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
    const manual = fixture(); manual.sockets[0].send('ets2'); manual.events.get('pointerdown')(); manual.selectManually('ats'); manual.settings.value.selectedGame = 'ats';
    await nextTick();
    for (let i = 0; i < 11; i++) { manual.sockets[0].send('ets2'); await manual.tick(1000); }
    assert.equal(manual.launches, 0); assert.equal(manual.selection.value, 'ats'); assert.equal(manual.settings.value.selectedGame, 'ats');
    const missing = fixture(); missing.installed = false; missing.sockets[0].send('ets2');
    await missing.tick(9999); missing.sockets[0].send('ets2'); await missing.tick(1);
    for (let i = 0; i < 100; i++) { missing.sockets[0].send('ets2'); await missing.tick(1); }
    assert.equal(missing.checks, 1);
});


test('queued callbacks cannot change a replacement socket after reconnect or landing restart', async () => {
    for (const restartLanding of [false, true]) {
        const f = fixture();
        const old = f.sockets[0];
        old.send('ets2');
        const message = old.onmessage, close = old.onclose, error = old.onerror;
        if (restartLanding) {
            await f.changeView('navigation');
            await f.changeView('desktopHome');
        } else {
            close();
            await f.tick(2000);
        }
        const replacement = f.sockets[1];
        replacement.send('ats');
        const oldCloseCalls = old.closeCalls || 0;
        message({ data: JSON.stringify({ game: 'ets2' }) });
        error();
        close();
        assert.equal(f.settings.value.selectedGame, 'ats');
        assert.equal(old.closeCalls || 0, oldCloseCalls);
        await f.tick(restartLanding ? 9999 : 7999);
        assert.equal(f.sockets.length, 2);
        replacement.send('ats');
        // A queued close immediately before expiry must not cancel this timer.
        close();
        await f.tick(1);
        assert.equal(f.launches, 1);
        assert.equal(f.sockets.length, 2);
    }
});

test('manual selection before first detection persists with fresh packets and resets on landing re-entry', async () => {
    const f = fixture(); f.events.get('pointerdown')(); f.selectManually('ats'); f.settings.value.selectedGame = 'ats';
    await nextTick();
    for (let i = 0; i < 11; i++) { f.sockets[0].send('ets2'); await f.tick(1000); }
    assert.equal(f.launches, 0); assert.equal(f.settings.value.selectedGame, 'ats');
    await f.changeView('map'); await f.changeView('gameManager');
    const replacement = f.sockets.at(-1); replacement.send('ets2');
    await f.tick(9999); replacement.send('ets2'); await f.tick(1);
    assert.equal(f.launches, 1); assert.equal(f.settings.value.selectedGame, 'ets2');
});

test('a mod popup or download blocks entry and closing it starts a fresh idle interval', async () => {
    const f = fixture(); f.sockets[0].send('ets2'); await f.tick(5000);
    f.blocked.value = true;
    for (let i = 0; i < 15; i++) { f.sockets[0].send('ets2'); await f.tick(1000); }
    assert.equal(f.launches, 0); assert.equal(f.checks, 0);
    f.blocked.value = false; f.sockets[0].send('ets2');
    await f.tick(9999); assert.equal(f.launches, 0);
    f.sockets[0].send('ets2'); await f.tick(1); assert.equal(f.launches, 1);
});

test('pointer motion keeps the landing active without accumulating timers', async () => {
    const f = fixture(); f.sockets[0].send('ats');
    for (let i = 0; i < 12; i++) {
        await f.tick(1000);
        for (let move = 0; move < 50; move++) f.events.get('pointermove')();
        f.sockets[0].send('ats');
    }
    assert.equal(f.launches, 0); assert.equal(f.checks, 0);
    await f.tick(9999); assert.equal(f.launches, 0);
    f.sockets[0].send('ats'); await f.tick(1); assert.equal(f.launches, 1);
});

test('a hidden game-manager popup does not block desktop-home automatic entry', async () => {
    const f = fixture(); f.sockets[0].send('ets2'); f.blocked.value = true;
    await f.changeView('desktopHome');
    assert.equal(f.blocked.value, true, 'v-show preserves the hidden popup state');
    const desktopSocket = f.sockets.at(-1); desktopSocket.send('ats');
    await f.tick(9999); assert.equal(f.launches, 0);
    desktopSocket.send('ats'); await f.tick(1);
    assert.equal(f.launches, 1); assert.equal(f.settings.value.selectedGame, 'ats');
});

test('explicit re-selection of the saved game before telemetry preserves that choice', async () => {
    const f = fixture('gameManager', 'ats');
    f.selectManually('ats'); f.settings.value.selectedGame = 'ats';
    for (let i = 0; i < 11; i++) { f.sockets[0].send('ets2'); await f.tick(1000); }
    assert.equal(f.settings.value.selectedGame, 'ats'); assert.equal(f.launches, 0);
});

test('manual selection while map verification is pending prevents the queued launch', async () => {
    const f = fixture(); const finish = f.deferMap(); f.sockets[0].send('ets2');
    await f.tick(9999); f.sockets[0].send('ets2');
    const pendingTick = f.tick(1); await nextTick();
    assert.equal(f.checks, 1);
    f.selectManually('ats'); f.settings.value.selectedGame = 'ats';
    finish(true); await pendingTick;
    assert.equal(f.launches, 0); assert.equal(f.settings.value.selectedGame, 'ats');
});

test('opening and closing a popup during map verification invalidates the queued launch', async () => {
    const f = fixture(); const finish = f.deferMap(); f.sockets[0].send('ets2');
    await f.tick(9999); f.sockets[0].send('ets2');
    const pendingTick = f.tick(1); await nextTick();
    assert.equal(f.checks, 1);
    f.blocked.value = true; f.blocked.value = false;
    finish(true); await pendingTick;
    assert.equal(f.launches, 0, 'same-tick open/close must invalidate pending work');
    await f.tick(9999); f.sockets[0].send('ets2'); await f.tick(0);
    assert.equal(f.launches, 0);
    await f.tick(1); assert.equal(f.launches, 1);
});

test('settings hydration after landing mounts is not a manual game selection', async () => {
    for (const view of ['gameManager', 'desktopHome']) {
        for (const earlierInput of [false, true]) {
            const f = fixture(view);
            if (earlierInput) f.events.get('pointermove')();
            // initSettings in the parent mounted hook replaces the settings ref
            // after the child's landing probe and watchers have been installed.
            f.settings.value = { ...f.settings.value, selectedGame: 'ets2' };
            await nextTick();
            f.sockets[0].send('ats');
            assert.equal(f.settings.value.selectedGame, 'ats');
            await f.tick(9999); assert.equal(f.launches, 0);
            f.sockets[0].send('ats'); await f.tick(1);
            assert.equal(f.launches, 1);
        }
    }
});
