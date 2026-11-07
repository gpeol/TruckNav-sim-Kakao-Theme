import { defineConfig } from '@playwright/test';

export default defineConfig({
    testDir: '.',
    testMatch: ['tmp-nearby.spec.ts', 'free-drive-hud.spec.ts'],
    use: {
        baseURL: 'http://127.0.0.1:3199',
        launchOptions: { executablePath: process.env.CHROMIUM_PATH, args: ['--no-sandbox'] },
    },
});
