import { expect, test } from '@playwright/test';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
const modelRoot = process.env.AIRE_MODEL_DIR || resolve('../instrument-aire-models/models');
const models = { S03: 'aire-strings-a02b-s03', B01: 'aire-brass-a02b-b01', W01: 'aire-woodwind-a02b-w01' };
test('runs real AIRE models with a production worker and same-origin assets without isolation headers', async ({ page }) => {
  test.skip(!existsSync(resolve(modelRoot, models.S03, 'model.onnx')), 'Provide local AIRE models with AIRE_MODEL_DIR.');
  test.setTimeout(180_000);
  const failedAssets: string[] = [];
  const workers: string[] = [];
  page.on('worker', w => workers.push(w.url()));
  page.on('response', response => { if (response.status() >= 400) failedAssets.push(response.url()); });
  await page.route('**/fixture-model/*', async route => {
    const id = route.request().url().split('/').at(-1) as keyof typeof models;
    await route.fulfill({ path: resolve(modelRoot, models[id], 'model.onnx'), contentType: 'application/octet-stream' });
  });
  await page.goto('/kgstudio/src/test/browser/aire-test.html');
  await page.waitForFunction(() => typeof window.aireFixture === 'function');
  for (const id of ['S03', 'B01', 'W01'] as const) {
    const result = await page.evaluate(id => window.aireFixture(id), id);
    expect(result.isolated).toBe(false); expect(result.cached).toBe(true);
    expect(result.points).toHaveLength(272);
    expect(result.points.every(p => Number.isInteger(p.value) && p.value >= 0 && p.value <= 127)).toBe(true);
    if (id === 'S03') expect(result.points.map(p => p.value)).toEqual(result.expected);
    expect(result.progress.at(-1)).toMatchObject({ completed: 1, total: 1 });
  }
  expect(workers).toHaveLength(3); // One dedicated worker per sequential operation, no runtime thread workers.
  expect(workers.every(url => url.includes('/kgstudio/assets/aireWorker-'))).toBe(true);
  expect(failedAssets).toEqual([]);
  const wasm = await page.evaluate(() => window.aireWasmFixture());
  const fixture = await page.evaluate(() => window.aireFixture());
  expect(wasm.map(p => p.value)).toEqual(fixture.expected);
  const long = await page.evaluate(() => window.aireLongFixture());
  expect(long.points).toHaveLength(2049);
  expect(long.points.every(p => Number.isInteger(p.value) && p.value >= 0 && p.value <= 127)).toBe(true);
  expect(long.progress.at(-1)).toMatchObject({ completed: 2, total: 2 });
  expect(await page.evaluate(() => window.aireCancelFixture())).toBe(true);
  // Cancellation releases the one-worker slot and cached model remains reusable.
  expect((await page.evaluate(() => window.aireFixture())).points).toHaveLength(272);
});
