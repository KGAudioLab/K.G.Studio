import { HF_MODEL_DOWNLOAD_HEADER, HF_MODEL_DOWNLOAD_ROUTE, isHuggingFaceModelUrl, isLoopbackHostname } from './huggingFaceModelEndpoint';

export async function fetchModel(sourceUrl: string, options?: { signal?: AbortSignal }): Promise<Response> {
  if (typeof location !== 'undefined' && isLoopbackHostname(location.hostname)) {
    const source = new URL(sourceUrl, location.href);
    if (isHuggingFaceModelUrl(source)) {
      const endpoint = new URL(`${import.meta.env.BASE_URL}${HF_MODEL_DOWNLOAD_ROUTE}`, location.origin);
      endpoint.searchParams.set('url', source.href);
      const response = await fetch(endpoint, options);
      if (response.headers.has(HF_MODEL_DOWNLOAD_HEADER)) return response;
      // A static host or a local server without a token leaves the download to the browser.
      await response.body?.cancel();
    }
  }
  return fetch(sourceUrl, options);
}
