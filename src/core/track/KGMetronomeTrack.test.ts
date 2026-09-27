import { instanceToPlain } from 'class-transformer';
import { describe, expect, it } from 'vitest';
import { KGProject } from '../KGProject';
import { KGMidiTrack } from './KGMidiTrack';
import {
  KGMetronomeTrack,
  METRONOME_BEAT_PITCH,
  METRONOME_DOWNBEAT_PITCH,
  METRONOME_INSTRUMENT,
  METRONOME_NOTE_LENGTH_TICKS,
  METRONOME_NOTE_VELOCITY,
  METRONOME_TRACK_ID,
  METRONOME_TRACK_INDEX,
  METRONOME_TRACK_NAME,
} from './KGMetronomeTrack';

function absoluteNoteStarts(track: KGMetronomeTrack): Array<{ tick: number; pitch: number }> {
  const region = track.getRegions()[0];
  return region.getNotes().map(note => ({
    tick: region.getStartTick() + note.getStartTick(),
    pitch: note.getPitch(),
  }));
}

describe('KGMetronomeTrack', () => {
  it('uses the reserved runtime identity and MIDI woodblock configuration', () => {
    const track = new KGMetronomeTrack({ numerator: 4, denominator: 4 }, 2);

    expect(track).toBeInstanceOf(KGMidiTrack);
    expect(track.getId()).toBe(METRONOME_TRACK_ID);
    expect(track.getTrackIndex()).toBe(METRONOME_TRACK_INDEX);
    expect(track.getName()).toBe(METRONOME_TRACK_NAME);
    expect(track.getInstrument()).toBe(METRONOME_INSTRUMENT);
    expect(track.getNoTranspose()).toBe(true);
  });

  it('generates one accented denominator-beat click from one negative bar to project end', () => {
    const track = new KGMetronomeTrack({ numerator: 4, denominator: 4 }, 2);
    const region = track.getRegions()[0];
    const starts = absoluteNoteStarts(track);

    expect(region.getStartTick()).toBe(-3840);
    expect(starts).toHaveLength(12);
    expect(starts[0]).toEqual({ tick: -3840, pitch: METRONOME_DOWNBEAT_PITCH });
    expect(starts[1]).toEqual({ tick: -2880, pitch: METRONOME_BEAT_PITCH });
    expect(starts[4]).toEqual({ tick: 0, pitch: METRONOME_DOWNBEAT_PITCH });
    expect(starts.at(-1)?.tick).toBe(6720);
    expect(region.getNotes().every(note => (
      note.getEndTick() - note.getStartTick() === METRONOME_NOTE_LENGTH_TICKS
      && note.getVelocity() === METRONOME_NOTE_VELOCITY
    ))).toBe(true);
  });

  it('replaces notes on refresh and preserves denominator-beat behavior in 6/8', () => {
    const track = new KGMetronomeTrack({ numerator: 3, denominator: 4 }, 3);
    const originalRegion = track.getRegions()[0];

    track.refreshNotes({ numerator: 6, denominator: 8 }, 1);
    const starts = absoluteNoteStarts(track);

    expect(track.getRegions()).toHaveLength(1);
    expect(track.getRegions()[0]).not.toBe(originalRegion);
    expect(starts).toHaveLength(12);
    expect(starts.map(item => item.tick)).toEqual([
      -2880, -2400, -1920, -1440, -960, -480,
      0, 480, 960, 1440, 1920, 2400,
    ]);
    expect(starts.filter(item => item.pitch === METRONOME_DOWNBEAT_PITCH).map(item => item.tick))
      .toEqual([-2880, 0]);
  });

  it('keeps the virtual track outside user tracks and serialized project data', () => {
    const project = new KGProject('Transient Metronome');
    const plain = instanceToPlain(project) as Record<string, unknown>;

    expect(project.getTracks()).toEqual([]);
    expect(project.getPlaybackTracks()).toEqual([project.getMetronomeTrack()]);
    expect(plain).not.toHaveProperty('metronomeTrack');
    expect(plain.tracks).toEqual([]);
  });

  it('refreshes through project time-signature and length setters', () => {
    const project = new KGProject('Refresh', 2, 0, 120, { numerator: 4, denominator: 4 });

    project.setTimeSignature({ numerator: 3, denominator: 4 });
    project.setMaxBars(4);

    const starts = absoluteNoteStarts(project.getMetronomeTrack());
    expect(starts[0].tick).toBe(-2880);
    expect(starts).toHaveLength(15);
    expect(starts.at(-1)?.tick).toBe(10560);
  });
});
