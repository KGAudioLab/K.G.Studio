import { expect, test } from '@playwright/test';
import type {} from './reverbAudioHarness';

async function open(page: import('@playwright/test').Page) {
  await page.goto('/kgstudio/reverb-audio-test.html');
  await page.waitForFunction(() => typeof window.renderReverbFixture === 'function');
}

test('all five IRs match direct Tone.Convolver with dry/wet mixing', async ({ page }) => {
  await open(page);
  for (const type of ['hall', 'room', 'chamber', 'plate', 'spring'] as const) {
    for (const wet of [0, .1, 1]) {
      const result = await page.evaluate(options => window.renderReverbFixture(options), { type, wet });
      expect(result.difference, `${type}, wet=${wet}`).toBeLessThan(1e-6);
      expect(result.peak).toBeGreaterThan(0);
      if (wet === 0) expect(result.tailEnergy).toBe(0);
      else expect(result.tailEnergy).toBeGreaterThan(0);
    }
  }
});

test('reverb supports bypass, duplicate instances, order, edits, and export sample rates', async ({ page }) => {
  await open(page);
  for (const overrides of [
    { bypass: true }, { copies: 2 }, { sampleRate: 44100 }, { sampleRate: 22050 },
    { edit: true }, { order: 'before' as const }, { order: 'after' as const },
  ]) {
    const options = { type: 'hall' as const, wet: .5, ...overrides };
    const result = await page.evaluate(options => window.renderReverbFixture(options), options);
    expect(result.difference, JSON.stringify(options)).toBeLessThan(1e-6);
    if (options.bypass) expect(result.tailEnergy).toBe(0);
    else expect(result.tailEnergy).toBeGreaterThan(0);
  }
});

test('MIDI and audio exports await IR loading and retain the reverb tail', async ({ page }) => {
  await open(page);
  const audio = await page.evaluate(() => window.renderReverbProjectFixture('audio'));
  const midi = await page.evaluate(() => window.renderReverbProjectFixture('midi'));
  for (const result of [audio, midi]) {
    expect(result.duration).toBeCloseTo(3.986667, 4);
    expect(result.tailEnergy).toBeGreaterThan(0);
  }
  expect(audio.gainDb).toBeCloseTo(midi.gainDb, 2);
});

test('preserved comparison page plays and switches presets', async ({ page }) => {
  await page.goto('/kgstudio/reverb-comparison.html');
  await page.getByRole('button', { name: 'Play from start', exact: true }).click();
  await expect(page.locator('#status')).toHaveText('Playing Chamber');
  await page.getByRole('button', { name: 'Plate', exact: true }).click();
  await expect(page.locator('#status')).toHaveText('Playing Plate');
  await page.getByRole('button', { name: 'Reverb on · compare dry', exact: true }).click();
  await expect(page.locator('#bypass')).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: 'Stop', exact: true }).click();
  await expect(page.locator('#status')).toHaveText('Stopped.');
});
