import {
  detectMonophonicNotesFromAudio,
  type AudioToMidiDetectedNote,
  type AudioToMidiDetectionRequest,
} from '../util/audioToMidiCore';

export interface AudioToMidiWorkerResult {
  type: 'result';
  notes: AudioToMidiDetectedNote[];
}

type WorkerScopeLike = typeof globalThis & {
  onmessage: ((event: MessageEvent<AudioToMidiDetectionRequest>) => void) | null;
  postMessage: (message: AudioToMidiWorkerResult) => void;
};

const workerScope = self as WorkerScopeLike;

workerScope.onmessage = (event: MessageEvent<AudioToMidiDetectionRequest>) => {
  const notes = detectMonophonicNotesFromAudio(event.data);
  workerScope.postMessage({ type: 'result', notes });
};
