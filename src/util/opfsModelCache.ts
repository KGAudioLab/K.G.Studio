export interface ModelDownloadProgress {
  receivedBytes: number;
  totalBytes: number | null;
  percent: number;
}

interface OpfsModelCacheOptions {
  directoryName?: string;
  sizeSuffix?: string;
  tempSuffix?: string;
}

export class OpfsModelCache {
  private readonly directoryName: string;
  private readonly sizeSuffix: string;
  private readonly tempSuffix: string;

  constructor(options: OpfsModelCacheOptions = {}) {
    this.directoryName = options.directoryName ?? 'models';
    this.sizeSuffix = options.sizeSuffix ?? '.size';
    this.tempSuffix = options.tempSuffix ?? '.download';
  }

  public async exists(filename: string): Promise<boolean> {
    try {
      const dir = await this.getDir();
      const fileHandle = await dir.getFileHandle(filename);
      const sizeHandle = await dir.getFileHandle(this.getSizeFilename(filename));
      const [file, sizeFile] = await Promise.all([fileHandle.getFile(), sizeHandle.getFile()]);
      const expectedSize = Number(await sizeFile.text());
      if (!Number.isFinite(expectedSize) || expectedSize <= 0) {
        await this.delete(filename);
        return false;
      }
      if (file.size !== expectedSize) {
        await this.delete(filename);
        return false;
      }
      return true;
    } catch {
      return false;
    }
  }

  public async getFile(filename: string): Promise<File> {
    const dir = await this.getDir();
    const handle = await dir.getFileHandle(filename);
    const file = await handle.getFile();
    console.log('[opfsModelCache] Opened cached file.', {
      filename,
      size: file.size,
    });
    return file;
  }

  public async getArrayBuffer(filename: string): Promise<ArrayBuffer> {
    const file = await this.getFile(filename);
    return file.arrayBuffer();
  }

  public async delete(filename: string): Promise<void> {
    const dir = await this.getDir();
    await this.removeIfExists(dir, filename);
    await this.removeIfExists(dir, this.getSizeFilename(filename));
    await this.removeIfExists(dir, `${filename}${this.tempSuffix}`);
    await this.removeIfExists(dir, `${this.getSizeFilename(filename)}${this.tempSuffix}`);
  }

  public async download(
    sourceUrl: string,
    filename: string,
    onProgress?: (progress: ModelDownloadProgress) => void,
  ): Promise<void> {
    const response = await fetch(sourceUrl);
    if (!response.ok) {
      throw new Error(`Model download failed (${response.status})`);
    }
    const totalBytesHeader = response.headers.get('Content-Length');
    const totalBytes = totalBytesHeader ? Number(totalBytesHeader) : null;
    if (!response.body) {
      throw new Error('Model download response did not include a readable body.');
    }
    await this.downloadStream(response.body, filename, totalBytes, onProgress);
  }

  public async downloadStream(
    stream: ReadableStream<Uint8Array>,
    filename: string,
    totalBytes: number | null,
    onProgress?: (progress: ModelDownloadProgress) => void,
  ): Promise<void> {
    const dir = await this.getDir();
    await this.delete(filename);

    const tempFilename = `${filename}${this.tempSuffix}`;
    const tempHandle = await dir.getFileHandle(tempFilename, { create: true });
    const tempWritable = await tempHandle.createWritable();
    const reader = stream.getReader();
    let receivedBytes = 0;

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (!value) continue;
        await tempWritable.write(value);
        receivedBytes += value.byteLength;
        onProgress?.({
          receivedBytes,
          totalBytes,
          percent: totalBytes ? (receivedBytes / totalBytes) * 100 : 0,
        });
      }
      await tempWritable.close();

      const sizeValue = totalBytes ?? receivedBytes;
      if (!Number.isFinite(sizeValue) || sizeValue <= 0) {
        throw new Error('Model download did not provide a valid size.');
      }

      console.log(`[opfsModelCache] Finalizing cached model ${filename} from temp file ${tempFilename}.`);
      const finalHandle = await dir.getFileHandle(filename, { create: true });
      const finalWritable = await finalHandle.createWritable();
      try {
        const tempFile = await tempHandle.getFile();
        const tempBuffer = await tempFile.arrayBuffer();
        console.log('[opfsModelCache] Temp file ready for finalize copy.', {
          filename,
          tempFilename,
          tempSize: tempFile.size,
          expectedSize: sizeValue,
        });
        await finalWritable.write(tempBuffer);
        await finalWritable.close();
      } catch (error) {
        await finalWritable.abort();
        throw error;
      }

      const sizeHandle = await dir.getFileHandle(this.getSizeFilename(filename), { create: true });
      const sizeWritable = await sizeHandle.createWritable();
      try {
        await sizeWritable.write(String(sizeValue));
        await sizeWritable.close();
      } catch (error) {
        await sizeWritable.abort();
        throw error;
      }

      onProgress?.({
        receivedBytes: sizeValue,
        totalBytes: sizeValue,
        percent: 100,
      });
      console.log('[opfsModelCache] Cached model finalize completed.', {
        filename,
        size: sizeValue,
      });
    } catch (error) {
      try {
        await tempWritable.abort();
      } catch {
        // Ignore abort cleanup errors.
      }
      await this.delete(filename);
      throw error;
    } finally {
      await this.removeIfExists(dir, tempFilename);
      reader.releaseLock();
    }
  }

  private getSizeFilename(filename: string): string {
    return `${filename}${this.sizeSuffix}`;
  }

  private async getDir(): Promise<FileSystemDirectoryHandle> {
    const root = await navigator.storage.getDirectory();
    return root.getDirectoryHandle(this.directoryName, { create: true });
  }

  private async removeIfExists(dir: FileSystemDirectoryHandle, name: string): Promise<void> {
    try {
      await dir.removeEntry(name);
    } catch {
      // Ignore missing entry cleanup.
    }
  }
}
