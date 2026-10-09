import { beforeEach, describe, expect, it, vi } from 'vitest';
import { KGCore } from '../../core/KGCore';
import { KGProject } from '../../core/KGProject';
import { KGMidiTrack } from '../../core/track/KGMidiTrack';
import { KGAudioTrack } from '../../core/track/KGAudioTrack';
import { KGTrackAutomationPoint } from '../../core/track/KGTrackAutomationPoint';
import { KGAudioInterface } from '../../core/audio-interface/KGAudioInterface';
import type { KGCommand } from '../../core/commands/KGCommand';
import { createToolInstance } from './index';

vi.mock('../../stores/projectStore', () => ({ useProjectStore: { getState: () => ({ selectedTrackId: '1' }) } }));

describe.each([
  { setting: 'volume', min: -60, max: 12, sample: -6.25 },
  { setting: 'pan', min: -1, max: 1, sample: 0.25 },
] as const)('update_track_$setting', ({ setting, min, max, sample }) => {
  let track: KGMidiTrack;
  let other: KGMidiTrack;
  let project: KGProject;
  const audio = { setTrackVolume: vi.fn(), setTrackPan: vi.fn() };
  const executeCommand = vi.fn(async (command: KGCommand) => { command.execute(); });
  const tool = createToolInstance(`update_track_${setting}`)!;
  const current = () => setting === 'volume' ? track.getVolume() : track.getPan();

  beforeEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
    track = new KGMidiTrack('Lead', 1);
    other = new KGMidiTrack('Bass', 2);
    track.setVolumeAutomation([new KGTrackAutomationPoint('vol', 0, -12)]);
    track.setPanAutomation([new KGTrackAutomationPoint('pan', 0, -0.5)]);
    project = new KGProject('Mix');
    project.setTracks([track, other, new KGAudioTrack('Audio', 3)]);
    vi.spyOn(KGCore, 'instance').mockReturnValue({ getCurrentProject: () => project, executeCommand } as unknown as KGCore);
    vi.spyOn(KGAudioInterface, 'instance').mockReturnValue(audio as unknown as KGAudioInterface);
  });

  it.each([min, max, sample])('sets numeric value %s with audio updates and undo/redo, preserving automation', async value => {
    const original = current();
    const volume = track.getVolume();
    const pan = track.getPan();
    const result = await tool.execute({ track_id: '1', value });
    expect(result.success).toBe(true);
    expect(result.result).toContain(`track_id: 1\ntrack_name: Lead\nvalue: ${value}`);
    expect(current()).toBe(value);
    const setter = setting === 'volume' ? audio.setTrackVolume : audio.setTrackPan;
    expect(setter).toHaveBeenLastCalledWith('1', value);
    const command = executeCommand.mock.calls[0][0];
    command.undo();
    expect(current()).toBe(original);
    expect(setter).toHaveBeenLastCalledWith('1', original);
    command.execute();
    expect(current()).toBe(value);
    expect(setting === 'volume' ? track.getPan() : track.getVolume()).toBe(setting === 'volume' ? pan : volume);
    expect(track.getVolumeAutomation()[0].getValue()).toBe(-12);
    expect(track.getPanAutomation()[0].getValue()).toBe(-0.5);
    expect(track.getName()).toBe('Lead');
    expect(other.getPan()).toBe(0);
  });

  it('returns success without a command when unchanged', async () => {
    expect((await tool.execute({ track_id: '1', value: current() })).success).toBe(true);
    expect(executeCommand).not.toHaveBeenCalled();
  });

  it.each([undefined, null, '0', '-6 dB', NaN, Infinity, -Infinity, min - 0.01, max + 0.01, true])('rejects invalid value %s with an error and no mutation', async value => {
    const result = await tool.execute({ track_id: '1', value });
    expect(result.success).toBe(false);
    expect(result.result).toContain('value');
    expect(executeCommand).not.toHaveBeenCalled();
  });

  it('normalizes numeric IDs and prioritizes them over names', async () => {
    expect((await tool.execute({ track_id: 1, track_name: 'Bass', value: sample })).success).toBe(true);
    expect(current()).toBe(sample);
    expect(other.getPan()).toBe(0);
  });

  it('uses the first exact MIDI name match', async () => {
    other.setName('Lead');
    expect((await tool.execute({ track_name: 'Lead', value: sample })).success).toBe(true);
    expect(current()).toBe(sample);
    expect(executeCommand.mock.calls[0][0]).toMatchObject({ trackId: 1 });
  });

  it.each([{}, { track_id: '', track_name: '' }, { track_name: 'lead' }, { track_id: 'missing', track_name: 'Lead' }, { track_id: '3' }, { track_name: 'Audio' }])('rejects invalid targets %j', async target => {
    expect((await tool.execute({ ...target, value: sample })).success).toBe(false);
    expect(executeCommand).not.toHaveBeenCalled();
  });

  it('rejects global tracks by ID and name', async () => {
    for (const global of project.getGlobalTracks()) {
      for (const target of [{ track_id: global.getId() }, { track_name: global.getName() }]) {
        expect((await tool.execute({ ...target, value: sample })).success).toBe(false);
      }
    }
    expect(executeCommand).not.toHaveBeenCalled();
  });

  it('shares its three-argument schema in Regular/Advanced and excludes Efficient', () => {
    expect(createToolInstance(tool.name, 'advanced')!.getDefinition()).toEqual(tool.getDefinition());
    const schema = tool.getDefinition().function.parameters;
    expect(Object.keys(schema.properties)).toEqual(['track_id', 'track_name', 'value']);
    expect(schema.required).toEqual(['value']);
    expect(schema.properties.value).toMatchObject({ type: 'number', minimum: min, maximum: max });
    expect(tool.isReadOnlyTool()).toBe(false);
    expect(tool.isAvailableInRegularMode()).toBe(true);
    expect(tool.isAvailableInEfficientMode()).toBe(false);
    expect(tool.buildConfirmationContent({ track_id: 1, track_name: 'Bass', value: sample })).toContain('track ID **1**');
    expect(tool.buildConfirmationContent({ track_name: 'Lead', value: sample })).toContain('track **Lead**');
    expect(tool.buildConfirmationContent({ track_id: '1', value: max + 1 })).toBeUndefined();
  });
});
