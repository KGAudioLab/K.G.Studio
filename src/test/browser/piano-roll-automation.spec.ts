import { expect, test, type Page } from '@playwright/test';
import type { KGMidiRegion } from '../../core/region/KGMidiRegion';

const regionStart = 15360;
const beatWidth = 80;
const notes = [
  { id: 'overlap', start: 0, duration: 2880, velocity: 45 },
  { id: 'chord-low', start: 960, duration: 480, velocity: 70 },
  { id: 'chord-high', start: 960, duration: 960, velocity: 80 },
  { id: 'middle', start: 1920, duration: 480, velocity: 85 },
  { id: 'last', start: 2880, duration: 480, velocity: 90 },
  { id: 'outside', start: 3840, duration: 480, velocity: 65 },
].map((note, index) => ({ ...note, pitch: 60 + index }));

const originalEvents = [
  { id: 'left', tick: 0, value: 17 },
  { id: 'start', tick: 960, value: 34 },
  { id: 'interior', tick: 1680, value: 57 },
  { id: 'end', tick: 2880, value: 70 },
  { id: 'right', tick: 3840, value: 91 },
];

test.beforeEach(async ({ page }) => {
  await page.goto('/kgstudio/');
  await page.locator('.bar-number-cell').first().waitFor();

  await page.evaluate(async ({ notes, regionStart, originalEvents }) => {
    const load = (path: string) => import(`/kgstudio/src/${path}`);
    const { KGCore } = await load('core/KGCore.ts');
    const { KGProject } = await load('core/KGProject.ts');
    const { KGMidiTrack } = await load('core/track/KGMidiTrack.ts');
    const { KGMidiRegion } = await load('core/region/KGMidiRegion.ts');
    const { KGMidiNote } = await load('core/midi/KGMidiNote.ts');
    const { KGMidiPitchBend } = await load('core/midi/KGMidiPitchBend.ts');
    const { KGMidiControllerEvent } = await load('core/midi/KGMidiControllerEvent.ts');
    const { KGPianoRollState } = await load('core/state/KGPianoRollState.ts');
    const { useProjectStore } = await load('stores/projectStore.ts');
    const project = new KGProject('Piano roll automation test', 16);
    project.setTimeSignature({ numerator: 6, denominator: 8 });
    project.setPianoRollZoom(2);
    project.setPianoRollSnapping('1/4');
    KGPianoRollState.instance().setPianoRollZoom(2);
    const track = new KGMidiTrack('Melody', 1, 'acoustic_grand_piano');
    const region = new KGMidiRegion('automation-region', '1', 0, 'Melody', regionStart, 5760);
    notes.forEach(({ id, start, duration, velocity, pitch }) => {
      region.addNote(new KGMidiNote(id, start, start + duration, pitch, velocity));
    });
    region.setPitchBends(originalEvents.map(({ id, tick, value }) => new KGMidiPitchBend(`bend-${id}`, tick, value * 128)));
    region.setControllerEvents(7, originalEvents.map(({ id, tick, value }) => new KGMidiControllerEvent(`cc-${id}`, tick, value)));
    track.setRegions([region]);
    project.setTracks([track]);
    KGCore.instance().setCurrentProject(project);
    useProjectStore.getState().refreshProjectState();
    useProjectStore.getState().openMidiPianoRoll(region.getId());
  }, { notes, regionStart, originalEvents });

  await page.getByRole('button', { name: 'Toggle automation lane' }).click();
  await page.locator('.piano-roll-note-scroll').evaluate(element => { element.scrollLeft = 1100; });
  await expect(page.locator('.piano-roll-automation-scroll-layer')).toHaveCSS('transform', 'matrix(1, 0, 0, 1, -1100, 0)');
});

async function selectAutomation(page: Page, label: string) {
  await page.locator('.automation-type-dropdown').click();
  await page.locator('.quant-option').filter({ hasText: label }).click();
  return page.getByLabel(`${label} automation lane`);
}

function readNotes(page: Page) {
  return page.evaluate(async () => {
    const path = '/kgstudio/src/core/KGCore.ts';
    const { KGCore } = await import(path) as typeof import('../../core/KGCore');
    const region = KGCore.instance().getCurrentProject().getTracks()[0].getRegions()[0];
    return (region as KGMidiRegion).getNotes().map(note => ({
      id: note.getId(),
      start: note.getStartTick(),
      duration: note.getEndTick() - note.getStartTick(),
      velocity: note.getVelocity(),
      pitch: note.getPitch(),
    }));
  });
}

function history(page: Page, action: 'undo' | 'redo') {
  return page.evaluate(async action => {
    const path = '/kgstudio/src/stores/projectStore.ts';
    const { useProjectStore } = await import(path);
    useProjectStore.getState()[action]();
  }, action);
}

