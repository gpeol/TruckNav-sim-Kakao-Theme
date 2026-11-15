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
for (const [name, file] of [['FreeDriveBar', 'freeDriveBar.vue'], ['TopBar', 'topBar.vue']]) {
    const source = await readFile(`${root}/app/components/navigation/${file}`, 'utf8');
    const { descriptor, errors } = parse(source, { filename: file });
    assert.deepEqual(errors, []);
    const compiled = compileScript(descriptor, { id: name, inlineTemplate: true });
    components[name] = ts.transpileModule(compiled.content, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
}
const styleFiles = ['global/_variables.scss', 'global/_global.scss', 'scoped/map/map.scss', 'scoped/navigation/topBar.scss',
    'scoped/common/hudButton.scss', 'scoped/navigation/speedLimit.scss', 'scoped/navigation/warningSlide.scss', 'scoped/navigation/freeDriveBar.scss', 'global/_navigation-theme.scss'];
const styles = (await Promise.all(styleFiles.map(file => readFile(`${root}/app/assets/scss/${file}`, 'utf8')))).join('\n').replace(/^@use[^;]+;/gm, '');
const css = sass.compileString(styles).css.replaceAll('env(safe-area-inset-bottom)', '21px')
    .replaceAll('env(safe-area-inset-top)', '0px').replaceAll('env(safe-area-inset-left)', '0px').replaceAll('env(safe-area-inset-right)', '0px');
const locale = JSON.parse(await readFile(`${root}/app/locales/ko.json`, 'utf8'));
const browser = await chromium.launch({ headless: true, ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}) });
try {
    const page = await browser.newPage();
    const results = [];
    for (const [width, height] of [[393,852],[390,650],[320,568],[844,375],[844,300],[667,260]]) {
        await page.setViewportSize({ width, height });
        await page.setContent(`<style>${css}</style><div id="app"></div>`);
        await page.addScriptTag({ path: require.resolve('vue/dist/vue.global.js') });
        await page.evaluate(({ components, locale }) => {
            const Vue = window.Vue;
            window.state = Vue.reactive({ showStatus:true, routeActive:false, connected:true,location:'Calais, France', activeUiComponents:['topBar','fuel','sleep','time','speed'] });
            window.calls = { exit:0, appearance:0, settings:0 };
            const useTranslations = () => ({ t: key => key.split('.').reduce((value, part) => value?.[part], locale) || key });
            const useSettings = () => ({ settings: Vue.ref(window.state) });
            const useUnitConversion = () => ({ kmToUserUnits: value => value, literToUserUnits: value => value, speedUnit:'km/h', fuelUnit:'L' });
            const loaded = {};
            for (const [name, code] of Object.entries(components)) {
                const exports = {};
                new Function('require','ref','computed','nextTick','useTranslations','useSettings','useUnitConversion','exports', code)
                    (() => Vue, Vue.ref, Vue.computed, Vue.nextTick, useTranslations, useSettings, useUnitConversion, exports);
                loaded[name] = exports.default;
            }
            const app = Vue.createApp({ setup: () => ({ state:window.state, calls:window.calls }), template:
                `<div class="full-page-wrapper"><div class="ui-safe-container"><div class="map-ui-layer" :class="{'is-free-driving':!state.routeActive,'has-status-bar':state.showStatus}">
                    <TopBar :truck-speed="53" :game-connected="state.connected" :is-free-driving="!state.routeActive" :current-location-name="state.location" :fuel="381" :rest-stop-minutes="300" rest-stop-time="08:59" game-time="Mon 15:07" :is-web="true" :show-status="state.showStatus" />
                    <div class="warnings"><div class="route-warning"><div class="warning-message"><span>⚠</span><div class="text-content"><span>외부 게임 경로가 감지되었습니다.</span></div></div></div></div>
                    <div class="hud-buttons"><button class="option-btn" v-for="n in 4">HUD</button></div><div class="speed-limit-sign circle">80</div>
                    <FreeDriveBar v-if="!state.routeActive" @exit="calls.exit++" @appearance="calls.appearance++" @settings="calls.settings++" />
                </div></div></div>` });
            for (const [name, component] of Object.entries(loaded)) app.component(name, component);
            app.component('Icon', { props:['size'], template:'<svg class="iconify" :width="size" :height="size" aria-hidden="true"></svg>' });
            app.mount('#app');
        }, { components, locale });
        const boxes = await page.evaluate(() => {
            const box = selector => { const r = document.querySelector(selector).getBoundingClientRect(); return { left:r.left,right:r.right,top:r.top,bottom:r.bottom }; };
            return { bar:box('.free-drive-bar'), telemetry:box('.gas-sleep-time'), warning:box('.route-warning'), hud:box('.hud-buttons'), speed:box('.truck-info') };
        });
        const apart = (a,b) => a.right <= b.left + .5 || b.right <= a.left + .5 || a.bottom <= b.top + .5 || b.bottom <= a.top + .5;
        if (width >= 640) { assert.ok(Math.abs(boxes.warning.left-boxes.bar.left)<1, 'landscape warning/footer left alignment'); assert.ok(boxes.telemetry.right < boxes.bar.right, 'telemetry must be a separate compact chip'); }
        if (height > width) { assert.ok(Math.abs(boxes.hud.bottom-(boxes.bar.top-8))<1, 'portrait HUD must sit directly above exit bar'); assert.ok(boxes.telemetry.right <= boxes.hud.left, 'portrait chips must reserve HUD column'); }
        assert.ok(boxes.telemetry.bottom <= boxes.bar.top, `${width}x${height}: telemetry not above exit`);
        assert.ok(apart(boxes.hud,boxes.bar) && apart(boxes.hud,boxes.telemetry), `${width}x${height}: HUD overlaps footer`);
        assert.ok(apart(boxes.warning,boxes.telemetry), `${width}x${height}: banner overlaps telemetry`);
        if (width >= 640) { const notices = await page.evaluate(() => { const lane=document.querySelector('.warnings'); lane.append(lane.firstElementChild.cloneNode(true)); const r=lane.getBoundingClientRect(); const chip=document.querySelector('.gas-sleep-time').getBoundingClientRect(); lane.scrollTop=lane.scrollHeight; return { bottom:r.bottom,chipTop:chip.top,scrollable:lane.scrollHeight<=lane.clientHeight || lane.scrollTop>0 }; }); assert.ok(notices.bottom<=notices.chipTop, 'stacked warnings overlap chip'); assert.ok(notices.scrollable, 'stacked warnings must remain readable'); assert.ok(await page.locator('.warnings').evaluate(el=>el.clientHeight>=44),'at least one full 44px notice must be visible'); }
        if (height>width) assert.ok(Math.abs((boxes.telemetry.left+boxes.telemetry.right)/2-width/2)<1,'portrait telemetry centered on footer');
        { const loc=await page.locator('.free-drive-location').boundingBox(); assert.ok(apart({left:loc.x,right:loc.x+loc.width,top:loc.y,bottom:loc.y+loc.height},(height>width?boxes.warning:await page.locator('.warnings').evaluate(el=>{const r=el.getBoundingClientRect();return {left:r.left,right:r.right,top:r.top,bottom:r.bottom};}))),'location overlaps warning'); assert.ok(loc.y+loc.height<=boxes.telemetry.top-5,'location above telemetry'); assert.ok(apart({left:loc.x,right:loc.x+loc.width,top:loc.y,bottom:loc.y+loc.height},boxes.hud),'location overlaps HUD');
        await page.evaluate(()=>{window.state.location='';}); assert.equal(await page.locator('.free-drive-location').count(),0); await page.evaluate(()=>{window.state.location='Duisburg, Germany';}); assert.match(await page.locator('.free-drive-location').innerText(),/Duisburg/); await page.evaluate(()=>{window.state.location='Very long current vehicle location near Duisburg, Germany';}); const longLocation=await page.locator('.free-drive-location').boundingBox(); assert.ok(longLocation.x>=0 && longLocation.x+longLocation.width<=width,'long location leaves viewport'); assert.match(await page.locator('.free-drive-location').getAttribute('aria-label'),/Very long current vehicle location/);
        await page.evaluate(()=>{window.state.connected=false;}); assert.equal(await page.locator('.free-drive-location').count(),0); await page.evaluate(()=>{window.state.connected=true;}); }
        assert.equal(await page.locator('.gas-sleep-time').count(), 1, 'existing telemetry must not be duplicated');
        assert.match(await page.locator('.gas-sleep-time').innerText(), /381/);
        const chips=await page.locator('.gas-sleep-time :is(.fuel-amount,.sleep-div,.game-time)').evaluateAll(els=>els.map(el=>{const r=el.getBoundingClientRect();return {left:r.left,right:r.right,top:r.top,bottom:r.bottom,bg:getComputedStyle(el).backgroundColor};})); assert.equal(chips.length,3); for (const [i,c] of chips.entries()) { assert.notEqual(c.bg,'rgba(0, 0, 0, 0)','each metric needs its own chip'); assert.ok(c.left>=0 && c.right<=width,'chip leaves viewport'); for(const other of chips.slice(i+1)) assert.ok(apart(c,other),'chips overlap'); }
        if (height > width) assert.ok(chips.every(chip => Math.abs(chip.top - chips[0].top) < 1), `${width}x${height}: telemetry chips should share a row`);
        assert.doesNotMatch(await page.locator('.free-drive-bar').innerText(), /km|ETA|도착|남음/);
        await page.evaluate(() => { window.state.activeUiComponents = window.state.activeUiComponents.filter(key => key !== 'fuel'); });
        assert.equal(await page.locator('.fuel-amount').isVisible(),false);
        assert.equal(await page.locator('.game-time').isVisible(),true);
        for (const [key,selector] of [['sleep','.sleep-div'],['time','.game-time']]) { await page.evaluate(key=>{window.state.activeUiComponents=window.state.activeUiComponents.filter(k=>k!==key);},key); assert.equal(await page.locator(selector).isVisible(),false); }
        await page.evaluate(()=>{window.state.activeUiComponents.push('fuel','sleep','time');});
        await page.getByRole('button',{name:'안전운전 종료',exact:true}).click();
        assert.equal(await page.evaluate(() => window.calls.exit),1);
        await page.getByRole('button',{name:'안전운전 메뉴',exact:true}).click();
        await page.getByRole('dialog').waitFor();
        await page.keyboard.press('Tab');
        assert.equal(await page.getByRole('dialog').getByRole('button').first().evaluate(el=>document.activeElement===el),true);
        await page.keyboard.press('Shift+Tab');
        assert.equal(await page.getByRole('dialog').getByRole('button').last().evaluate(el=>document.activeElement===el),true);
        await page.keyboard.press('Escape');
        assert.equal(await page.getByRole('dialog').count(),0);
        assert.equal(await page.getByRole('button',{name:'안전운전 메뉴',exact:true}).evaluate(el=>document.activeElement===el),true);
        for (const [label,event] of [['화면 설정','appearance'],['설정','settings']]) {
            await page.getByRole('button',{name:'안전운전 메뉴',exact:true}).click();
            await page.getByRole('dialog').getByRole('button',{name:label,exact:true}).click();
            assert.equal(await page.evaluate(key => window.calls[key],event),1);
        }
        await page.evaluate(() => { window.state.showStatus=false; });
        assert.equal(await page.locator('.gas-sleep-time').count(),0, 'status-off setting must hide original telemetry');
        assert.equal(await page.locator('.free-drive-bar').count(),1);
        await page.evaluate(() => { window.state.routeActive=true; });
        assert.equal(await page.locator('.free-drive-bar').count(),0, 'route state owns its existing summary');
        results.push(`${width}x${height}`);
    }
    console.log(JSON.stringify({ passed:results.length,viewports:results,scope:'actual SFC events + CSS geometry; no server/game or iPhone validation' }));
} finally { await browser.close(); }
