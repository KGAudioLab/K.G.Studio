import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DeleteMidiEventsCommand } from './DeleteMidiEventsCommand';
import { KGCore } from '../../KGCore';
import { KGMidiNote } from '../../midi/KGMidiNote';
import { KGMidiPitchBend } from '../../midi/KGMidiPitchBend';
import { createMockMidiRegion, createMockMidiTrack, createMockProject } from '../../../test/utils/mock-data';

vi.mock('../../KGCore', () => ({
  KGCore: {
    instance: vi.fn()
  }
}));

interface MockCore {
  getCurrentProject: ReturnType<typeof vi.fn>;
  getSelectedItems: ReturnType<typeof vi.fn>;
  removeSelectedItem: ReturnType<typeof vi.fn>;
}

describe('DeleteMidiEventsCommand', () => {
  let mockCore: MockCore;
  let note: KGMidiNote;
  let pitchBend: KGMidiPitchBend;
  let region: ReturnType<typeof createMockMidiRegion>;

  beforeEach(() => {
    note = new KGMidiNote('note-1', 1, 2, 60, 100);
    pitchBend = new KGMidiPitchBend('bend-1', 1.5, 12288);

    region = createMockMidiRegion({
      id: 'region-1',
      trackId: 'track-1',
      trackIndex: 0,
      notes: [note],
      pitchBends: [pitchBend],
    });

    const track = createMockMidiTrack({
      id: 1,
      regions: [region],
    });

    const project = createMockProject({
      tracks: [track],
    });

    mockCore = {
      getCurrentProject: vi.fn().mockReturnValue(project),
      getSelectedItems: vi.fn(() => [note, pitchBend]),
      removeSelectedItem: vi.fn(),
    };

    vi.mocked(KGCore.instance).mockReturnValue(mockCore as unknown as KGCore);
  });

  it('deletes selected notes and pitch bends together', () => {
    const command = new DeleteMidiEventsCommand(['note-1'], ['bend-1']);

    command.execute();

    expect(region.getNotes()).toHaveLength(0);
    expect(region.getPitchBends()).toHaveLength(0);
    expect(mockCore.removeSelectedItem).toHaveBeenCalledTimes(2);
  });

  it('restores deleted notes and pitch bends on undo', () => {
    const command = new DeleteMidiEventsCommand(['note-1'], ['bend-1']);

    command.execute();
    command.undo();

    expect(region.getNotes()).toHaveLength(1);
    expect(region.getNotes()[0].getId()).toBe('note-1');
    expect(region.getPitchBends()).toHaveLength(1);
    expect(region.getPitchBends()[0].getId()).toBe('bend-1');
  });
});
