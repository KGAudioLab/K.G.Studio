import { KGProject } from '../core/KGProject';
import { KGAudioRegion } from '../core/region/KGAudioRegion';
import type {
  PianoRollQuantizeLengthValue,
  PianoRollQuantizePositionValue,
} from '../core/state/KGPianoRollState';
import type { RawMidiNote } from './midiUtil';
import { noteValueToTicks } from '../core/timing';
import {
  tickRangeToSeconds,
  tickToSeconds,
  secondsToTick,
} from './globalTrackUtil';

export {
  detectMonophonicNotesFromAudio,
  type AudioToMidiDetectedNote,
  type AudioToMidiDetectionRequest,
} from './audioToMidiCore';

import type { AudioToMidiDetectedNote } from './audioToMidiCore';

export interface AudioToMidiAnalysisSpan {
  regionStartTick: number;
  regionEndTick: number;
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
  const regionStartTick = audioRegion.getStartTick();
  const regionEndTick = regionStartTick + audioRegion.getLengthTicks();
  if (regionEndTick <= regionStartTick) {
    return null;
  }

  if (options.loopModeEnabled && options.convertLoopRangeOnly) {
    const projectTimeSignature = project.getTimeSignature();
  const ticksPerBar = projectTimeSignature.numerator * 960 * (4 / projectTimeSignature.denominator);
    const loopStartTick = options.loopingRange[0] * ticksPerBar;
    const loopEndTick = (options.loopingRange[1] + 1) * ticksPerBar;
    const overlapStartTick = Math.max(regionStartTick, loopStartTick);
    const overlapEndTick = Math.min(regionEndTick, loopEndTick);
    if (overlapEndTick <= overlapStartTick) {
      return null;
    }

    return {
      regionStartTick: overlapStartTick,
      regionEndTick: overlapEndTick,
      startSeconds: audioRegion.getClipStartOffsetSeconds() + tickRangeToSeconds(project, regionStartTick, overlapStartTick),
      endSeconds: audioRegion.getClipStartOffsetSeconds() + tickRangeToSeconds(project, regionStartTick, overlapEndTick),
    };
  }

  return {
    regionStartTick,
    regionEndTick,
    startSeconds: audioRegion.getClipStartOffsetSeconds(),
    endSeconds: audioRegion.getClipStartOffsetSeconds() + tickRangeToSeconds(project, regionStartTick, regionEndTick),
  };
}

export function quantizationValueToTicks(value: string): number {
  const denominator = Number.parseInt(value.split('/')[1] ?? '', 10);
  if (!Number.isFinite(denominator) || denominator <= 0) {
    throw new Error(`Invalid quantization value: ${value}`);
  }

  return noteValueToTicks(denominator);
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
  const regionStartAbsoluteSeconds = tickToSeconds(project, span.regionStartTick);
  const regionLengthTicks = Math.max(0, span.regionEndTick - span.regionStartTick);
  const quantizedStartStep = quantizationValueToTicks(options.quantizeNoteStart);
  const quantizedLengthStep = quantizationValueToTicks(options.quantizeNoteLength);

  const converted = detectedNotes
    .map(note => {
      const startTickAbsolute = secondsToTick(project, regionStartAbsoluteSeconds + note.startOffsetSeconds);
      const endTickAbsolute = secondsToTick(project, regionStartAbsoluteSeconds + note.endOffsetSeconds);
      const rawStartTick = startTickAbsolute - span.regionStartTick;
      const rawEndTick = endTickAbsolute - span.regionStartTick;
      const rawDurationTicks = rawEndTick - rawStartTick;
      if (rawDurationTicks < quantizedLengthStep) {
        return null;
      }

      const quantizedStartTick = Math.round(rawStartTick / quantizedStartStep) * quantizedStartStep;
      const quantizedDurationTicks = Math.max(
        quantizedLengthStep,
        Math.round(rawDurationTicks / quantizedLengthStep) * quantizedLengthStep,
      );
      const quantizedEndTick = quantizedStartTick + quantizedDurationTicks;
      if (quantizedStartTick >= regionLengthTicks) {
        return null;
      }

      const clampedStartTick = clamp(quantizedStartTick, 0, regionLengthTicks);
      const clampedEndTick = clamp(
        Math.max(clampedStartTick + quantizedLengthStep, quantizedEndTick),
        clampedStartTick + Math.min(quantizedLengthStep, Math.max(regionLengthTicks - clampedStartTick, 0)),
        regionLengthTicks,
      );
      if (clampedEndTick <= clampedStartTick) {
        return null;
      }

      return {
        startTick: clampedStartTick,
        endTick: clampedEndTick,
        pitch: note.pitch,
        velocity: clamp(Math.round(45 + note.heat * 82), 1, 127),
      } satisfies RawMidiNote;
    })
    .filter((note): note is RawMidiNote => note !== null)
    .sort((left, right) => left.startTick - right.startTick || left.pitch - right.pitch);

  const merged: RawMidiNote[] = [];
  for (const note of converted) {
    const previous = merged[merged.length - 1];
    if (
      previous &&
      previous.pitch === note.pitch &&
      note.startTick <= previous.endTick + 1e-6
    ) {
      previous.endTick = Math.max(previous.endTick, note.endTick);
      previous.velocity = Math.max(previous.velocity, note.velocity);
      continue;
    }

    merged.push({ ...note });
  }

  return merged;
}
