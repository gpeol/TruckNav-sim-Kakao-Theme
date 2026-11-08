import { test, expect, type WebSocketRoute } from '@playwright/test';

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
function graphFixture(roundabout = false, branch = false) {
    const points = [[1,1],[1,1.08],[1.05,1.16],[1.15,1.24],[1.25,1.32],[1.35,1.4],[1.45,1.48]];
    const edges:number[] = [];
    const geometry:number[] = [];
    for (let i=0; i<points.length-1; i++) {
        edges.push(i+1, i+2, 1, 0, 0, 0, 0, 0, geometry.length, 2, i === 2 ? (roundabout ? 3 : 2) : 0, 0);
        geometry.push(...points[i]!, ...points[i+1]!);
    }
    if (branch) {
        const alternate = [1.08,1.2];
        edges.push(3,8,1,0,0,0,0,0,geometry.length,2,0,0);
        geometry.push(...points[2]!, ...alternate);
        edges.push(8,4,1,0,0,0,0,0,geometry.length,2,0,0);
        geometry.push(...alternate, ...points[3]!);
    }
    return {graph: Buffer.from(new Float32Array(edges).buffer), geometry: Buffer.from(new Float32Array(geometry).buffer)};
}

test('alternates destination and refreshed current location without approximation marks', async ({page}) => {
    await page.setViewportSize({width:390,height:844});
    const graph = graphFixture();
    const world = (lng:number,lat:number) => [lng*Math.PI/180*300000, -300000*Math.log(Math.tan((lat*Math.PI/180+Math.PI/2)/2))];
    const cities = [[1,1,'Alpha'],[1,1.08,'Gamma'],[1.45,1.48,'Beta']].map(([lng,lat,name]) => {
        const [x,y]=world(lng as number,lat as number);
        return {uid:name,token:name,name,countryToken:'test',x,y,areas:[]};
    });
    await page.addInitScript(() => {
        localStorage.setItem('truck-nav-settings', JSON.stringify({selectedGame:'ets2',locale:'ko',routeTimeMode:'real',profiles:{ets2:{lastDestination:[1.45,1.48]}}}));
        const original = window.setInterval.bind(window);
        window.setInterval = ((callback:TimerHandler, delay?:number, ...args:unknown[]) => original(callback,delay===10000?2000:delay===30000?6000:delay,...args)) as typeof window.setInterval;
    });
    await page.route('**/api/map-status/**', route=>route.fulfill({json:{downloaded:true}}));
    await page.route('**/maps/**', route=>{
        const url=route.request().url();
        if(url.endsWith('graph.bin'))return route.fulfill({body:graph.graph});
        if(url.endsWith('geometry.bin'))return route.fulfill({body:graph.geometry});
        if(url.endsWith('.mp3'))return route.fulfill({body:emptyPmtiles()});
        if(url.endsWith('scale.json'))return route.fulfill({json:{ruralScale:19,urbanScale:3,hasUkRule:true}});
        return route.fulfill({json:url.endsWith('cities.json')?cities:url.endsWith('.geojson')?{type:'FeatureCollection',features:[]}: {}});
    });
    let telemetry:WebSocketRoute|undefined;
    await page.routeWebSocket(/:30001/,ws=>{telemetry=ws;});
    await page.goto('/');await page.getByRole('button',{name:'Euro Truck Simulator 2'}).click();await page.getByRole('button',{name:'내비게이션 시작'}).click();
    await expect.poll(()=>Boolean(telemetry),{timeout:15000}).toBeTruthy();
    const [x,z]=world(1,1);
    const packet={game:'ets2',common:{gameTime:'2026-07-01T10:00:00Z',mapScale:19,nextRestStopMinutes:300},truck:{constants:{brand:'Test',name:'Truck'},current:{position:{x,y:0,z},heading:0,dashboard:{speedKph:0,fuelAmount:450}}},job:{income:0,citySourceId:'test',companySourceId:'test',cityDestinationId:'test',companyDestinationId:'test'},navigation:{distance:0,speedLimitKph:80},specialEvents:{onJob:false},trailers:[]};
    telemetry!.send(JSON.stringify(packet));
    await page.getByRole('button',{name:'내비게이션 시작',exact:true}).click();
    const summary=page.locator('.trip-summary');
    await expect(summary.locator('.trip-destination')).toContainText('목적지 · Beta');
    await expect(summary.locator('.trip-arrival')).toContainText('실제 예상 도착');
    await expect(summary.locator('.trip-arrival')).not.toContainText('~');
    await expect(summary.locator('.trip-remaining')).not.toContainText('~');
    await expect(summary.locator('.trip-destination')).toContainText('현재 위치 · Alpha',{timeout:10000});
    const [nx,nz]=world(1,1.08);packet.truck.current.position.x=nx;packet.truck.current.position.z=nz;
    telemetry!.send(JSON.stringify(packet));
    await expect(summary.locator('.trip-destination')).toContainText('현재 위치 · Gamma',{timeout:5000});
    await expect(summary.locator('.trip-destination')).toContainText('목적지 · Beta',{timeout:10000});
});

