import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  timeout: 45_000,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: 'list',
  use: {
    baseURL: 'http://127.0.0.1:8081',
    timezoneId: 'Asia/Shanghai',
    trace: 'retain-on-failure',
  },
  webServer: [
    {
      command: 'npm run web -- --port 8081',
      url: 'http://127.0.0.1:8081',
      env: { EXPO_PUBLIC_PROPOSAL_MODE: 'mock', EXPO_PUBLIC_AI_GATEWAY_URL: '' },
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
    {
      command: 'node e2e/mock-gateway.mjs',
      url: 'http://127.0.0.1:8788/health',
      reuseExistingServer: !process.env.CI,
      timeout: 30_000,
    },
    {
      command: 'node e2e/start-cloud-web.mjs',
      url: 'http://127.0.0.1:8082',
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
  ],
});
