import { execFileSync, spawnSync } from 'node:child_process';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_AUDIO_TEMPO_DETECTION_OPTIONS,
  normalizeAudioTempoDetectionOptions,
} from '../../util/audioTempoDetection';

const FIXTURE_PATH = path.resolve(process.cwd(), 'public/test-data/short-arrangement-01.mp3');
const ffmpegAvailable = spawnSync('ffmpeg', ['-version'], { stdio: 'ignore' }).status === 0;
const offlineAudioContextAvailable = typeof globalThis.OfflineAudioContext !== 'undefined';
const runIfSupported = ffmpegAvailable && offlineAudioContextAvailable ? it : it.skip;

function decodeMp3ToMonoPcm(pathname: string): { sampleRate: number; pcm: Float32Array } {
  const wav = execFileSync(
    'ffmpeg',
    ['-v', 'error', '-i', pathname, '-ac', '1', '-f', 'wav', 'pipe:1'],
    { maxBuffer: 64 * 1024 * 1024 },
  );

  const readString = (offset: number, length: number) => wav.toString('ascii', offset, offset + length);
  if (readString(0, 4) !== 'RIFF' || readString(8, 4) !== 'WAVE') {
    throw new Error('ffmpeg did not return a RIFF/WAVE stream');
  }

  let offset = 12;
  let sampleRate = 44100;
  let pcmData = Buffer.alloc(0);

  while (offset + 8 <= wav.length) {
    const chunkId = readString(offset, 4);
    const chunkSize = wav.readUInt32LE(offset + 4);
    const chunkStart = offset + 8;

    if (chunkId === 'fmt ') {
      sampleRate = wav.readUInt32LE(chunkStart + 4);
    } else if (chunkId === 'data') {
      pcmData = wav.subarray(chunkStart, chunkStart + chunkSize);
      break;
    }

    offset = chunkStart + chunkSize + (chunkSize % 2);
  }

  const pcm = new Float32Array(pcmData.length / 2);
  for (let sampleIndex = 0; sampleIndex < pcm.length; sampleIndex++) {
    pcm[sampleIndex] = pcmData.readInt16LE(sampleIndex * 2) / 32768;
  }

  return { sampleRate, pcm };
}

describe('audio tempo detection fixture', () => {
  it('keeps the fixture-targeted BPM range locked to 125 BPM expectations', () => {
    expect(normalizeAudioTempoDetectionOptions(DEFAULT_AUDIO_TEMPO_DETECTION_OPTIONS)).toEqual({
      minTempo: 80,
      maxTempo: 180,
    });
  });

  runIfSupported('detects the expected BPM from the mp3 fixture', async () => {
    const { sampleRate, pcm } = decodeMp3ToMonoPcm(FIXTURE_PATH);
    const audioContext = new OfflineAudioContext(1, pcm.length, sampleRate);
    const audioBuffer = audioContext.createBuffer(1, pcm.length, sampleRate);
    audioBuffer.copyToChannel(pcm, 0, 0);

    const { detectTempoFromAudio } = await import('../../util/audioTempoDetection');
    const result = await detectTempoFromAudio(audioBuffer, {
      offsetSeconds: 0,
      durationSeconds: audioBuffer.duration,
    }, DEFAULT_AUDIO_TEMPO_DETECTION_OPTIONS);

    expect(result.bpm).toBe(125);
    expect(result.offsetSeconds).toBeGreaterThanOrEqual(0.3);
    expect(result.offsetSeconds).toBeLessThanOrEqual(0.4);
  });
});