for (const viewport of [{width:390,height:844}, {width:844,height:390}, {width:812,height:375}, {width:1024,height:768}, {width:1440,height:900}]) {
    test(`route preview and menu use real route state at ${viewport.width}x${viewport.height}`, async ({page}) => {
        await page.setViewportSize(viewport);
        const errors:string[] = [];
        page.on('pageerror', error => errors.push(error.message));
        const roundabout = viewport.width === 390;
        const graph = graphFixture(roundabout);
        await page.addInitScript(() => localStorage.setItem('truck-nav-settings', JSON.stringify({
            selectedGame:'ets2', locale:'ko', profiles:{ets2:{lastDestination:[1.45,1.48]}}
        })));
        await page.route('**/api/map-status/**', route => route.fulfill({json:{downloaded:true}}));
        await page.route('**/maps/**', route => {
            const url = route.request().url();
            if (url.endsWith('graph.bin')) return route.fulfill({body:graph.graph});
            if (url.endsWith('geometry.bin')) return route.fulfill({body:graph.geometry});
            if (url.endsWith('.mp3')) return route.fulfill({body:emptyPmtiles()});
            if (url.endsWith('scale.json')) return route.fulfill({json:{ruralScale:19,urbanScale:3,hasUkRule:true}});
            return route.fulfill({json:url.endsWith('cities.json') ? [] : url.endsWith('.geojson') ? {type:'FeatureCollection',features:[]} : {}});
        });
        let telemetry:WebSocketRoute | undefined;
        await page.routeWebSocket(/:30001/, ws => {telemetry=ws;});
        await page.goto('/');
        await page.getByRole('button',{name:'Euro Truck Simulator 2'}).click();
        await page.getByRole('button',{name:'내비게이션 시작'}).click();
        await expect.poll(() => Boolean(telemetry), {timeout:15000}).toBeTruthy();
        const gameX = Math.PI / 180 * 300000;
        const gameZ = -300000 * Math.log(Math.tan((Math.PI / 180 + Math.PI / 2) / 2));
        telemetry!.send(JSON.stringify({
            game:'ets2', common:{gameTime:'2026-07-01T10:00:00Z',mapScale:19,nextRestStopMinutes:300},
            truck:{constants:{brand:'Test',name:'Truck'},current:{position:{x:gameX,y:0,z:gameZ},heading:0,dashboard:{speedKph:0,fuelAmount:450}}},
            job:{income:0,citySourceId:'test',companySourceId:'test',cityDestinationId:'test',companyDestinationId:'test'},
            navigation:{distance:0,speedLimitKph:80},specialEvents:{onJob:false},trailers:[],
        }));
        await expect(page.getByRole('region',{name:'경로 미리보기'})).toBeVisible({timeout:20000});
        await expect(page.getByText('안내 경로',{exact:false})).toBeVisible();
        await page.getByRole('button',{name:/자동 시작 취소/}).click();
        await page.screenshot({path:test.info().outputPath('route-preview.png')});
        await page.getByRole('button',{name:'내비게이션 시작',exact:true}).click();
        const summary = page.locator('.route-ui').getByRole('button',{name:/안내 메뉴 열기/});
        await expect(summary).toBeVisible();
        await expect(summary.locator('.trip-destination')).toBeVisible();
        await expect(summary).toContainText('게임 예상 도착');
        if (roundabout) {
            await expect(page.locator('.primary-turn')).toContainText('회전교차로 1시 방향 출구');
            const icon = page.locator('.primary-turn .roundabout-direction');
            await expect(icon).toBeVisible();
            await expect(icon.locator('g')).toHaveAttribute('transform', 'rotate(30 24 24)');
            await expect(icon.locator('polygon')).toHaveCSS('fill', 'rgb(255, 255, 255)');
        }
        await expect.poll(() => summary.evaluate(element => getComputedStyle(element).opacity)).toBe('1');
        const guidance = await page.locator('.primary-turn').boundingBox();
        const controls = await page.locator('.hud-buttons').boundingBox();
        const speed = await page.locator('.truck-speed-div').boundingBox();
        const limit = await page.locator('.speed-limit-sign').boundingBox();
        const truck = await page.locator('[data-truck-marker]').boundingBox();
        expect(guidance && controls && speed && limit && truck).toBeTruthy();
        expect(limit!.y).toBeGreaterThanOrEqual(speed!.y + speed!.height);
        expect(Math.abs((limit!.x + limit!.width / 2) - (speed!.x + speed!.width / 2))).toBeLessThanOrEqual(1);
        expect(Math.abs(limit!.height - speed!.height)).toBeLessThanOrEqual(4);
        const secondary = page.locator('.secondary-turn');
        if (await secondary.count()) {
            await expect(page.locator('.primary-turn')).toHaveCSS('border-bottom-left-radius', '0px');
            const secondBox = await secondary.boundingBox();
            expect(Math.abs(secondBox!.x - guidance!.x)).toBeLessThanOrEqual(1);
            expect(Math.abs(secondBox!.y - (guidance!.y + guidance!.height))).toBeLessThanOrEqual(1);
        }
        if (viewport.width > viewport.height) {
            const summaryBox = await summary.boundingBox();
            expect(Math.abs(summaryBox!.x - guidance!.x)).toBeLessThanOrEqual(1);
            expect(Math.abs(summaryBox!.width - guidance!.width)).toBeLessThanOrEqual(1);
            expect(truck!.x + truck!.width / 2).toBeGreaterThan(guidance!.x + guidance!.width);
            expect(speed!.x).toBeGreaterThan(viewport.width / 2);
            expect(limit!.y + limit!.height).toBeLessThan(controls!.y);
        } else {
            expect(speed!.y).toBeGreaterThan(guidance!.y);
            await expect(page.locator('.left-buttons')).toHaveCount(0);
        }
        await expect(page.locator('.landing-button')).toBeVisible();
        await page.screenshot({path:test.info().outputPath('route-guidance.png')});
        await summary.click();
        await expect(page.getByRole('region',{name:'안내 메뉴'})).toBeVisible();
        await page.screenshot({path:test.info().outputPath('route-menu.png')});
        await page.getByRole('button',{name:'화면 설정',exact:true}).click();
        await expect(page.getByText('앱 글꼴')).toBeVisible();
        await expect(page.getByRole('dialog',{name:'화면 설정'})).toBeVisible();
        await expect(page.locator('.map-ui-layer .primary-turn')).toBeVisible();
        await page.screenshot({path:test.info().outputPath('appearance-overlay.png'), animations:'disabled'});
        await page.getByRole('button',{name:'뒤로',exact:true}).click();
        await expect(summary).toBeVisible();
        await summary.click();
        await page.getByRole('button',{name:'화면 설정',exact:true}).click();
        await page.locator('.settings-scrim').click({position:{x:viewport.width-8,y:8}});
        await expect(summary).toBeVisible();
        await summary.click();
        await page.getByRole('button',{name:'설정',exact:true}).click();
        await expect(page.locator('.settings-panel .menu-list.main')).toBeVisible();
        await page.locator('.settings-panel .menu-list.main').getByText('화면 설정',{exact:true}).click();
        await expect(page.getByText('앱 글꼴')).toBeVisible();
        await page.getByRole('button',{name:'뒤로',exact:true}).click();
        await expect(page.locator('.settings-panel .menu-list.main')).toBeVisible();
        await page.getByRole('button',{name:'뒤로',exact:true}).click();
        await expect(summary).toBeVisible();
        expect(errors).toEqual([]);
    });
}

