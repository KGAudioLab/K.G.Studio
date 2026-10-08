import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AVAILABLE_TOOLS, createToolInstance } from './index';
import { AdvancedTickEditorTool } from './AdvancedTickEditorTool';
import { KGCore } from '../../core/KGCore';
import { KGProject } from '../../core/KGProject';
import { KGMidiTrack } from '../../core/track/KGMidiTrack';
import { KGMidiRegion } from '../../core/region/KGMidiRegion';
import { GlobalTrackType } from '../../core/global-track';
import { findGlobalTrackByType } from '../../util/globalTrackUtil';
import type { KGCommand } from '../../core/commands/KGCommand';

vi.mock('../../stores/projectStore', () => ({ useProjectStore: { getState: () => ({ activeRegionId: 'region', selectedRegionIds: [] }) } }));
beforeEach(() => vi.restoreAllMocks());

const cases = [
  ['add_notes', { notes: [{ pitch: 'C4', start: 960, length: 480, velocity: 91 }], track_id: '1' }, { notes: [{ pitch: 'C4', start: 1, length: 0.5, velocity: 91 }], track_id: '1' }],
  ['remove_notes', { start: 960, end: 1920 }, { start: 1, end: 2 }],
  ['write_chord_progression', { chords: [{ chord: 'C', start: 960, length: 480 }] }, { chords: [{ chord: 'C', start: 1, length: 0.5 }] }],
  ['remove_chord_progression', { start: 960, end: 960 }, { start: 1, end: 1 }],
  ['write_markers', { markers: [{ marker: 'Verse', start: 960, length: 480 }] }, { markers: [{ marker: 'Verse', beat: 1, length: 0.5 }] }],
  ['remove_markers', { start: 960, end: 1920 }, { start: 1, end: 2 }],
  ['write_bpm', { bpms: [{ bpm: 90, start: 4800 }, { bpm: 120 }] }, { bpms: [{ bpm: 90, beat: 5 }, { bpm: 120 }] }],
  ['remove_bpm', { start: 960, end: 1920 }, { start: 1, end: 2 }],
  ['write_key_signature', { key_signatures: [{ key_signature: 'A minor', start: 4800 }] }, { key_signatures: [{ key_signature: 'A minor', beat: 5 }] }],
  ['remove_key_signature', { start: 960, end: 1920 }, { start: 1, end: 2 }],
] as const;

