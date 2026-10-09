import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './src/test/browser', testMatch: 'aire-production.spec.ts', fullyParallel: false, workers: 1,
  use: { baseURL: 'http://127.0.0.1:4175', headless: true },
  webServer: { command: 'node src/test/browser/serveAireBuild.mjs', url: 'http://127.0.0.1:4175/kgstudio/', reuseExistingServer: false },
});
