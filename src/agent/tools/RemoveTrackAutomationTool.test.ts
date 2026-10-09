import { beforeEach, describe, expect, it, vi } from 'vitest';
import { RemoveTrackAutomationTool } from './RemoveTrackAutomationTool';
import { UpdateTrackAutomationTool } from './UpdateTrackAutomationTool';
import { AUTOMATION_TYPES, type AutomationType } from './automationToolTypes';
import { createToolInstance } from './index';
import { KGCore } from '../../core/KGCore';
import { KGProject } from '../../core/KGProject';
import { KGCommand } from '../../core/commands/KGCommand';
import { KGMidiTrack } from '../../core/track/KGMidiTrack';
import { KGAudioTrack } from '../../core/track/KGAudioTrack';
import { KGTrackAutomationPoint } from '../../core/track/KGTrackAutomationPoint';
import { KGMidiRegion } from '../../core/region/KGMidiRegion';
import { KGMidiNote } from '../../core/midi/KGMidiNote';
import { KGMidiPitchBend } from '../../core/midi/KGMidiPitchBend';
import { KGMidiControllerEvent } from '../../core/midi/KGMidiControllerEvent';

const state = { activeRegionId: null as string | null };
vi.mock('../../stores/projectStore', () => ({ useProjectStore: { getState: () => state } }));
let track: KGMidiTrack;
let project: KGProject;
let commands: KGCommand[];
let selected: Array<{ getId(): string }>;
let tool: RemoveTrackAutomationTool;
function region(id: string, start: number, length = 200) {
  const result = new KGMidiRegion(id, String(track.getId()), track.getTrackIndex(), id, start, length);
  track.addRegion(result);
  return result;
}
function seed(target: KGMidiRegion, type: AutomationType, ticks = [9, 10, 19, 20]) {
  for (const tick of ticks) {
    const id = `${target.getId()}-${type}-${tick}`;
    if (type === 'pitch_bend') target.addPitchBend(new KGMidiPitchBend(id, tick, 8192 + tick));
    else target.addControllerEvent(Number(type.slice(2)), new KGMidiControllerEvent(id, tick, tick));
  }
}
function points(target: KGMidiRegion, type: AutomationType) {
  return type === 'pitch_bend' ? target.getPitchBends() : target.getControllerEvents(Number(type.slice(2)));
}
function call(type: unknown = 'cc1', position: unknown = 110, length: unknown = 10, target: Record<string, unknown> = { track_id: '1' }) {
  return tool.execute({ ...target, automation_type: type, position, length });
}
beforeEach(() => {
  vi.restoreAllMocks();
  state.activeRegionId = null;
  commands = [];
  selected = [];
  track = new KGMidiTrack('Lead', 1);
  project = new KGProject('removal', 8, 0, 120, { numerator: 4, denominator: 4 }, 'C major');
  project.setTracks([track]);
  vi.spyOn(KGCore, 'instance').mockReturnValue({
    getCurrentProject: () => project, getSelectedItems: () => selected,
    removeSelectedItem: (item: { getId(): string }) => { selected = selected.filter(point => point !== item); },
    executeCommand: (command: KGCommand) => { command.execute(); commands.push(command); },
  } as unknown as KGCore);
  tool = new RemoveTrackAutomationTool();
});

