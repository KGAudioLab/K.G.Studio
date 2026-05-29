import { KGProject } from '../core/KGProject';
import { KGAudioRegion } from '../core/region/KGAudioRegion';
import { beatRangeToSeconds, getAudioRegionDisplayLengthBeats } from './globalTrackUtil';

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
  const regionStartBeat = audioRegion.getStartFromBeat();
  const visibleLengthBeats = getAudioRegionDisplayLengthBeats(project, audioRegion);
  if (visibleLengthBeats <= 0) {
    return [];
  }

  const regionEndBeat = regionStartBeat + visibleLengthBeats;
  const beatsPerBar = project.getTimeSignature().numerator;
  const startBarIndex = Math.floor(regionStartBeat / beatsPerBar);
  const lastBeatExclusive = regionEndBeat - 1e-9;
  const endBarIndexExclusive = Math.max(
    startBarIndex + 1,
    Math.ceil(Math.max(regionStartBeat, lastBeatExclusive) / beatsPerBar),
  );

  const windows: AudioChordWindow[] = [];
  for (let barIndex = startBarIndex; barIndex < endBarIndexExclusive; barIndex++) {
    const barStartBeat = barIndex * beatsPerBar;
    const barEndBeat = barStartBeat + beatsPerBar;
    const overlapStartBeat = Math.max(regionStartBeat, barStartBeat);
    const overlapEndBeat = Math.min(regionEndBeat, barEndBeat);
    if (overlapEndBeat <= overlapStartBeat) {
      continue;
    }

    const startSeconds = audioRegion.getClipStartOffsetSeconds() + beatRangeToSeconds(project, regionStartBeat, overlapStartBeat);
    const endSeconds = audioRegion.getClipStartOffsetSeconds() + beatRangeToSeconds(project, regionStartBeat, overlapEndBeat);
    windows.push({
      barIndex,
      startBeat: overlapStartBeat,
      endBeat: overlapEndBeat,
      startSeconds,
      endSeconds,
    });
  }

  return windows;
}
