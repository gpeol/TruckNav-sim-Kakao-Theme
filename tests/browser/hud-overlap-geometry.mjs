// Standalone CSS geometry regression; no web server, telemetry or game connection.
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../../', import.meta.url));
const require = createRequire(path.join(root, 'package.json'));
const sass = require('sass');
const { chromium } = require('@playwright/test');
const files = ['global/_variables.scss', 'global/_global.scss', 'scoped/map/map.scss', 'scoped/navigation/topBar.scss',
    'scoped/common/hudButton.scss', 'scoped/navigation/speedLimit.scss', 'scoped/navigation/maneuverCard.scss', 'scoped/navigation/warningSlide.scss', 'scoped/navigation/compactTrip.scss', 'scoped/navigation/sheetSlide.scss', 'global/_navigation-theme.scss'];
const source = (await Promise.all(files.map(file => readFile(path.join(root, 'app/assets/scss', file), 'utf8')))).join('\n')
    .replace(/^@use[^;]+;/gm, '');
const css = sass.compileString(source).css.replaceAll('env(safe-area-inset-bottom)', '21px')
    .replaceAll('env(safe-area-inset-left)', '0px').replaceAll('env(safe-area-inset-right)', '0px').replaceAll('env(safe-area-inset-top)', '0px');
const browser = await chromium.launch({ headless: true, ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}) });
const page = await browser.newPage();
const icon = '<span class="icon"></span>';
const warning = '<div class="route-warning" role="status"><div class="warning-message"><span>⚠</span><div class="text-content" tabindex="0"><span class="text-nowrap">게임 연결 상태와 외부 경로 설정을 확인하세요. 매우 긴 경고 내용이 화면 밖으로 나가지 않아야 합니다.</span></div></div></div>';
const noOverlap = (a, b) => a.right <= b.left + 0.5 || b.right <= a.left + 0.5 || a.bottom <= b.top + 0.5 || b.bottom <= a.top + 0.5;
const results = [];
try {
    for (const [width, height, guidance, adding, warningCount = 1, hideStatus = false, preview = false] of [[390,650,false,false],[320,568,false,false],[844,375,true,false],
        [812,340,true,false],[844,300,true,false],[667,260,true,false],[667,260,true,true],
        [390,650,false,false,2],[390,740,true,false,2],[667,260,true,true,2],[390,650,true,false,1,true],
        [390,650,false,false,2,false,true],[667,260,false,false,2,false,true]]) {
        await page.setViewportSize({ width, height });
        await page.setContent(`<style>${css}</style><div class="full-page-wrapper"><div class="ui-safe-container"><div class="map-ui-layer ${hideStatus ? '' : 'has-status-bar'} ${guidance ? 'has-guidance' : ''} ${preview ? 'has-route-preview' : ''}" ${hideStatus ? 'style="--top-bar-height:0px"' : ''}>
            <div class="game-information"><div class="truck-info"><div class="truck-speed-div"><p class="truck-speed">110</p><p class="km-h">km/h</p></div></div></div>
            ${guidance ? '<div class="card"><div class="primary-turn"><span class="icon-wrapper"></span><div class="turn-info"><p>38.4<span>km</span></p><p>회전교차로 11시 방향 출구로 나가세요</p></div></div><div class="secondary-turn"><span class="icon-wrapper"></span><span>35.8<small>km</small></span></div></div>' : ''}
            ${preview ? '<div class="route-preview-bar">경로 미리보기</div>' : ''}
            <div class="hud-buttons">${[0,1,2,3].map(() => `<button class="option-btn">${icon}</button>`).join('')}${adding ? `<button class="option-btn add-stop-hud-btn">${icon}</button>` : ''}</div>
            <div class="speed-limit-sign circle">80</div><div class="warnings">${warning.repeat(warningCount)}</div>
            ${guidance ? '<button class="trip-summary"><span class="trip-destination"><span>목적지 · 칼레 버스정류장</span></span><span class="trip-handle"></span><span class="trip-route-icon">↪</span><span class="trip-details"><span class="trip-metrics"><span class="trip-arrival"><small>게임 예상 도착</small>오후 07:53</span><strong>376<small>km</small></strong></span><span class="trip-remaining">4시간 46분 남음</span></span><span class="trip-menu-icon">≡</span><span class="trip-progress"></span></button>' : ''}
            </div></div></div>`);
        const boxes = await page.evaluate(() => {
            const box = el => { const r = el.getBoundingClientRect(); return { left:r.left, right:r.right, top:r.top, bottom:r.bottom, width:r.width, height:r.height }; };
            return { hud: [...document.querySelectorAll('.hud-buttons button')].map(box), warnings: [...document.querySelectorAll('.route-warning')].map(box),
                speed: box(document.querySelector('.truck-info')), limit: box(document.querySelector('.speed-limit-sign')),
                card: document.querySelector('.card') && box(document.querySelector('.card')), trip: document.querySelector('.trip-summary') && box(document.querySelector('.trip-summary')),
                preview: document.querySelector('.route-preview-bar') && box(document.querySelector('.route-preview-bar')),
                destination: document.querySelector('.trip-destination') && box(document.querySelector('.trip-destination')) };
        });
        const label = `${width}x${height}${adding ? ' +add-stop' : ''} banners=${warningCount}${hideStatus ? ' status-off' : ''}${preview ? ' preview' : ''}`;
        const reader = await page.locator('.route-warning .text-content').first().evaluate(el => {
            el.scrollTop = el.scrollHeight;
            return { overflow: getComputedStyle(el).overflowY, wrapping: getComputedStyle(el.firstElementChild).whiteSpace,
                needsScroll: el.scrollHeight > el.clientHeight, scrolled: el.scrollTop > 0 };
        });
        assert.equal(reader.overflow, 'auto', `${label}: full warning cannot scroll`);
        assert.equal(reader.wrapping, 'normal', `${label}: warning cannot wrap`);
        if (reader.needsScroll) assert.ok(reader.scrolled, `${label}: warning tail is inaccessible`);
        for (const warning of boxes.warnings) {
            assert.ok(warning.left >= 0 && warning.right <= width, `${label}: warning leaves viewport`);
            assert.ok(warning.top >= 56, `${label}: warning covers status/landing controls`);
            assert.ok(noOverlap(warning, boxes.speed) && noOverlap(warning, boxes.limit), `${label}: warning covers speed/limit`);
            if (guidance) assert.ok(noOverlap(warning, boxes.card), `${label}: warning covers guidance ${JSON.stringify({ warning, card: boxes.card })}`);
            if (preview) assert.ok(noOverlap(warning, boxes.preview), `${label}: warning covers route preview`);
        }
        for (const [i, hud] of boxes.hud.entries()) {
            assert.ok(hud.right-hud.left>=48 && hud.bottom-hud.top>=48, `${label}: touch target below48px`);
            for (const warning of boxes.warnings) assert.ok(noOverlap(hud, warning), `${label}: warning covers HUD ${i}`);
            for (const other of boxes.hud.slice(i + 1)) assert.ok(noOverlap(hud, other), `${label}: HUD buttons overlap`);
            if (guidance) { assert.ok(noOverlap(hud,boxes.trip), `${label}: HUD overlaps summary`); assert.ok(noOverlap(hud, boxes.speed), `${label}: speed overlaps HUD`); assert.ok(noOverlap(hud, boxes.limit), `${label}: limit overlaps HUD`); }
        }
        if (guidance) {
            assert.ok(noOverlap(boxes.card, boxes.trip), `${label}: guidance overlaps summary`);
            assert.ok(noOverlap(boxes.card, boxes.destination), `${label}: guidance overlaps destination`);
        }
        results.push(label);
    }
    console.log(JSON.stringify({ passed: results.length, viewports: results, scope: 'CSS fixture only; not actual iOS Whale or full Vue interaction' }));
} finally { await browser.close(); }
