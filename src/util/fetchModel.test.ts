import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchModel } from './fetchModel';
import { HF_MODEL_DOWNLOAD_HEADER } from './huggingFaceModelEndpoint';

const hubModel = 'https://huggingface.co/KGAudioLab/instrument-aire-models/resolve/main/model.onnx';

afterEach(() => vi.unstubAllGlobals());

describe('fetchModel', () => {
  it('uses the localhost download endpoint for a Hugging Face file', async () => {
    vi.stubGlobal('location', new URL('http://localhost:5173/kgstudio/'));
    const model = new Response('model', { headers: { [HF_MODEL_DOWNLOAD_HEADER]: '1' } });
    const fetch = vi.fn().mockResolvedValue(model);
    vi.stubGlobal('fetch', fetch);
    const signal = new AbortController().signal;

    expect(await fetchModel(hubModel, { signal })).toBe(model);
    expect(fetch).toHaveBeenCalledTimes(1);
    const [endpoint, options] = fetch.mock.calls[0];
    expect(endpoint.origin).toBe('http://localhost:5173');
    expect(endpoint.searchParams.get('url')).toBe(hubModel);
    expect(options).toEqual({ signal });
  });

  it('downloads directly when the local endpoint is unavailable', async () => {
    vi.stubGlobal('location', new URL('http://localhost:5173/kgstudio/'));
    const model = new Response('model');
    const fetch = vi.fn().mockResolvedValueOnce(new Response(null, { status: 204 })).mockResolvedValueOnce(model);
    vi.stubGlobal('fetch', fetch);

    expect(await fetchModel(hubModel)).toBe(model);
    expect(fetch).toHaveBeenLastCalledWith(hubModel, undefined);
  });

  it.each([
    ['https://kgaudiolab.github.io/kgstudio/', hubModel],
    ['http://localhost:5173/kgstudio/', hubModel.replace('huggingface.co/', 'huggingface.co.example.com/') ],
  ])('downloads directly from %s when the proxy does not apply', async (pageUrl, source) => {
    vi.stubGlobal('location', new URL(pageUrl));
    const fetch = vi.fn().mockResolvedValue(new Response('model'));
    vi.stubGlobal('fetch', fetch);

    await fetchModel(source);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch).toHaveBeenCalledWith(source, undefined);
  });
});
