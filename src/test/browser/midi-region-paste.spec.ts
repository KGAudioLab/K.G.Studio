import { expect, test } from '@playwright/test';

for (const [initialBars, zoom] of [[4, 2], [8, 3], [32, 4]]) {
  test(`MIDI copy/paste/undo keeps previews healthy on mount in a ${initialBars}-bar project at ${zoom}× zoom`, async ({ page }) => {
    const pageErrors: string[] = [];
    page.on('pageerror', error => pageErrors.push(error.message));
    await page.addInitScript(() => {
      const descriptor = Object.getOwnPropertyDescriptor(HTMLCanvasElement.prototype, 'width')!;
      let largestCanvasWidth = 0;
      Object.defineProperty(HTMLCanvasElement.prototype, 'width', {
        ...descriptor,
        set(value: number) {
          largestCanvasWidth = Math.max(largestCanvasWidth, value);
          descriptor.set!.call(this, value);
        },
      });
      Object.defineProperty(window, 'largestCanvasWidth', { get: () => largestCanvasWidth });
    });
    await page.goto('/kgstudio/');
    await page.locator('.bar-number-cell').first().waitFor();
    // Mount MainContent with a saved project zoom and a fresh parent grid ref,
    // matching startup rather than injecting regions into an already-mounted grid.
    await page.evaluate(async () => {
      const path = '/kgstudio/src/stores/projectStore.ts';
      const { useProjectStore } = await import(path);
      useProjectStore.setState({ showSettings: true });
    });
    await expect(page.locator('.bar-number-cell')).toHaveCount(0);
    await page.evaluate(async ({ maxBars, zoom }) => {
      const load = (path: string) => import(`/kgstudio/src/${path}`);
      const { KGCore } = await load('core/KGCore.ts');
      const { KGProject } = await load('core/KGProject.ts');
      const { KGMidiTrack } = await load('core/track/KGMidiTrack.ts');
      const { KGMidiRegion } = await load('core/region/KGMidiRegion.ts');
      const { KGMidiNote } = await load('core/midi/KGMidiNote.ts');
      const { useProjectStore } = await load('stores/projectStore.ts');
      const project = new KGProject('Paste regression', maxBars);
      project.setBarWidthMultiplier(zoom);
      const track = new KGMidiTrack('Melody', 1, 'acoustic_grand_piano');
      track.setTrackIndex(0);
      const region = new KGMidiRegion('original-midi', '1', 0, 'Melody Region 1', 0, 4 * 3840);
      for (let beat = 0; beat < 16; beat += 1) {
        region.addNote(new KGMidiNote(`note-${beat}`, beat * 960, beat * 960 + 480, 60 + beat % 5, 100));
      }
      track.setRegions([region]);
      project.setTracks([track]);
      KGCore.instance().setCurrentProject(project);
      useProjectStore.getState().refreshProjectState();
      useProjectStore.setState({ showSettings: false });
    }, { maxBars: initialBars, zoom });

    const region = page.locator('[data-region-id="original-midi"]');
    await expect(region).toHaveCSS('width', `${4 * 40 * zoom}px`);
    await expect(region).toHaveCSS('left', '0px');
    const original = region.locator('canvas');
    await expect(original).toHaveCount(1);
    const inspectOriginal = () => original.evaluate(canvasElement => {
      const canvas = canvasElement as HTMLCanvasElement;
      const context = canvas.getContext('2d')!;
      const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
      return { width: canvas.width, hasNotes: pixels.some((value, index) => index % 4 === 3 && value > 0), lost: context.isContextLost() };
    });
    await expect.poll(async () => (await inspectOriginal()).hasNotes).toBe(true);
    const originalWidth = (await inspectOriginal()).width;

    for (let cycle = 0; cycle < 5; cycle += 1) {
      const result = await page.evaluate(async () => {
        const corePath = '/kgstudio/src/core/KGCore.ts';
        const storePath = '/kgstudio/src/stores/projectStore.ts';
        const { KGCore } = await import(corePath);
        const { useProjectStore } = await import(storePath);
        const core = KGCore.instance();
        const region = core.getCurrentProject().getTracks()[0].getRegions()[0];
        core.clearSelectedItems();
        core.addSelectedItems([region]);
        core.copySelectedItems();
        return useProjectStore.getState().pasteRegionsAtTrack('1', 4 * 3840);
      });
      expect(result.success).toBe(true);
      await expect(page.locator('.bar-number-cell')).toHaveCount(Math.max(8, initialBars));
      await expect(page.locator('.track-region')).toHaveCount(2);
      const pasted = page.locator('.track-region:not([data-region-id="original-midi"])');
      await expect(pasted).toHaveCSS('left', `${4 * 40 * zoom}px`);
      await expect(pasted).toHaveCSS('width', `${4 * 40 * zoom}px`);
      await expect.poll(async () => (await inspectOriginal()).hasNotes).toBe(true);
      await page.evaluate(async () => {
        const path = '/kgstudio/src/stores/projectStore.ts';
        const { useProjectStore } = await import(path);
        useProjectStore.getState().undo();
      });
      await expect(page.locator('.bar-number-cell')).toHaveCount(initialBars);
      await expect(page.locator('.track-region')).toHaveCount(1);
      await expect.poll(inspectOriginal).toEqual({ width: originalWidth, hasNotes: true, lost: false });
    }
    const largestWidth = await page.evaluate(() => (window as unknown as { largestCanvasWidth: number }).largestCanvasWidth);
    expect(largestWidth).toBeLessThanOrEqual(originalWidth + 4);
    expect(pageErrors).toEqual([]);
  });
}
