import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const sass = require('sass');
const { chromium } = require('playwright');
test('free-driving header and offline notice respect portrait, landscape and notch insets', {skip: !process.env.CHROMIUM_PATH}, async () => {
 const scss = await readFile(new URL('../app/assets/scss/global/_navigation-theme.scss', import.meta.url), 'utf8');
 const css = sass.compileString(scss).css.replaceAll('env(safe-area-inset-top, 0px)', 'var(--test-inset-top, 0px)');
 const browser = await chromium.launch({executablePath:process.env.CHROMIUM_PATH,headless:true});
 try {
 for (const viewport of [{width:390,height:844},{width:844,height:390}]) {
 const page = await browser.newPage({viewport});
 await page.setContent('<style>'+css+'</style><div class="map-ui-layer is-free-driving"><div class="game-information"></div><div class="warnings"><div class="route-warning" role="status">게임 오프라인</div></div></div>');
 for (const inset of [0,44]) {
 await page.evaluate(n=>document.documentElement.style.setProperty('--test-inset-top',n+'px'),inset);
 const metrics = await page.evaluate(()=>({background:getComputedStyle(document.querySelector('.game-information')).backgroundColor,shadow:getComputedStyle(document.querySelector('.game-information')).boxShadow,warningTop:getComputedStyle(document.querySelector('.warnings')).top}));
 assert.equal(metrics.background,'rgba(0, 0, 0, 0)');assert.equal(metrics.shadow,'none');assert.equal(metrics.warningTop,(inset+12)+'px');
 }
 await page.close();
 }
 } finally {await browser.close();}
});
