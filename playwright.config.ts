import { defineConfig } from '@playwright/test';
export default defineConfig({
    testDir: './tests/browser',
    use: {
        baseURL: 'http://127.0.0.1:3001',
        launchOptions: process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH, args: ['--no-sandbox'] } : {},
    },
    webServer: {
        command: 'node .output/server/index.mjs',
        port: 3001,
        env: { PORT: '3001', HOST: '127.0.0.1' },
        reuseExistingServer: !process.env.CI,
    },
});