describe('RemoveTrackAutomationTool', () => {
  it.each(AUTOMATION_TYPES)('removes only matching %s points with exclusive end, preserving unrelated data and undo/redo', async type => {
    const target = region('target', 100);
    const note = new KGMidiNote('note', 10, 20, 60, 100);
    target.addNote(note);
    const trackLevel = type === 'volume' || type === 'pan';
    const getPoints = () => trackLevel ? track.getAutomationPoints(type) : points(target, type);
    if (trackLevel) {
      track.setAutomationPoints(type, [109, 110, 119, 120].map(tick => new KGTrackAutomationPoint(`p-${tick}`, tick, type === 'volume' ? -10 : 0.5)));
    } else seed(target, type);
    // A different lane must survive the removal.
    const otherType = type === 'cc2' ? 'cc1' : 'cc2';
    seed(target, otherType);
    const originals = [...getPoints()];
    selected = [originals[1], originals[3], note];
    const base = [track.getVolume(), track.getPan()];
    const result = await call(type);
    expect(result.success).toBe(true);
    expect(result.result).toContain(`Removed 2 ${type}`);
    expect(getPoints()).toEqual([originals[0], originals[3]]);
    expect(selected).toEqual([originals[3], note]);
    expect(points(target, otherType)).toHaveLength(4);
    expect(target.getNotes()).toEqual([note]);
    expect([target.getStartTick(), target.getLengthTicks()]).toEqual([100, 200]);
    expect([track.getVolume(), track.getPan()]).toEqual(base);
    expect(commands).toHaveLength(1);
    commands[0].undo();
    expect(getPoints()).toEqual(originals);
    commands[0].execute();
    expect(getPoints()).toEqual([originals[0], originals[3]]);
    commands[0].undo();
    expect(getPoints()).toEqual(originals);
  });
  it.each(['cc1', 'pitch_bend'] as const)('deletes %s across overlapping and adjacent MIDI regions with one command', async type => {
    const a = region('a', 100);
    const b = region('b', 105);
    const c = region('c', 110);
    seed(a, type, [9, 10, 19, 20]);
    seed(b, type, [4, 5, 14, 15]);
    seed(c, type, [0, 9, 10]);
    const original = [a, b, c].map(target => [...points(target, type)]);
    // The active region must not restrict an explicitly targeted track.
    state.activeRegionId = a.getId();
    const result = await call(type);
    expect(result.result).toContain('Removed 6');
    expect([a, b, c].map(target => points(target, type).map(point => point.getTick()))).toEqual([[9, 20], [4, 15], [10]]);
    expect(commands).toHaveLength(1);
    commands[0].undo();
    expect([a, b, c].map(target => points(target, type))).toEqual(original);
    commands[0].execute();
    expect([a, b, c].map(target => points(target, type).length)).toEqual([2, 2, 1]);
  });
  it.each(AUTOMATION_TYPES)('length=1 removes only the exact tick for %s', async type => {
    const target = region('r', 100);
    const trackLevel = type === 'volume' || type === 'pan';
    if (trackLevel) track.setAutomationPoints(type, [109, 110, 111].map(tick => new KGTrackAutomationPoint(String(tick), tick, 0)));
    else seed(target, type, [9, 10, 11]);
    const result = await call(type, 110, 1);
    expect(result.result).toContain('Removed 1');
    expect(trackLevel ? track.getAutomationPoints(type).map(point => point.getTick()) : points(target, type).map(point => point.getTick() + 100)).toEqual([109, 111]);
  });
  it.each(['position', 'length'] as const)('rejects invalid %s before mutation', async key => {
    const target = region('r', 100);
    seed(target, 'cc1');
    for (const value of [NaN, Infinity, -Infinity, -1, 0.5, '10', true, null, undefined, ...(key === 'length' ? [0] : [])]) {
      const result = await tool.execute({ track_id: '1', automation_type: 'cc1', position: 110, length: 10, [key]: value });
      expect(result.success).toBe(false);
      expect(points(target, 'cc1')).toHaveLength(4);
      expect(commands).toHaveLength(0);
    }
  });
  it.each(['cc12', 'velocity', '', 1, true, null, undefined])('rejects unsupported automation type %s', async type => {
    expect((await tool.execute({ track_id: '1', automation_type: type, position: 0, length: 10 })).success).toBe(false);
    expect(commands).toHaveLength(0);
  });
  it('rejects a nonfinite range end before mutation', async () => {
    expect((await call('volume', 1e308, 1e308)).success).toBe(false);
    expect(commands).toHaveLength(0);
  });
  it('uses ID precedence, exact first MIDI name matching and numeric IDs', async () => {
    const duplicate = new KGMidiTrack('Lead', 2);
    const audio = new KGAudioTrack('Lead', 3);
    project.setTracks([audio, track, duplicate]);
    track.setAutomationPoints('pan', [new KGTrackAutomationPoint('first', 110, 0)]);
    duplicate.setAutomationPoints('pan', [new KGTrackAutomationPoint('second', 110, 0)]);
    await call('pan', 110, 1, { track_id: 2, track_name: 'Lead' });
    expect(track.getAutomationPoints('pan')).toHaveLength(1);
    expect(duplicate.getAutomationPoints('pan')).toHaveLength(0);
    await call('pan', 110, 1, { track_name: 'Lead' });
    expect(track.getAutomationPoints('pan')).toHaveLength(0);
    for (const target of [{ track_id: 'missing', track_name: 'Lead' }, { track_id: '3' }, { track_name: 'lead' }, { track_name: 'missing' }]) {
      expect((await call('pan', 110, 1, target)).success).toBe(false);
    }
    expect(commands).toHaveLength(2);
  });
  it('uses active region before selected region, limits region removal to it, and then falls back to selection', async () => {
    const a = region('active', 100);
    const b = region('selected', 100);
    seed(a, 'cc1'); seed(b, 'cc1');
    state.activeRegionId = a.getId();
    selected = [b];
    await call('cc1', 110, 10, {});
    expect(points(a, 'cc1')).toHaveLength(2);
    expect(points(b, 'cc1')).toHaveLength(4);
    state.activeRegionId = null;
    await call('cc1', 110, 10, {});
    expect(points(b, 'cc1')).toHaveLength(2);
  });
  it('uses active region owning track for track-level removal without restricting range to region bounds', async () => {
    const target = region('active', 0, 10);
    state.activeRegionId = target.getId();
    track.setAutomationPoints('volume', [new KGTrackAutomationPoint('volume', 110, -10)]);
    expect((await call('volume', 110, 1, {})).success).toBe(true);
    expect(track.getAutomationPoints('volume')).toHaveLength(0);
    expect(target.getLengthTicks()).toBe(10);
  });
  it('fails without a MIDI region selection when identifiers are omitted', async () => {
    expect((await call('cc1', 0, 1, {})).success).toBe(false);
    expect((await call('volume', 0, 1, {})).success).toBe(false);
    expect(commands).toHaveLength(0);
  });
  it('succeeds without an undo entry or region creation for empty matches', async () => {
    const emptyTrack = await call('cc1');
    expect(emptyTrack.success).toBe(true);
    expect(emptyTrack.result).toContain('Removed 0');
    expect(track.getRegions()).toHaveLength(0);
    const target = region('outside-range', 100);
    seed(target, 'cc1');
    state.activeRegionId = target.getId();
    expect((await call('cc1', 0, 1, {})).success).toBe(true);
    expect([target.getStartTick(), target.getLengthTicks()]).toEqual([100, 200]);
    expect(points(target, 'cc1')).toHaveLength(4);
    expect(commands).toHaveLength(0);
  });
  it('preserves the other track mix lane and out-of-range points', async () => {
    track.setAutomationPoints('volume', [new KGTrackAutomationPoint('v0', 109, 0), new KGTrackAutomationPoint('v1', 110, 3)]);
    track.setAutomationPoints('pan', [new KGTrackAutomationPoint('p1', 110, 0.5)]);
    await call('volume', 110, 1);
    expect(track.getAutomationPoints('pan')[0].getValue()).toBe(0.5);
    expect(track.getAutomationPoints('volume').map(point => point.getId())).toEqual(['v0']);
  });
  it('registers a native tick tool with a shared enum and accurate confirmation/result', async () => {
    expect(createToolInstance(tool.name, 'advanced')).toBeInstanceOf(RemoveTrackAutomationTool);
    expect(tool.isReadOnlyTool()).toBe(false);
    expect(tool.isAvailableInAdvancedMode()).toBe(true);
    expect(tool.isAvailableInRegularMode()).toBe(false);
    expect(tool.isAvailableInEfficientMode()).toBe(false);
    expect(tool.parameters.automation_type.enum).toEqual(new UpdateTrackAutomationTool().parameters.automation_type.enum);
    expect(tool.getDefinition().function.parameters.required).toEqual(['automation_type', 'position', 'length']);
    expect(tool.parameters.length.description).toContain('length=1');
    const target = region('region', 100);
    seed(target, 'cc1');
    const args = { track_id: '1', automation_type: 'cc1', position: 110, length: 10 };
    expect(tool.buildConfirmationContent(args)).toContain('**2 cc1 automation keypoints**');
    expect(tool.buildConfirmationContent(args)).toContain('[110, 120)');
    expect(tool.buildConfirmationContent({ ...args, length: 0 })).toBeUndefined();
    expect(commands).toHaveLength(0);
    const result = await tool.execute(args);
    expect(result.result).toContain('track_id=1');
    expect(result.result).toContain('all MIDI regions');
  });
});
