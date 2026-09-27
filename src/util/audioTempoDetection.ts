import type { KGProject } from '../core/KGProject';
import type { KGAudioRegion } from '../core/region/KGAudioRegion';
import { tickRangeToSeconds, getAudioRegionDisplayLengthTicks } from './globalTrackUtil';

export {
  DEFAULT_AUDIO_TEMPO_DETECTION_OPTIONS,
  detectTempoFromAudio,
  normalizeAudioTempoDetectionOptions,
  type AudioTempoAnalysisSpan,
  type AudioTempoDetectionOptions,
  type DetectedAudioTempo,
} from './audioTempoDetectionCore';

import type { AudioTempoAnalysisSpan } from './audioTempoDetectionCore';

const MIN_ANALYSIS_DURATION_SECONDS = 0.05;

export function buildAudioTempoAnalysisSpanForRegion(
  project: KGProject,
  audioRegion: KGAudioRegion,
): AudioTempoAnalysisSpan | null {
  const visibleLengthTicks = getAudioRegionDisplayLengthTicks(project, audioRegion);
  if (visibleLengthTicks <= 0) {
    return null;
  }

  const regionStartTick = audioRegion.getStartTick();
  const durationSeconds = tickRangeToSeconds(project, regionStartTick, regionStartTick + visibleLengthTicks);
  if (durationSeconds < MIN_ANALYSIS_DURATION_SECONDS) {
    return null;
  }

  return {
    offsetSeconds: audioRegion.getClipStartOffsetSeconds(),
    durationSeconds,
  };
}
