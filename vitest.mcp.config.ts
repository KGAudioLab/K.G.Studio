import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['build/mcpServer.test.ts'],
    testTimeout: 10_000,
  },
});
