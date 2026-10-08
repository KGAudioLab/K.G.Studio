import { beforeEach, describe, expect, it, vi } from 'vitest';
import { UpdateTrackAutomationTool } from './UpdateTrackAutomationTool';
import { createToolInstance } from './index';
import { KGCore } from '../../core/KGCore';
import { KGProject } from '../../core/KGProject';
import { CreateMidiEventsCommand } from '../../core/commands/note/CreateMidiEventsCommand';
import { KGCommand } from '../../core/commands/KGCommand';
import { KGMidiTrack } from '../../core/track/KGMidiTrack';
import { KGAudioTrack } from '../../core/track/KGAudioTrack';
import { KGMidiRegion } from '../../core/region/KGMidiRegion';
import { KGMidiNote } from '../../core/midi/KGMidiNote';
import { KGMidiPitchBend } from '../../core/midi/KGMidiPitchBend';
import { KGMidiControllerEvent } from '../../core/midi/KGMidiControllerEvent';

const state = { activeRegionId: null as string | null };
vi.mock('../../stores/projectStore', () => ({ useProjectStore: { getState: () => state } }));
let track: KGMidiTrack;
let project: KGProject;
let commands: KGCommand[];
let selected: unknown[];
let tool: UpdateTrackAutomationTool;
function region(id: string, start: number, length: number) {
  const result = new KGMidiRegion(id, String(track.getId()), track.getTrackIndex(), id, start, length);
  track.addRegion(result);
  return result;
}
function call(type: string, value: unknown, position: unknown = 100, target: Record<string, unknown> = { track_id: '1' }) {
  return tool.execute({ ...target, automation_type: type, position, value });
}
beforeEach(() => {
  vi.restoreAllMocks();
  state.activeRegionId = null;
  commands = [];
  selected = [];
  track = new KGMidiTrack('Lead', 1);
  project = new KGProject('automation', 8, 0, 120, { numerator: 4, denominator: 4 }, 'C major');
  project.setTracks([track]);
  vi.spyOn(KGCore, 'instance').mockReturnValue({
    getCurrentProject: () => project, getSelectedItems: () => selected,
    removeSelectedItem: vi.fn(),
    executeCommand: (command: KGCommand) => { command.execute(); commands.push(command); },
  } as unknown as KGCore);
  tool = new UpdateTrackAutomationTool();
});

