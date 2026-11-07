import { test, expect } from '@playwright/test';

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

test('Kakao fonts can be selected and loaded', async ({ page }) => {
    await page.route('**/api/map-status/**', route => route.fulfill({ json: { downloaded: true } }));
    await page.route('**/maps/**', async route => {
        const url = route.request().url();
        if (url.endsWith('.mp3')) return route.fulfill({body: emptyPmtiles()});
        if (url.endsWith('.bin')) return route.fulfill({body: Buffer.alloc(0)});
        return route.fulfill({json: url.endsWith('cities.json') ? [] : url.endsWith('.geojson') ? {type:'FeatureCollection', features:[]} : {}});
    });
    await page.routeWebSocket(/:30001/, () => {});
    await page.goto('/');
    await page.getByRole('button', { name: 'Euro Truck Simulator 2' }).click();
    await page.getByRole('button', { name: '내비게이션 시작' }).click();
    await page.getByRole('button', { name: '설정', exact: true }).click();
    await page.getByText('화면 설정', { exact: true }).click();
    for (const font of ['KakaoBigFont', 'KakaoSmallFont']) {
        await page.locator('button[role=combobox]').click();
        await page.getByRole('option', { name: font }).click();
        await expect(page.locator('button[role=combobox]')).toContainText(font);
        const faces = await page.evaluate(async family => {
            const loaded = await document.fonts.load(`16px "${family}"`, '한글');
            return loaded.map(face => face.status);
        }, font);
        expect(faces.length).toBeGreaterThan(0);
        expect(faces.every(status => status === 'loaded')).toBe(true);
        await expect.poll(() => page.evaluate(() => getComputedStyle(document.body).fontFamily)).toContain(font);
    }
});