test('traffic requires server selection and clears when the provider fails', async ({page}) => {
    await page.setViewportSize({width:390,height:844});
    const graph = graphFixture();
    await page.addInitScript(() => {
        localStorage.setItem('truck-nav-settings', JSON.stringify({selectedGame:'ets2', locale:'ko', profiles:{ets2:{lastDestination:[1.45,1.48]}}}));
        (window as any).__trafficFeatureCounts = [];
        (window as any).__vehicleFeatureCounts = [];
        (window as any).__vehicleCoordinates = [];
        const originalPost = Worker.prototype.postMessage;
        Worker.prototype.postMessage = function (...args:any[]) {
            const data = args[0]?.data;
            if (data?.source === 'tmp-traffic' && Array.isArray(data.data?.features)) {
                (window as any).__trafficFeatureCounts.push(data.data.features.length);
            }
            if (data?.source === 'tmp-vehicles' && Array.isArray(data.data?.features)) {
                (window as any).__vehicleFeatureCounts.push(data.data.features.length);
                if (data.data.features.length) (window as any).__vehicleCoordinates.push(data.data.features[0].geometry.coordinates);
            }
            return (originalPost as any).apply(this, args);
        } as typeof Worker.prototype.postMessage;
        const nativeTimeout = window.setTimeout.bind(window);
        window.setTimeout = ((callback: TimerHandler, delay?: number, ...args: unknown[]) => nativeTimeout(callback, delay === 6000 ? 1000 : delay, ...args)) as typeof window.setTimeout;
    });
    await page.route('**/', async route => {
        const response = await route.fetch();
        const html = (await response.text()).replace('</head>', '<meta name="trucknav-traffic" content="1"></head>');
        await route.fulfill({response, body:html});
    });
    await page.route('**/api/map-status/**', route => route.fulfill({json:{downloaded:true}}));
    await page.route('**/maps/**', route => {
        const url = route.request().url();
        if (url.endsWith('graph.bin')) return route.fulfill({body:graph.graph});
        if (url.endsWith('geometry.bin')) return route.fulfill({body:graph.geometry});
        if (url.endsWith('.mp3')) return route.fulfill({body:emptyPmtiles()});
        if (url.endsWith('scale.json')) return route.fulfill({json:{ruralScale:19,urbanScale:3,hasUkRule:true}});
        return route.fulfill({json:url.endsWith('cities.json') ? [] : url.endsWith('.geojson') ? {type:'FeatureCollection',features:[]} : {}});
    });
    let polls = 0;
    const firstObservedAt = Date.now();
    let fail = false;
    await page.route('**/__trucknav/traffic/servers', route => route.fulfill({json:[{id:2,name:'Simulation 1'}]}));
    await page.route('**/__trucknav/traffic/snapshot?*', route => {
        polls++;
        if (fail) return route.fulfill({status:502});
        const now = firstObservedAt + (polls - 1) * 6000;
        const gameX = Math.PI / 180 * 300000;
        const startZ = -300000 * Math.log(Math.tan((1.08*Math.PI/180 + Math.PI/2)/2));
        const dx = 0.1671875 * Math.PI/180 * 300000;
        const nextZ = -300000 * Math.log(Math.tan((1.235*Math.PI/180 + Math.PI/2)/2));
        const dz = nextZ - startZ;
        const length = Math.hypot(dx,dz);
        return route.fulfill({json:{serverId:2,observedAt:now,vehicles:[1,2,3].map(id => ({id:String(id),x:gameX+id*50*dx/length+polls*.5,z:startZ+id*50*dz/length,time:Math.floor(now/1000)}))}});
    });
    let telemetry:WebSocketRoute | undefined;
    await page.routeWebSocket(/:30001/, ws => {telemetry=ws;});
    await page.goto('/');
    await page.getByRole('button',{name:'Euro Truck Simulator 2'}).click();
    await page.getByRole('button',{name:'내비게이션 시작'}).click();
    await expect.poll(() => Boolean(telemetry), {timeout:15000}).toBeTruthy();
    const gameX = Math.PI / 180 * 300000;
    const gameZ = -300000 * Math.log(Math.tan((Math.PI / 180 + Math.PI / 2) / 2));
    telemetry!.send(JSON.stringify({game:'ets2',common:{gameTime:'2026-07-01T10:00:00Z',mapScale:19,nextRestStopMinutes:300},truck:{constants:{brand:'Test',name:'Truck'},current:{position:{x:gameX,y:0,z:gameZ},heading:0,dashboard:{speedKph:0,fuelAmount:450}}},job:{income:0,citySourceId:'test',companySourceId:'test',cityDestinationId:'test',companyDestinationId:'test'},navigation:{distance:0,speedLimitKph:80},specialEvents:{onJob:false},trailers:[]}));
    await page.getByRole('button',{name:'내비게이션 시작',exact:true}).click();
    await page.locator('.route-ui').getByRole('button',{name:/안내 메뉴 열기/}).click();
    await page.getByRole('button',{name:'화면 설정',exact:true}).click();
    expect(polls).toBe(0);
    await page.getByRole('button',{name:'서버 목록 불러오기'}).click();
    await page.getByRole('combobox',{name:'TruckersMP 교통량 (추정)'}).selectOption('2');
    await expect.poll(() => page.evaluate(() => (window as any).__vehicleFeatureCounts.some((count:number) => count === 3))).toBeTruthy();
    await expect(page.getByText('교통량 추정이 켜져 있습니다.')).toBeVisible({timeout:10000});
    expect(polls).toBeGreaterThanOrEqual(4);
    const positions = await page.evaluate(() => (window as any).__vehicleCoordinates);
    expect(positions.length).toBeGreaterThanOrEqual(4);
    expect(positions.at(-1)).not.toEqual(positions[0]);
    await expect.poll(() => page.evaluate(() => (window as any).__trafficFeatureCounts.some((count:number) => count > 0))).toBeTruthy();
    await page.getByRole('button',{name:'뒤로',exact:true}).click();
    await expect(page.locator('.settings-layer')).toBeHidden();
    await expect(page.locator('.route-ui').getByRole('button',{name:/안내 메뉴 열기/})).toBeVisible();
    await expect(page.locator('.trip-progress-traffic')).toHaveCount(1);
    await expect(page.locator('.trip-progress-traffic')).toHaveCSS('background-color', 'rgb(245, 166, 35)');
    await page.screenshot({path:test.info().outputPath('traffic-route.png'), animations:'disabled'});
    await page.locator('.route-ui').getByRole('button',{name:/안내 메뉴 열기/}).click();
    await page.getByRole('button',{name:'화면 설정',exact:true}).click();
    fail = true;
    await expect(page.getByText('교통량 정보를 가져오지 못했습니다.')).toBeVisible({timeout:10000});
    await expect.poll(() => page.evaluate(() => (window as any).__trafficFeatureCounts.at(-1))).toBe(0);
    await expect.poll(() => page.evaluate(() => (window as any).__vehicleFeatureCounts.at(-1))).toBe(0);
    await page.getByRole('button',{name:'뒤로',exact:true}).click();
    await expect(page.locator('.trip-progress-traffic')).toHaveCount(0);
    await page.locator('.route-ui').getByRole('button',{name:/안내 메뉴 열기/}).click();
    await page.getByRole('button',{name:'화면 설정',exact:true}).click();
    await page.getByRole('button',{name:'사용 안 함',exact:true}).click();
    await expect(page.getByText('교통량 정보를 가져오지 못했습니다.')).toHaveCount(0);
});

