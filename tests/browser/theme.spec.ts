import { test, expect } from '@playwright/test';

for (const viewport of [{width:1280,height:900}, {width:390,height:844}, {width:844,height:390}]) {
    test(`theme, game selection and mods at ${viewport.width}x${viewport.height}`, async ({ page }) => {
        await page.setViewportSize(viewport);
        const errors: string[] = [];
        page.on('pageerror', error => errors.push(error.message));
        await page.clock.install({time: new Date(2026, 6, 1, 17, 59, 50)});
        await page.route('**/api/map-status/**', route => route.fulfill({json: {downloaded: true}}));
        await page.goto('/');
        await expect(page.getByRole('heading', {name:'오늘도, 안전한 운행'})).toBeVisible();
        await expect(page.locator('html')).toHaveAttribute('data-theme', 'day');
        await page.clock.fastForward(30_000);
        await expect(page.locator('html')).toHaveAttribute('data-theme', 'night');
        await page.getByRole('button', {name:'주간', exact:true}).click();
        await expect(page.locator('html')).toHaveAttribute('data-theme', 'day');
        await page.getByRole('button', {name:'야간', exact:true}).click();
        await expect(page.locator('html')).toHaveAttribute('data-theme', 'night');
        await page.screenshot({path:test.info().outputPath('night.png')});
        await page.reload();
        await expect(page.getByRole('button',{name:'야간',exact:true})).toHaveAttribute('aria-pressed','true');
        await page.getByRole('button',{name:'자동',exact:true}).click();
        await page.getByLabel('자동 전환 기준').selectOption('game');
        await expect(page.locator('html')).toHaveAttribute('data-theme','night'); // disconnected → local time
        await page.getByRole('button', {name:'Euro Truck Simulator 2'}).click();
        await expect(page.getByRole('button', {name:'내비게이션 시작'})).toBeVisible();
        await page.getByRole('button', {name:/지도 모드 \(/}).click();
        await expect(page.getByText('ProMods Europe', {exact:true})).toBeVisible();
        await page.getByRole('button',{name:'선택',exact:true}).nth(0).click();
        await expect(page.getByRole('button', {name:/지도 모드 \(promods-europe/})).toBeVisible();
        const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('truck-nav-settings')!));
        expect(saved.profiles.ets2.activeMod).toBe('promods-europe');
        expect(saved.themeMode).toBe('auto');
        expect(saved.themeClock).toBe('game');
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
        expect(errors).toEqual([]);
    });
}

test('legacy settings retain locale, units, DLCs and custom colors', async ({page}) => {
    await page.addInitScript(() => localStorage.setItem('truck-nav-settings', JSON.stringify({
        selectedGame:'ats', locale:'en', savedIP:'192.168.1.42', profiles:{ats:{units:'imperial',roadColor:'#123456',ownedDlcs:[1,3],activeMod:'reforma'}},
    })));
    await page.route('**/api/map-status/**', route => route.fulfill({json:{downloaded:false}}));
    await page.goto('/');
    await expect(page.getByRole('heading',{name:'Your next journey starts here'})).toBeVisible();
    await expect(page.getByRole('button',{name:'Auto',exact:true})).toHaveAttribute('aria-pressed','true');
    await page.getByRole('button',{name:'Night',exact:true}).click();
    const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('truck-nav-settings')!));
    expect(saved.locale).toBe('en');
    expect(saved.savedIP).toBe('192.168.1.42');
    expect(saved.profiles.ats).toMatchObject({units:'imperial',roadColor:'#123456',ownedDlcs:[1,3],activeMod:'reforma'});
    expect(saved.themeClock).toBe('device');
});

test('the theme accent follows the stylesheet after settings changes', async ({page}) => {
    await page.route('**/api/map-status/**', route => route.fulfill({json:{downloaded:false}}));
    await page.goto('/');
    await page.addStyleTag({content: ':root { --theme-color: #123456; }'});
    const accent = () => page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--theme-color').trim());
    await expect.poll(accent).toBe('#123456');
    await page.getByRole('button', {name:'주간', exact:true}).click();
    await expect.poll(accent).toBe('#123456');
});
