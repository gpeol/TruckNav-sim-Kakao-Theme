import { test, expect, type WebSocketRoute } from '@playwright/test';

function emptyPmtiles() {
    const bytes = Buffer.alloc(130);
    bytes.write('PMTiles'); bytes[7] = 3;
    for (const [offset, value] of [[8, 127], [16, 1], [24, 128], [32, 2], [56, 130]]) bytes.writeBigUInt64LE(BigInt(value!), offset!);
    bytes[97] = 1; bytes[98] = 1; bytes[99] = 1; bytes[101] = 14;
    bytes.writeInt32LE(-1800000000, 102); bytes.writeInt32LE(-850000000, 106);
    bytes.writeInt32LE(1800000000, 110); bytes.writeInt32LE(850000000, 114);
    bytes.write('{}', 128);
    return bytes;
}

for (const viewport of [{ width: 320, height: 700 }, { width: 390, height: 844 },
    { width: 722, height: 832 }, { width: 844, height: 390 }, { width: 1024, height: 768 }]) {
    test(`free-drive HUD follows guidance placement at ${viewport.width}x${viewport.height}`, async ({ page }) => {
        await page.setViewportSize(viewport);
        await page.addInitScript(() => localStorage.setItem('truck-nav-settings', JSON.stringify({ selectedGame: 'ets2', locale: 'ko', themeMode: 'night' })));
        await page.route('**/api/map-status/**', route => route.fulfill({ json: { downloaded: true } }));
        await page.route('**/maps/**', route => {
            const url = route.request().url();
            if (url.endsWith('.mp3')) return route.fulfill({ body: emptyPmtiles() });
            if (url.endsWith('graph.bin') || url.endsWith('geometry.bin')) return route.fulfill({ body: Buffer.alloc(0) });
            if (url.endsWith('scale.json')) return route.fulfill({ json: { ruralScale: 19, urbanScale: 3, hasUkRule: true } });
            return route.fulfill({ json: url.endsWith('.geojson') ? { type: 'FeatureCollection', features: [] } : [] });
        });
        let telemetry: WebSocketRoute | undefined;
        await page.routeWebSocket(/:30001/, ws => { telemetry = ws; });
        await page.goto('/');
        await page.getByRole('button', { name: 'Euro Truck Simulator 2' }).click();
        await page.getByRole('button', { name: '내비게이션 시작' }).click();
        await expect.poll(() => Boolean(telemetry), { timeout: 15000 }).toBeTruthy();
        telemetry!.send(JSON.stringify({
            game: 'ets2', common: { gameTime: '2026-07-01T10:00:00Z', mapScale: 19, nextRestStopMinutes: 300 },
            truck: { constants: { brand: 'Test', name: 'Truck' }, current: { position: { x: 5000, y: 0, z: -5000 }, heading: 0, dashboard: { speedKph: 53, fuelAmount: 450 } } },
            job: { income: 0, citySourceId: 'test', companySourceId: 'test', cityDestinationId: 'test', companyDestinationId: 'test' },
            navigation: { distance: 0, speedLimitKph: 80 }, specialEvents: { onJob: false }, trailers: [],
        }));
        const bar = page.locator('.game-information');
        const back = page.getByRole('button', { name: '게임 선택' });
        const settings = page.getByRole('button', { name: '설정', exact: true });
        const speed = page.locator('.truck-info');
        const limit = page.locator('.speed-limit-sign');
        await expect(limit).toBeVisible();
        await expect(page.locator('.landing-button')).toHaveCount(0);
        await expect(page.locator('.settings-top-button')).toHaveCount(0);
        expect(await bar.evaluate(el => getComputedStyle(el).backgroundColor)).toBe('rgba(0, 0, 0, 0)');
        expect(await bar.evaluate(el => getComputedStyle(el).boxShadow)).toBe('none');
        const before = { speed: await speed.boundingBox(), limit: await limit.boundingBox() };
        await page.locator('.map-ui-layer').evaluate(el => el.classList.add('has-guidance'));
        expect(await speed.boundingBox()).toEqual(before.speed);
        expect(await limit.boundingBox()).toEqual(before.limit);
        await page.locator('.map-ui-layer').evaluate(el => el.classList.remove('has-guidance'));
        await page.getByRole('button', { name: '안전운전 메뉴', exact: true }).click();
        await settings.click();
        await expect(page.locator('.settings-panel')).toBeVisible();
    });
}

test('offline warning leaves free-drive controls usable on a short portrait screen', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 650 });
    await page.addInitScript(() => localStorage.setItem('truck-nav-settings', JSON.stringify({ selectedGame: 'ets2', locale: 'ko' })));
    await page.route('**/api/map-status/**', route => route.fulfill({ json: { downloaded: true } }));
    await page.route('**/maps/**', route => route.fulfill({ json: [] }));
    await page.routeWebSocket(/:30001/, () => {});
    await page.goto('/');
    await page.getByRole('button', { name: 'Euro Truck Simulator 2' }).click();
    await page.getByRole('button', { name: '내비게이션 시작' }).click();
    const warning = page.locator('.route-warning');
    await expect(warning).toBeVisible();
    await expect(warning).toHaveAttribute('role', 'status');
    await expect(warning).toContainText('게임');
    const warningBox = (await warning.boundingBox())!;
    const statusBox = (await page.locator('.game-information').boundingBox())!;
    expect(warningBox.y).toBeGreaterThanOrEqual(12);
    expect(warningBox.y).toBeLessThan(statusBox.y + statusBox.height);
    await expect(page.locator('.disconnected-div')).toHaveCount(0);
    await expect(page.locator('.landing-button')).toHaveCount(0);
    for (const button of await page.locator('.hud-buttons .option-btn').all()) {
        const box = (await button.boundingBox())!;
        expect(warningBox.y + warningBox.height <= box.y || box.y + box.height <= warningBox.y ||
            warningBox.x + warningBox.width <= box.x || box.x + box.width <= warningBox.x).toBeTruthy();
    }
});
