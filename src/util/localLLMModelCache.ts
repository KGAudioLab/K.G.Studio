import { OpfsModelCache, type ModelDownloadProgress } from './opfsModelCache';
import { LOCAL_LLM_MODEL_FILENAME } from './localLLMConfig';

const cache = new OpfsModelCache({ directoryName: 'models' });
let writingToCachePromise: Promise<void> | null = null;

export { type ModelDownloadProgress };

export interface CachedModelStreamResult {
  reader: ReadableStreamDefaultReader<Uint8Array>;
  totalBytes: number;
  fromCache: boolean;
  cacheWritePromise: Promise<void> | null;
}

export class LocalLLMModelCache {
  public static async exists(filename: string = LOCAL_LLM_MODEL_FILENAME): Promise<boolean> {
    return cache.exists(filename);
  }

  public static async getFile(filename: string = LOCAL_LLM_MODEL_FILENAME): Promise<File> {
    return cache.getFile(filename);
  }

  public static async getArrayBuffer(filename: string = LOCAL_LLM_MODEL_FILENAME): Promise<ArrayBuffer> {
    return cache.getArrayBuffer(filename);
  }

  public static async delete(filename: string = LOCAL_LLM_MODEL_FILENAME): Promise<void> {
    await cache.delete(filename);
  }

  public static async loadModelReaderWithCache(
    sourceUrl: string,
    filename: string = LOCAL_LLM_MODEL_FILENAME,
    onProgress?: (progress: ModelDownloadProgress & { fromCache: boolean }) => void,
  ): Promise<CachedModelStreamResult> {
    if (writingToCachePromise) {
      await writingToCachePromise.catch(() => {});
    }

    if (await this.exists(filename)) {
      const file = await this.getFile(filename);
      onProgress?.({
        receivedBytes: file.size,
        totalBytes: file.size,
        percent: 100,
        fromCache: true,
      });
      return {
        reader: file.stream().getReader(),
        totalBytes: file.size,
        fromCache: true,
        cacheWritePromise: null,
      };
    }

    const response = await fetch(sourceUrl);
    if (!response.ok || !response.body) {
      throw new Error(`Model download failed (${response.status})`);
    }

    const totalBytesHeader = response.headers.get('Content-Length');
    const totalBytes = totalBytesHeader ? Number(totalBytesHeader) : 0;
    const [streamForConsumer, streamForCache] = response.body.tee();

    writingToCachePromise = cache.downloadStream(
      streamForCache,
      filename,
      totalBytes > 0 ? totalBytes : null,
      progress => onProgress?.({ ...progress, fromCache: false }),
    );
    writingToCachePromise = writingToCachePromise.finally(() => {
      writingToCachePromise = null;
    });

    return {
      reader: streamForConsumer.getReader(),
      totalBytes,
      fromCache: false,
      cacheWritePromise: writingToCachePromise,
    };
  }

  public static async download(
    sourceUrl: string,
    filename: string = LOCAL_LLM_MODEL_FILENAME,
    onProgress?: (progress: ModelDownloadProgress) => void,
  ): Promise<void> {
    await cache.download(sourceUrl, filename, onProgress);
  }
}
