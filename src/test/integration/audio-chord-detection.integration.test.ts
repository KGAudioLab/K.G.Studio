import { execFileSync, spawnSync } from 'node:child_process';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { detectChordsFromAudio } from '../../util/audioChordDetectionCore';

const FIXTURE_PATH = path.resolve(process.cwd(), 'public/test-data/chord-progression-01.mp3');
const BAR_DURATION_SECONDS = 2;
const ffmpegAvailable = spawnSync('ffmpeg', ['-version'], { stdio: 'ignore' }).status === 0;
const runIfFfmpeg = ffmpegAvailable ? it : it.skip;

function decodeMp3ToMonoPcm(path: string): { sampleRate: number; pcm: Float32Array } {
  const wav = execFileSync(
    'ffmpeg',
    ['-v', 'error', '-i', path, '-ac', '1', '-f', 'wav', 'pipe:1'],
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

describe('audio chord detection fixture', () => {
  runIfFfmpeg('detects the expected bar-locked progression from the mp3 fixture', () => {
    const { sampleRate, pcm } = decodeMp3ToMonoPcm(FIXTURE_PATH);
    const windows = Array.from({ length: 9 }, (_, barIndex) => ({
      barIndex,
      startBeat: barIndex * 4,
      endBeat: (barIndex + 1) * 4,
      startSeconds: barIndex * BAR_DURATION_SECONDS,
      endSeconds: (barIndex + 1) * BAR_DURATION_SECONDS,
    }));

    const results = detectChordsFromAudio({
      pcm,
      sampleRate,
      clipStartOffsetSeconds: 0,
      windows,
    });

    expect(results.map(result => result.symbol)).toEqual([
      'Am',
      'F',
      'Dm',
      'E',
      'Am',
      'C',
      'Dm',
      'E',
      'N',
    ]);
  });
});
