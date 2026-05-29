import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ImportChordRegionsCommand } from './ImportChordRegionsCommand';
import { createMockMidiTrack } from '../../../test/utils/mock-data';

const track = createMockMidiTrack({ id: 1, regions: [] });
track.setTrackIndex(0);

vi.mock('../../KGCore', () => ({
  KGCore: {
    instance: () => ({
      getCurrentProject: () => ({
        getTracks: () => [track],
      }),
    }),
  },
}));

describe('ImportChordRegionsCommand', () => {
  beforeEach(() => {
    track.setRegions([]);
  });

  it('creates one MIDI region with imported notes and supports undo', () => {
    const command = new ImportChordRegionsCommand(
      '1',
      0,
      8,
      6,
      [
        { startBeat: 0, endBeat: 4, pitch: 48, velocity: 127 },
        { startBeat: 0, endBeat: 4, pitch: 60, velocity: 127 },
        { startBeat: 4, endBeat: 6, pitch: 41, velocity: 127 },
        { startBeat: 4, endBeat: 6, pitch: 53, velocity: 127 },
      ],
      'Chord Progression',
      'imported-region',
    );

    command.execute();

    expect(track.getRegions()).toHaveLength(1);
    const region = command.getCreatedRegion();
    expect(region?.getId()).toBe('imported-region');
    expect(region?.getStartFromBeat()).toBe(8);
    expect(region?.getLength()).toBe(6);
    expect(region?.getNotes().map(note => ({
      startBeat: note.getStartBeat(),
      endBeat: note.getEndBeat(),
      pitch: note.getPitch(),
      velocity: note.getVelocity(),
    }))).toEqual([
      { startBeat: 0, endBeat: 4, pitch: 48, velocity: 127 },
      { startBeat: 0, endBeat: 4, pitch: 60, velocity: 127 },
      { startBeat: 4, endBeat: 6, pitch: 41, velocity: 127 },
      { startBeat: 4, endBeat: 6, pitch: 53, velocity: 127 },
    ]);

    command.undo();
    expect(track.getRegions()).toHaveLength(0);
  });
});
