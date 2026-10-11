import { expect, test } from '@playwright/test';
import type {} from './limiterAudioHarness';
import type {} from './eqAudioHarness';

test('track limiter matches Tone.Limiter including gain, threshold, bypass, duplicates and live enable', async ({ page }) => {
  await page.goto('/kgstudio/limiter-audio-test.html');
  await page.waitForFunction(() => typeof window.renderLimiterFixture === 'function');
  for (const options of [
    { inputGainDb: 0, thresholdDb: -18 },
    { inputGainDb: 12, thresholdDb: -18 },
    { inputGainDb: -24, thresholdDb: 0 },
    { inputGainDb: 6, thresholdDb: -30, sampleRate: 44100 },
    { inputGainDb: 24, thresholdDb: -100, bypass: true },
    { inputGainDb: 6, thresholdDb: -18, copies: 2 },
    { inputGainDb: 6, thresholdDb: -18, edit: true },
    { inputGainDb: 6, thresholdDb: -18, enable: true },
    { inputGainDb: 6, thresholdDb: -18, remove: true },
  ]) {
    const actual = await page.evaluate(options => window.renderLimiterFixture(options), options);
    const reference = await page.evaluate(options => window.renderLimiterFixture(options, true), options);
    expect(actual, JSON.stringify(options)).toBeCloseTo(reference, 2);
    if (options.bypass || options.remove) expect(actual).toBeCloseTo(0, 2);
  }
});

test('EQ and limiter processing follows card order', async ({ page }) => {
  await page.goto('/kgstudio/limiter-audio-test.html');
  await page.waitForFunction(() => typeof window.renderLimiterFixture === 'function');
  const before = await page.evaluate(() => window.renderLimiterFixture({ inputGainDb: 0, thresholdDb: -18, eqOrder: 'before' }));
  const after = await page.evaluate(() => window.renderLimiterFixture({ inputGainDb: 0, thresholdDb: -18, eqOrder: 'after' }));
  const referenceBefore = await page.evaluate(() => window.renderLimiterFixture({ inputGainDb: 0, thresholdDb: -18, eqOrder: 'before' }, true));
  const referenceAfter = await page.evaluate(() => window.renderLimiterFixture({ inputGainDb: 0, thresholdDb: -18, eqOrder: 'after' }, true));
  expect(before).toBeCloseTo(referenceBefore, 2);
  expect(after).toBeCloseTo(referenceAfter, 2);
  expect(after - before).toBeGreaterThan(1);
});


test('MIDI and audio project exports include saved limiter controls', async ({ page }) => {
  await page.goto('/kgstudio/limiter-audio-test.html');
  await page.waitForFunction(() => typeof window.renderLimiterProjectFixture === 'function');
  const reference = await page.evaluate(() => window.renderLimiterFixture({ inputGainDb: 6, thresholdDb: -18, sampleRate: 44100 }, true));
  for (const type of ['audio', 'midi'] as const) {
    const actual = await page.evaluate(type => window.renderLimiterProjectFixture(type), type);
    expect(actual, type).toBeCloseTo(reference, 2);
  }
});

test('limiter history continuously captures stereo transients and reports reduction', async ({ page }) => {
  await page.goto('/kgstudio/limiter-audio-test.html');
  await page.waitForFunction(() => typeof window.checkLimiterHistory === 'function');
  const result = await page.evaluate(() => window.checkLimiterHistory());
  expect(result.peaks).toHaveLength(5);
  for (const peak of result.peaks) expect(peak).toBeCloseTo(-0.02, 1);
  expect(result.reduction).toBeLessThan(-1);
  expect(result.reordered).toBe(true);
  expect(result.removed).toBe(true);
});

test('limiter card draws white history behind the interactive threshold', async ({ page }) => {
  await page.goto('/kgstudio/limiter-audio-test.html');
  await page.waitForFunction(() => typeof window.mountLimiterHistoryPreview === 'function');
  await page.evaluate(() => window.mountLimiterHistoryPreview());
  const history = page.locator('.limiter-history path');
  await expect(history).toHaveAttribute('d', /Z$/);
  await expect(history).toHaveCSS('fill', 'rgba(255, 255, 255, 0.22)');
  const threshold = page.locator('.fx-level-line');
  await threshold.focus();
  await page.keyboard.press('ArrowDown');
  await expect(threshold).toHaveAttribute('aria-valuenow', '-19');
  // Capture enough history to inspect the filled graph and readout together.
  await page.waitForTimeout(9000);
  await expect(history).toHaveAttribute('d', /^M0\.00,110 L0\.00,/);
  await page.screenshot({ path: '/tmp/kg-limiter-history.png' });
  await page.locator('.fx-collapse').click();
  await expect(history).not.toHaveAttribute('d', /.+/);
});
