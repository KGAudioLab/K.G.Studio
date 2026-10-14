import { expect, test } from '@playwright/test';

test('track image picker layout, commit, undo, and instrument reset', async ({ page }) => {
  // Keep this UI regression independent of remote soundfont availability.
  const sample = Buffer.alloc(44 + 2048);
  sample.write('RIFF', 0); sample.writeUInt32LE(sample.length - 8, 4); sample.write('WAVEfmt ', 8);
  sample.writeUInt32LE(16, 16); sample.writeUInt16LE(1, 20); sample.writeUInt16LE(1, 22);
  sample.writeUInt32LE(44100, 24); sample.writeUInt32LE(88200, 28);
  sample.writeUInt16LE(2, 32); sample.writeUInt16LE(16, 34);
  sample.write('data', 36); sample.writeUInt32LE(2048, 40);
  await page.route('**/*-mp3/*.mp3', route => route.fulfill({ contentType: 'audio/wav', body: sample }));
  await page.goto('/kgstudio/');
  await page.locator('.bar-number-cell').first().waitFor();
  await expect(page.locator('.global-loading-overlay')).toHaveCount(0);
  await page.evaluate(async () => {
    const load = (path: string) => import(`/kgstudio/src/${path}`);
    const { KGCore } = await load('core/KGCore.ts');
    const { KGProject } = await load('core/KGProject.ts');
    const { KGMidiTrack } = await load('core/track/KGMidiTrack.ts');
    const { useProjectStore } = await load('stores/projectStore.ts');
    const { ConfigManager } = await load('core/config/ConfigManager.ts');
    await ConfigManager.instance().set('general.language', 'en_us');
    const project = new KGProject('Track images');
    project.setTracks([new KGMidiTrack('Lead', 1)]);
    KGCore.instance().setCurrentProject(project);
    useProjectStore.getState().refreshProjectState();
    useProjectStore.setState({ selectedTrackId: '1', showInstrumentSelection: true });
  });
  await page.getByRole('button', { name: 'Choose track image' }).click();
  const dialog = page.getByRole('dialog', { name: 'Track Image' });
  await expect(dialog).toBeVisible();
  await dialog.evaluate(element => Promise.all(element.getAnimations({ subtree: true }).map(animation => animation.finished)));
  const options = page.locator('.track-image-option');
  const singerOptions = options.filter({ has: page.locator('img[src*="/singer_"], img[src*="/choir_"]') });
  await expect(singerOptions).toHaveCount(11);
  await expect.poll(() => singerOptions.locator('img').evaluateAll(elements => elements.every(element => (element as HTMLImageElement).complete && (element as HTMLImageElement).naturalWidth > 0))).toBe(true);
  const desktop = await options.evaluateAll(elements => elements.slice(0, 6).map(element => {
    const box = element.getBoundingClientRect(); return { x: box.x, y: box.y, width: box.width, height: box.height };
  }));
  expect(desktop[0].width).toBe(128);
  expect(desktop[0].height).toBe(128);
  expect(desktop[4].y).toBe(desktop[0].y);
  expect(desktop[5].y).toBeGreaterThan(desktop[0].y);
  await page.screenshot({ path: '/tmp/kg-track-image-desktop.png' });
  await page.setViewportSize({ width: 390, height: 640 });
  const mobile = await options.evaluateAll(elements => elements.slice(0, 6).map(element => {
    const box = element.getBoundingClientRect(); return { x: box.x, y: box.y, width: box.width, height: box.height };
  }));
  expect(mobile[4].y).toBe(mobile[0].y);
  expect(mobile[5].y).toBeGreaterThan(mobile[0].y);
  expect(mobile[0].width).toBeLessThan(128);
  expect(Math.abs(mobile[0].width - mobile[0].height)).toBeLessThan(1);
  await expect(dialog.getByRole('button', { name: 'OK', exact: true })).toBeInViewport();
  await page.screenshot({ path: '/tmp/kg-track-image-narrow.png' });
  await page.setViewportSize({ width: 1280, height: 800 });
  await dialog.getByRole('button', { name: 'singer male deep brown', exact: true }).click();
  await expect(page.locator('.instrument-preview img')).toHaveAttribute('src', '/kgstudio/resources/instruments/piano.png');
  await dialog.getByRole('button', { name: 'OK', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  const assertImage = async (name: string) => {
    await expect(page.locator('.instrument-preview img')).toHaveAttribute('src', `/kgstudio/resources/instruments/${name}`);
    await expect(page.locator('.instrument-image img')).toHaveAttribute('src', `/kgstudio/resources/instruments/${name}`);
  };
  await assertImage('singer_male_deep_brown.png');
  const action = async (method: 'undo' | 'redo') => page.evaluate(async method => {
    const path = '/kgstudio/src/stores/projectStore.ts';
    const { useProjectStore } = await import(path); useProjectStore.getState()[method]();
  }, method);
  await action('undo'); await assertImage('piano.png');
  await action('redo'); await assertImage('singer_male_deep_brown.png');
  await page.evaluate(async () => {
    const path = '/kgstudio/src/stores/projectStore.ts';
    const { useProjectStore } = await import(path);
    await useProjectStore.getState().setTrackInstrument(1, 'violin');
  });
  await assertImage('violin.png');
  await action('undo'); await assertImage('singer_male_deep_brown.png');
});
