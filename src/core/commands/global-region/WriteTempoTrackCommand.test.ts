import { beforeEach, describe, expect, it, vi } from 'vitest';
import { KGCore } from '../../KGCore';
import { KGProject } from '../../KGProject';
import { GlobalTrackType } from '../../global-track';
import { KGAudioRegion } from '../../region/KGAudioRegion';
import { KGTempoRegion } from '../../region/KGTempoRegion';
import { KGAudioTrack } from '../../track/KGAudioTrack';
import { WriteTempoTrackCommand } from './WriteTempoTrackCommand';

describe('WriteTempoTrackCommand', () => {
  beforeEach(() => {
    const project = new KGProject('Tempo', 8, 0, 120);
    const mockCore = KGCore.instance() as unknown as {
      getCurrentProject: ReturnType<typeof vi.fn>;
    };

    mockCore.getCurrentProject.mockReturnValue(project);
  });

  const getTempoTrack = () => {
    const tempoTrack = KGCore.instance().getCurrentProject().getGlobalTracks()
      .find(track => track.getType() === GlobalTrackType.Tempo);

    if (!tempoTrack) {
      throw new Error('Tempo track missing in test setup');
    }

    return tempoTrack;
  };

  it('writes base BPM only by clearing explicit tempo regions and updating project BPM', () => {
    const tempoTrack = getTempoTrack();
    tempoTrack.setRegions([
      new KGTempoRegion('existing-1', tempoTrack.getId(), tempoTrack.getTrackIndex(), 120, 0, 3, 4),
      new KGTempoRegion('existing-2', tempoTrack.getId(), tempoTrack.getTrackIndex(), 140, 3, 5, 4),
    ]);

    const command = new WriteTempoTrackCommand(96, []);
    command.execute();

    expect(KGCore.instance().getCurrentProject().getBpm()).toBe(96);
    expect(tempoTrack.getRegions()).toEqual([]);
  });

  it('rebuilds explicit tempo regions into a gapless full-song plan', () => {
    const command = new WriteTempoTrackCommand(100, [
      { startBeat: 8, bpm: 120 },
      { startBeat: 16, bpm: 140 },
    ]);
    command.execute();

    const project = KGCore.instance().getCurrentProject();
    const regions = getTempoTrack().getRegions() as KGTempoRegion[];

    expect(project.getBpm()).toBe(100);
    expect(regions.map(region => ({
      bpm: region.getBpm(),
      startBar: region.getStartBar(),
      lengthBars: region.getLengthBars(),
    }))).toEqual([
      { bpm: 100, startBar: 0, lengthBars: 2 },
      { bpm: 120, startBar: 2, lengthBars: 2 },
      { bpm: 140, startBar: 4, lengthBars: 4 },
    ]);
  });

  it('restores both project BPM and prior tempo regions on undo', () => {
    const project = KGCore.instance().getCurrentProject();
    const tempoTrack = getTempoTrack();
    tempoTrack.setRegions([
      new KGTempoRegion('existing-1', tempoTrack.getId(), tempoTrack.getTrackIndex(), 120, 0, 2, 4),
      new KGTempoRegion('existing-2', tempoTrack.getId(), tempoTrack.getTrackIndex(), 128, 2, 6, 4),
    ]);

    const command = new WriteTempoTrackCommand(88, [
      { startBeat: 12, bpm: 144 },
    ]);
    command.execute();

    expect(project.getBpm()).toBe(88);
    expect((tempoTrack.getRegions() as KGTempoRegion[]).map(region => region.getBpm())).toEqual([88, 144]);

    command.undo();

    expect(project.getBpm()).toBe(120);
    expect((tempoTrack.getRegions() as KGTempoRegion[]).map(region => ({
      bpm: region.getBpm(),
      startBar: region.getStartBar(),
      lengthBars: region.getLengthBars(),
    }))).toEqual([
      { bpm: 120, startBar: 0, lengthBars: 2 },
      { bpm: 128, startBar: 2, lengthBars: 6 },
    ]);
  });

  it('expands max bars when the rebuilt tempo map makes audio overflow', () => {
    const project = KGCore.instance().getCurrentProject();
    const audioTrack = new KGAudioTrack('Audio', 1);
    audioTrack.setRegions([
      new KGAudioRegion('audio', '1', 0, 'Audio', 28, 4, 'file', 'file.wav', 8, 0),
    ]);
    project.setTracks([audioTrack]);

    const command = new WriteTempoTrackCommand(60, []);
    command.execute();

    expect(project.getBpm()).toBe(60);
    expect(project.getMaxBars()).toBe(9);
    expect((audioTrack.getRegions()[0] as KGAudioRegion).getLength()).toBeCloseTo(8);

    command.undo();

    expect(project.getBpm()).toBe(120);
    expect(project.getMaxBars()).toBe(8);
    expect((audioTrack.getRegions()[0] as KGAudioRegion).getLength()).toBeCloseTo(4);
  });
});
