import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  toneAudioBuffersCtorMock,
  existsMock,
  getInstrumentObjectUrlsMock,
  storeInstrumentMock,
  deleteInstrumentMock,
  configGetMock,
} = vi.hoisted(() => ({
  toneAudioBuffersCtorMock: vi.fn(),
  existsMock: vi.fn(),
  getInstrumentObjectUrlsMock: vi.fn(),
  storeInstrumentMock: vi.fn(),
  deleteInstrumentMock: vi.fn(),
  configGetMock: vi.fn(),
}));

vi.mock('../../constants/generalMidiConstants', () => ({
  FLUIDR3_INSTRUMENT_MAP: {
    test_instrument: {
      displayName: 'Test Instrument',
      midiInstrument: 1,
      image: 'test.png',
      group: 'TEST',
      pitchRange: [60, 61],
    },
  },
}));

vi.mock('../config/ConfigManager', () => ({
  ConfigManager: {
    instance: () => ({
      getIsInitialized: () => true,
      initialize: vi.fn().mockResolvedValue(undefined),
      get: configGetMock,
    }),
  },
}));

vi.mock('../../util/soundfontInstrumentCache', () => ({
  SoundfontInstrumentCache: {
    exists: existsMock,
    getInstrumentObjectUrls: getInstrumentObjectUrlsMock,
    storeInstrument: storeInstrumentMock,
    deleteInstrument: deleteInstrumentMock,
  },
}));

vi.mock('tone', () => ({
  ToneAudioBuffers: toneAudioBuffersCtorMock,
}));

import { KGToneBuffersPool } from './KGToneBuffersPool';

describe('KGToneBuffersPool soundfont cache behavior', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    configGetMock.mockReturnValue('https://cdn.example.com/FluidR3_GM/');
    existsMock.mockResolvedValue(false);
    getInstrumentObjectUrlsMock.mockResolvedValue({
      C4: 'blob:cached-c4',
      Db4: 'blob:cached-db4',
    });
    storeInstrumentMock.mockResolvedValue(undefined);
    deleteInstrumentMock.mockResolvedValue(undefined);

    toneAudioBuffersCtorMock.mockImplementation((options: {
      urls: Record<string, string>;
      onload: () => void;
      onerror?: (error: Error) => void;
    }) => {
      const buffers = {
        loaded: true,
        has: (key: string) => key in options.urls,
        get: (key: string) => ({ key, duration: 1, loaded: true }),
        dispose: vi.fn(),
      };
      queueMicrotask(() => options.onload());
      return buffers;
    });

    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (url.includes('Db4') && url.includes('fail-db4')) {
        return new Response(null, { status: 500 });
      }
      return new Response(new Uint8Array([1, 2, 3]), { status: 200 });
    }));
    vi.stubGlobal('URL', {
      createObjectURL: vi.fn((blob: Blob) => `blob:${blob.size}:${Math.random()}`),
      revokeObjectURL: vi.fn(),
    });

    KGToneBuffersPool.instance().dispose();
    (KGToneBuffersPool as unknown as { _instance: KGToneBuffersPool | null })._instance = null;
  });

  it('loads from OPFS cache without refetching remote URLs', async () => {
    existsMock.mockResolvedValue(true);

    const pool = KGToneBuffersPool.instance();
    const buffers = await pool.getToneAudioBuffers('test_instrument');

    expect(buffers.loaded).toBe(true);
    expect(getInstrumentObjectUrlsMock).toHaveBeenCalledOnce();
    expect(fetch).not.toHaveBeenCalled();
  });

  it('stores a complete remote instrument and reuses the in-memory cache', async () => {
    const pool = KGToneBuffersPool.instance();

    await pool.getToneAudioBuffers('test_instrument');
    await pool.getToneAudioBuffers('test_instrument');

    expect(fetch).toHaveBeenCalledTimes(2);
    expect(storeInstrumentMock).toHaveBeenCalledOnce();
    expect(toneAudioBuffersCtorMock).toHaveBeenCalledOnce();
  });

  it('does not persist or memoize a partial remote load', async () => {
    configGetMock.mockReturnValue('https://fail-db4.example.com/FluidR3_GM/');
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (url.includes('Db4')) {
        return new Response(null, { status: 500 });
      }
      return new Response(new Uint8Array([1, 2, 3]), { status: 200 });
    }));

    const pool = KGToneBuffersPool.instance();
    const first = await pool.getToneAudioBuffers('test_instrument');
    const second = await pool.getToneAudioBuffers('test_instrument');

    expect(first.loaded).toBe(true);
    expect(second.loaded).toBe(true);
    expect(fetch).toHaveBeenCalledTimes(4);
    expect(storeInstrumentMock).not.toHaveBeenCalled();
    expect(deleteInstrumentMock).toHaveBeenCalled();
  });

  it('retries remote loading after a previous partial success', async () => {
    let requestCount = 0;
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      requestCount += 1;
      if (requestCount <= 2 && url.includes('Db4')) {
        return new Response(null, { status: 500 });
      }
      return new Response(new Uint8Array([1, 2, 3]), { status: 200 });
    }));

    const pool = KGToneBuffersPool.instance();
    await pool.getToneAudioBuffers('test_instrument');
    await pool.getToneAudioBuffers('test_instrument');

    expect(fetch).toHaveBeenCalledTimes(4);
    expect(storeInstrumentMock).toHaveBeenCalledOnce();
  });

  it('deduplicates concurrent loads for the same instrument', async () => {
    let onloadCount = 0;
    toneAudioBuffersCtorMock.mockImplementation((options: {
      urls: Record<string, string>;
      onload: () => void;
    }) => {
      const buffers = {
        loaded: true,
        has: (key: string) => key in options.urls,
        get: (key: string) => ({ key, duration: 1, loaded: true }),
        dispose: vi.fn(),
      };
      setTimeout(() => {
        onloadCount += 1;
        options.onload();
      }, 0);
      return buffers;
    });

    const pool = KGToneBuffersPool.instance();
    const [first, second] = await Promise.all([
      pool.getToneAudioBuffers('test_instrument'),
      pool.getToneAudioBuffers('test_instrument'),
    ]);

    expect(first).toBe(second);
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(toneAudioBuffersCtorMock).toHaveBeenCalledOnce();
    expect(onloadCount).toBe(1);
  });
});
