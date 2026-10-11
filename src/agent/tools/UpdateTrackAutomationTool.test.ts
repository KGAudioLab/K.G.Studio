import { beforeEach, describe, expect, it, vi } from 'vitest';
import { UpdateTrackAutomationTool } from './UpdateTrackAutomationTool';
import { createToolInstance } from './index';
import { KGCore } from '../../core/KGCore';
import { KGProject } from '../../core/KGProject';
import { CreateRegionCommand } from '../../core/commands/region/CreateRegionCommand';
import { ResizeRegionCommand } from '../../core/commands/region/ResizeRegionCommand';
import { CreateMidiEventsCommand } from '../../core/commands/note/CreateMidiEventsCommand';
import { CreateTrackAutomationPointsCommand } from '../../core/commands/track/CreateTrackAutomationPointsCommand';
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
  return tool.execute({ ...target, automation_type: type, keypoints: [{ position, value }] });
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
    expect((await tool.execute({ track_id: '1', automation_type: 'cc1', keypoints: [{ value: 1, position }] })).success).toBe(false);
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
    expect(result.result).toContain(`"value":${value}`);
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
  function bulk(type: string, keypoints: unknown, target: Record<string, unknown> = { track_id: '1' }) {
    return tool.execute({ ...target, automation_type: type, keypoints });
  }

  function snapshot(type: string) {
    return type === 'volume' || type === 'pan'
      ? track.getAutomationPoints(type).map(point => [point.getId(), point.getTick(), point.getValue()])
      : track.getRegions().flatMap(candidate => {
        const target = candidate as KGMidiRegion;
        const events = type === 'pitch_bend' ? target.getPitchBends() : target.getControllerEvents(Number(type.slice(2)));
        return events.map(point => [target.getId(), point.getId(), target.getStartTick() + point.getTick(), point.getValue()]);
      });
  }

  it.each(ranges)('bulk upserts %s with one undo, stable redo IDs, and unchanged no-op', async (type, min, max) => {
    await bulk(type, [{ position: 100, value: min }, { position: 110, value: min }]);
    const before = snapshot(type);
    expect(commands).toHaveLength(1);
    await bulk(type, [{ position: 120, value: max }, { position: 110, value: max }, { position: 100, value: min }]);
    const after = snapshot(type);
    expect(after).toHaveLength(3);
    expect(commands).toHaveLength(2);
    commands[1].undo();
    expect(snapshot(type)).toEqual(before);
    commands[1].execute();
    expect(snapshot(type)).toEqual(after);
    await bulk(type, [{ position: 100, value: min }, { position: 110, value: max }, { position: 120, value: max }]);
    expect(commands).toHaveLength(2);
    commands[1].undo(); commands[0].undo();
    expect(snapshot(type)).toEqual([]);
    expect(track.getRegions()).toHaveLength(0);
  });

  it.each([undefined, null, {}, [], [null], [1], [[]], [{}], [{ position: 0 }], [{ value: 0 }], [{ position: 0, value: '0' }]])('rejects malformed/empty keypoints %j before editing', async input => {
    expect((await bulk('cc1', input)).success).toBe(false);
    expect(commands).toHaveLength(0);
    expect(track.getRegions()).toHaveLength(0);
  });

  it('rejects legacy calls and validates invalid overwritten entries before any edit', async () => {
    expect((await tool.execute({ track_id: '1', automation_type: 'cc1', position: 0, value: 0 })).success).toBe(false);
    expect((await bulk('cc1', [{ position: 10, value: 0 }, { position: 20, value: 128 }, { position: 20, value: 10 }])).success).toBe(false);
    expect((await bulk('cc1', [{ position: 10, value: 0 }, { position: -1, value: 10 }])).success).toBe(false);
    expect(commands).toHaveLength(0);
    expect(track.getRegions()).toHaveLength(0);
  });

  it('uses last values at duplicate positions and resolves regions in ascending order', async () => {
    await bulk('cc1', [{ position: 1000, value: 1 }, { position: 100, value: 2 }, { position: 1000, value: 3 }]);
    const target = track.getRegions()[0] as KGMidiRegion;
    expect(track.getRegions()).toHaveLength(1);
    expect(target.getStartTick()).toBe(100);
    expect(target.getControllerEvents(1).map(point => [point.getTick(), point.getValue()])).toEqual([[0, 2], [900, 3]]);
    const after = snapshot('cc1');
    commands[0].undo(); commands[0].execute();
    expect(snapshot('cc1')).toEqual(after);
  });

  it('resolves multiple existing/new regions per position and undoes all edits together', async () => {
    const first = region('first', 100, 100);
    const second = region('second', 500, 100);
    await bulk('pitch_bend', [{ position: 10000, value: -100 }, { position: 550, value: 100 }, { position: 150, value: 0 }]);
    expect(first.getPitchBends()[0].getTick()).toBe(50);
    expect(second.getPitchBends()[0].getTick()).toBe(50);
    expect(track.getRegions()).toHaveLength(3);
    const after = snapshot('pitch_bend');
    commands[0].undo();
    expect(track.getRegions()).toEqual([first, second]);
    expect(snapshot('pitch_bend')).toEqual([]);
    commands[0].execute();
    expect(snapshot('pitch_bend')).toEqual(after);
  });

  it('expands the selected region on both ends and preserves absolute unrelated content', async () => {
    const target = region('selected', 100, 100);
    target.addNote(new KGMidiNote('note', 20, 40, 60, 100));
    target.addPitchBend(new KGMidiPitchBend('bend', 30, 8192));
    target.addControllerEvent(2, new KGMidiControllerEvent('cc', 40, 70));
    selected.push(target);
    await bulk('cc1', [{ position: 250, value: 2 }, { position: 10, value: 1 }], {});
    expect([target.getStartTick(), target.getLengthTicks()]).toEqual([10, 241]);
    expect(target.getNotes()[0].getStartTick() + target.getStartTick()).toBe(120);
    expect(target.getPitchBends()[0].getTick() + target.getStartTick()).toBe(130);
    expect(target.getControllerEvents(2)[0].getTick() + target.getStartTick()).toBe(140);
    const after = snapshot('cc1');
    commands[0].undo();
    expect([target.getStartTick(), target.getLengthTicks()]).toEqual([100, 100]);
    expect(target.getNotes()[0].getStartTick()).toBe(20);
    commands[0].execute();
    expect(snapshot('cc1')).toEqual(after);
  });

  it.each([false, true])('rolls back earlier edits and partially executed later region edits (existing=%s)', async existing => {
    const target = existing ? region('active', 100, 100) : null;
    if (target) {
      state.activeRegionId = target.getId();
      target.addControllerEvent(2, new KGMidiControllerEvent('other', 20, 55));
    }
    const original = CreateMidiEventsCommand.prototype.execute;
    let executions = 0;
    vi.spyOn(CreateMidiEventsCommand.prototype, 'execute').mockImplementation(function (this: CreateMidiEventsCommand) {
      original.call(this);
      if (++executions === 2) throw new Error('later creation failed');
    });
    const result = await bulk('cc1', [{ position: 10, value: 1 }, { position: 10000, value: 2 }], existing ? {} : { track_id: '1' });
    expect(result.success).toBe(false);
    expect(result.result).toContain('later creation failed');
    expect(commands).toHaveLength(0);
    expect(snapshot('cc1')).toEqual([]);
    if (target) {
      expect([target.getStartTick(), target.getLengthTicks()]).toEqual([100, 100]);
      expect(target.getControllerEvents(2).map(point => [point.getTick(), point.getValue()])).toEqual([[20, 55]]);
    } else expect(track.getRegions()).toHaveLength(0);
  });

  it('rolls back a region creation that mutates then throws', async () => {
    const original = CreateRegionCommand.prototype.execute;
    vi.spyOn(CreateRegionCommand.prototype, 'execute').mockImplementation(function (this: CreateRegionCommand) {
      original.call(this);
      throw new Error('region creation failed');
    });
    expect((await bulk('cc1', [{ position: 10, value: 1 }])).success).toBe(false);
    expect(track.getRegions()).toHaveLength(0);
    expect(commands).toHaveLength(0);
  });

  it('rolls back earlier edits and a later region resize that mutates then throws', async () => {
    const target = region('active', 100, 100);
    target.addNote(new KGMidiNote('note', 20, 40, 60, 100));
    state.activeRegionId = target.getId();
    const original = ResizeRegionCommand.prototype.execute;
    let executions = 0;
    vi.spyOn(ResizeRegionCommand.prototype, 'execute').mockImplementation(function (this: ResizeRegionCommand) {
      original.call(this);
      if (++executions === 2) throw new Error('region resize failed');
    });
    expect((await bulk('cc1', [{ position: 10, value: 1 }, { position: 250, value: 2 }], {})).success).toBe(false);
    expect([target.getStartTick(), target.getLengthTicks()]).toEqual([100, 100]);
    expect(target.getNotes()[0].getStartTick()).toBe(20);
    expect(snapshot('cc1')).toEqual([]);
    expect(commands).toHaveLength(0);
  });

  it('restores the entire track lane after a later command mutates then throws', async () => {
    await call('pan', 0.25, 0);
    const before = snapshot('pan');
    const original = CreateTrackAutomationPointsCommand.prototype.execute;
    let executions = 0;
    vi.spyOn(CreateTrackAutomationPointsCommand.prototype, 'execute').mockImplementation(function (this: CreateTrackAutomationPointsCommand) {
      original.call(this);
      if (++executions === 2) throw new Error('later track creation failed');
    });
    expect((await bulk('pan', [{ position: 0, value: 0.5 }, { position: 10, value: 0.5 }, { position: 20, value: 0.5 }])).success).toBe(false);
    expect(snapshot('pan')).toEqual(before);
    expect(commands).toHaveLength(1);
  });

  it('passes error propagation to real command history and preserves history on failure/no-op', async () => {
    const { KGCommandHistory } = await import('../../core/commands/KGCommandHistory');
    const history = KGCommandHistory.instance();
    history.clear();
    const core = KGCore.instance();
    const execute = vi.spyOn(core, 'executeCommand').mockImplementation((command, options) => history.executeCommand(command, options));
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      await bulk('pan', [{ position: 0, value: 0.5 }, { position: 10, value: -0.5 }]);
      expect(execute).toHaveBeenLastCalledWith(expect.any(KGCommand), { rethrow: true });
      expect(history.undo()).toBe(true);
      expect(history.canUndo()).toBe(false);
      expect(history.redo()).toBe(true);
      await bulk('pan', [{ position: 0, value: 0.5 }, { position: 10, value: -0.5 }]);
      expect(execute).toHaveBeenCalledTimes(1);
      vi.spyOn(CreateTrackAutomationPointsCommand.prototype, 'execute').mockImplementation(() => { throw new Error('history failure'); });
      expect((await bulk('pan', [{ position: 20, value: 0 }])).success).toBe(false);
      expect(history.undo()).toBe(true);
      expect(history.canUndo()).toBe(false);
    } finally {
      history.clear();
      log.mockRestore();
    }
  });

  it('exports the nested required keypoint schema and summarizes batch confirmation/results', async () => {
    const schema = tool.getDefinition().function.parameters;
    expect(schema.properties).not.toHaveProperty('position');
    expect(schema.properties).not.toHaveProperty('value');
    expect(schema.properties.keypoints).toMatchObject({ type: 'array', items: { type: 'object', required: ['position', 'value'], properties: { position: { type: 'number', minimum: 0 }, value: { type: 'number' } } } });
    const args = { track_id: '1', automation_type: 'pan', keypoints: [{ position: 20, value: 0 }, { position: 10, value: 1 }] };
    expect(tool.buildConfirmationContent(args)).toContain('**2 pan automation keypoints**');
    expect(tool.buildConfirmationContent(args)).toContain('**[10, 20]**');
    expect(tool.buildConfirmationContent(args)).toContain('**Lead**');
    expect((await tool.execute(args)).result).toContain('keypoint_count=2, tick_range=[10, 20]');
    expect(tool.buildConfirmationContent({ ...args, keypoints: [] })).toBeUndefined();
  });

  it('shows a compact UI summary with unique keypoint counts, readable lane names, and no-op status', async () => {
    const args = { track_id: '1', automation_type: 'cc64', keypoints: [{ position: 10, value: 0 }, { position: 20, value: 127 }, { position: 10, value: 127 }] };
    const result = await tool.execute(args);
    expect(tool.buildToolResultDisplayContent(args, result)).toBe('Updated 2 sustain keypoints on track **Lead**.');
    expect(result.result).toContain('keypoints=');
    expect(tool.buildToolResultDisplayContent(args, await tool.execute(args))).toBe('The automation already matches on track **Lead**; no changes applied.');
    const single = { track_id: '1', automation_type: 'pitch_bend', keypoints: [{ position: 10, value: 1 }] };
    expect(tool.buildToolResultDisplayContent(single, await tool.execute(single))).toBe('Updated 1 pitch bend keypoint on track **Lead**.');
    expect(tool.buildToolResultDisplayContent(args, { success: false, result: 'failure' })).toBeUndefined();
    expect(tool.buildToolResultDisplayContent(null, result)).toBeUndefined();
  });

  it('registers the native tick tool and describes signed bend and binary sustain', () => {
    expect(createToolInstance(tool.name, 'advanced')).toBeInstanceOf(UpdateTrackAutomationTool);
    expect(tool.isReadOnlyTool()).toBe(false);
    expect(tool.isAvailableInAdvancedMode()).toBe(true);
    expect(tool.isAvailableInRegularMode()).toBe(false);
    expect(tool.isAvailableInEfficientMode()).toBe(false);
    expect(tool.getDefinition().function.parameters.required).toEqual(['automation_type', 'keypoints']);
    expect(tool.parameters.keypoints.items!.properties!.value.description).toContain('[-8192, 8191]');
    expect(tool.parameters.keypoints.items!.properties!.value.description).toContain('cc64 exactly 0 (off) or 127 (on)');
    expect(tool.buildConfirmationContent({ track_id: '1', automation_type: 'pitch_bend', keypoints: [{ position: 123, value: -20 }] })).toContain('**1 pitch_bend automation keypoints**');
  });
});
