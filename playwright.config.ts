import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './src/test/browser',
  timeout: 30_000,
  fullyParallel: false,
  retries: 0,
  use: {
    baseURL: 'http://127.0.0.1:4174/kgstudio',
    headless: true,
  },
  webServer: {
    command: 'npm run dev -- --host 127.0.0.1 --port 4174',
    url: 'http://127.0.0.1:4174/kgstudio/',
    reuseExistingServer: true,
    timeout: 30_000,
  },
});
