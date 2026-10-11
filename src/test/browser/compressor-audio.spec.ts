import { expect, test } from '@playwright/test';
import type {} from './compressorAudioHarness';

const defaults = { gainDb: 0, thresholdDb: -20, ratio: 4, attackMs: 10, releaseMs: 100 };

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


test('compressor history captures input before output gain and reports reduction', async ({ page }) => {
  await page.goto('/kgstudio/compressor-audio-test.html');
  await page.waitForFunction(() => typeof window.checkCompressorHistory === 'function');
  const result = await page.evaluate(() => window.checkCompressorHistory());
  expect(result.peaks).toHaveLength(5);
  for (const peak of result.peaks) expect(peak).toBeCloseTo(-6.02, 1);
  expect(result.reduction).toBeLessThan(-1);
  expect(result.reordered).toBe(true);
  expect(result.removed).toBe(true);
});

test('compressor draws input and reduction histories while keeping threshold interactive', async ({ page }) => {
  await page.goto('/kgstudio/compressor-audio-test.html');
  await page.waitForFunction(() => typeof window.mountCompressorHistoryPreview === 'function');
  await page.evaluate(() => window.mountCompressorHistoryPreview());
  const input = page.locator('.compressor-history path').first();
  const reduction = page.locator('.dynamics-reduction-history');
  await expect(input).toHaveAttribute('d', /Z$/);
  await expect(reduction).toHaveAttribute('d', /Z$/);
  await expect(input).toHaveCSS('fill', 'rgba(255, 255, 255, 0.22)');
  await expect(reduction).toHaveCSS('fill', 'rgba(90, 159, 212, 0.45)');
  const threshold = page.locator('.fx-level-line');
  await threshold.focus();
  await page.keyboard.press('ArrowDown');
  await expect(threshold).toHaveAttribute('aria-valuenow', '-19');
  await page.waitForTimeout(9000);
  await expect(input).toHaveAttribute('d', /^M0\.00,110 L0\.00,/);
  await expect(reduction).toHaveAttribute('d', /^M0\.00,0 L0\.00,/);
  await threshold.blur();
  await page.screenshot({ path: '/tmp/kg-compressor-history.png' });
  await page.locator('.fx-power').click();
  await expect(input).not.toHaveAttribute('d', /.+/);
  await expect(reduction).not.toHaveAttribute('d', /.+/);
});
