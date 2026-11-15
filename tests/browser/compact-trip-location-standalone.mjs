// Mounts the actual CompactTrip SFC without a server, game or telemetry connection.
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
const root = fileURLToPath(new URL('../../', import.meta.url));
const require = createRequire(root + 'package.json');
const { chromium } = require('@playwright/test');
const { parse, compileScript } = require('@vue/compiler-sfc');
const ts = require('typescript');
const source = await readFile(root + 'app/components/navigation/compactTrip.vue', 'utf8');
const { descriptor, errors } = parse(source, { filename: 'compactTrip.vue' });
assert.deepEqual(errors, []);
const compile = text => ts.transpileModule(text, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const code = compile(compileScript(descriptor, { id: 'compact-trip', inlineTemplate: true }).content);
const durationCode = compile(await readFile(root + 'app/utils/routeTime.ts', 'utf8'));
const locale = JSON.parse(await readFile(root + 'app/locales/ko.json', 'utf8'));
const browser = await chromium.launch({ headless:true, ...(process.env.CHROMIUM_PATH ? { executablePath:process.env.CHROMIUM_PATH } : {}) });
try {
    const page = await browser.newPage();
    await page.setContent('<div id="app"></div>');
    await page.addScriptTag({ path:require.resolve('vue/dist/vue.global.js') });
    await page.evaluate(({ code, durationCode, locale }) => {
        const Vue = window.Vue;
        const timers = new Map(); let now = 0, nextId = 1;
        const setInterval = (fn, delay) => { const id=nextId++; timers.set(id,{fn,delay,due:now+delay}); return id; };
        const clearInterval = id => timers.delete(id);
        window.tick = async ms => { now+=ms; for(const timer of timers.values()) while(timer.due<=now) {timer.due+=timer.delay; timer.fn();} await Vue.nextTick(); };
        window.timerCount = () => timers.size;
        window.timerDelays = () => [...timers.values()].map(t=>t.delay);
        const duration = {}; new Function('exports',durationCode)(duration);
        const exports = {};
        const useSettings = () => ({settings:Vue.ref({locale:'ko'})});
        const useTranslations = () => ({t:key=>key.split('.').reduce((o,k)=>o?.[k],locale) || key});
        new Function('require','ref','computed','onMounted','onUnmounted','useSettings','useTranslations','setInterval','clearInterval','exports',code)
            (id=>id==='vue'?Vue:duration,Vue.ref,Vue.computed,Vue.onMounted,Vue.onUnmounted,useSettings,useTranslations,setInterval,clearInterval,exports);
        window.state=Vue.reactive({destinationName:'Beta',currentLocationName:'Alpha'});
        const app=Vue.createApp({setup:()=>({state:window.state}),template:'<CompactTrip v-bind="state" :route-distance-converted="751" distance-unit="km" route-eta="0h 44min" />'});
        app.component('CompactTrip',exports.default);
        app.component('Icon',{props:['name','size'],template:'<svg class="iconify" :data-icon="name" :width="size" :height="size" aria-hidden="true"></svg>'});
        app.mount('#app'); window.unmount=()=>app.unmount();
    },{code,durationCode,locale});
    const chip=page.locator('.trip-destination'), summary=page.locator('.trip-summary');
    async function expectState(place,kind,current) {
        assert.equal(await chip.innerText(),place);
        assert.doesNotMatch(await chip.innerText(),/현재 위치|목적지|·/);
        assert.match(await summary.getAttribute('aria-label'),new RegExp(kind+': '+place));
        assert.equal(await chip.getAttribute('aria-hidden'),'true');
        assert.equal(await chip.locator('.destination-flag').count(),current?0:1);
        assert.equal(await chip.locator('[data-icon="lucide:map-pin"]').count(),current?1:0);
        if(!current) assert.equal(await chip.locator('.destination-flag path').count(),2);
    }
    assert.deepEqual(await page.evaluate(()=>window.timerDelays()),[30000]);
    await expectState('Beta','목적지',false);
    await page.evaluate(()=>window.tick(29999)); await expectState('Beta','목적지',false);
    await page.evaluate(()=>window.tick(1)); await expectState('Alpha','현재 위치',true);
    await page.evaluate(async()=>{window.state.currentLocationName='Gamma';await window.Vue.nextTick();}); await expectState('Gamma','현재 위치',true);
    await page.evaluate(async()=>{window.state.currentLocationName='';await window.Vue.nextTick();}); await expectState('Beta','목적지',false);
    await page.evaluate(async()=>{window.state.currentLocationName='Gamma';await window.Vue.nextTick();}); await expectState('Gamma','현재 위치',true);
    await page.evaluate(()=>window.tick(30000)); await expectState('Beta','목적지',false);
    await page.evaluate(async()=>{window.state.currentLocationName='';window.state.destinationName='';await window.Vue.nextTick();});
    assert.equal(await chip.count(),0);
    assert.doesNotMatch(await summary.getAttribute('aria-label'),/현재 위치:|목적지:/);
    await page.evaluate(()=>window.unmount());
    assert.equal(await page.evaluate(()=>window.timerCount()),0,'unmount must clear location interval');
    assert.equal(await summary.count(),0);
    await page.evaluate(()=>window.tick(60000));
    console.log(JSON.stringify({passed:1,scope:'actual CompactTrip SFC: 30s alternation, icons, text, ARIA, fallback, reactive location, empty state and timer cleanup; no server/game'}));
} finally { await browser.close(); }