test('offers traffic settings through Electron IPC without the preview marker', async ({page}) => {
    await page.setViewportSize({width:390,height:844});
    const graph = graphFixture();
    await page.addInitScript(() => {
        localStorage.setItem('truck-nav-settings', JSON.stringify({selectedGame:'ets2', locale:'ko'}));
        (window as any).electronAPI = {
            getSettings: async () => null,
            getTruckersMpServers: async () => [{id:2,name:'Simulation 1'}],
            getTruckersMpSnapshot: async (serverId:number) => ({serverId,observedAt:Date.now(),vehicles:[]}),
        };
    });
    await page.route('**/api/map-status/**', route => route.fulfill({json:{downloaded:true}}));
    await page.route('**/maps/**', route => {
        const url = route.request().url();
        if (url.endsWith('graph.bin')) return route.fulfill({body:graph.graph});
        if (url.endsWith('geometry.bin')) return route.fulfill({body:graph.geometry});
        if (url.endsWith('.mp3')) return route.fulfill({body:emptyPmtiles()});
        if (url.endsWith('scale.json')) return route.fulfill({json:{ruralScale:19,urbanScale:3,hasUkRule:true}});
        return route.fulfill({json:url.endsWith('cities.json') ? [] : url.endsWith('.geojson') ? {type:'FeatureCollection',features:[]} : {}});
    });
    await page.routeWebSocket(/:30001/, () => {});
    await page.goto('/');
    await page.getByRole('button',{name:'Euro Truck Simulator 2'}).click();
    await page.getByRole('button',{name:'내비게이션 시작'}).click();
    await page.getByRole('button',{name:'설정',exact:true}).click();
    await page.locator('.settings-panel .menu-list.main').getByText('화면 설정',{exact:true}).click();
    await page.getByRole('button',{name:'서버 목록 불러오기'}).click();
    await page.getByRole('combobox',{name:'TruckersMP 교통량 (추정)'}).selectOption('2');
    await expect(page.getByText('차량 움직임을 관측하는 중입니다. 최대 1분이 걸릴 수 있습니다.')).toBeVisible();
});

