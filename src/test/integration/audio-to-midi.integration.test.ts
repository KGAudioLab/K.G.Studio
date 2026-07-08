import { execFileSync, spawnSync } from 'node:child_process';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { pitchToNoteNameString } from '../../util/midiUtil';
import { detectMonophonicNotesFromAudio } from '../../util/audioToMidi';

const FIXTURE_PATH = path.resolve(process.cwd(), 'public/test-data/audio-to-midi-test01.mp3');
const ffmpegAvailable = spawnSync('ffmpeg', ['-version'], { stdio: 'ignore' }).status === 0;
const runIfFfmpeg = ffmpegAvailable ? it : it.skip;

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

describe('audio-to-MIDI fixture regression', () => {
  runIfFfmpeg('extracts exactly A1 then D2 from the dedicated mp3 fixture at -16 dB', () => {
    const { sampleRate, pcm } = decodeMp3ToMonoPcm(FIXTURE_PATH);
    const notes = detectMonophonicNotesFromAudio({
      pcm,
      sampleRate,
      startSeconds: 0,
      endSeconds: pcm.length / sampleRate,
      floorDb: -16,
      pitchRangeStart: 12,
      pitchRangeEnd: 107,
      groupAdjacentPitchesToHighest: true,
    });

    expect(notes).toHaveLength(2);
    expect(notes.map(note => pitchToNoteNameString(note.pitch))).toEqual(['A1', 'D2']);
  });
});
