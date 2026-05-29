import { analyze, guess } from 'web-audio-beat-detector';

const DEFAULT_MIN_TEMPO = 80;
const DEFAULT_MAX_TEMPO = 180;
const ABSOLUTE_MIN_TEMPO = 40;
const ABSOLUTE_MAX_TEMPO = 240;

export interface AudioTempoDetectionOptions {
  minTempo: number;
  maxTempo: number;
}

export interface AudioTempoAnalysisSpan {
  offsetSeconds: number;
  durationSeconds: number;
}

export interface DetectedAudioTempo {
  tempo: number;
  bpm: number;
  offsetSeconds: number;
}

export const DEFAULT_AUDIO_TEMPO_DETECTION_OPTIONS: AudioTempoDetectionOptions = {
  minTempo: DEFAULT_MIN_TEMPO,
  maxTempo: DEFAULT_MAX_TEMPO,
};

function clampTempo(value: number): number {
  if (!Number.isFinite(value)) {
    return DEFAULT_MIN_TEMPO;
  }

  return Math.max(ABSOLUTE_MIN_TEMPO, Math.min(ABSOLUTE_MAX_TEMPO, Math.round(value)));
}

export function normalizeAudioTempoDetectionOptions(
  options?: Partial<AudioTempoDetectionOptions>,
): AudioTempoDetectionOptions {
  const minTempo = clampTempo(options?.minTempo ?? DEFAULT_MIN_TEMPO);
  const maxTempo = clampTempo(options?.maxTempo ?? DEFAULT_MAX_TEMPO);

  if (minTempo >= maxTempo) {
    throw new Error('Minimum BPM must be lower than maximum BPM.');
  }

  return { minTempo, maxTempo };
}

export async function detectTempoFromAudio(
  audioBuffer: AudioBuffer,
  span: AudioTempoAnalysisSpan,
  options?: Partial<AudioTempoDetectionOptions>,
): Promise<DetectedAudioTempo> {
  const normalizedOptions = normalizeAudioTempoDetectionOptions(options);

  // Keep the detector behind this wrapper because the library is MIT-licensed,
  // works directly with browser AudioBuffers, supports subrange analysis, and
  // exposes beat offset that we will need for future beat-alignment features.
  const [tempo, guessResult] = await Promise.all([
    analyze(audioBuffer, span.offsetSeconds, span.durationSeconds, normalizedOptions),
    guess(audioBuffer, span.offsetSeconds, span.durationSeconds, normalizedOptions),
  ]);

  return {
    tempo,
    bpm: Math.round(tempo),
    offsetSeconds: guessResult.offset,
  };
}
