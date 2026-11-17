export const HUGGING_FACE_ORIGIN = 'https://huggingface.co';
export const HF_MODEL_DOWNLOAD_ROUTE = '__hf-model';
export const HF_MODEL_DOWNLOAD_HEADER = 'X-KGStudio-HF-Download';

export function isHuggingFaceModelUrl(url: URL): boolean {
  return url.origin === HUGGING_FACE_ORIGIN && !url.username && !url.password
    && /^\/(?:[^/]+\/){1,3}resolve\/[^/]+\/.+/.test(url.pathname);
}

export function isLoopbackHostname(hostname: string): boolean {
  return ['localhost', '127.0.0.1', '[::1]'].includes(hostname.toLowerCase());
}
