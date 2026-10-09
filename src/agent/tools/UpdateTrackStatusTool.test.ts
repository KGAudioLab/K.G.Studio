import { beforeEach, describe, expect, it, vi } from 'vitest';
import { KGCore } from '../../core/KGCore';
import { KGProject } from '../../core/KGProject';
import { KGMidiTrack } from '../../core/track/KGMidiTrack';
import { KGAudioTrack } from '../../core/track/KGAudioTrack';
import { KGAudioInterface } from '../../core/audio-interface/KGAudioInterface';
import type { KGCommand } from '../../core/commands/KGCommand';
import { createToolInstance } from './index';
import { UpdateTrackStatusTool } from './UpdateTrackStatusTool';

vi.mock('../../stores/projectStore', () => ({
  useProjectStore: { getState: () => ({ selectedTrackId: '1', selectedRegionIds: [] }) },
}));

describe('UpdateTrackStatusTool', () => {
  let track: KGMidiTrack;
  let other: KGMidiTrack;
  let project: KGProject;
  const audio = { setTrackMute: vi.fn(), setTrackSolo: vi.fn() };
  const executeCommand = vi.fn(async (command: KGCommand) => { command.execute(); });
  const tool = new UpdateTrackStatusTool();

  beforeEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
    track = new KGMidiTrack('Lead', 1, 'trumpet');
    other = new KGMidiTrack('Bass', 2, 'acoustic_bass');
    project = new KGProject('Track status');
    project.setTracks([track, other, new KGAudioTrack('Audio', 3)]);
    vi.spyOn(KGCore, 'instance').mockReturnValue({
      getCurrentProject: () => project, executeCommand,
    } as unknown as KGCore);
    vi.spyOn(KGAudioInterface, 'instance').mockReturnValue(audio as unknown as KGAudioInterface);
  });

  it.each(['mute', 'solo'] as const)('sets %s on/off with audio updates and undo/redo', async status => {
    const getValue = () => status === 'mute' ? track.getMuted() : track.getSolo();
    const setter = status === 'mute' ? audio.setTrackMute : audio.setTrackSolo;
    for (const value of [true, false]) {
      const result = await tool.execute({ track_id: '1', status_type: status, value });
      expect(result.success).toBe(true);
      expect(result.result).toContain(`status_type: ${status}\nvalue: ${value}`);
      expect(getValue()).toBe(value);
      expect(setter).toHaveBeenLastCalledWith('1', value);
      const command = executeCommand.mock.calls.at(-1)![0];
      command.undo();
      expect(getValue()).toBe(!value);
      expect(setter).toHaveBeenLastCalledWith('1', !value);
      command.execute();
      expect(getValue()).toBe(value);
      expect(status === 'mute' ? track.getSolo() : track.getMuted()).toBe(false);
      expect(track.getName()).toBe('Lead');
      expect(track.getInstrument()).toBe('trumpet');
      expect(other.getMuted()).toBe(false);
      expect(other.getSolo()).toBe(false);
    }
  });

  it.each(['mute', 'solo'])('succeeds without a command when %s already matches', async status => {
    for (const value of [false, true]) {
      if (status === 'mute') track.setMuted(value);
      else track.setSolo(value);
      expect((await tool.execute({ track_id: '1', status_type: status, value })).success).toBe(true);
    }
    expect(executeCommand).not.toHaveBeenCalled();
    expect(audio.setTrackMute).not.toHaveBeenCalled();
    expect(audio.setTrackSolo).not.toHaveBeenCalled();
  });

  it('normalizes numeric IDs and prefers IDs over names', async () => {
    expect((await tool.execute({ track_id: 1, track_name: 'Bass', status_type: 'mute', value: true })).success).toBe(true);
    expect(track.getMuted()).toBe(true);
    expect(other.getMuted()).toBe(false);
  });

  it('preserves an enabled solo flag when changing mute and vice versa', async () => {
    track.setSolo(true);
    await tool.execute({ track_id: '1', status_type: 'mute', value: true });
    expect(track.getSolo()).toBe(true);
    await tool.execute({ track_id: '1', status_type: 'solo', value: false });
    expect(track.getMuted()).toBe(true);
  });

  it('rejects actual global track identifiers and names', async () => {
    for (const globalTrack of project.getGlobalTracks()) {
      for (const target of [{ track_id: globalTrack.getId() }, { track_name: globalTrack.getName() }]) {
        expect((await tool.execute({ ...target, status_type: 'mute', value: true })).success).toBe(false);
      }
    }
    expect(executeCommand).not.toHaveBeenCalled();
  });

  it('uses the first exact matching MIDI name', async () => {
    other.setName('Lead');
    expect((await tool.execute({ track_name: 'Lead', status_type: 'solo', value: true })).success).toBe(true);
    expect(track.getSolo()).toBe(true);
    expect(other.getSolo()).toBe(false);
  });

  it.each([
    {}, { track_id: '', track_name: '' }, { track_id: '999', track_name: 'Lead' },
    { track_name: 'lead' }, { track_id: '3' }, { track_name: 'Audio' },
    { track_id: '-1' }, { track_id: 'global-tempo' },
  ])('rejects unresolved targets without mutation: %j', async target => {
    expect((await tool.execute({ ...target, status_type: 'mute', value: true })).success).toBe(false);
    expect(executeCommand).not.toHaveBeenCalled();
  });

  it.each([
    {}, { status_type: 'mute' }, { value: true },
    { status_type: 'volume', value: true }, { status_type: 1, value: true },
    { status_type: 'solo', value: 'true' }, { status_type: 'mute', value: 'false' },
    { status_type: 'mute', value: 0 }, { status_type: 'solo', value: null },
  ])('rejects invalid status arguments: %j', async args => {
    expect((await tool.execute({ track_id: '1', ...args })).success).toBe(false);
    expect(executeCommand).not.toHaveBeenCalled();
  });

  it('exposes the same four-parameter schema in Regular and Advanced', () => {
    const regular = createToolInstance('update_track_status', 'regular')!;
    const advanced = createToolInstance('update_track_status', 'advanced')!;
    expect(regular).toBeInstanceOf(UpdateTrackStatusTool);
    expect(advanced).toBeInstanceOf(UpdateTrackStatusTool);
    expect(advanced.getDefinition()).toEqual(regular.getDefinition());
    const schema = regular.getDefinition().function.parameters;
    expect(Object.keys(schema.properties)).toEqual(['track_id', 'track_name', 'status_type', 'value']);
    expect(schema.required).toEqual(['status_type', 'value']);
    expect(schema.properties.status_type).toMatchObject({ enum: ['solo', 'mute'] });
    expect(regular.isReadOnlyTool()).toBe(false);
    expect(regular.isAvailableInRegularMode()).toBe(true);
    expect(regular.isAvailableInEfficientMode()).toBe(false);
  });

  it('builds confirmation text for both identifiers and boolean values', () => {
    expect(tool.buildConfirmationContent({ track_id: 1, track_name: 'Bass', status_type: 'mute', value: false }))
      .toBe('Allow setting mute **off** on track ID **1**?');
    expect(tool.buildConfirmationContent({ track_name: 'Lead', status_type: 'solo', value: true }))
      .toBe('Allow setting solo **on** on track **Lead**?');
    expect(tool.buildConfirmationContent(null)).toBeUndefined();
    expect(tool.buildConfirmationContent({ status_type: 'solo', value: true })).toBeUndefined();
  });
});
