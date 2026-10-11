import { describe, expect, it, vi } from 'vitest';
import type * as Tone from 'tone';
import { ImportStemsCommand } from './ImportStemsCommand';
import { KGCore } from '../../KGCore';
import { KGProject } from '../../KGProject';
import { KGAudioTrack } from '../../track/KGAudioTrack';
import { KGAudioInterface } from '../../audio-interface/KGAudioInterface';

describe('stem track defaults', () => {
  it('applies independent default FX before bus creation and restores them on redo', async () => {
    const project = new KGProject('Stems'); const source = new KGAudioTrack('Source', 1); project.setTracks([source]);
    vi.spyOn(KGCore, 'instance').mockReturnValue({ getCurrentProject: () => project } as unknown as KGCore);
    const create = vi.fn(async (id: string) => {
      expect(project.getTracks().find(track => track.getId().toString() === id)?.getFX().map(effect => effect.getType())).toEqual(['eq', 'reverb']);
    });
    vi.spyOn(KGAudioInterface, 'instance').mockReturnValue({ createTrackAudioPlayerBus: create, loadAudioBufferForTrack: vi.fn(), removeTrackAudioPlayerBus: vi.fn() } as unknown as KGAudioInterface);
    try {
      const command = new ImportStemsCommand(1, 0, 0, ['Vocals', 'Drums'].map(name => ({ trackName: name, regionName: name, audioFileId: name, audioFileName: `${name}.wav`, audioDurationSeconds: 2, toneBuffer: {} as Tone.ToneAudioBuffer })), project.getMaxBars());
      command.execute(); await Promise.resolve();
      expect(source.getFX()).toEqual([]);
      const tracks = project.getTracks().slice(1);
      expect(tracks).toHaveLength(2);
      expect(new Set(tracks.flatMap(track => track.getFX().map(effect => effect.getId()))).size).toBe(4);
      tracks[0].getFX()[1].setEnabled(false); expect(tracks[1].getFX()[1].getEnabled()).toBe(true);
      command.undo(); expect(project.getTracks()).toEqual([source]);
      command.execute(); await Promise.resolve(); expect(create).toHaveBeenCalledTimes(4);
    } finally { vi.restoreAllMocks(); }
  });
});
