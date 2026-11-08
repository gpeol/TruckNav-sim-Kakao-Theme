import { test, expect, type WebSocketRoute } from '@playwright/test';

// Minimal, empty PMTiles v3 archive. Exercises the real protocol and MapLibre
// lifecycle without downloading proprietary game map data.
function emptyPmtiles() {
    const bytes = Buffer.alloc(130);
    bytes.write('PMTiles'); bytes[7] = 3;
    for (const [offset,value] of [[8,127],[16,1],[24,128],[32,2],[56,130]]) bytes.writeBigUInt64LE(BigInt(value!),offset!);
    bytes[97] = 1; bytes[98] = 1; bytes[99] = 1; bytes[101] = 14;
    bytes.writeInt32LE(-1800000000,102); bytes.writeInt32LE(-850000000,106);
    bytes.writeInt32LE(1800000000,110); bytes.writeInt32LE(850000000,114);
    bytes.write('{}',128);
    return bytes;
}

test('real MapLibre startup, telemetry HUD and in-game theme clock', async ({page}) => {
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.clock.install({time:new Date(2026,6,1,12)});
    await page.route('**/api/map-status/**', route => route.fulfill({json:{downloaded:true}}));
    await page.route('**/maps/**', async route => {
        const url=route.request().url();
        if (url.endsWith('.mp3')) return route.fulfill({body:emptyPmtiles()});
        if (url.endsWith('.bin')) return route.fulfill({body:Buffer.alloc(0)});
        const json = url.endsWith('cities.json') ? [] : url.endsWith('.geojson') ? {type:'FeatureCollection',features:[]} : {};
        return route.fulfill({json});
    });
    let telemetry: WebSocketRoute | undefined;
    await page.routeWebSocket(/:30001/, ws => {telemetry=ws;});
    await page.goto('/');
    await page.getByLabel('자동 전환 기준').selectOption('game');
    await page.getByRole('button',{name:'Euro Truck Simulator 2'}).click();
    await page.getByRole('button',{name:'내비게이션 시작'}).click();
    await expect(page.locator('.maplibregl-canvas')).toBeVisible();
    await expect.poll(() => Boolean(telemetry)).toBeTruthy();
    const packet = {
        game:'ets2', common:{gameTime:'2026-07-01T23:00:00Z',mapScale:19,nextRestStopMinutes:300},
        truck:{constants:{brand:'Test',name:'Truck'},current:{position:{x:0,y:0,z:0},heading:0,dashboard:{speedKph:72,fuelAmount:450}}},
        job:{income:0,citySourceId:'test',companySourceId:'test',cityDestinationId:'test',companyDestinationId:'test'},
        navigation:{distance:0,speedLimitKph:80},specialEvents:{onJob:false},trailers:[],
    };
    telemetry!.send(JSON.stringify(packet));
    await expect(page.locator('.truck-speed')).toHaveText('72');
    await expect(page.locator('.speed-limit')).toHaveText('80');
    await expect(page.locator('html')).toHaveAttribute('data-theme','night');
    packet.common.gameTime='2026-07-02T12:00:00Z';
    telemetry!.send(JSON.stringify(packet));
    await expect(page.locator('html')).toHaveAttribute('data-theme','day');
    await page.clock.fastForward(2000);
    await expect(page.locator('.loading-screen')).toBeHidden();
    await page.screenshot({path:test.info().outputPath('navigation-day.png')});
    await page.getByRole('button',{name:'설정',exact:true}).click();
    await page.getByText('화면 설정',{exact:true}).click();
    await page.getByRole('button',{name:'야간',exact:true}).click();
    await expect(page.locator('html')).toHaveAttribute('data-theme','night');
    expect(errors).toEqual([]);
});
