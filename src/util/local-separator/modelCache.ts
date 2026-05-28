import type { LocalSeparatorModelConfig } from './types';
import { OpfsModelCache, type ModelDownloadProgress } from '../opfsModelCache';

const cache = new OpfsModelCache({ directoryName: 'models' });

export { type ModelDownloadProgress };

export class LocalSeparatorModelCache {
  public static async exists(modelConfig: LocalSeparatorModelConfig): Promise<boolean> {
    return cache.exists(modelConfig.filename, {
      expectedSizeBytes: modelConfig.download.expectedSizeBytes,
    });
  }

  public static async getFile(modelConfig: LocalSeparatorModelConfig): Promise<File> {
    return cache.getFile(modelConfig.filename);
  }

  public static async getArrayBuffer(modelConfig: LocalSeparatorModelConfig): Promise<ArrayBuffer> {
    return cache.getArrayBuffer(modelConfig.filename);
  }

  public static async delete(modelConfig: LocalSeparatorModelConfig): Promise<void> {
    await cache.delete(modelConfig.filename);
  }

  public static async download(
    modelConfig: LocalSeparatorModelConfig,
    sourceUrl: string,
    onProgress?: (progress: ModelDownloadProgress) => void,
  ): Promise<void> {
    await cache.download(
      sourceUrl,
      modelConfig.filename,
      {
        expectedSizeBytes: modelConfig.download.expectedSizeBytes,
      },
      onProgress,
    );
  }
}
