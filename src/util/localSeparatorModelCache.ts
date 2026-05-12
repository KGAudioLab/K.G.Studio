import { LOCAL_SEPARATOR_MODEL_FILENAME } from './localSeparatorConfig';

export interface ModelDownloadProgress {
  receivedBytes: number;
  totalBytes: number | null;
  percent: number;
}

export class LocalSeparatorModelCache {
  private static readonly MODELS_DIR = 'models';
  private static readonly TEMP_SUFFIX = '.download';

  public static async exists(filename: string = LOCAL_SEPARATOR_MODEL_FILENAME): Promise<boolean> {
    try {
      const modelsDir = await this.getModelsDir();
      await modelsDir.getFileHandle(filename);
      return true;
    } catch {
      return false;
    }
  }

  public static async getFile(filename: string = LOCAL_SEPARATOR_MODEL_FILENAME): Promise<File> {
    const modelsDir = await this.getModelsDir();
    const fileHandle = await modelsDir.getFileHandle(filename);
    return fileHandle.getFile();
  }

  public static async getArrayBuffer(filename: string = LOCAL_SEPARATOR_MODEL_FILENAME): Promise<ArrayBuffer> {
    const file = await this.getFile(filename);
    return file.arrayBuffer();
  }

  public static async delete(filename: string = LOCAL_SEPARATOR_MODEL_FILENAME): Promise<void> {
    try {
      const modelsDir = await this.getModelsDir();
      await modelsDir.removeEntry(filename);
    } catch {
      // Ignore missing file cleanup.
    }

    try {
      const modelsDir = await this.getModelsDir();
      await modelsDir.removeEntry(`${filename}${this.TEMP_SUFFIX}`);
    } catch {
      // Ignore missing temp file cleanup.
    }
  }

  public static async download(
    sourceUrl: string,
    filename: string = LOCAL_SEPARATOR_MODEL_FILENAME,
    onProgress?: (progress: ModelDownloadProgress) => void,
  ): Promise<void> {
    const response = await fetch(sourceUrl);
    if (!response.ok) {
      throw new Error(`Model download failed (${response.status})`);
    }

    const modelsDir = await this.getModelsDir();
    const tempName = `${filename}${this.TEMP_SUFFIX}`;
    await this.delete(filename);

    const tempHandle = await modelsDir.getFileHandle(tempName, { create: true });
    const writable = await tempHandle.createWritable();

    try {
      const totalBytesHeader = response.headers.get('Content-Length');
      const totalBytes = totalBytesHeader ? Number(totalBytesHeader) : null;

      if (!response.body) {
        const buffer = await response.arrayBuffer();
        await writable.write(buffer);
        onProgress?.({
          receivedBytes: buffer.byteLength,
          totalBytes,
          percent: 100,
        });
      } else {
        const reader = response.body.getReader();
        let receivedBytes = 0;

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          if (!value) continue;
          await writable.write(value);
          receivedBytes += value.byteLength;
          onProgress?.({
            receivedBytes,
            totalBytes,
            percent: totalBytes ? (receivedBytes / totalBytes) * 100 : 0,
          });
        }
      }
    } catch (error) {
      await writable.abort();
      await this.delete(filename);
      throw error;
    }

    await writable.close();

    const finalHandle = await modelsDir.getFileHandle(filename, { create: true });
    const finalWritable = await finalHandle.createWritable();
    try {
      const tempFile = await tempHandle.getFile();
      await finalWritable.write(await tempFile.arrayBuffer());
      await finalWritable.close();
    } catch (error) {
      await finalWritable.abort();
      throw error;
    } finally {
      try {
        await modelsDir.removeEntry(tempName);
      } catch {
        // Ignore temp cleanup errors.
      }
    }
  }

  private static async getModelsDir(): Promise<FileSystemDirectoryHandle> {
    const root = await navigator.storage.getDirectory();
    return root.getDirectoryHandle(this.MODELS_DIR, { create: true });
  }
}
