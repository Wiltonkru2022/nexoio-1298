import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 30_000,
  expect: { timeout: 8_000 },
  fullyParallel: false,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['html', { outputFolder: 'playwright-report', open: 'never' }]] : 'list',
  use: {
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 1000 } } },
    { name: 'tablet', use: { ...devices['iPad (gen 7)'], browserName: 'chromium', viewport: { width: 810, height: 1080 } } },
    { name: 'mobile', use: { ...devices['Pixel 5'], browserName: 'chromium', viewport: { width: 393, height: 851 } } },
  ],
  webServer: [
    {
      command: 'npm run dev -w @nexoio/merchant -- --host 127.0.0.1',
      url: 'http://127.0.0.1:5173',
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
    },
    {
      command: 'npm run dev -w @nexoio/admin -- --host 127.0.0.1',
      url: 'http://127.0.0.1:5174',
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
    },
  ],
});
