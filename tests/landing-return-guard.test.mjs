import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import { ref, computed } from 'vue';
const require = createRequire(import.meta.url);
const ts = require('typescript');

test('only explicit safe-driving exit suppresses landing autostart until manual intent', async () => {
    const page = await readFile(new URL('../app/pages/index.vue', import.meta.url), 'utf8');
    const script = page.match(/<script[^>]*>([\s\S]*?)<\/script>/)[1];
    const code = ts.transpileModule(script + '\nexports.actions = { goHome, launchMap, launchGameManager, selectManually, currentView };', {
        compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText;
    for (const desktop of [false, true]) {
        let blocked, manualSelections = 0;
        const exports = {};
        vm.runInNewContext(code, {
            exports, require: name => name.includes('LandingAutoStart') ? {
                useLandingAutoStart: (_view, _launch, guard) => { blocked = guard; return { selectManually: () => { manualSelections++; } }; },
            } : {},
            ref, computed, usePlatform: () => ({ isElectron: ref(desktop), isMobile: ref(false) }),
            useSettings: () => ({ settings: ref({}) }), onMounted: () => {}, onUnmounted: () => {}, watch: () => {},
        });
        const a = exports.actions;
        a.launchMap(); a.goHome();
        assert.equal(blocked.value, false);
        a.launchMap(); a.goHome('safe-driving-exit');
        assert.equal(blocked.value, true);
        assert.equal(a.currentView.value, desktop ? 'desktopHome' : 'gameManager');
        a.launchGameManager(); assert.equal(blocked.value, true);
        a.selectManually('ets2'); assert.equal(blocked.value, false); assert.equal(manualSelections, 1);
        a.goHome('safe-driving-exit'); a.launchMap(); assert.equal(blocked.value, false);
        assert.equal(a.currentView.value, 'map');
    }
});
