import { expect, test } from '@playwright/test';

test('edits single velocities and draws an undoable ramp in a scrolled piano roll', async ({ page }) => {
  await page.goto('/kgstudio/');
  await page.locator('.bar-number-cell').first().waitFor();
  const notes = [
    { id: 'overlap', start: 0, duration: 2880, velocity: 45 },
    { id: 'chord-low', start: 960, duration: 480, velocity: 70 },
    { id: 'chord-high', start: 960, duration: 960, velocity: 80 },
    { id: 'middle', start: 1920, duration: 480, velocity: 85 },
    { id: 'last', start: 2880, duration: 480, velocity: 90 },
    { id: 'outside', start: 3840, duration: 480, velocity: 65 },
  ].map((note, index) => ({ ...note, pitch: 60 + index }));

  await page.evaluate(async notes => {
    const load = (path: string) => import(`/kgstudio/src/${path}`);
    const { KGCore } = await load('core/KGCore.ts');
    const { KGProject } = await load('core/KGProject.ts');
    const { KGMidiTrack } = await load('core/track/KGMidiTrack.ts');
    const { KGMidiRegion } = await load('core/region/KGMidiRegion.ts');
    const { KGMidiNote } = await load('core/midi/KGMidiNote.ts');
    const { KGPianoRollState } = await load('core/state/KGPianoRollState.ts');
    const { useProjectStore } = await load('stores/projectStore.ts');
    const project = new KGProject('Velocity test', 16);
    project.setPianoRollZoom(2);
    KGPianoRollState.instance().setPianoRollZoom(2);
    const track = new KGMidiTrack('Melody', 1, 'acoustic_grand_piano');
    const region = new KGMidiRegion('velocity-region', '1', 0, 'Melody', 15360, 5760);
    notes.forEach(({ id, start, duration, velocity, pitch }) => {
      region.addNote(new KGMidiNote(id, start, start + duration, pitch, velocity));
    });
    track.setRegions([region]);
    project.setTracks([track]);
    KGCore.instance().setCurrentProject(project);
    useProjectStore.getState().refreshProjectState();
    useProjectStore.getState().openMidiPianoRoll(region.getId());
  }, notes);

  await page.getByRole('button', { name: 'Toggle automation lane' }).click();
  await page.locator('.automation-type-dropdown').click();
  await page.getByText('Note Velocity', { exact: true }).click();

  const lane = page.getByLabel('Note Velocity automation lane');
  const svg = lane.locator('svg');
  const dot = (id: string) => lane.locator(`circle[data-note-id="${id}"]`);
  await expect(lane.locator('circle')).toHaveCount(notes.length);
  await expect(lane.locator('.piano-roll-automation-line')).toHaveCount(notes.length);
  await page.locator('.piano-roll-note-scroll').evaluate(element => { element.scrollLeft = 1100; });
  await expect(lane.locator('.piano-roll-automation-scroll-layer')).toHaveCSS('transform', 'matrix(1, 0, 0, 1, -1100, 0)');

  const readNotes = () => page.evaluate(async () => {
    const path = '/kgstudio/src/core/KGCore.ts';
    const { KGCore } = await import(path) as typeof import('../../core/KGCore');
    const region = KGCore.instance().getCurrentProject().getTracks()[0].getRegions()[0];
    return (region as import('../../core/region/KGMidiRegion').KGMidiRegion).getNotes().map(note => ({
      id: note.getId(),
      start: note.getStartTick(),
      duration: note.getEndTick() - note.getStartTick(),
      velocity: note.getVelocity(),
      pitch: note.getPitch(),
    }));
  });
  const history = (action: 'undo' | 'redo') => page.evaluate(async action => {
    const path = '/kgstudio/src/stores/projectStore.ts';
    const { useProjectStore } = await import(path);
    useProjectStore.getState()[action]();
  }, action);

  const { x, y, width, height } = (await dot('outside').boundingBox())!;
  const outsideNote = page.locator('.piano-note#outside');
  expect(x + width / 2).toBeCloseTo((await outsideNote.boundingBox())!.x);
  const originalColor = await outsideNote.evaluate(note => note.style.backgroundColor);
  const laneBox = (await svg.boundingBox())!;
  await page.mouse.move(x + width / 2, y + height / 2);
  await page.mouse.down();
  await page.mouse.move(x + width / 2 + 20, laneBox.y + 1, { steps: 4 });
  await expect(dot('outside').locator('title')).toHaveText('127');
  expect(await readNotes()).toEqual(notes);
  await page.mouse.up();
  const afterDotDrag = notes.map(note => note.id === 'outside' ? { ...note, velocity: 127 } : note);
  expect(await readNotes()).toEqual(afterDotDrag);
  expect(await outsideNote.evaluate(note => note.style.backgroundColor)).not.toBe(originalColor);

  const first = (await dot('chord-low').boundingBox())!;
  const last = (await dot('last').boundingBox())!;
  const left = first.x + first.width / 2;
  const right = last.x + last.width / 2;
  const velocityY = (velocity: number) => laneBox.y + 16 + (127 - velocity) * (laneBox.height - 32) / 127;
  await page.mouse.move(right, velocityY(100));
  await page.mouse.down();
  await page.mouse.move(left, velocityY(20), { steps: 6 });
  await expect(svg.locator('.piano-roll-velocity-ramp')).toBeVisible();
  expect(await readNotes()).toEqual(afterDotDrag);
  await page.mouse.up();
  await expect(svg.locator('.piano-roll-velocity-ramp')).toHaveCount(0);
  const rampVelocities = [45, 20, 20, 60, 100, 127];
  const afterRamp = notes.map((note, index) => ({ ...note, velocity: rampVelocities[index] }));
  expect(await readNotes()).toEqual(afterRamp);

  await history('undo');
  expect(await readNotes()).toEqual(afterDotDrag);
  await expect(dot('middle').locator('title')).toHaveText('85');
  await history('redo');
  expect(await readNotes()).toEqual(afterRamp);
  await expect(dot('middle').locator('title')).toHaveText('60');
});