test('imports and clears the game destination through Electron IPC', async ({page}) => {
    await page.setViewportSize({width:390,height:844});
    const graph = graphFixture();
    await page.addInitScript(() => {
        localStorage.setItem('truck-nav-settings', JSON.stringify({selectedGame:'ets2', locale:'ko', profiles:{ets2:{lastDestination:[1.35,1.4]}}}));
        (window as any).routeIpc = {snapshot:{state:'inactive'}, reads:0, stops:0};
        (window as any).electronAPI = {
            getSettings: async () => null,
            getGameRoute: async () => { (window as any).routeIpc.reads++; return (window as any).routeIpc.snapshot; },
            stopGameRoute: async () => { (window as any).routeIpc.stops++; },
        };
    });
    await page.route('**/api/map-status/**', route => route.fulfill({json:{downloaded:true}}));
    await page.route('**/maps/**', route => {
        const url = route.request().url();
        if (url.endsWith('graph.bin')) return route.fulfill({body:graph.graph});
        if (url.endsWith('geometry.bin')) return route.fulfill({body:graph.geometry});
        if (url.endsWith('.mp3')) return route.fulfill({body:emptyPmtiles()});
        if (url.endsWith('scale.json')) return route.fulfill({json:{ruralScale:19,urbanScale:3,hasUkRule:true}});
        return route.fulfill({json:url.endsWith('cities.json') ? [] : url.endsWith('.geojson') ? {type:'FeatureCollection',features:[]} : {}});
    });
    let telemetry:WebSocketRoute | undefined;
    await page.routeWebSocket(/:30001/, ws => {telemetry=ws;});
    await page.goto('/');
    await page.getByRole('button',{name:'Euro Truck Simulator 2'}).click();
    await page.getByRole('button',{name:'내비게이션 시작'}).click();
    await expect.poll(() => Boolean(telemetry), {timeout:15000}).toBeTruthy();
    expect(await page.evaluate(() => (window as any).routeIpc.reads)).toBe(0);
    const toWorld = (lng:number,lat:number) => [lng*Math.PI/180*300000, -300000*Math.log(Math.tan((lat*Math.PI/180+Math.PI/2)/2))];
    const [x,z] = toWorld(1,1);
    const [dx,dz] = toWorld(1.45,1.48);
    const points = [[1,1],[1,1.08],[1.05,1.16],[1.15,1.24],[1.25,1.32],[1.35,1.4],[1.45,1.48]].map(([lng,lat], index) => [...toWorld(lng!,lat!), 50000 * (6-index)/6]);
    await page.evaluate(points => { (window as any).routeIpc.snapshot = {state:'active',points}; }, points);
    telemetry!.send(JSON.stringify({game:'ets2',common:{gameTime:'2026-07-01T10:00:00Z',mapScale:19,nextRestStopMinutes:300},truck:{constants:{brand:'Test',name:'Truck'},current:{position:{x,y:0,z},heading:0,dashboard:{speedKph:0,fuelAmount:450}}},job:{income:0,citySourceId:'test',companySourceId:'test',cityDestinationId:'test',companyDestinationId:'test'},navigation:{distance:50000,speedLimitKph:80},specialEvents:{onJob:false},trailers:[]}));
    await expect(page.getByText('게임 경로')).toBeVisible({timeout:20000});
    await page.evaluate(() => { (window as any).routeIpc.snapshot = {state:'inactive'}; });
    await expect(page.getByRole('region',{name:'경로 미리보기'})).toHaveCount(0);
    await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('truck-nav-settings') || '{}').profiles?.ets2?.lastDestination)).toEqual([1.35,1.4]);
    telemetry!.close();
    await expect.poll(() => page.evaluate(() => (window as any).routeIpc.stops)).toBeGreaterThan(1);
});

