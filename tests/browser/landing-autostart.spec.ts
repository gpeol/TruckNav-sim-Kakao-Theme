import { test, expect, type WebSocketRoute } from '@playwright/test';
test.setTimeout(90000);

for (const game of ['Ets2', 'Ats']) {
    test(`landing detects ${game} and enters after idle timeout`, async ({ page }) => {
        await page.addInitScript(() => localStorage.setItem('truck-nav-settings', JSON.stringify({ locale: 'ko' })));
        await page.route('**/api/map-status/**', route => route.fulfill({ json: { downloaded: true } }));
        await page.route('**/maps/**', route => route.fulfill({ json: [] }));
        let socket: WebSocketRoute | undefined;
        await page.routeWebSocket(/:30001/, ws => { socket = ws; });
        await page.goto('/', { waitUntil: 'domcontentloaded' });
        await expect.poll(() => Boolean(socket)).toBeTruthy();
        await page.clock.install();
        await page.keyboard.press('Shift');
        socket!.send(JSON.stringify({ game }));
        await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('truck-nav-settings')!).selectedGame)).toBe(game.toLowerCase());
        await page.clock.fastForward(9999);
        await expect(page.locator('.map-container')).toHaveCount(0);
        socket!.send(JSON.stringify({ game }));
        await new Promise(resolve => setTimeout(resolve, 50));
        await page.clock.fastForward(1);
        await expect(page.locator('.map-container')).toBeVisible();
    });
}

test('landing restarts idle timeout after input and preserves manual selection', async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem('truck-nav-settings', JSON.stringify({ locale: 'ko' })));
    await page.route('**/api/map-status/**', route => route.fulfill({ json: { downloaded: true } }));
    await page.route('**/maps/**', route => route.fulfill({ json: [] }));
    let socket: WebSocketRoute | undefined;
    await page.routeWebSocket(/:30001/, ws => { socket = ws; });
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await expect.poll(() => Boolean(socket)).toBeTruthy();
    await page.clock.install();
    await page.keyboard.press('Shift');
    socket!.send(JSON.stringify({ game: 'Ets2' }));
    await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('truck-nav-settings')!).selectedGame)).toBe('ets2');
    await page.clock.fastForward(5000);
    await page.keyboard.press('Shift');
    socket!.send(JSON.stringify({ game: 'Ets2' }));
    await page.clock.fastForward(5000);
    await expect(page.locator('.map-container')).toHaveCount(0);
    await page.getByRole('button', { name: 'American Truck Simulator' }).click();
    for (let second = 0; second < 11; second++) {
        socket!.send(JSON.stringify({ game: 'Ets2' }));
        await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('truck-nav-settings')!).selectedGame)).toBe('ats');
        await page.clock.fastForward(1000);
    }
    await expect(page.locator('.map-container')).toHaveCount(0);
});

test('reselecting the saved game before first telemetry preserves the explicit choice', async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem('truck-nav-settings', JSON.stringify({ locale: 'ko', selectedGame: 'ats' })));
    await page.route('**/api/map-status/**', route => route.fulfill({ json: { downloaded: true } }));
    await page.route('**/maps/**', route => route.fulfill({ json: [] }));
    let socket: WebSocketRoute | undefined;
    await page.routeWebSocket(/:30001/, ws => { socket = ws; });
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await expect.poll(() => Boolean(socket)).toBeTruthy();
    await page.clock.install();
    await page.getByRole('button', { name: 'American Truck Simulator' }).click();
    for (let second = 0; second < 11; second++) {
        socket!.send(JSON.stringify({ game: 'Ets2' }));
        await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('truck-nav-settings')!).selectedGame)).toBe('ats');
        await page.clock.fastForward(1000);
    }
    await expect(page.locator('.map-container')).toHaveCount(0);
});

test('mod selection pauses automatic entry and closing it restarts ten seconds', async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem('truck-nav-settings', JSON.stringify({ locale: 'ko' })));
    await page.route('**/api/map-status/**', route => route.fulfill({ json: { downloaded: true } }));
    await page.route('**/maps/**', route => route.fulfill({ json: [] }));
    let socket: WebSocketRoute | undefined;
    await page.routeWebSocket(/:30001/, ws => { socket = ws; });
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await expect.poll(() => Boolean(socket)).toBeTruthy();
    await page.clock.install();
    socket!.send(JSON.stringify({ game: 'Ets2' }));
    await page.getByRole('button', { name: /지도 모드/ }).click();
    await expect(page.locator('.popup-window')).toBeVisible();
    for (let second = 0; second < 12; second++) {
        socket!.send(JSON.stringify({ game: 'Ets2' }));
        await page.clock.fastForward(1000);
    }
    await expect(page.locator('.map-container')).toHaveCount(0);
    await page.locator('.popup-window .close-icon').click();
    await expect(page.locator('.popup-window')).toHaveCount(0);
    socket!.send(JSON.stringify({ game: 'Ets2' }));
    await page.clock.fastForward(9999);
    await expect(page.locator('.map-container')).toHaveCount(0);
    socket!.send(JSON.stringify({ game: 'Ets2' }));
    await new Promise(resolve => setTimeout(resolve, 50));
    await page.clock.fastForward(1);
    await expect(page.locator('.map-container')).toBeVisible();
});

test('speed remains visible when status bar is disabled', async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem('truck-nav-settings', JSON.stringify({ locale: 'ko', selectedGame: 'ets2', activeUiComponents: ['speed', 'speedLimit'] })));
    await page.route('**/api/map-status/**', route => route.fulfill({ json: { downloaded: true } }));
    await page.route('**/maps/**', route => route.fulfill({ json: [] }));
    await page.routeWebSocket(/:30001/, () => {});
    await page.goto('/');
    await page.getByRole('button', { name: 'Euro Truck Simulator 2' }).click();
    await page.getByRole('button', { name: '내비게이션 시작' }).click();
    await expect(page.locator('.truck-speed-div')).toBeVisible();
    await expect(page.locator('.game-information')).toHaveClass(/status-hidden/);
    await expect(page.locator('.game-information .disconnected-div')).toHaveCount(0);
});
