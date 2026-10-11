import { expect, test } from '@playwright/test';
import type {} from './compressorAudioHarness';

const defaults = { gainDb: 0, thresholdDb: -24, ratio: 4, attackMs: 10, releaseMs: 228 };

test('compressor matches native Tone processing, controls, bypass, and live edits', async ({ page }) => {
  await page.goto('/kgstudio/compressor-audio-test.html');
  await page.waitForFunction(() => typeof window.renderCompressorFixture === 'function');
  for (const overrides of [
    {}, { gainDb: 12 }, { gainDb: -24, thresholdDb: 0, ratio: 1 },
    { thresholdDb: -100, ratio: 20, attackMs: 0, releaseMs: 0 },
    { attackMs: 1000, releaseMs: 1000, pulse: true },
    { attackMs: 0, releaseMs: 0, pulse: true },
    { gainDb: 24, bypass: true }, { copies: 2 }, { edit: true }, { enable: true }, { remove: true },
    { gainDb: 6, thresholdDb: -18, sampleRate: 44100 },
  ]) {
    const options = { ...defaults, ...overrides };
    const actual = await page.evaluate(options => window.renderCompressorFixture(options), options);
    const reference = await page.evaluate(options => window.renderCompressorFixture(options, true), options);
    expect(actual, JSON.stringify(options)).toBeCloseTo(reference, 2);
    if (options.bypass || options.remove) expect(actual).toBeCloseTo(0, 2);
  }
});

test('compressor respects its order relative to EQ', async ({ page }) => {
  await page.goto('/kgstudio/compressor-audio-test.html');
  await page.waitForFunction(() => typeof window.renderCompressorFixture === 'function');
  for (const eqOrder of ['before', 'after'] as const) {
    const options = { ...defaults, eqOrder };
    const actual = await page.evaluate(options => window.renderCompressorFixture(options), options);
    const reference = await page.evaluate(options => window.renderCompressorFixture(options, true), options);
    expect(actual, eqOrder).toBeCloseTo(reference, 2);
  }
});

test('MIDI and audio exports include compressor and output gain', async ({ page }) => {
  await page.goto('/kgstudio/compressor-audio-test.html');
  await page.waitForFunction(() => typeof window.renderCompressorProjectFixture === 'function');
  const reference = await page.evaluate(options => window.renderCompressorFixture(options, true),
    { ...defaults, thresholdDb: -18, gainDb: 6, sampleRate: 44100 });
  for (const type of ['audio', 'midi'] as const) {
    const actual = await page.evaluate(type => window.renderCompressorProjectFixture(type), type);
    expect(actual, type).toBeCloseTo(reference, 2);
  }
});