test('imports a game destination in the opt-in preview and clears it when the game route ends', async ({page}) => {
    await page.setViewportSize({width:390,height:844});
    const graph = graphFixture(false, true);
    await page.addInitScript(() => {
        localStorage.setItem('truck-nav-settings', JSON.stringify({selectedGame:'ets2', locale:'ko', profiles:{ets2:{lastDestination:[1.35,1.4]}}}));
        (window as any).__gamePaths = [];
        const original = Worker.prototype.postMessage;
        Worker.prototype.postMessage = function (...args:any[]) {
            if (args[0]?.type === 'CALC_MULTI_ROUTE' && args[0].payload?.gameNodes) (window as any).__gamePaths.push(args[0].payload.gameNodes);
            return (original as any).apply(this, args);
        } as typeof Worker.prototype.postMessage;
    });
    await page.route('**/', async route => {
        const response = await route.fetch();
        const html = (await response.text()).replace('</head>', '<meta name="trucknav-secure-preview" content="1"><meta name="trucknav-game-route" content="1"></head>');
        await route.fulfill({response, body:html});
    });
    await page.route('**/api/map-status/**', route => route.fulfill({json:{downloaded:true}}));
    await page.route('**/maps/**', route => {
        const url = route.request().url();
        if (url.endsWith('graph.bin')) return route.fulfill({body:graph.graph});
        if (url.endsWith('geometry.bin')) return route.fulfill({body:graph.geometry});
        if (url.endsWith('.mp3')) return route.fulfill({body:emptyPmtiles()});
        if (url.endsWith('scale.json')) return route.fulfill({json:{ruralScale:19,urbanScale:3,hasUkRule:true}});
        return route.fulfill({json:url.endsWith('cities.json') ? [] : url.endsWith('.geojson') ? {type:'FeatureCollection',features:[]} : {}});
    });
    let telemetry:WebSocketRoute | undefined;
    let gameRoute:WebSocketRoute | undefined;
    await page.routeWebSocket(/\/__trucknav\/telemetry$/, ws => {telemetry=ws;});
    await page.routeWebSocket(/\/__trucknav\/game-route$/, ws => {gameRoute=ws;});
    await page.goto('/');
    await page.getByRole('button',{name:'Euro Truck Simulator 2'}).click();
    await page.getByRole('button',{name:'내비게이션 시작'}).click();
    await expect.poll(() => Boolean(telemetry && gameRoute), {timeout:15000}).toBeTruthy();
    const toWorld = (lng:number,lat:number) => [lng*Math.PI/180*300000, -300000*Math.log(Math.tan((lat*Math.PI/180+Math.PI/2)/2))];
    const [x,z] = toWorld(1,1);
    const [midX,midZ] = toWorld(1.15,1.24);
    const [dx,dz] = toWorld(1.45,1.48);
    const points = [[1,1],[1,1.08],[1.05,1.16],[1.15,1.24],[1.25,1.32],[1.35,1.4],[1.45,1.48]].map(([lng,lat], index) => [...toWorld(lng!,lat!), 50000 * (6-index)/6]);
    telemetry!.send(JSON.stringify({
        game:'ets2', common:{gameTime:'2026-07-01T10:00:00Z',mapScale:19,nextRestStopMinutes:300},
        truck:{constants:{brand:'Test',name:'Truck'},current:{position:{x,y:0,z},heading:0,dashboard:{speedKph:0,fuelAmount:450}}},
        job:{income:0,citySourceId:'test',companySourceId:'test',cityDestinationId:'test',companyDestinationId:'test'},
        navigation:{distance:50000,speedLimitKph:80},specialEvents:{onJob:false},trailers:[],
    }));
    gameRoute!.send(JSON.stringify({state:'active',points}));
    await expect(page.getByText('게임 경로')).toBeVisible({timeout:20000});
    await expect.poll(() => page.evaluate(() => (window as any).__gamePaths.at(-1))).toEqual([1,2,3,4,5,6,7]);
    await page.getByRole('button',{name:/자동 시작 취소/}).click();
    await expect(page.getByRole('button',{name:/자동 시작 취소/})).toHaveCount(0);
    await page.getByRole('button',{name:'내비게이션 시작',exact:true}).click();
    const [altX,altZ] = toWorld(1.08,1.2);
    const rerouted = [...points.slice(0,3), [altX,altZ,points[2]![2]! - 1], ...points.slice(3)];
    gameRoute!.send(JSON.stringify({state:'active',points:rerouted}));
    await expect.poll(() => page.evaluate(() => (window as any).__gamePaths.at(-1))).toEqual([1,2,3,8,4,5,6,7]);
    await expect(page.locator('.route-ui').getByRole('button',{name:/안내 메뉴 열기/})).toBeVisible();
    gameRoute!.send(JSON.stringify({state:'active',points:rerouted,waypoints:[[midX,midZ],[dx,dz]]}));
    await expect.poll(() => page.evaluate(() => (window as any).__gamePaths.length)).toBeGreaterThan(2);
    // A game route that cannot be matched must not leave the previous route visible.
    gameRoute!.send(JSON.stringify({state:'active',points:[points[0],points[6]]}));
    await expect(page.locator('.route-ui').getByRole('button',{name:/안내 메뉴 열기/})).toHaveCount(0);
    gameRoute!.send(JSON.stringify({state:'active',points:rerouted}));
    await expect(page.getByText('게임 경로')).toBeVisible({timeout:20000});
    gameRoute!.send(JSON.stringify({state:'inactive'}));
    await expect(page.getByRole('region',{name:'경로 미리보기'})).toHaveCount(0);
    await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('truck-nav-settings') || '{}').profiles?.ets2?.lastDestination)).toEqual([1.35,1.4]);
    gameRoute!.send(JSON.stringify({state:'active',points}));
    await expect(page.getByText('게임 경로')).toBeVisible({timeout:20000});
    await page.getByRole('button',{name:'경로 취소'}).click();
    await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('truck-nav-settings') || '{}').profiles?.ets2?.lastDestination)).toEqual([1.35,1.4]);
});
