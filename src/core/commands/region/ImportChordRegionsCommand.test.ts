import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ImportChordRegionsCommand } from './ImportChordRegionsCommand';
import { createMockMidiTrack } from '../../../test/utils/mock-data';
import { KGMidiRegion } from '../../region/KGMidiRegion';
import { KGMidiNote } from '../../midi/KGMidiNote';
import { KGMidiPitchBend } from '../../midi/KGMidiPitchBend';
import { KGMidiControllerEvent } from '../../midi/KGMidiControllerEvent';

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
        { startTick: 0, endTick: 4, pitch: 48, velocity: 127 },
        { startTick: 0, endTick: 4, pitch: 60, velocity: 127 },
        { startTick: 4, endTick: 6, pitch: 41, velocity: 127 },
        { startTick: 4, endTick: 6, pitch: 53, velocity: 127 },
      ],
      'Chord Progression',
      'imported-region',
    );

    command.execute();

    expect(track.getRegions()).toHaveLength(1);
    const region = command.getCreatedRegion();
    expect(region?.getId()).toBe('imported-region');
    expect(region?.getStartTick()).toBe(8);
    expect(region?.getLengthTicks()).toBe(6);
    expect(region?.getNotes().map(note => ({
      startTick: note.getStartTick(),
      endTick: note.getEndTick(),
      pitch: note.getPitch(),
      velocity: note.getVelocity(),
    }))).toEqual([
      { startTick: 0, endTick: 4, pitch: 48, velocity: 127 },
      { startTick: 0, endTick: 4, pitch: 60, velocity: 127 },
      { startTick: 4, endTick: 6, pitch: 41, velocity: 127 },
      { startTick: 4, endTick: 6, pitch: 53, velocity: 127 },
    ]);

    command.undo();
    expect(track.getRegions()).toHaveLength(0);
  });

  it('adds notes while extending left and preserving absolute MIDI event timing', () => {
    const existing = new KGMidiRegion('existing', '1', 0, 'Existing', 8, 4);
    existing.addNote(new KGMidiNote('existing-note', 1, 2, 72, 90));
    existing.addPitchBend(new KGMidiPitchBend('bend', 2, 9000));
    existing.addControllerEvent(1, new KGMidiControllerEvent('controller', 3, 64));
    track.setRegions([existing]);

    const command = new ImportChordRegionsCommand(
      '1', 0, 4, 6,
      [{ startTick: 0, endTick: 2, pitch: 60, velocity: 127 }],
      'Chord Progression', undefined, 'add', 'existing',
    );

    command.execute();

    expect(existing.getStartTick()).toBe(4);
    expect(existing.getLengthTicks()).toBe(8);
    expect(existing.getNotes().map(note => [note.getId(), note.getStartTick(), note.getEndTick()])).toEqual([
      ['existing-note', 5, 6],
      [expect.stringContaining('KGMidiNote'), 0, 2],
    ]);
    expect(existing.getPitchBends()[0].getTick()).toBe(6);
    expect(existing.getControllerEvents(1)[0].getTick()).toBe(7);

    command.undo();
    expect(existing.getStartTick()).toBe(8);
    expect(existing.getLengthTicks()).toBe(4);
    expect(existing.getNotes().map(note => [note.getId(), note.getStartTick(), note.getEndTick()])).toEqual([
      ['existing-note', 1, 2],
    ]);
    expect(existing.getPitchBends()[0].getTick()).toBe(2);
    expect(existing.getControllerEvents(1)[0].getTick()).toBe(3);

    command.execute();
    expect(existing.getStartTick()).toBe(4);
    expect(existing.getNotes()).toHaveLength(2);
  });

  it('replaces every intersecting note across the full import span and preserves other events', () => {
    const existing = new KGMidiRegion('existing', '1', 0, 'Existing', 4, 12);
    existing.setNotes([
      new KGMidiNote('outside-left', 1, 2, 50, 80),
      new KGMidiNote('crosses-left', 3, 5, 51, 80),
      new KGMidiNote('inside', 5, 6, 52, 80),
      new KGMidiNote('crosses-right', 7, 9, 53, 80),
      new KGMidiNote('outside-right', 10, 11, 54, 80),
    ]);
    existing.addPitchBend(new KGMidiPitchBend('bend', 5, 9000));
    existing.addControllerEvent(11, new KGMidiControllerEvent('controller', 6, 100));
    track.setRegions([existing]);

    const command = new ImportChordRegionsCommand(
      '1', 0, 8, 4,
      [{ startTick: 0, endTick: 4, pitch: 60, velocity: 127 }],
      'Chord Progression', undefined, 'replace', 'existing',
    );

    command.execute();

    expect(existing.getNotes().map(note => note.getId())).toEqual([
      'outside-left',
      'outside-right',
      expect.stringContaining('KGMidiNote'),
    ]);
    expect(existing.getPitchBends().map(event => [event.getId(), event.getTick()])).toEqual([['bend', 5]]);
    expect(existing.getControllerEvents(11).map(event => [event.getId(), event.getTick()])).toEqual([['controller', 6]]);

    command.undo();
    expect(existing.getNotes().map(note => note.getId())).toEqual([
      'outside-left', 'crosses-left', 'inside', 'crosses-right', 'outside-right',
    ]);
  });
});
