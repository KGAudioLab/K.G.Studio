import { expect, test } from '@playwright/test';

for (const { zoom, pixelRatio, tempoChange } of [
  { zoom: 2, pixelRatio: 1, tempoChange: false },
  { zoom: 2.37, pixelRatio: 1, tempoChange: false },
  { zoom: 2.37, pixelRatio: 2, tempoChange: false },
  { zoom: 2.37, pixelRatio: 2, tempoChange: true },
]) {
  test(`audio split preserves waveform positions and opacity at ${zoom}x zoom, ${pixelRatio}x pixels, tempo change ${tempoChange}`, async ({ browser }) => {
    const context = await browser.newContext({ deviceScaleFactor: pixelRatio });
    const page = await context.newPage();
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.addInitScript(() => {
      const original = CanvasRenderingContext2D.prototype.fillRect;
      const clear = CanvasRenderingContext2D.prototype.clearRect;
      CanvasRenderingContext2D.prototype.clearRect = function (...args) {
        (this.canvas as HTMLCanvasElement & { peaks?: number[] }).peaks = [];
        return clear.apply(this, args);
      };
      CanvasRenderingContext2D.prototype.fillRect = function (x, y, width, height) {
        if (y === 0) (this.canvas as HTMLCanvasElement & { peaks?: number[] }).peaks?.push(x);
        return original.call(this, x, y, width, height);
      };
    });
    await page.goto('http://127.0.0.1:4174/kgstudio/');
    await page.locator('.bar-number-cell').first().waitFor();
    await page.evaluate(async ({ zoom, tempoChange }) => {
      const load = (path: string) => import(`/kgstudio/src/${path}`);
      const { KGCore } = await load('core/KGCore.ts');
      const { KGProject } = await load('core/KGProject.ts');
      const { KGAudioTrack } = await load('core/track/KGAudioTrack.ts');
      const { KGAudioRegion } = await load('core/region/KGAudioRegion.ts');
      const { KGAudioInterface } = await load('core/audio-interface/KGAudioInterface.ts');
      const { useProjectStore } = await load('stores/projectStore.ts');
      const { GlobalTrackType } = await load('core/global-track/index.ts');
      const { KGTempoRegion } = await load('core/region/KGTempoRegion.ts');
      const { tickRangeToSeconds } = await load('util/globalTrackUtil.ts');
      const project = new KGProject('Audio split pixels', 16, 0, 120);
      project.setBarWidthMultiplier(zoom);
      if (tempoChange) {
        const tempoTrack = project.getGlobalTracks().find((track: { getType: () => unknown }) => track.getType() === GlobalTrackType.Tempo);
        tempoTrack.setRegions([
          new KGTempoRegion('fast', tempoTrack.getId(), tempoTrack.getTrackIndex(), 120, 0, 2, 3840),
          new KGTempoRegion('slow', tempoTrack.getId(), tempoTrack.getTrackIndex(), 60, 2, 14, 3840),
        ]);
      }
      const duration = tickRangeToSeconds(project, 317, 317 + 16 * 960);
      const track = new KGAudioTrack('Audio', 1);
      track.setTrackIndex(0);
      const region = new KGAudioRegion('audio-original', '1', 0, 'Audio', 317, 16 * 960, 'audio', 'audio.wav', duration, 0);
      track.setRegions([region]);
      project.setTracks([track]);
      const buffer = new AudioBuffer({ length: Math.ceil(44100 * duration), sampleRate: 44100, numberOfChannels: 1 });
      const samples = buffer.getChannelData(0);
      for (let i = 0; i < samples.length; i++) samples[i] = i % 2 ? 0.25 : -0.25;
      for (const seconds of [1, 3, 5, 7]) buffer.getChannelData(0)[seconds * 44100] = 1;
      KGAudioInterface.instance().getAudioBuffer = () => buffer;
      KGCore.instance().setCurrentProject(project);
      useProjectStore.getState().refreshProjectState();
    }, { zoom, tempoChange });
    const inspect = () => page.locator('.track-region canvas').evaluateAll(elements => elements.flatMap(element => {
      const canvas = element as HTMLCanvasElement & { peaks?: number[] };
      const rect = canvas.getBoundingClientRect();
      return (canvas.peaks ?? []).map(x => rect.left + x * rect.width / canvas.width);
    }).sort((a, b) => a - b));
    await expect.poll(async () => (await inspect()).length).toBe(4);
    const before = await inspect();
    await page.evaluate(async () => {
      const load = (path: string) => import(`/kgstudio/src/${path}`);
      const { SplitRegionCommand } = await load('core/commands/region/SplitRegionCommand.ts');
      const { useProjectStore } = await load('stores/projectStore.ts');
      new SplitRegionCommand('audio-original', 317 + 7 * 960).execute();
      useProjectStore.getState().refreshProjectState();
    });
    await expect(page.locator('.track-region')).toHaveCount(2);
    await expect.poll(async () => (await inspect()).length).toBe(4);
    const after = await inspect();
    for (let i = 0; i < before.length; i++) expect(Math.abs(after[i] - before[i])).toBeLessThan(0.1);
    const opacity = await page.locator('.track-region canvas').evaluateAll(elements => elements.map(element => {
      const canvas = element as HTMLCanvasElement;
      const pixels = canvas.getContext('2d')!.getImageData(0, Math.floor(canvas.height / 2), canvas.width, 1).data;
      return [...new Set(Array.from({ length: canvas.width - 4 }, (_, i) => pixels[(i + 2) * 4 + 3]))];
    }));
    expect(opacity).toEqual([[179], [179]]);
    await context.close();
  });
}
