import type { TimeSignature } from '../../types/projectTypes';
import { KGMidiNote } from '../midi/KGMidiNote';
import { KGMidiRegion } from '../region/KGMidiRegion';
import { TICKS_PER_QUARTER, ticksPerBar, ticksPerMeterBeat } from '../timing';
import { KGMidiTrack } from './KGMidiTrack';

export const METRONOME_TRACK_ID = -1;
export const METRONOME_TRACK_INDEX = -1;
export const METRONOME_TRACK_NAME = 'Metronome';
export const METRONOME_INSTRUMENT = 'woodblock' as const;
export const METRONOME_DOWNBEAT_PITCH = 72;
export const METRONOME_BEAT_PITCH = 60;
export const METRONOME_NOTE_LENGTH_TICKS = TICKS_PER_QUARTER / 4;
export const METRONOME_NOTE_VELOCITY = 127;

const METRONOME_REGION_ID = 'virtual-metronome-region';

/** Runtime-only MIDI track used by realtime playback for metronome clicks. */
export class KGMetronomeTrack extends KGMidiTrack {
  constructor(timeSignature: TimeSignature, maxBars: number) {
    super(METRONOME_TRACK_NAME, METRONOME_TRACK_ID, METRONOME_INSTRUMENT);
    this.setTrackIndex(METRONOME_TRACK_INDEX);
    this.setNoTranspose(true);
    this.refreshNotes(timeSignature, maxBars);
  }

  /** Replace the generated click region so refreshes never accumulate notes. */
  public refreshNotes(timeSignature: TimeSignature, maxBars: number): void {
    const barTicks = ticksPerBar(timeSignature);
    const beatTicks = ticksPerMeterBeat(timeSignature);
    const projectEndTick = Math.max(0, maxBars) * barTicks;
    const regionStartTick = -barTicks;
    const regionLengthTicks = projectEndTick - regionStartTick;
    const region = new KGMidiRegion(
      METRONOME_REGION_ID,
      String(METRONOME_TRACK_ID),
      METRONOME_TRACK_INDEX,
      METRONOME_TRACK_NAME,
      regionStartTick,
      regionLengthTicks,
    );
    const notes: KGMidiNote[] = [];

    for (let absoluteTick = regionStartTick; absoluteTick < projectEndTick; absoluteTick += beatTicks) {
      const normalizedBarTick = ((absoluteTick % barTicks) + barTicks) % barTicks;
      const localStartTick = absoluteTick - regionStartTick;
      notes.push(new KGMidiNote(
        `virtual-metronome-note-${absoluteTick}`,
        localStartTick,
        localStartTick + METRONOME_NOTE_LENGTH_TICKS,
        normalizedBarTick === 0 ? METRONOME_DOWNBEAT_PITCH : METRONOME_BEAT_PITCH,
        METRONOME_NOTE_VELOCITY,
      ));
    }

    region.setNotes(notes);
    this.setRegions([region]);
  }
}