describe('UpdateTrackAutomationTool', () => {
  const ranges = [
    ['volume', -60, 12], ['pan', -1, 1], ['pitch_bend', -8192, 8191],
    ['cc1', 0, 127], ['cc2', 0, 127], ['cc7', 0, 127], ['cc11', 0, 127], ['cc64', 0, 127],
  ] as const;
  it.each(ranges)('accepts %s boundaries and rejects invalid values before mutation', async (type, min, max) => {
    for (const value of [min - 1, max + 1, NaN, Infinity, -Infinity, '0', null, undefined,
      ...(type === 'volume' || type === 'pan' ? [] : [0.5]), ...(type === 'cc64' ? [1, 64, 126] : [])]) {
      expect((await call(type, value)).success).toBe(false);
      expect(commands).toHaveLength(0);
      expect(track.getRegions()).toHaveLength(0);
    }
    expect((await call(type, min)).success).toBe(true);
    expect((await call(type, max)).success).toBe(true);
  });
  it.each([-1, 0.5, NaN, Infinity, -Infinity, '100', null, undefined])('rejects invalid position %s without mutation', async position => {
    expect((await tool.execute({ track_id: '1', automation_type: 'cc1', value: 1, position })).success).toBe(false);
    expect(commands).toHaveLength(0);
    expect(track.getRegions()).toHaveLength(0);
  });
  it('rejects unsupported types', async () => {
    expect((await call('cc12', 1)).success).toBe(false);
    expect(commands).toHaveLength(0);
  });
  it.each(['volume', 'pan'] as const)('upserts decimal %s at track level, preserves base settings and supports undo/redo and no-op', async type => {
    const baseVolume = track.getVolume();
    const basePan = track.getPan();
    expect((await call(type, 0.25, 0)).success).toBe(true);
    const id = track.getAutomationPoints(type)[0].getId();
    await call(type, 0.75, 0);
    expect(track.getAutomationPoints(type).map(p => [p.getId(), p.getTick(), p.getValue()])).toEqual([[id, 0, 0.75]]);
    await call(type, 0.75, 0);
    expect(commands).toHaveLength(2);
    commands[1].undo();
    expect(track.getAutomationPoints(type)[0].getValue()).toBe(0.25);
    commands[1].execute();
    expect(track.getAutomationPoints(type)[0].getValue()).toBe(0.75);
    commands[1].undo(); commands[0].undo();
    expect(track.getAutomationPoints(type)).toHaveLength(0);
    commands[0].execute();
    expect(track.getAutomationPoints(type)[0].getValue()).toBe(0.25);
    expect(track.getVolume()).toBe(baseVolume);
    expect(track.getPan()).toBe(basePan);
    expect(track.getRegions()).toHaveLength(0);
  });
  it.each([[-8192, 0], [0, 8192], [8191, 16383]])('converts public pitch bend %s to storage %s', async (value, stored) => {
    const result = await call('pitch_bend', value);
    expect(result.success).toBe(true);
    expect(result.result).toContain(`value=${value}`);
    expect((track.getRegions()[0] as KGMidiRegion).getPitchBends()[0].getValue()).toBe(stored);
  });
  it.each([{ numerator: 4, denominator: 4, length: 3840 }, { numerator: 3, denominator: 4, length: 2880 }, { numerator: 6, denominator: 8, length: 2880 }])('creates a bar using meter $numerator/$denominator with atomic undo/redo', async ({ numerator, denominator, length }) => {
    project.setTimeSignature({ numerator, denominator });
    await call('cc64', 127, 123);
    const created = track.getRegions()[0] as KGMidiRegion;
    expect([created.getStartTick(), created.getLengthTicks()]).toEqual([123, length]);
    expect(created.getControllerEvents(64)[0].getTick()).toBe(0);
    expect(commands).toHaveLength(1);
    commands[0].undo();
    expect(track.getRegions()).toHaveLength(0);
    commands[0].execute();
    const redone = track.getRegions()[0] as KGMidiRegion;
    expect(redone.getId()).toBe(created.getId());
    expect(redone.getControllerEvents(64).map(p => [p.getTick(), p.getValue()])).toEqual([[0, 127]]);
  });
  it('selects closest containing region, breaks ties by order, and treats end as exclusive', async () => {
    const early = region('early', 0, 200);
    const closest = region('closest', 50, 150);
    const tied = region('tied', 50, 150);
    await call('cc1', 1, 50);
    expect(closest.getControllerEvents(1)).toHaveLength(1);
    expect(early.getControllerEvents(1)).toHaveLength(0);
    expect(tied.getControllerEvents(1)).toHaveLength(0);
    await call('cc1', 2, 200);
    expect(track.getRegions()).toHaveLength(4);
    expect(track.getRegions()[3].getStartTick()).toBe(200);
  });
  it.each(['cc1', 'cc2', 'cc7', 'cc11', 'cc64', 'pitch_bend'])('upserts %s with relative ticks and preserves other events through undo/redo', async type => {
    const target = region('target', 50, 100);
    target.addControllerEvent(2, new KGMidiControllerEvent('other', 1, 55));
    target.addPitchBend(new KGMidiPitchBend('other-bend', 1, 8192));
    await call(type, 0, 100);
    const points = () => type === 'pitch_bend' ? target.getPitchBends() : target.getControllerEvents(Number(type.slice(2)));
    const point = points().find(p => p.getTick() === 50)!;
    await call(type, 127, 100);
    expect(points().filter(p => p.getTick() === 50)).toHaveLength(1);
    expect(point.getValue()).toBe(type === 'pitch_bend' ? 8319 : 127);
    await call(type, 127, 100);
    expect(commands).toHaveLength(2);
    commands[1].undo();
    expect(point.getValue()).toBe(type === 'pitch_bend' ? 8192 : 0);
    commands[1].execute();
    expect(point.getValue()).toBe(type === 'pitch_bend' ? 8319 : 127);
    expect(target.getControllerEvents(2).find(p => p.getId() === 'other')?.getValue()).toBe(55);
    expect(target.getPitchBends().find(p => p.getId() === 'other-bend')?.getValue()).toBe(8192);
  });
  it.each([10, 250])('expands the active region at %s while preserving absolute content through undo/redo', async position => {
    const target = region('active', 100, 100);
    target.addNote(new KGMidiNote('note', 20, 40, 60, 100));
    target.addPitchBend(new KGMidiPitchBend('bend', 30, 8192));
    target.addControllerEvent(2, new KGMidiControllerEvent('cc', 40, 70));
    state.activeRegionId = target.getId();
    await call('cc1', 20, position, {});
    expect(commands).toHaveLength(1);
    const check = () => {
      expect(target.getNotes()[0].getStartTick() + target.getStartTick()).toBe(120);
      expect(target.getPitchBends()[0].getTick() + target.getStartTick()).toBe(130);
      expect(target.getControllerEvents(2)[0].getTick() + target.getStartTick()).toBe(140);
      expect(target.getControllerEvents(1)[0].getTick() + target.getStartTick()).toBe(position);
    };
    check();
    expect(target.getStartTick()).toBe(Math.min(position, 100));
    expect(target.getStartTick() + target.getLengthTicks()).toBe(Math.max(position + 1, 200));
    commands[0].undo();
    expect([target.getStartTick(), target.getLengthTicks()]).toEqual([100, 100]);
    expect(target.getControllerEvents(1)).toHaveLength(0);
    commands[0].execute(); check();
  });
  it('supports active/selected fallback for track-level automation and errors with no region selection', async () => {
    expect((await call('volume', 1, 100, {})).success).toBe(false);
    selected.push(region('selected', 0, 10));
    expect((await call('volume', 1, 100, {})).success).toBe(true);
    expect(track.getRegions()[0].getLengthTicks()).toBe(10);
    expect(track.getAutomationPoints('volume')[0].getTick()).toBe(100);
  });
  it('uses active region before selected region and selected fallback for region events', async () => {
    const first = region('first', 0, 100);
    const active = region('active', 0, 100);
    selected.push(first);
    state.activeRegionId = active.getId();
    await call('cc1', 1, 10, {});
    expect(active.getControllerEvents(1)).toHaveLength(1);
    expect(first.getControllerEvents(1)).toHaveLength(0);
    state.activeRegionId = null;
    await call('cc1', 2, 10, {});
    expect(first.getControllerEvents(1)[0].getValue()).toBe(2);
  });
  it('honors numeric ID precedence, exact first MIDI name matching and non-MIDI rejection', async () => {
    const duplicate = new KGMidiTrack('Lead', 2);
    const audio = new KGAudioTrack('Lead', 3);
    project.setTracks([audio, track, duplicate]);
    await call('pan', 1, 0, { track_id: 2, track_name: 'Lead' });
    expect(duplicate.getAutomationPoints('pan')).toHaveLength(1);
    expect(track.getAutomationPoints('pan')).toHaveLength(0);
    await call('pan', 0.5, 0, { track_name: 'Lead' });
    expect(track.getAutomationPoints('pan')[0].getValue()).toBe(0.5);
    for (const target of [{ track_id: 'missing', track_name: 'Lead' }, { track_id: '3' }, { track_name: 'lead' }]) {
      expect((await call('pan', 0, 0, target)).success).toBe(false);
    }
    expect(commands).toHaveLength(2);
  });
  it('preserves other track points and lanes when updating a point', async () => {
    await call('volume', -10, 0);
    await call('volume', -20, 100);
    await call('pan', 0.5, 100);
    await call('volume', -30, 100);
    expect(track.getAutomationPoints('volume').map(p => [p.getTick(), p.getValue()])).toEqual([[0, -10], [100, -30]]);
    expect(track.getAutomationPoints('pan').map(p => [p.getTick(), p.getValue()])).toEqual([[100, 0.5]]);
    commands[3].undo();
    expect(track.getAutomationPoints('volume').map(p => [p.getTick(), p.getValue()])).toEqual([[0, -10], [100, -20]]);
  });
  it.each([false, true])('rolls back region preparation on event creation failure (existing=%s)', async existing => {
    const target = existing ? region('active', 100, 100) : null;
    if (target) state.activeRegionId = target.getId();
    vi.spyOn(CreateMidiEventsCommand.prototype, 'execute').mockImplementation(() => { throw new Error('event creation failed'); });
    const result = await call('cc1', 20, 10, existing ? {} : { track_id: '1' });
    expect(result.success).toBe(false);
    expect(commands).toHaveLength(0);
    if (target) {
      expect([target.getStartTick(), target.getLengthTicks()]).toEqual([100, 100]);
      expect(target.getControllerEvents(1)).toHaveLength(0);
    } else expect(track.getRegions()).toHaveLength(0);
  });
  it('registers the native tick tool and describes signed bend and binary sustain', () => {
    expect(createToolInstance(tool.name, 'advanced')).toBeInstanceOf(UpdateTrackAutomationTool);
    expect(tool.isReadOnlyTool()).toBe(false);
    expect(tool.isAvailableInAdvancedMode()).toBe(true);
    expect(tool.isAvailableInRegularMode()).toBe(false);
    expect(tool.isAvailableInEfficientMode()).toBe(false);
    expect(tool.getDefinition().function.parameters.required).toEqual(['automation_type', 'position', 'value']);
    expect(tool.parameters.value.description).toContain('[-8192, 8191]');
    expect(tool.parameters.value.description).toContain('cc64 exactly 0 (off) or 127 (on)');
    expect(tool.buildConfirmationContent({ track_id: '1', automation_type: 'pitch_bend', position: 123, value: -20 })).toContain('**-20** at tick **123**');
  });
});
