import { KGProject } from '../core/KGProject';
import { KGAudioRegion } from '../core/region/KGAudioRegion';
import type {
  PianoRollQuantizeLengthValue,
  PianoRollQuantizePositionValue,
} from '../core/state/KGPianoRollState';
import type { RawMidiNote } from './midiUtil';
import {
  beatRangeToSeconds,
  beatToSeconds,
  secondsToBeat,
} from './globalTrackUtil';

export {
  detectMonophonicNotesFromAudio,
  type AudioToMidiDetectedNote,
  type AudioToMidiDetectionRequest,
} from './audioToMidiCore';

import type { AudioToMidiDetectedNote } from './audioToMidiCore';

export interface AudioToMidiAnalysisSpan {
  regionStartBeat: number;
  regionEndBeat: number;
  startSeconds: number;
  endSeconds: number;
}

export interface AudioToMidiConversionOptions {
  floorDb: number;
  pitchRangeStart: number;
  pitchRangeEnd: number;
  quantizeNoteStart: PianoRollQuantizePositionValue;
  quantizeNoteLength: PianoRollQuantizeLengthValue;
  groupAdjacentPitchesToHighest: boolean;
}

export function buildAudioToMidiAnalysisSpan(
  project: KGProject,
  audioRegion: KGAudioRegion,
  options: {
    loopModeEnabled: boolean;
    convertLoopRangeOnly: boolean;
    loopingRange: [number, number];
  },
): AudioToMidiAnalysisSpan | null {
  const regionStartBeat = audioRegion.getStartFromBeat();
  const regionEndBeat = regionStartBeat + audioRegion.getLength();
  if (regionEndBeat <= regionStartBeat) {
    return null;
  }

  if (options.loopModeEnabled && options.convertLoopRangeOnly) {
    const beatsPerBar = project.getTimeSignature().numerator;
    const loopStartBeat = options.loopingRange[0] * beatsPerBar;
    const loopEndBeat = (options.loopingRange[1] + 1) * beatsPerBar;
    const overlapStartBeat = Math.max(regionStartBeat, loopStartBeat);
    const overlapEndBeat = Math.min(regionEndBeat, loopEndBeat);
    if (overlapEndBeat <= overlapStartBeat) {
      return null;
    }

    return {
      regionStartBeat: overlapStartBeat,
      regionEndBeat: overlapEndBeat,
      startSeconds: audioRegion.getClipStartOffsetSeconds() + beatRangeToSeconds(project, regionStartBeat, overlapStartBeat),
      endSeconds: audioRegion.getClipStartOffsetSeconds() + beatRangeToSeconds(project, regionStartBeat, overlapEndBeat),
    };
  }

  return {
    regionStartBeat,
    regionEndBeat,
    startSeconds: audioRegion.getClipStartOffsetSeconds(),
    endSeconds: audioRegion.getClipStartOffsetSeconds() + beatRangeToSeconds(project, regionStartBeat, regionEndBeat),
  };
}

export function quantizationValueToBeats(value: string): number {
  const denominator = Number.parseInt(value.split('/')[1] ?? '', 10);
  if (!Number.isFinite(denominator) || denominator <= 0) {
    throw new Error(`Invalid quantization value: ${value}`);
  }

  return 4 / denominator;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function convertDetectedAudioNotesToRawMidiNotes(
  project: KGProject,
  span: AudioToMidiAnalysisSpan,
  detectedNotes: AudioToMidiDetectedNote[],
  options: Pick<AudioToMidiConversionOptions, 'quantizeNoteStart' | 'quantizeNoteLength'>,
): RawMidiNote[] {
  const regionStartAbsoluteSeconds = beatToSeconds(project, span.regionStartBeat);
  const regionLengthBeats = Math.max(0, span.regionEndBeat - span.regionStartBeat);
  const quantizedStartStep = quantizationValueToBeats(options.quantizeNoteStart);
  const quantizedLengthStep = quantizationValueToBeats(options.quantizeNoteLength);

  const converted = detectedNotes
    .map(note => {
      const startBeatAbsolute = secondsToBeat(project, regionStartAbsoluteSeconds + note.startOffsetSeconds);
      const endBeatAbsolute = secondsToBeat(project, regionStartAbsoluteSeconds + note.endOffsetSeconds);
      const rawStartBeat = startBeatAbsolute - span.regionStartBeat;
      const rawEndBeat = endBeatAbsolute - span.regionStartBeat;
      const rawDurationBeats = rawEndBeat - rawStartBeat;
      if (rawDurationBeats < quantizedLengthStep) {
        return null;
      }

      const quantizedStartBeat = Math.round(rawStartBeat / quantizedStartStep) * quantizedStartStep;
      const quantizedDurationBeats = Math.max(
        quantizedLengthStep,
        Math.round(rawDurationBeats / quantizedLengthStep) * quantizedLengthStep,
      );
      const quantizedEndBeat = quantizedStartBeat + quantizedDurationBeats;
      if (quantizedStartBeat >= regionLengthBeats) {
        return null;
      }

      const clampedStartBeat = clamp(quantizedStartBeat, 0, regionLengthBeats);
      const clampedEndBeat = clamp(
        Math.max(clampedStartBeat + quantizedLengthStep, quantizedEndBeat),
        clampedStartBeat + Math.min(quantizedLengthStep, Math.max(regionLengthBeats - clampedStartBeat, 0)),
        regionLengthBeats,
      );
      if (clampedEndBeat <= clampedStartBeat) {
        return null;
      }

      return {
        startBeat: clampedStartBeat,
        endBeat: clampedEndBeat,
        pitch: note.pitch,
        velocity: clamp(Math.round(45 + note.heat * 82), 1, 127),
      } satisfies RawMidiNote;
    })
    .filter((note): note is RawMidiNote => note !== null)
    .sort((left, right) => left.startBeat - right.startBeat || left.pitch - right.pitch);

  const merged: RawMidiNote[] = [];
  for (const note of converted) {
    const previous = merged[merged.length - 1];
    if (
      previous &&
      previous.pitch === note.pitch &&
      note.startBeat <= previous.endBeat + 1e-6
    ) {
      previous.endBeat = Math.max(previous.endBeat, note.endBeat);
      previous.velocity = Math.max(previous.velocity, note.velocity);
      continue;
    }

    merged.push({ ...note });
  }

  return merged;
}
