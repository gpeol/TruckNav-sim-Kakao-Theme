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

test('the map displays only SDK streamed positions and clears them on disconnect', async ({ page }) => {
    test.setTimeout(60000);
    await page.addInitScript(() => localStorage.setItem('truck-nav-settings', JSON.stringify({ selectedGame: 'ets2', locale: 'ko' })));
    await page.route('**/api/map-status/**', route => route.fulfill({ json: { downloaded: true } }));
    await page.route('**/maps/**', route => {
        const url = route.request().url();
        if (url.endsWith('.mp3')) return route.fulfill({ body: emptyPmtiles() });
        if (url.endsWith('graph.bin') || url.endsWith('geometry.bin')) return route.fulfill({ body: Buffer.alloc(0) });
        if (url.endsWith('scale.json')) return route.fulfill({ json: { ruralScale: 19, urbanScale: 3, hasUkRule: true } });
        return route.fulfill({ json: url.endsWith('.geojson') ? { type: 'FeatureCollection', features: [] } : [] });
    });
    let nearby: WebSocketRoute | undefined;
    await page.routeWebSocket(/__trucknav\/tmp-nearby/, ws => { nearby = ws; });
    await page.routeWebSocket(/:30001/, () => {});
    await page.goto('/');
    await page.evaluate(() => document.head.insertAdjacentHTML('beforeend', '<meta name="trucknav-tmp-nearby" content="1">'));
    await page.getByRole('button', { name: 'Euro Truck Simulator 2' }).click();
    await page.getByRole('button', { name: '내비게이션 시작' }).click();
    await expect.poll(() => Boolean(nearby), { timeout: 15000 }).toBeTruthy();
    const markerCount = () => page.evaluate(() => {
        const element = document.querySelector('.maplibregl-map') as any;
        let component = element?.__vueParentComponent;
        while (component) {
            const map = component.setupState?.map;
            if (map?.getSource) return (map.getSource('tmp-vehicles') as any)?._data?.geojson?.features?.length ?? 0;
            component = component.parent;
        }
        return -1;
    });
    const send = () => nearby!.send(JSON.stringify({ state: 'active', vehicles: [[100, 200], [120, 220]] }));
    send();
    const timer = setInterval(send, 250);
    try { await expect.poll(markerCount, { timeout: 30000 }).toBe(2); }
    finally { clearInterval(timer); }
    nearby!.send(JSON.stringify({ state: 'inactive', vehicles: [] }));
    await expect.poll(markerCount).toBe(0);
});
