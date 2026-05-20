import {
  LOCAL_SEPARATOR_MODEL_EXPECTED_SIZE_BYTES,
  LOCAL_SEPARATOR_MODEL_FILENAME,
} from './localSeparatorConfig';
import { OpfsModelCache, type ModelDownloadProgress } from './opfsModelCache';

const cache = new OpfsModelCache({ directoryName: 'models' });

export { type ModelDownloadProgress };

export class LocalSeparatorModelCache {
  public static async exists(filename: string = LOCAL_SEPARATOR_MODEL_FILENAME): Promise<boolean> {
    return cache.exists(filename, {
      expectedSizeBytes: LOCAL_SEPARATOR_MODEL_EXPECTED_SIZE_BYTES,
    });
  }

  public static async getFile(filename: string = LOCAL_SEPARATOR_MODEL_FILENAME): Promise<File> {
    return cache.getFile(filename);
  }

  public static async getArrayBuffer(filename: string = LOCAL_SEPARATOR_MODEL_FILENAME): Promise<ArrayBuffer> {
    return cache.getArrayBuffer(filename);
  }

  public static async delete(filename: string = LOCAL_SEPARATOR_MODEL_FILENAME): Promise<void> {
    await cache.delete(filename);
  }

  public static async download(
    sourceUrl: string,
    filename: string = LOCAL_SEPARATOR_MODEL_FILENAME,
    onProgress?: (progress: ModelDownloadProgress) => void,
  ): Promise<void> {
    await cache.download(
      sourceUrl,
      filename,
      {
        expectedSizeBytes: LOCAL_SEPARATOR_MODEL_EXPECTED_SIZE_BYTES,
      },
      onProgress,
    );
  }
}
