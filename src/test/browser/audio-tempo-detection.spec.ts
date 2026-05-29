import { expect, test } from '@playwright/test';

test('detects 125 BPM from the real mp3 fixture in a real browser', async ({ page }) => {
  await page.goto('/kgstudio/tempo-detection-test.html');

  await page.waitForFunction(() => {
    const testWindow = window as Window & {
      runAudioTempoDetectionFixture?: (() => Promise<{ bpm: number; offsetSeconds: number; tempo: number }>) | undefined;
      __tempoHarnessError?: string | null;
    };
    return typeof testWindow.runAudioTempoDetectionFixture === 'function' || testWindow.__tempoHarnessError !== null;
  });

  const harnessError = await page.evaluate(() => {
    return (window as Window & { __tempoHarnessError?: string | null }).__tempoHarnessError ?? null;
  });
  expect(harnessError).toBeNull();

  const result = await page.evaluate(async () => {
    return window.runAudioTempoDetectionFixture();
  });

  expect(result.bpm).toBe(125);
  expect(result.offsetSeconds).toBeGreaterThanOrEqual(0.3);
  expect(result.offsetSeconds).toBeLessThanOrEqual(0.4);
});
