import { afterEach, describe, expect, it, vi } from 'vitest';
import type * as Tone from 'tone';
import { loadReverbIR } from './reverbPresets';

afterEach(() => vi.unstubAllGlobals());

describe('reverb IR buffer cache', () => {
  it('shares decoded buffers at the same sample rate but decodes separately for a different rate', async () => {
    const data = new ArrayBuffer(8); const buffer = { duration: 3 } as AudioBuffer;
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, arrayBuffer: async () => data });
    vi.stubGlobal('fetch', fetchMock);
    const decode = vi.fn().mockResolvedValue(buffer);
    const first = { sampleRate: 32000, decodeAudioData: decode } as unknown as Tone.BaseContext;
    const otherDecode = vi.fn().mockResolvedValue(buffer);
    const second = { sampleRate: 32000, decodeAudioData: otherDecode } as unknown as Tone.BaseContext;
    const [a, b] = await Promise.all([loadReverbIR('hall', first), loadReverbIR('hall', second)]);
    expect(a).toBe(b); expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(decode).toHaveBeenCalledWith(data); expect(otherDecode).not.toHaveBeenCalled();
    await loadReverbIR('hall', { sampleRate: 96000, decodeAudioData: otherDecode } as unknown as Tone.BaseContext);
    expect(fetchMock).toHaveBeenCalledTimes(2); expect(otherDecode).toHaveBeenCalledOnce();
    expect(fetchMock.mock.calls[0][0]).toContain('/resources/fx/reverb/hall.wav');
  });

  it('reports failed requests and permits a later retry', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce({ ok: false, status: 404 })
      .mockResolvedValueOnce({ ok: true, arrayBuffer: async () => new ArrayBuffer(4) });
    vi.stubGlobal('fetch', fetchMock);
    const buffer = { duration: 1 } as AudioBuffer;
    const context = { sampleRate: 32000, decodeAudioData: vi.fn().mockResolvedValue(buffer) } as unknown as Tone.BaseContext;
    await expect(loadReverbIR('room', context)).rejects.toThrow('404');
    await expect(loadReverbIR('room', context)).resolves.toBe(buffer);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
