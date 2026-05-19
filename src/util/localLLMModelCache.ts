import { OpfsModelCache, type ModelDownloadProgress } from './opfsModelCache';
import { LOCAL_LLM_MODEL_EXPECTED_SIZE_BYTES, LOCAL_LLM_MODEL_FILENAME } from './localLLMConfig';

const cache = new OpfsModelCache({ directoryName: 'models' });
let writingToCachePromise: Promise<void> | null = null;

export { type ModelDownloadProgress };

export interface CachedModelStreamResult {
  reader: ReadableStreamDefaultReader<Uint8Array>;
  totalBytes: number;
  fromCache: boolean;
  cacheWritePromise: Promise<void> | null;
}

const createProgressReader = (
  file: File,
  onProgress?: (progress: ModelDownloadProgress & { fromCache: boolean }) => void,
): ReadableStreamDefaultReader<Uint8Array> => {
  const sourceReader = file.stream().getReader();
  let receivedBytes = 0;

  const monitoredStream = new ReadableStream<Uint8Array>({
    async pull(controller) {
      const { done, value } = await sourceReader.read();
      if (done) {
        controller.close();
        return;
      }

      if (!value) {
        return;
      }

      receivedBytes += value.byteLength;
      onProgress?.({
        receivedBytes,
        totalBytes: file.size,
        percent: file.size > 0 ? (receivedBytes / file.size) * 100 : 0,
        fromCache: true,
      });
      controller.enqueue(value);
    },
    async cancel(reason) {
      await sourceReader.cancel(reason);
    },
  });

  return monitoredStream.getReader();
};

export class LocalLLMModelCache {
  public static async exists(filename: string = LOCAL_LLM_MODEL_FILENAME): Promise<boolean> {
    return cache.exists(filename, {
      expectedSizeBytes: LOCAL_LLM_MODEL_EXPECTED_SIZE_BYTES,
    });
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
      return {
        reader: createProgressReader(file, onProgress),
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
      {
        expectedSizeBytes: LOCAL_LLM_MODEL_EXPECTED_SIZE_BYTES,
      },
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
    await cache.download(
      sourceUrl,
      filename,
      {
        expectedSizeBytes: LOCAL_LLM_MODEL_EXPECTED_SIZE_BYTES,
      },
      onProgress,
    );
  }
}
