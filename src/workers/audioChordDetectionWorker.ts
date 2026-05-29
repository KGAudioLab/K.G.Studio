import {
  detectChordsFromAudio,
  type AudioChordDetectionProgress,
  type AudioChordDetectionRequest,
  type DetectedAudioChord,
} from '../util/audioChordDetectionCore';

export type AudioChordDetectionWorkerMessage =
  | { type: 'progress'; progress: AudioChordDetectionProgress }
  | { type: 'result'; results: DetectedAudioChord[] };

type WorkerScopeLike = typeof globalThis & {
  onmessage: ((event: MessageEvent<AudioChordDetectionRequest>) => void) | null;
  postMessage: (message: AudioChordDetectionWorkerMessage) => void;
};

const workerScope = self as WorkerScopeLike;

workerScope.onmessage = (event: MessageEvent<AudioChordDetectionRequest>) => {
  const results = detectChordsFromAudio(event.data, progress => {
    workerScope.postMessage({ type: 'progress', progress });
  });
  workerScope.postMessage({ type: 'result', results });
};
