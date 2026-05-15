export const LOCAL_LLM_PROVIDER_KEY = 'local_browser';
export const LOCAL_LLM_MODEL_URL =
  'http://localhost:3000/models/gemma-4-E4B-it-web.task';
export const LOCAL_LLM_MODEL_FILENAME = 'gemma-4-E4B-it-web.task';
export const LOCAL_LLM_DISPLAY_NAME = 'Gemma 4 E4B';
export const LOCAL_LLM_LEGACY_FILENAMES = [
  'gemma-3n-E4B-it-int4-Web.litertlm',
];

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
  } else if (!crossOriginIsolated || !sharedArrayBufferAvailable) {
    reason = 'Local browser LLM requires SharedArrayBuffer support. Ensure COOP/COEP headers are enabled.';
  } else if (!webgpuExposed) {
    reason = 'Local browser LLM currently requires a browser with WebGPU support.';
  }

  return {
    supported: reason === null,
    webgpuExposed,
    crossOriginIsolated,
    sharedArrayBufferAvailable,
    secureContext,
    reason,
  };
}
