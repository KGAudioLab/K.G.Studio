import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './src/test/browser',
  testMatch: 'mcp.spec.ts',
  timeout: 60_000,
  workers: 1,
  use: { headless: true },
  webServer: [
    { command: 'npm run dev:mcp -- --port 5178', url: 'http://127.0.0.1:5178/kgstudio/', timeout: 30_000 },
    { command: 'npm run preview:mcp -- --port 4178', url: 'http://127.0.0.1:4178/kgstudio/', timeout: 30_000 },
    { command: 'npm run preview -- --host 127.0.0.1 --port 4179 --strictPort', url: 'http://127.0.0.1:4179/kgstudio/', timeout: 30_000 },
  ],
});
