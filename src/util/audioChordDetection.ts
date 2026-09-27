import { KGProject } from '../core/KGProject';
import { KGAudioRegion } from '../core/region/KGAudioRegion';
import { tickRangeToSeconds, getAudioRegionDisplayLengthTicks } from './globalTrackUtil';
import { ticksPerBar } from '../core/timing';

export {
  DEFAULT_AUDIO_CHORD_DETECTION_OPTIONS,
  detectChordsFromAudio,
  type AudioChordDetectionRequest,
  type AudioChordDetectionOptions,
  type AudioChordWindow,
  type DetectedAudioChord,
} from './audioChordDetectionCore';

import type { AudioChordWindow } from './audioChordDetectionCore';

export function buildAudioChordWindowsForRegion(
  project: KGProject,
  audioRegion: KGAudioRegion,
): AudioChordWindow[] {
  const regionStartTick = audioRegion.getStartTick();
  const visibleLengthTicks = getAudioRegionDisplayLengthTicks(project, audioRegion);
  if (visibleLengthTicks <= 0) {
    return [];
  }

  const regionEndTick = regionStartTick + visibleLengthTicks;
  const barTicks = ticksPerBar(project.getTimeSignature());
  const startBarIndex = Math.floor(regionStartTick / barTicks);
  const endBarIndexExclusive = Math.max(
    startBarIndex + 1,
    Math.ceil(regionEndTick / barTicks),
  );

  const windows: AudioChordWindow[] = [];
  for (let barIndex = startBarIndex; barIndex < endBarIndexExclusive; barIndex++) {
    const barStartTick = barIndex * barTicks;
    const barEndTick = barStartTick + barTicks;
    const overlapStartTick = Math.max(regionStartTick, barStartTick);
    const overlapEndTick = Math.min(regionEndTick, barEndTick);
    if (overlapEndTick <= overlapStartTick) {
      continue;
    }

    const startSeconds = audioRegion.getClipStartOffsetSeconds() + tickRangeToSeconds(project, regionStartTick, overlapStartTick);
    const endSeconds = audioRegion.getClipStartOffsetSeconds() + tickRangeToSeconds(project, regionStartTick, overlapEndTick);
    windows.push({
      barIndex,
      startTick: overlapStartTick,
      endTick: overlapEndTick,
      startSeconds,
      endSeconds,
    });
  }

  return windows;
}
