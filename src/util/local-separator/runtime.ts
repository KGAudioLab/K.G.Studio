import * as ort from 'onnxruntime-web/webgpu';
import ortWasmAsyncifyUrl from 'onnxruntime-web/ort-wasm-simd-threaded.asyncify.wasm?url';
import type { LocalRuntimeState, LocalRuntimeSupport, LocalSeparatorModelConfig } from './types';

function log(message: string, payload?: unknown): void {
  if (payload === undefined) {
    console.log(`[localSeparator] ${message}`);
    return;
  }
  console.log(`[localSeparator] ${message}`, payload);
}

export function detectLocalRuntimeSupport(): LocalRuntimeSupport {
  const support = {
    webgpuExposed: typeof navigator !== 'undefined' && 'gpu' in navigator,
  };
  if (support.webgpuExposed) {
    log('WebGPU API is exposed by this browser.');
  } else {
    log('WebGPU API is not exposed by this browser. CPU/wasm will be used.');
  }
  return support;
}

export class LocalOrtRuntimeManager {
  private runtime: LocalRuntimeState | null = null;
  private currentModel: string | null = null;
  private readonly onProviderChange: (provider: string) => void;
  private static wasmPathsConfigured = false;

  constructor({ onProviderChange }: { onProviderChange?: (provider: string) => void } = {}) {
    this.onProviderChange = onProviderChange ?? (() => {});
  }

  public reset(): void {
    this.runtime = null;
    this.currentModel = null;
  }

  public async ensureRuntime(modelConfig: LocalSeparatorModelConfig, modelData: Uint8Array): Promise<LocalRuntimeState> {
    if (this.runtime && this.currentModel === modelConfig.filename) {
      return this.runtime;
    }

    if (!LocalOrtRuntimeManager.wasmPathsConfigured) {
      ort.env.wasm.wasmPaths = {
        wasm: ortWasmAsyncifyUrl,
      };
      log('Configured ONNX Runtime wasm paths.', ort.env.wasm.wasmPaths);
      LocalOrtRuntimeManager.wasmPathsConfigured = true;
    }

    const providersToTry: Array<'webgpu' | 'wasm'> = [];
    if (typeof navigator !== 'undefined' && 'gpu' in navigator) {
      providersToTry.push('webgpu');
      log('navigator.gpu is available, trying WebGPU first.');
    } else {
      log('navigator.gpu is not available. Falling back to CPU/wasm.');
    }
    providersToTry.push('wasm');

    let lastError: unknown = null;
    for (const provider of providersToTry) {
      try {
        if (provider === 'webgpu' && ort.env?.webgpu) {
          ort.env.webgpu.powerPreference = 'high-performance';
          log('Using WebGPU power preference high-performance.');
        }

        const session = await ort.InferenceSession.create(modelData, {
          executionProviders: [provider],
          graphOptimizationLevel: 'all',
        });

        this.runtime = { provider, session };
        this.currentModel = modelConfig.filename;
        this.onProviderChange(provider === 'wasm' ? 'cpu/wasm' : provider);
        log(`Using provider: ${provider}`);
        return this.runtime;
      } catch (error) {
        lastError = error;
        if (provider === 'webgpu') {
          log('WebGPU session creation failed. Falling back to CPU/wasm.', error);
          this.onProviderChange('cpu/wasm fallback');
        } else {
          log(`Provider failed: ${provider}`, error);
        }
      }
    }

    throw new Error(`Unable to create ONNX Runtime session. ${lastError ? String(lastError) : ''}`.trim());
  }
}
