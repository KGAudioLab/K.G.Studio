import type { KGProject } from '../core/KGProject';
import { KGMidiRegion } from '../core/region/KGMidiRegion';
import { KGMidiTrack } from '../core/track/KGMidiTrack';
import { GlobalTrackType } from '../core/global-track';
import { KGChordRegion } from '../core/region/KGChordRegion';
import { convertChordSymbolToMidiPitches } from './chordRegionImportUtil';
import { getEffectiveKeySignatureAtBeat } from './globalTrackUtil';
import { getRootNoteFromKeySignature, getScalePitchClasses } from './scaleUtil';
import { beatsToBar, pitchToNoteNameString } from './midiUtil';
import { translate } from '../i18n/translate';

export type IntelligentArpeggiatorSource = { type: 'chord' } | { type: 'midi'; trackId: string };
export type IntelligentArpeggiatorOptions = { source: IntelligentArpeggiatorSource; exampleBars: number; generateBars: number; tieBreak: 'higher' | 'lower' };
export type GeneratedArpeggiatorNote = { startBeat: number; endBeat: number; pitch: number; velocity: number };
export type IntelligentArpeggiatorPlan = { notes: GeneratedArpeggiatorNote[]; endBeat: number };

type PatternEvent = { offset: number; length: number; anchorRank: number; scaleOffset: number; velocity: number };

function scalePitches(project: KGProject, beat: number): number[] {
  const key = getEffectiveKeySignatureAtBeat(project, beat);
  const modeSteps = key.endsWith(' minor') ? [2, 1, 2, 2, 1, 2, 2] : [2, 2, 1, 2, 2, 2, 1];
  const pcs = new Set(getScalePitchClasses(getRootNoteFromKeySignature(key), modeSteps));
  return Array.from({ length: 128 }, (_, pitch) => pitch).filter(pitch => pcs.has(pitch % 12));
}

function scaleIndex(pitches: number[], pitch: number): number {
  return pitches.indexOf(pitch);
}

/** Returns the closest scale degree while retaining a source pitch's chromatic alteration separately. */
function nearestScaleIndex(pitches: number[], pitch: number): number {
  const exact = scaleIndex(pitches, pitch);
  if (exact >= 0) return exact;
  let closest = 0;
  for (let index = 1; index < pitches.length; index += 1) {
    if (Math.abs(pitches[index] - pitch) < Math.abs(pitches[closest] - pitch)) closest = index;
  }
  return closest;
}

function displayBeat(beatInBar: number): number {
  return Math.round((beatInBar + 1) * 100) / 100;
}

function sourceAt(project: KGProject, source: IntelligentArpeggiatorSource, beat: number): number[] {
  if (source.type === 'chord') {
    const track = project.getGlobalTracks().find(item => item.getType() === GlobalTrackType.Chord);
    const chord = track?.getRegions().find((region): region is KGChordRegion => (
      region instanceof KGChordRegion && region.getStartFromBeat() <= beat && beat < region.getStartFromBeat() + region.getLength()
    ));
    const pitches = chord ? convertChordSymbolToMidiPitches(chord.getSymbol()) : null;
    return pitches ? pitches.slice(1).sort((a, b) => a - b) : [];
  }
  const track = project.getTracks().find(item => item.getId().toString() === source.trackId);
  if (!(track instanceof KGMidiTrack)) return [];
  return [...new Set(track.getRegions().flatMap(region => {
    if (!(region instanceof KGMidiRegion)) return [];
    return region.getNotes().filter(note => {
      const start = region.getStartFromBeat() + note.getStartBeat();
      const end = region.getStartFromBeat() + note.getEndBeat();
      return start <= beat && beat < end;
    }).map(note => note.getPitch());
  }))].sort((a, b) => a - b);
}

function validateOnKey(project: KGProject, beat: number, pitches: number[]): string | null {
  const scale = new Set(scalePitches(project, beat));
  const invalid = pitches.find(pitch => !scale.has(pitch));
  if (invalid === undefined) return null;
  const { bar, beatInBar } = beatsToBar(beat, project.getTimeSignature());
  return translate('intelligentArpeggiator.error.pitchOutsideKey', {
    pitch: pitchToNoteNameString(invalid),
    bar: bar + 1,
    beat: displayBeat(beatInBar),
  });
}

