// Actual Vue SFC + Sass checks without starting a server or connecting telemetry.
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
const root = fileURLToPath(new URL('../../', import.meta.url));
const require = createRequire(new URL('../../package.json', import.meta.url));
const { chromium } = require('@playwright/test');
const { parse, compileScript } = require('@vue/compiler-sfc');
const ts = require('typescript');
const sass = require('sass');
const components = {};
for (const [name, file] of [['CompactTrip', 'compactTrip.vue'], ['TopBar', 'topBar.vue'], ['ManeuverCard','maneuverCard.vue'], ['DirectionIcon','directionIcon.vue']]) {
    const source = await readFile(`${root}/app/components/navigation/${file}`, 'utf8');
    const { descriptor, errors } = parse(source, { filename: file });
    assert.deepEqual(errors, []);
    const compiled = compileScript(descriptor, { id: name, inlineTemplate: true });
    components[name] = ts.transpileModule(compiled.content, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
}
const styleFiles = ['global/_variables.scss', 'global/_global.scss', 'scoped/map/map.scss', 'scoped/navigation/topBar.scss',
    'scoped/common/hudButton.scss', 'scoped/navigation/speedLimit.scss', 'scoped/navigation/warningSlide.scss', 'scoped/navigation/compactTrip.scss', 'scoped/navigation/maneuverCard.scss', 'scoped/navigation/sheetSlide.scss', 'global/_navigation-theme.scss'];
const styles = (await Promise.all(styleFiles.map(file => readFile(`${root}/app/assets/scss/${file}`, 'utf8')))).join('\n').replace(/^@use[^;]+;/gm, '');
const css = sass.compileString(styles).css.replaceAll('env(safe-area-inset-bottom)', '21px')
    .replaceAll('env(safe-area-inset-top)', '0px').replaceAll('env(safe-area-inset-left)', 'var(--test-safe-side, 0px)').replaceAll('env(safe-area-inset-right)', 'var(--test-safe-side, 0px)');
const durationCode = ts.transpileModule(await readFile(root+'/app/utils/routeTime.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText;
const turnCode=ts.transpileModule(await readFile(root+'/app/utils/turnDistance.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText;
const layoutCode=ts.transpileModule(await readFile(root+'/app/composables/useTripTelemetryLayout.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText;
const locale = JSON.parse(await readFile(`${root}/app/locales/ko.json`, 'utf8'));
const browser = await chromium.launch({ headless: true, ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}) });
try {
    const page = await browser.newPage();
    const results = [];
    for (const [width, height, adding=false,long=false,notch=false] of [[393,852],[320,568],[1024,768],[844,500],[844,375],[667,260],[667,260,true],[640,260,true],[640,360,true],[667,375,true],[640,260,true,true],[320,568,false,true],[844,375,true,false,true]]) {
        await page.setViewportSize({ width, height });
        await page.setContent(`<style>${css}:root {--test-safe-side:${notch?44:0}px;}</style><div id="app"></div>`);
        await page.addScriptTag({ path: require.resolve('vue/dist/vue.global.js') });
        await page.evaluate(({ components, locale, durationCode, turnCode, layoutCode, adding,long }) => {
            const Vue = window.Vue;
            window.state = Vue.reactive({ showStatus:true, routeActive:true, connected:true,adding,long,location:'Calais, France', activeUiComponents:['topBar','fuel','sleep','time','speed'] });
            window.calls = { exit:0, appearance:0, settings:0 };
            const useTranslations = () => ({ t: key => key.split('.').reduce((value, part) => value?.[part], locale) || key });
            const useSettings = () => ({ settings: Vue.ref(window.state) });
            const useUnitConversion = () => ({ kmToUserUnits: value => value, literToUserUnits: value => value, speedUnit:'km/h', fuelUnit:'L',distanceUnit:Vue.ref('km') });
            const duration={}; new Function('exports',durationCode)(duration); new Function('exports',turnCode)(duration); const loaded = {};
            for (const [name, code] of Object.entries(components)) {
                const exports = {};
                new Function('require','ref','computed','nextTick','onMounted','onUnmounted','useTranslations','useSettings','useUnitConversion','exports', code)
                    (id => id==='vue'?Vue:duration, Vue.ref, Vue.computed, Vue.nextTick, Vue.onMounted, Vue.onUnmounted, useTranslations, useSettings, useUnitConversion, exports);
                loaded[name] = exports.default;
            }
            const layout={};new Function('onMounted','onUnmounted','exports',layoutCode)(Vue.onMounted,Vue.onUnmounted,layout); const app = Vue.createApp({ setup: () => { const mapUiElement=Vue.ref(null);layout.useTripTelemetryLayout(mapUiElement);return {state:window.state,calls:window.calls,mapUiElement};}, template:
                `<div class="full-page-wrapper"><div class="ui-safe-container"><div ref="mapUiElement" class="map-ui-layer" :class="{'is-route-guidance':state.routeActive,'has-guidance':true,'has-status-bar':state.showStatus}">
                    <TopBar :truck-speed="53" :game-connected="state.connected" :is-free-driving="!state.routeActive" :current-location-name="state.location" :fuel="state.long?1234.5:381" :rest-stop-minutes="300" rest-stop-time="08:59" :game-time="state.long?'Wednesday 23:59':'Mon 15:07'" :is-web="true" :show-status="state.showStatus" />
                    <div class="warnings"><div class="route-warning"><div class="warning-message"><span>⚠</span><div class="text-content"><span>외부 게임 경로가 감지되었습니다.</span></div></div></div></div>
                    <div class="hud-buttons"><button class="option-btn" v-for="n in 4">HUD</button><button v-if="state.adding" class="option-btn add-stop-hud-btn">ADD</button></div><div class="speed-limit-sign circle">80</div>
                    <ManeuverCard :upcoming-turns="[{type:'depart',distance:0},{type:state.long?'roundabout':'exit-highway',exitClock:8,exitCount:3,distance:3.9},{type:'right',distance:4}]" :distance-to-next-turn="38.4" next-instruction="출구로 나가세요" /><div class="route-ui is-navigating"><CompactTrip :route-distance-converted="751" distance-unit="km" route-eta="0h 44min" destination-name="Calais" current-location-name="Duisburg" /></div>
                </div></div></div>` });
            for (const [name, component] of Object.entries(loaded)) app.component(name, component);
            app.component('Icon', { props:['size'], template:'<svg class="iconify" :width="size" :height="size" aria-hidden="true"></svg>' });
            app.mount('#app');
        }, { components, locale, durationCode, turnCode, layoutCode, adding,long });
        await page.waitForFunction(()=>document.querySelector('.map-ui-layer').style.getPropertyValue('--trip-telemetry-height') !== '0px');
        await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
        const boxes=await page.evaluate(()=>{const b=s=>{const r=document.querySelector(s).getBoundingClientRect();return {left:r.left,right:r.right,top:r.top,bottom:r.bottom};};return {telemetry:b('.gas-sleep-time'),summary:b('.trip-summary'),location:b('.trip-destination'),hud:b('.hud-buttons'),hudItems:[...document.querySelectorAll('.hud-buttons button')].map(el=>{const r=el.getBoundingClientRect();return {left:r.left,right:r.right,top:r.top,bottom:r.bottom};}),card:b('.card'),speed:b('.truck-info'),limit:b('.speed-limit-sign'),warning:b('.route-warning')};});
        const apart=(a,b)=>a.right<=b.left+.5||b.right<=a.left+.5||a.bottom<=b.top+.5||b.bottom<=a.top+.5;
        for(const key of ['summary','hud','card','speed','limit','warning']) assert.ok(apart(boxes.telemetry,boxes[key]),width+'x'+height+': telemetry overlaps '+key+' '+JSON.stringify(boxes));
        for (const h of boxes.hudItems) { assert.ok(h.right-h.left>=48 && h.bottom-h.top>=48); for (const key of ['location','summary','card','speed','limit','warning']) assert.ok(apart(h,boxes[key]),'HUD overlaps '+key+' '+JSON.stringify(boxes)); }
        const chips=await page.locator('.gas-sleep-time :is(.fuel-amount,.sleep-div,.game-time)').evaluateAll(els=>els.map(el=>{const r=el.getBoundingClientRect();return {left:r.left,right:r.right,top:r.top,bottom:r.bottom,overflow:el.scrollWidth>el.clientWidth+1};}));for(const c of chips){assert.equal(c.overflow,false,'chip text overflow');for(const key of ['summary','hud','speed','limit','warning'])assert.ok(apart(c,boxes[key]),'chip overlaps '+key);}
        assert.equal(await page.locator('.primary-turn .turn-info').evaluate(el=>el.scrollWidth>el.clientWidth+1),false,'turn instruction overflows narrow card'); assert.equal(await page.locator('.secondary-turn').count(),1,'following turn remains visible');
        assert.ok(apart(boxes.location,boxes.telemetry),'location overlaps chips');
        assert.ok(boxes.telemetry.left>=0 && boxes.telemetry.right<=width && boxes.telemetry.top>=0 && boxes.telemetry.bottom<=height-21,'telemetry violates viewport/safe bottom');
        if(height>320 || height>width){assert.ok(boxes.telemetry.bottom<=boxes.summary.top,'normal telemetry above summary'); assert.ok(boxes.location.bottom<=boxes.telemetry.top,'location above telemetry');}
        else assert.ok(boxes.telemetry.left>=boxes.summary.right,'short landscape telemetry next to summary');
        for(const [key,selector] of [['fuel','.fuel-amount'],['sleep','.sleep-div'],['time','.game-time']]){await page.evaluate(k=>{window.state.activeUiComponents=window.state.activeUiComponents.filter(v=>v!==k);},key);assert.equal(await page.locator(selector).isVisible(),false);}
        await page.evaluate(()=>{window.state.connected=false;}); assert.equal(await page.locator('.gas-sleep-time').count(),0); await page.waitForFunction(()=>document.querySelector('.map-ui-layer').style.getPropertyValue('--trip-telemetry-height')==='0px'); await page.evaluate(()=>{window.state.connected=true;}); await page.evaluate(()=>{window.state.showStatus=false;});assert.equal(await page.locator('.gas-sleep-time').count(),0);assert.equal(await page.locator('.trip-summary').count(),1);
        results.push(`${width}x${height}`);
    }
    console.log(JSON.stringify({ passed:results.length,viewports:results,scope:'actual guidance TopBar + CompactTrip SFC layout; no server/game or iPhone validation' }));
} finally { await browser.close(); }
