import { expect, test } from '@playwright/test';
import type {} from './eqAudioHarness';

test('real Tone EQ renders shelves, bell Q, bypass, duplicates, and live edits', async ({ page }) => {
  await page.goto('/kgstudio/eq-audio-test.html');
  await page.waitForFunction(() => typeof window.renderEQFixture === 'function');
  for (const options of [
    { band: 0, gain: 9, frequency: 50 },
    { band: 0, gain: -9, frequency: 50, sampleRate: 44100 },
    { band: 1, gain: 8, frequency: 1350, q: 3 },
    { band: 1, gain: 8, frequency: 1000, q: 0.2 },
    { band: 1, gain: 8, frequency: 1000, q: 8 },
    { band: 2, gain: 6, frequency: 15000 },
    { band: 2, gain: -6, frequency: 12000, sampleRate: 32000 },
    { band: 0, gain: 9, frequency: 50, bypass: true },
    { band: 1, gain: 6, frequency: 1350, copies: 2 },
    { band: 1, gain: 8, frequency: 1350, edit: true },
    { band: 1, gain: -8, frequency: 1350, edit: true },
    { band: 1, gain: 8, frequency: 1350, remove: true },
  ]) {
    const result = await page.evaluate(options => window.renderEQFixture(options), options);
    expect(result.gainDb, JSON.stringify(options)).toBeCloseTo(result.predictedDb, 2);
  }
});

test('project WAV bounce includes the saved track EQ', async ({ page }) => {
  await page.goto('/kgstudio/eq-audio-test.html');
  await page.waitForFunction(() => typeof window.renderEQProjectFixture === 'function');
  for (const type of ['audio', 'midi'] as const) {
    const gainDb = await page.evaluate(type => window.renderEQProjectFixture(type), type);
    expect(gainDb, type).toBeCloseTo(6, 2);
  }
});
