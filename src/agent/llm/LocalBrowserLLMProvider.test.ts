import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const {
  configGetMock,
  ensureRuntimeSupportedMock,
  notifyLoadProgressMock,
  notifyLoadStartMock,
  notifyCacheReadyMock,
  notifyLoadErrorMock,
  loadModelReaderWithCacheMock,
} = vi.hoisted(() => ({
  configGetMock: vi.fn(),
  ensureRuntimeSupportedMock: vi.fn(async () => undefined),
  notifyLoadProgressMock: vi.fn(),
  notifyLoadStartMock: vi.fn(),
  notifyCacheReadyMock: vi.fn(),
  notifyLoadErrorMock: vi.fn(),
  loadModelReaderWithCacheMock: vi.fn(),
}));

vi.mock('../../core/config/ConfigManager', () => ({
  ConfigManager: {
    instance: () => ({
      get: configGetMock,
    }),
  },
}));

vi.mock('../../util/localLLMModelManager', () => ({
  LocalLLMModelManager: {
    ensureRuntimeSupported: ensureRuntimeSupportedMock,
    notifyLoadProgress: notifyLoadProgressMock,
    notifyLoadStart: notifyLoadStartMock,
    notifyCacheReady: notifyCacheReadyMock,
    notifyLoadError: notifyLoadErrorMock,
  },
}));

vi.mock('../../util/localLLMModelCache', () => ({
  LocalLLMModelCache: {
    loadModelReaderWithCache: loadModelReaderWithCacheMock,
  },
}));

import { LocalBrowserLLMProvider } from './LocalBrowserLLMProvider';

describe('LocalBrowserLLMProvider', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  beforeEach(() => {
    configGetMock.mockReset();
    ensureRuntimeSupportedMock.mockClear();
    notifyLoadProgressMock.mockClear();
    notifyLoadStartMock.mockClear();
    notifyCacheReadyMock.mockClear();
    notifyLoadErrorMock.mockClear();
    loadModelReaderWithCacheMock.mockReset();
  });

  async function runProviderAndCaptureOptions(configValue: unknown): Promise<Record<string, unknown>> {
    const createFromOptionsMock = vi.fn(async (_fileset: unknown, options: Record<string, unknown>) => ({
      generateResponse: (_prompt: string, callback: (partial: string, done: boolean) => void) => {
        callback('hello', true);
      },
      sizeInTokens: (text: string) => text.length,
    }));

    configGetMock.mockReturnValue(configValue);
    loadModelReaderWithCacheMock.mockResolvedValue({
      reader: new Uint8Array([1, 2, 3]),
      totalBytes: 3,
      fromCache: true,
      cacheWritePromise: null,
    });

    vi.spyOn(LocalBrowserLLMProvider.prototype as never, 'getMediaPipeModule' as never).mockResolvedValue({
      FilesetResolver: {
        forGenAiTasks: vi.fn(async () => ({})),
      },
      LlmInference: {
        createFromOptions: createFromOptionsMock,
      },
    });

    const provider = new LocalBrowserLLMProvider();
    const chunks: unknown[] = [];
    for await (const chunk of provider.generateStream([])) {
      chunks.push(chunk);
    }

    expect(chunks.length).toBeGreaterThan(0);
    return createFromOptionsMock.mock.calls[0][1] as Record<string, unknown>;
  }

  it('uses the configured maxTokens value', async () => {
    const options = await runProviderAndCaptureOptions(65536);
    expect(options.maxTokens).toBe(65536);
  });

  it('falls back to 32768 when config is invalid', async () => {
    const options = await runProviderAndCaptureOptions(99999);
    expect(options.maxTokens).toBe(32768);
  });

  it('reports runtime initialization failures through the model manager', async () => {
    configGetMock.mockReturnValue(32768);
    loadModelReaderWithCacheMock.mockResolvedValue({
      reader: new Uint8Array([1, 2, 3]),
      totalBytes: 3,
      fromCache: false,
      cacheWritePromise: null,
    });

    const runtimeError = new Error('runtime init failed');
    vi.spyOn(LocalBrowserLLMProvider.prototype as never, 'getMediaPipeModule' as never).mockResolvedValue({
      FilesetResolver: {
        forGenAiTasks: vi.fn(async () => ({})),
      },
      LlmInference: {
        createFromOptions: vi.fn(async () => {
          throw runtimeError;
        }),
      },
    });

    const provider = new LocalBrowserLLMProvider();

    await expect(async () => {
      for await (const _chunk of provider.generateStream([])) {
        // No-op.
      }
    }).rejects.toThrow('runtime init failed');

    expect(ensureRuntimeSupportedMock).toHaveBeenCalled();
    expect(notifyLoadErrorMock).toHaveBeenCalledWith(runtimeError);
  });
});