function learnPattern(project: KGProject, region: KGMidiRegion, playhead: number, exampleEnd: number, reference: number[], tieBreak: 'higher' | 'lower'): PatternEvent[] | string {
  const referenceScale = scalePitches(project, playhead);
  // Source notes may be chromatic. Their nearest scale degree provides the learned
  // diatonic movement while their chromatic alteration is preserved at generation.
  const refIndices = reference.map(pitch => nearestScaleIndex(referenceScale, pitch));
  const events: PatternEvent[] = [];
  for (const note of region.getNotes()) {
    const absoluteStart = region.getStartFromBeat() + note.getStartBeat();
    if (absoluteStart < playhead || absoluteStart >= exampleEnd) continue;
    const error = validateOnKey(project, absoluteStart, [note.getPitch()]);
    if (error) return error;
    const noteIndex = scaleIndex(referenceScale, note.getPitch());
    let best = 0;
    for (let i = 1; i < reference.length; i += 1) {
      const distance = Math.abs(noteIndex - refIndices[i]);
      const bestDistance = Math.abs(noteIndex - refIndices[best]);
      if (distance < bestDistance || (distance === bestDistance && ((tieBreak === 'higher' && reference[i] > reference[best]) || (tieBreak === 'lower' && reference[i] < reference[best])))) best = i;
    }
    events.push({ offset: absoluteStart - playhead, length: note.getEndBeat() - note.getStartBeat(), anchorRank: best, scaleOffset: noteIndex - refIndices[best], velocity: note.getVelocity() });
  }
  return events.sort((a, b) => a.offset - b.offset);
}

export function buildIntelligentArpeggiatorPlan(project: KGProject, region: KGMidiRegion, playhead: number, options: IntelligentArpeggiatorOptions): IntelligentArpeggiatorPlan | { error: string } {
  const beatsPerBar = project.getTimeSignature().numerator;
  const exampleEnd = playhead + options.exampleBars * beatsPerBar;
  const songEnd = project.getMaxBars() * beatsPerBar;
  if (exampleEnd > songEnd) return { error: 'The example extends beyond the end of the song.' };
  const reference = sourceAt(project, options.source, playhead);
  if (reference.length === 0) return { error: 'The input source is empty at the playhead.' };
  const pattern = learnPattern(project, region, playhead, exampleEnd, reference, options.tieBreak);
  if (typeof pattern === 'string') return { error: pattern };
  if (pattern.length === 0) {
    const { bar, beatInBar } = beatsToBar(playhead, project.getTimeSignature());
    return { error: translate('intelligentArpeggiator.error.noExampleNotes', { bar: bar + 1, beat: displayBeat(beatInBar) }) };
  }
  const outputEnd = Math.min(songEnd, exampleEnd + options.generateBars * beatsPerBar);
  const notes: GeneratedArpeggiatorNote[] = [];
  const cycleLength = options.exampleBars * beatsPerBar;
  for (let cycleStart = exampleEnd; cycleStart < outputEnd; cycleStart += cycleLength) {
    for (const event of pattern) {
      const startBeat = cycleStart + event.offset;
      if (startBeat >= outputEnd) continue;
      const source = sourceAt(project, options.source, startBeat);
      if (source.length === 0) continue;
      const scale = scalePitches(project, startBeat);
      const anchor = source[Math.min(event.anchorRank, source.length - 1)];
      const nearestAnchorIndex = nearestScaleIndex(scale, anchor);
      const chromaticOffset = anchor - scale[nearestAnchorIndex];
      const index = nearestAnchorIndex + event.scaleOffset;
      if (index < 0 || index >= scale.length) return { error: 'A generated pitch is outside the MIDI range.' };
      const pitch = scale[index] + chromaticOffset;
      if (pitch < 0 || pitch > 127) return { error: 'A generated pitch is outside the MIDI range.' };
      notes.push({ startBeat, endBeat: Math.min(outputEnd, startBeat + event.length), pitch, velocity: event.velocity });
    }
  }
  return { notes, endBeat: outputEnd };
}