test('edits single velocities and draws an undoable ramp in a scrolled piano roll', async ({ page }) => {
  const lane = await selectAutomation(page, 'Note Velocity');
  const svg = lane.locator('svg');
  const dot = (id: string) => lane.locator(`circle[data-note-id="${id}"]`);
  await expect(lane.locator('circle')).toHaveCount(notes.length);
  await expect(lane.locator('.piano-roll-automation-line')).toHaveCount(notes.length);

  const { x, y, width, height } = (await dot('outside').boundingBox())!;
  const outsideNote = page.locator('.piano-note#outside');
  expect(x + width / 2).toBeCloseTo((await outsideNote.boundingBox())!.x);
  const originalColor = await outsideNote.evaluate(note => note.style.backgroundColor);
  const laneBox = (await svg.boundingBox())!;
  await page.mouse.move(x + width / 2, y + height / 2);
  await page.mouse.down();
  await page.mouse.move(x + width / 2 + 20, laneBox.y + 1, { steps: 4 });
  await expect(dot('outside').locator('title')).toHaveText('127');
  expect(await readNotes(page)).toEqual(notes);
  await page.mouse.up();
  const afterDotDrag = notes.map(note => note.id === 'outside' ? { ...note, velocity: 127 } : note);
  expect(await readNotes(page)).toEqual(afterDotDrag);
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
  expect(await readNotes(page)).toEqual(afterDotDrag);
  await page.mouse.up();
  await expect(svg.locator('.piano-roll-velocity-ramp')).toHaveCount(0);
  const rampVelocities = [45, 20, 20, 60, 100, 127];
  const afterRamp = notes.map((note, index) => ({ ...note, velocity: rampVelocities[index] }));
  expect(await readNotes(page)).toEqual(afterRamp);

  await history(page, 'undo');
  expect(await readNotes(page)).toEqual(afterDotDrag);
  await expect(dot('middle').locator('title')).toHaveText('85');
  await history(page, 'redo');
  expect(await readNotes(page)).toEqual(afterRamp);
  await expect(dot('middle').locator('title')).toHaveText('60');
});

async function drawPeak(page: Page, peakTick: number) {
  await page.getByTitle('Pencil Tool', { exact: true }).click();
  const pencil = page.locator('.piano-roll-automation-pencil');
  const bounds = (await pencil.boundingBox())!;
  const x = (tick: number) => bounds.x + (regionStart + tick) * beatWidth / 960;
  const top = bounds.y + 8;
  const bottom = bounds.y + bounds.height - 8;
  // Draw right to left, with an extra sample close to the straight rising segment.
  await page.mouse.move(x(2880), bottom);
  await page.mouse.down();
  await page.mouse.move(x(peakTick), top);
  await page.mouse.move(x((peakTick + 960) / 2), (top + bottom) / 2);
  await page.mouse.move(x(960), bottom);
  await expect(pencil.locator('polyline')).toBeVisible();
  return { pencil, x, top };
}

test('the pencil samples a curved stroke at note starts, including chords', async ({ page }) => {
  const lane = await selectAutomation(page, 'Note Velocity');
  const { pencil } = await drawPeak(page, 1920);
  expect(await readNotes(page)).toEqual(notes);
  await page.mouse.up();
  await expect(pencil.locator('polyline')).toHaveCount(0);

  const velocities = [45, 0, 0, 127, 0, 65];
  const expected = notes.map((note, index) => ({ ...note, velocity: velocities[index] }));
  expect(await readNotes(page)).toEqual(expected);
  await expect(lane.locator('circle[data-note-id="middle"] title')).toHaveText('127');
  await history(page, 'undo');
  expect(await readNotes(page)).toEqual(notes);
  await history(page, 'redo');
  expect(await readNotes(page)).toEqual(expected);
});

function readEvents(page: Page, controller: number | null) {
  return page.evaluate(async controller => {
    const path = '/kgstudio/src/core/KGCore.ts';
    const { KGCore } = await import(path) as typeof import('../../core/KGCore');
    const region = KGCore.instance().getCurrentProject().getTracks()[0].getRegions()[0] as KGMidiRegion;
    const events = controller === null ? region.getPitchBends() : region.getControllerEvents(controller);
    return events.map(event => ({ id: event.getId(), tick: event.getTick(), value: event.getValue() }));
  }, controller);
}

for (const { label, controller, maxValue } of [
  { label: 'CC7', controller: 7, maxValue: 127 },
  { label: 'Pitch Bend', controller: null, maxValue: 16383 },
]) {
  test(`the pencil simplifies and replaces only the covered ${label} points`, async ({ page }) => {
    const lane = await selectAutomation(page, label);
    const before = await readEvents(page, controller);
    const otherController = controller === null ? 7 : null;
    const otherEvents = await readEvents(page, otherController);
    const { pencil, x, top } = await drawPeak(page, 2040);
    expect(await readEvents(page, controller)).toEqual(before);
    await page.mouse.up();
    await expect(pencil.locator('polyline')).toHaveCount(0);

    const after = await readEvents(page, controller);
    expect(after.map(({ tick, value }) => ({ tick, value }))).toEqual([
      { tick: 0, value: before[0].value },
      { tick: 960, value: 0 },
      { tick: 2040, value: maxValue },
      { tick: 2880, value: 0 },
      { tick: 3840, value: before[4].value },
    ]);
    expect([after[0], after[4]]).toEqual([before[0], before[4]]);
    expect(await readEvents(page, otherController)).toEqual(otherEvents);
    expect(await readNotes(page)).toEqual(notes);
    const peak = (await lane.locator('circle').nth(2).boundingBox())!;
    expect(peak.x + peak.width / 2).toBeCloseTo(x(2040));

    await history(page, 'undo');
    expect(await readEvents(page, controller)).toEqual(before);
    await history(page, 'redo');
    expect(await readEvents(page, controller)).toEqual(after);

    const clickTick = 4356;
    expect(await page.evaluate(({ x, y }) => document.elementFromPoint(x, y)?.getAttribute('class'), { x: x(clickTick), y: top }))
      .toBe('piano-roll-automation-pencil');
    await page.mouse.click(x(clickTick), top);
    const clicked = await readEvents(page, controller);
    expect(clicked.slice(0, -1)).toEqual(after);
    expect(clicked.at(-1)).toMatchObject({ tick: 4800, value: maxValue });
  });
}
