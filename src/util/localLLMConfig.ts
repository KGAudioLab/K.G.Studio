export const LOCAL_LLM_PROVIDER_KEY = 'local_browser';
export const LOCAL_LLM_DEFAULT_MODEL_URL =
  'https://huggingface.co/notabilia/gemma-4-E4B-it-litert-lm/resolve/main/gemma-4-E4B-it-web.task';
export const LOCAL_LLM_MODEL_FILENAME = 'gemma-4-E4B-it-web.task';
export const LOCAL_LLM_MODEL_EXPECTED_SIZE_BYTES = 2964324352;
export const LOCAL_LLM_DISPLAY_NAME = 'Gemma 4 E4B';
export const LOCAL_LLM_LEGACY_FILENAMES = [
  'gemma-3n-E4B-it-int4-Web.litertlm',
];
export const LOCAL_LLM_CONTEXT_LENGTH_OPTIONS = [32768, 65536, 131072] as const;
export const LOCAL_LLM_DEFAULT_CONTEXT_LENGTH = 32768;

export type LocalLLMContextLength = typeof LOCAL_LLM_CONTEXT_LENGTH_OPTIONS[number];

export interface LocalLLMRuntimeSupport {
  supported: boolean;
  webgpuExposed: boolean;
  crossOriginIsolated: boolean;
  sharedArrayBufferAvailable: boolean;
  secureContext: boolean;
  reason: string | null;
}

export function detectLocalLLMRuntimeSupport(): LocalLLMRuntimeSupport {
  const secureContext = typeof window !== 'undefined' ? window.isSecureContext : false;
  const crossOriginIsolated = typeof window !== 'undefined' ? window.crossOriginIsolated : false;
  const sharedArrayBufferAvailable = typeof SharedArrayBuffer !== 'undefined';
  const webgpuExposed = typeof navigator !== 'undefined' && 'gpu' in navigator;

  let reason: string | null = null;
  if (!secureContext) {
    reason = 'Local browser LLM requires a secure context (HTTPS or localhost).';
  } else if (!webgpuExposed) {
    reason = 'Local browser LLM currently requires a browser with WebGPU support.';
  } else if (!crossOriginIsolated || !sharedArrayBufferAvailable) {
    reason = 'This host may not support the local browser runtime reliably because cross-origin isolation or SharedArrayBuffer is unavailable. COOP/COEP headers may be missing.';
  }

  return {
    supported: secureContext && webgpuExposed,
    webgpuExposed,
    crossOriginIsolated,
    sharedArrayBufferAvailable,
    secureContext,
    reason,
  };
}

export function isLocalLLMContextLength(value: unknown): value is LocalLLMContextLength {
  return typeof value === 'number'
    && (LOCAL_LLM_CONTEXT_LENGTH_OPTIONS as readonly number[]).includes(value);
}

export function normalizeLocalLLMContextLength(value: unknown): LocalLLMContextLength {
  return isLocalLLMContextLength(value) ? value : LOCAL_LLM_DEFAULT_CONTEXT_LENGTH;
}

export function formatLocalLLMContextLength(value: LocalLLMContextLength): string {
  return `${Math.round(value / 1024)}k`;
}
