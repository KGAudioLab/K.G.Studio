import { expect, test } from '@playwright/test';

test.use({ deviceScaleFactor: 2 });

test('keeps a long audio waveform aligned when zooming and scrolling the main grid', async ({ page }) => {
  const beatsPerBar = 4;
  const ticksPerBar = 960 * beatsPerBar;
  const regionBars = 144;
  const clipOffset = 3;
  const peaks = [11.375, 176.375];

  await page.goto('/kgstudio/');
  await page.locator('.bar-number-cell').first().waitFor();
  await page.evaluate(async ({ ticksPerBar, regionBars, clipOffset, peaks }) => {
    const load = (path: string) => import(`/kgstudio/src/${path}`);
    const { KGCore } = await load('core/KGCore.ts');
    const { KGProject } = await load('core/KGProject.ts');
    const { KGAudioTrack } = await load('core/track/KGAudioTrack.ts');
    const { KGAudioRegion } = await load('core/region/KGAudioRegion.ts');
    const { KGAudioInterface } = await load('core/audio-interface/KGAudioInterface.ts');
    const { useProjectStore } = await load('stores/projectStore.ts');

    const project = new KGProject('Long waveform', regionBars + 2, 0, 120);
    project.setBarWidthMultiplier(1);
    const track = new KGAudioTrack('Audio', 1);
    const duration = regionBars * 2 + clipOffset;
    track.setRegions([new KGAudioRegion(
      'long-audio', '1', 0, 'Long audio', ticksPerBar, regionBars * ticksPerBar,
      'audio', 'audio.wav', duration, clipOffset,
    )]);
    project.setTracks([track]);

    const sampleRate = 8000;
    const buffer = new AudioBuffer({ length: duration * sampleRate, sampleRate, numberOfChannels: 1 });
    const data = buffer.getChannelData(0);
    for (const seconds of peaks) {
      const sample = (clipOffset + seconds) * sampleRate;
      data.fill(1, sample - 16, sample + 16);
    }
    KGAudioInterface.instance().getAudioBuffer = () => buffer;
    KGCore.instance().setCurrentProject(project);
    useProjectStore.getState().refreshProjectState();
  }, { ticksPerBar, regionBars, clipOffset, peaks });

  const viewport = page.locator('.main-content-wrapper');
  const canvas = page.locator('[data-region-id="long-audio"] canvas');
  const scrollToPeak = (seconds: number, zoom: number) => viewport.evaluate((element, left) => {
    element.scrollLeft = left;
  }, (1 + seconds / 2) * 40 * zoom - 400);
  const readPeak = (seconds: number) => canvas.evaluate((element: HTMLCanvasElement, fraction) => {
    const region = element.closest('.track-region')!.getBoundingClientRect();
    const bounds = element.getBoundingClientRect();
    const x = Math.floor((region.left + fraction * region.width - bounds.left) * element.width / bounds.width);
    if (x < 1 || x >= element.width - 1) return 0;
    const pixel = element.getContext('2d')!.getImageData(x - 1, 1, 3, 1).data;
    return Math.max(pixel[3], pixel[7], pixel[11]);
  }, seconds / (regionBars * 2));

  await expect.poll(() => readPeak(peaks[0])).toBeGreaterThan(0);
  await page.locator('.current-zoom').click();
  const slider = page.locator('.zoom-slider-popup input');
  await slider.press('End');
  await expect(page.locator('.current-zoom')).toHaveText('8x');

  await scrollToPeak(peaks[0], 8);
  await expect.poll(() => readPeak(peaks[0])).toBeGreaterThan(0);
  expect(await canvas.evaluate((element: HTMLCanvasElement) => element.width)).toBeLessThanOrEqual(4096);

  await scrollToPeak(peaks[1], 8);
  await expect.poll(() => readPeak(peaks[1])).toBeGreaterThan(0);
  await slider.press('Home');
  await expect(page.locator('.current-zoom')).toHaveText('1x');
  await scrollToPeak(peaks[1], 1);
  await expect.poll(() => readPeak(peaks[1])).toBeGreaterThan(0);
});