describe('advanced tick editor adapters', () => {
  it('replaces exactly 16 tools and leaves untimed and native tick implementations unwrapped', () => {
    const shared = new Set(['update_todo_list', 'list_all_tracks', 'list_all_available_instruments', 'create_new_track', 'update_track', 'update_track_status', 'update_track_volume', 'update_track_pan', 'update_track_automation', 'delete_track']);
    let replacements = 0;
    for (const name of Object.keys(AVAILABLE_TOOLS)) {
      const regular = createToolInstance(name, 'regular')!;
      const efficient = createToolInstance(name, 'efficient')!;
      const advanced = createToolInstance(name, 'advanced')!;
      expect(efficient.constructor).toBe(regular.constructor);
      expect(advanced.name).toBe(regular.name);
      if (shared.has(name)) expect(advanced.constructor).toBe(regular.constructor);
      else {
        expect(advanced.constructor).not.toBe(regular.constructor);
        replacements++;
      }
    }
    expect(replacements).toBe(16);
    expect(createToolInstance('toString', 'advanced')).toBeNull();
  });

  it.each(cases)('converts %s exactly once for execution, approval and summaries', async (name, args, converted) => {
    const legacy = new AVAILABLE_TOOLS[name]();
    const execute = vi.spyOn(legacy, 'execute').mockResolvedValue({ success: true, result: 'ok' });
    const confirmation = vi.spyOn(legacy, 'buildConfirmationContent').mockReturnValue('Allow?');
    const display = vi.spyOn(legacy, 'buildToolResultDisplayContent').mockReturnValue('Done.');
    const history = vi.spyOn(legacy, 'buildToolHistoryContent').mockReturnValue('History.');
    const tool = new AdvancedTickEditorTool(legacy);
    const input = structuredClone(args);
    expect(await tool.execute(input)).toEqual({ success: true, result: 'ok' });
    expect(execute).toHaveBeenCalledWith(converted);
    expect(tool.buildConfirmationContent(input)).toBe('Allow?');
    expect(confirmation).toHaveBeenCalledWith(converted);
    expect(tool.buildToolResultDisplayContent(input, { success: true, result: 'ok' })).toBe('Done.');
    expect(display).toHaveBeenCalledWith(converted, { success: true, result: 'ok' });
    expect(tool.buildToolHistoryContent(input, { success: true, result: 'ok' })).toBe('History.');
    expect(history).toHaveBeenCalledWith(converted, { success: true, result: 'ok' });
    expect(input).toEqual(args);
    expect(tool.isReadOnlyTool()).toBe(false);
    expect(tool.isAvailableInEfficientMode()).toBe(legacy.isAvailableInEfficientMode());
    expect(JSON.stringify(tool.parameters)).not.toContain('"beat":');
  });

  it.each([0.5, -1, NaN, Infinity, '960', null])('rejects invalid tick %s before editing', async start => {
    const tool = createToolInstance('add_notes', 'advanced')!;
    expect((await tool.execute({ notes: [{ pitch: 'C4', start, length: 960 }] })).success).toBe(false);
  });

  it.each([0, -1, 0.5])('rejects invalid duration %s', async length => {
    expect((await createToolInstance('write_chord_progression', 'advanced')!.execute({ chords: [{ chord: 'C', start: 0, length }] })).success).toBe(false);
  });

  it('preserves optional global defaults and rejects legacy beat fields', async () => {
    const legacy = new AVAILABLE_TOOLS.write_bpm();
    const execute = vi.spyOn(legacy, 'execute').mockResolvedValue({ success: true, result: 'ok' });
    const tool = new AdvancedTickEditorTool(legacy);
    await tool.execute({ bpms: [{ bpm: 120, start: null }, { bpm: 90, start: '' }] });
    expect(execute).toHaveBeenCalledWith({ bpms: [{ bpm: 120, beat: null }, { bpm: 90, beat: '' }] });
    execute.mockClear();
    expect((await tool.execute({ bpms: [{ bpm: 90, beat: 1 }] })).success).toBe(false);
    expect(execute).not.toHaveBeenCalled();
  });

  it('preserves actual note timing, removal boundaries, approvals, and undo', async () => {
    const project = new KGProject('edit', 8, 0, 120, { numerator: 4, denominator: 4 }, 'C major');
    const track = new KGMidiTrack('Melody', 1);
    const region = new KGMidiRegion('region', '1', 0, 'Verse', 0, 7680);
    track.addRegion(region);
    project.setTracks([track]);
    const commands: KGCommand[] = [];
    vi.spyOn(KGCore, 'instance').mockReturnValue({ getCurrentProject: () => project, getSelectedItems: () => [],
      executeCommand: async (command: KGCommand) => { await command.execute(); commands.push(command); },
    } as unknown as KGCore);
    const add = createToolInstance('add_notes', 'advanced')!;
    const args = { track_id: '1', notes: [{ pitch: 'C4', start: 963, length: 481, velocity: 91 }, { pitch: 'E4', start: 1920, length: 960 }] };
    expect(add.buildConfirmationContent(args)).toContain('bar');
    expect((await add.execute(args)).success).toBe(true);
    expect(region.getNotes()[0].getStartTick()).toBe(963);
    expect(region.getNotes()[0].getEndTick()).toBe(1444);
    expect(region.getNotes()[0].getVelocity()).toBe(91);
    expect((await createToolInstance('remove_notes', 'advanced')!.execute({ track_id: '1', start: 963, end: 1920 })).success).toBe(true);
    expect(region.getNotes().map(note => note.getStartTick())).toEqual([1920]);
    await commands.pop()!.undo();
    expect(region.getNotes()).toHaveLength(2);
    await commands.pop()!.undo();
    expect(region.getNotes()).toHaveLength(0);
  });

  it('preserves tempo/key alignment and chord/marker removal boundaries', async () => {
    const project = new KGProject('global-edit', 8, 0, 120, { numerator: 4, denominator: 4 }, 'C major');
    vi.spyOn(KGCore, 'instance').mockReturnValue({ getCurrentProject: () => project, getSelectedItems: () => [], executeCommand: (command: KGCommand) => command.execute() } as unknown as KGCore);
    const run = (name: string, args: Record<string, unknown>) => createToolInstance(name, 'advanced')!.execute(args);
    expect((await run('write_bpm', { bpms: [{ bpm: 120 }, { bpm: 90, start: 4800 }] })).success).toBe(true);
    expect(findGlobalTrackByType(project, GlobalTrackType.Tempo)!.getRegions().map(r => r.getStartTick())).toEqual([0, 3840]);
    expect((await run('write_key_signature', { key_signatures: [{ key_signature: 'C major' }, { key_signature: 'A minor', start: 4800 }] })).success).toBe(true);
    expect(findGlobalTrackByType(project, GlobalTrackType.Signature)!.getRegions().map(r => r.getStartTick())).toEqual([0, 3840]);
    for (const [write, remove, field, item, type] of [
      ['write_chord_progression', 'remove_chord_progression', 'chords', { chord: 'Dm' }, GlobalTrackType.Chord],
      ['write_markers', 'remove_markers', 'markers', { marker: 'Verse' }, GlobalTrackType.Marker],
    ] as const) {
      expect((await run(write, { [field]: [{ ...item, start: 960, length: 480 }, { ...item, start: 1920, length: 480 }] })).success).toBe(true);
      expect((await run(remove, { start: 960, end: 1920 })).success).toBe(true);
      expect(findGlobalTrackByType(project, type)!.getRegions().map(r => r.getStartTick())).toEqual([1920]);
      expect((await run(remove, { start: 1920, end: 1920 })).success).toBe(true);
      expect(findGlobalTrackByType(project, type)!.getRegions()).toHaveLength(0);
    }
  });
});
