import {
  DEFAULT_AUDIO_TEMPO_DETECTION_OPTIONS,
  detectTempoFromAudio,
} from '../../util/audioTempoDetectionCore';

declare global {
  interface Window {
    runAudioTempoDetectionFixture: () => Promise<{ bpm: number; offsetSeconds: number; tempo: number }>;
  }
}

async function loadFixtureAudioBuffer(url: string): Promise<AudioBuffer> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch fixture audio: ${response.status}`);
  }

  const arrayBuffer = await response.arrayBuffer();
  const audioContext = new AudioContext();
  try {
    return await audioContext.decodeAudioData(arrayBuffer);
  } finally {
    await audioContext.close();
  }
}

window.runAudioTempoDetectionFixture = async () => {
  const statusNode = document.getElementById('status');
  if (statusNode) {
    statusNode.textContent = 'Running...';
  }

  const fixtureUrl = new URL(
    `${import.meta.env.BASE_URL}test-data/short-arrangement-01.mp3`,
    window.location.origin,
  ).href;
  const audioBuffer = await loadFixtureAudioBuffer(fixtureUrl);
  const result = await detectTempoFromAudio(
    audioBuffer,
    {
      offsetSeconds: 0,
      durationSeconds: audioBuffer.duration,
    },
    DEFAULT_AUDIO_TEMPO_DETECTION_OPTIONS,
  );

  if (statusNode) {
    statusNode.textContent = `Done: ${result.bpm} BPM`;
  }

  return result;
};
