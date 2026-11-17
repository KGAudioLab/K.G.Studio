import { TICKS_PER_QUARTER, ticksPerBar } from '../../core/timing';
import { KGMidiTrack } from '../../core/track/KGMidiTrack';
import type { KGProject } from '../../core/KGProject';
import type { KGMidiRegion } from '../../core/region/KGMidiRegion';
import { GlobalTrackType } from '../../core/global-track';
import { findGlobalTrackByType, getEffectiveBpmAtTick, getSortedTempoRegions } from '../globalTrackUtil';
import { translate } from '../../i18n/translate';
import type { MidiArticulation } from '../../core/midi/KGMidiNote';
import type { InstVelaArticulation, InstVelaNote, InstVelaRequest } from './types';

import { getInstVelaInstrument } from './instruments';

const SCORE_ARTICULATIONS: Record<MidiArticulation, InstVelaArticulation> = {
  0: 'sustain',
  1: 'spiccato',
  2: 'pizzicato',
  3: 'sustain', // Tremolo is reserved for a future model.
};

export interface InstVelaRegion {
  id: string;
  name: string;
  trackName: string;
  fingerprint: string;
  request: InstVelaRequest;
  error?: string;
}

export function getInstVelaRegions(project: KGProject, ids?: readonly string[]): InstVelaRegion[] {
  const tracks = project.getTracks().filter((track): track is KGMidiTrack =>
    track instanceof KGMidiTrack && Boolean(getInstVelaInstrument(track.getInstrument())));
  if (!tracks.length) return [];
  const meter = project.getTimeSignature();
  const tempoTrack = findGlobalTrackByType(project, GlobalTrackType.Tempo);
  const tempoRegions = tempoTrack ? getSortedTempoRegions(tempoTrack, ticksPerBar(meter)) : [];
  return tracks.flatMap(track => track.getRegions().flatMap(region => {
    if (ids && !ids.includes(region.getId())) return [];
    const start = region.getStartTick();
    const bpm = getEffectiveBpmAtTick(project, start);
    const end = start + region.getLengthTicks();
    const changesTempo = tempoRegions.some(tempo => {
      const tick = tempo.getStartTick();
      return tick > start && tick < end && tempo.getBpm() !== bpm;
    });
    const job = makeRegionScore(track, region, bpm, [meter.numerator, meter.denominator]);
    if (!job) return [];
    if (changesTempo) job.error = translate('instvela.splitAtTempoChange');
    return [job];
  }));
}

function makeRegionScore(
  track: KGMidiTrack,
  region: KGMidiRegion,
  bpm: number,
  meter: [number, number],
): InstVelaRegion | undefined {
  const instrument = getInstVelaInstrument(track.getInstrument())!;
  const notes = region.getNotes().map(note => ({
    start: note.getStartTick(),
    end: note.getEndTick(),
    pitch: note.getPitch(),
    velocity: Math.max(1, Math.min(127, Math.round(note.getVelocity()))),
    articulation: SCORE_ARTICULATIONS[note.getArticulation()] ?? SCORE_ARTICULATIONS[0],
  })).sort((a, b) => a.start - b.start
    || b.pitch - a.pitch || a.end - b.end || a.velocity - b.velocity);

  const scoreNotes: InstVelaNote[] = [];
  for (const note of notes) {
    const start = Math.max(0, note.start);
    const end = Math.min(region.getLengthTicks(), note.end);
    if (start < end) scoreNotes.push({
      start: start / TICKS_PER_QUARTER,
      end: end / TICKS_PER_QUARTER,
      pitch: note.pitch,
      velocity: note.velocity,
      articulation: note.articulation,
    });
  }
  if (!scoreNotes.length) return undefined;

  const input: Pick<InstVelaRequest, 'bundle' | 'score'> = {
    bundle: instrument.bundle,
    score: { tempo_bpm: bpm, time_signature: meter, bar_origin_beats: 0, controls: { instrument: instrument.voice }, notes: scoreNotes },
  };
  const identity = { id: region.getId(), name: region.getName(), trackName: track.getName() };
  const request: InstVelaRequest = {
    ...input,
    region: { ...identity, trackId: track.getId(), startTick: region.getStartTick(), lengthTicks: region.getLengthTicks() },
  };
  return { ...identity, request, fingerprint: JSON.stringify(input) };
}
