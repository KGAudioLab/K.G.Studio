import { describe, it, expect } from 'vitest';
import { encodeWav, getOfflineTrackGain, getOfflineTrackVolumeDb } from './KGOfflineRenderer';

/**
 * Create a minimal AudioBuffer-like object for testing.
 * In the jsdom test environment, AudioBuffer is not available,
 * so we create a plain object that matches the interface used by encodeWav.
 */
function createMockAudioBuffer(
  options: { numberOfChannels: number; sampleRate: number; length: number },
  channelData?: Float32Array[]
): AudioBuffer {
  const channels = channelData ?? Array.from({ length: options.numberOfChannels }, () =>
    new Float32Array(options.length)
  );
  return {
    numberOfChannels: options.numberOfChannels,
    sampleRate: options.sampleRate,
    length: options.length,
    duration: options.length / options.sampleRate,
    getChannelData: (ch: number) => channels[ch],
  } as unknown as AudioBuffer;
}

describe('encodeWav', () => {
  it('should produce a valid RIFF/WAV header for stereo 44100Hz', () => {
    const audioBuffer = createMockAudioBuffer({
      numberOfChannels: 2,
      sampleRate: 44100,
      length: 100,
    });

    const result = encodeWav(audioBuffer);
    const view = new DataView(result);

    // RIFF header
    expect(String.fromCharCode(view.getUint8(0), view.getUint8(1), view.getUint8(2), view.getUint8(3))).toBe('RIFF');
    expect(String.fromCharCode(view.getUint8(8), view.getUint8(9), view.getUint8(10), view.getUint8(11))).toBe('WAVE');

    // File size field: total - 8
    const dataSize = 100 * 2 * 2; // 100 frames * 2 channels * 2 bytes
    expect(view.getUint32(4, true)).toBe(44 + dataSize - 8);

    // fmt sub-chunk
    expect(String.fromCharCode(view.getUint8(12), view.getUint8(13), view.getUint8(14), view.getUint8(15))).toBe('fmt ');
    expect(view.getUint32(16, true)).toBe(16); // PCM sub-chunk size
    expect(view.getUint16(20, true)).toBe(1);  // audio format = PCM
    expect(view.getUint16(22, true)).toBe(2);  // channels
    expect(view.getUint32(24, true)).toBe(44100); // sample rate
    expect(view.getUint32(28, true)).toBe(44100 * 4); // byte rate (sampleRate * blockAlign)
    expect(view.getUint16(32, true)).toBe(4);  // block align (channels * bytesPerSample)
    expect(view.getUint16(34, true)).toBe(16); // bits per sample

    // data sub-chunk
    expect(String.fromCharCode(view.getUint8(36), view.getUint8(37), view.getUint8(38), view.getUint8(39))).toBe('data');
    expect(view.getUint32(40, true)).toBe(dataSize);
  });

  it('should produce correct header for mono 48000Hz', () => {
    const audioBuffer = createMockAudioBuffer({
      numberOfChannels: 1,
      sampleRate: 48000,
      length: 50,
    });

    const result = encodeWav(audioBuffer);
    const view = new DataView(result);

    expect(view.getUint16(22, true)).toBe(1);     // 1 channel
    expect(view.getUint32(24, true)).toBe(48000);  // sample rate
    expect(view.getUint16(32, true)).toBe(2);      // block align (1 * 2)
    expect(view.getUint32(28, true)).toBe(48000 * 2); // byte rate
    expect(view.getUint32(40, true)).toBe(50 * 2); // data size
  });

  it('should have correct total buffer size', () => {
    const audioBuffer = createMockAudioBuffer({
      numberOfChannels: 2,
      sampleRate: 44100,
      length: 200,
    });

    const result = encodeWav(audioBuffer);
    // 44 header + 200 frames * 2 channels * 2 bytes
    expect(result.byteLength).toBe(44 + 200 * 2 * 2);
  });

  it('should correctly convert float32 samples to int16', () => {
    const left = new Float32Array([0, 1, -1, 0.5, -0.5]);
    const right = new Float32Array([0, -1, 1, -0.5, 0.5]);

    const audioBuffer = createMockAudioBuffer(
      { numberOfChannels: 2, sampleRate: 44100, length: 5 },
      [left, right]
    );

    const result = encodeWav(audioBuffer);
    const view = new DataView(result);

    // Sample data starts at offset 44, interleaved L/R as int16 LE
    // Sample 0: L=0 → 0, R=0 → 0
    expect(view.getInt16(44, true)).toBe(0);
    expect(view.getInt16(46, true)).toBe(0);

    // Sample 1: L=1.0 → 32767, R=-1.0 → -32768
    expect(view.getInt16(48, true)).toBe(32767);
    expect(view.getInt16(50, true)).toBe(-32768);

    // Sample 2: L=-1.0 → -32768, R=1.0 → 32767
    expect(view.getInt16(52, true)).toBe(-32768);
    expect(view.getInt16(54, true)).toBe(32767);

    // Sample 3: L=0.5 → ~16383, R=-0.5 → ~-16384
    expect(view.getInt16(56, true)).toBeCloseTo(16383, -1);
    expect(view.getInt16(58, true)).toBeCloseTo(-16384, -1);
  });

  it('should clamp values outside [-1, 1]', () => {
    const data = new Float32Array([1.5, -1.5]);

    const audioBuffer = createMockAudioBuffer(
      { numberOfChannels: 1, sampleRate: 44100, length: 2 },
      [data]
    );

    const result = encodeWav(audioBuffer);
    const view = new DataView(result);

    // 1.5 clamped to 1.0 → 32767
    expect(view.getInt16(44, true)).toBe(32767);
    // -1.5 clamped to -1.0 → -32768
    expect(view.getInt16(46, true)).toBe(-32768);
  });

  it('should handle zero-length audio', () => {
    const audioBuffer = createMockAudioBuffer({
      numberOfChannels: 2,
      sampleRate: 44100,
      length: 0,
    });

    const result = encodeWav(audioBuffer);
    expect(result.byteLength).toBe(44); // header only
    const view = new DataView(result);
    expect(view.getUint32(40, true)).toBe(0); // data size = 0
  });
});

describe('offline track volume conversion', () => {
  it('treats 0 dB as unity gain instead of silence', () => {
    expect(getOfflineTrackVolumeDb(0, false)).toBe(0);
    expect(getOfflineTrackGain(0, false)).toBe(1);
  });

  it('converts negative dB values to linear gain', () => {
    expect(getOfflineTrackVolumeDb(-6, false)).toBe(-6);
    expect(getOfflineTrackGain(-6, false)).toBeCloseTo(Math.pow(10, -6 / 20), 6);
  });

  it('silences muted tracks and floor-level volumes', () => {
    expect(getOfflineTrackVolumeDb(0, true)).toBe(-Infinity);
    expect(getOfflineTrackGain(0, true)).toBe(0);
    expect(getOfflineTrackVolumeDb(-60, false)).toBe(-Infinity);
    expect(getOfflineTrackGain(-60, false)).toBe(0);
  });
});
