export interface ModelDownloadProgress {
  receivedBytes: number;
  totalBytes: number | null;
  percent: number;
}

interface OpfsModelCacheOptions {
  directoryName?: string;
  sizeSuffix?: string;
}

interface ModelCacheValidationOptions {
  expectedSizeBytes?: number | null;
  signal?: AbortSignal;
}

export class OpfsModelCache {
  private readonly directoryName: string;
  private readonly sizeSuffix: string;

  constructor(options: OpfsModelCacheOptions = {}) {
    this.directoryName = options.directoryName ?? 'models';
    this.sizeSuffix = options.sizeSuffix ?? '.size';
  }

  public async exists(filename: string, options: ModelCacheValidationOptions = {}): Promise<boolean> {
    const originalPath = filename;
    try {
      const dir = await this.getDir(filename);
      filename = filename.split('/').pop()!;
      const fileHandle = await dir.getFileHandle(filename);
      const sizeHandle = await dir.getFileHandle(this.getSizeFilename(filename));
      const [file, sizeFile] = await Promise.all([fileHandle.getFile(), sizeHandle.getFile()]);
      const expectedSize = Number(await sizeFile.text());
      if (!Number.isFinite(expectedSize) || expectedSize <= 0) {
        await this.delete(originalPath);
        return false;
      }
      if (options.expectedSizeBytes != null && expectedSize !== options.expectedSizeBytes) {
        await this.delete(originalPath);
        return false;
      }
      if (file.size !== expectedSize) {
        await this.delete(originalPath);
        return false;
      }
      return true;
    } catch {
      return false;
    }
  }

  public async getFile(filename: string): Promise<File> {
    const dir = await this.getDir(filename);
    filename = filename.split('/').pop()!;
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
    const dir = await this.getDir(filename);
    filename = filename.split('/').pop()!;
    await this.removeIfExists(dir, filename);
    await this.removeIfExists(dir, this.getSizeFilename(filename));
  }

  public async download(
    sourceUrl: string,
    filename: string,
    options: ModelCacheValidationOptions = {},
    onProgress?: (progress: ModelDownloadProgress) => void,
  ): Promise<void> {
    options.signal?.throwIfAborted();
    const response = await fetch(sourceUrl, { signal: options.signal });
    if (!response.ok) {
      throw new Error(`Model download failed (${response.status})`);
    }
    const totalBytesHeader = response.headers.get('Content-Length');
    const parsedSize = Number(totalBytesHeader);
    const totalBytes = Number.isFinite(parsedSize) && parsedSize > 0 ? parsedSize : null;
    if (!response.body) {
      throw new Error('Model download response did not include a readable body.');
    }
    await this.downloadStream(response.body, filename, totalBytes, options, onProgress);
  }

  public async downloadStream(
    stream: ReadableStream<Uint8Array>,
    filename: string,
    totalBytes: number | null,
    options: ModelCacheValidationOptions = {},
    onProgress?: (progress: ModelDownloadProgress) => void,
  ): Promise<void> {
    const originalPath = filename;
    const reader = stream.getReader();
    let finalWritable: FileSystemWritableFileStream | undefined;
    const onAbort = () => { void reader.cancel(options.signal?.reason).catch(() => {}); };
    options.signal?.addEventListener('abort', onAbort, { once: true });
    let receivedBytes = 0;

    try {
      options.signal?.throwIfAborted();
      const dir = await this.getDir(filename);
      await this.delete(filename);
      filename = filename.split('/').pop()!;
      const finalHandle = await dir.getFileHandle(filename, { create: true });
      finalWritable = await finalHandle.createWritable();
      while (true) {
        options.signal?.throwIfAborted();
        const { done, value } = await reader.read();
        options.signal?.throwIfAborted();
        if (done) break;
        if (!value) continue;
        await finalWritable.write(value);
        receivedBytes += value.byteLength;
        onProgress?.({
          receivedBytes,
          totalBytes,
          percent: totalBytes ? (receivedBytes / totalBytes) * 100 : 0,
        });
      }
      await finalWritable.close();
      options.signal?.throwIfAborted();

      if (totalBytes != null && receivedBytes !== totalBytes) {
        throw new Error('Model download ended before the advertised size was received.');
      }

      const sizeValue = totalBytes ?? receivedBytes;
      if (!Number.isFinite(sizeValue) || sizeValue <= 0) {
        throw new Error('Model download did not provide a valid size.');
      }
      if (options.expectedSizeBytes != null && receivedBytes !== options.expectedSizeBytes) {
        throw new Error(`Model download size mismatch for ${filename}: expected ${options.expectedSizeBytes} bytes, got ${receivedBytes}.`);
      }

      const sizeHandle = await dir.getFileHandle(this.getSizeFilename(filename), { create: true });
      const sizeWritable = await sizeHandle.createWritable();
      try {
        await sizeWritable.write(String(sizeValue));
        await sizeWritable.close();
        options.signal?.throwIfAborted();
      } catch (error) {
        try { await sizeWritable.abort(); } catch { /* The sidecar may already be closed. */ }
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
        await finalWritable?.abort();
      } catch {
        // Ignore abort cleanup errors.
      }
      await reader.cancel(error).catch(() => {});
      await this.delete(originalPath);
      throw error;
    } finally {
      options.signal?.removeEventListener('abort', onAbort);
      reader.releaseLock();
    }
  }

  private getSizeFilename(filename: string): string {
    return `${filename}${this.sizeSuffix}`;
  }

  private async getDir(filename: string): Promise<FileSystemDirectoryHandle> {
    const parts = filename.split('/');
    if (parts.some(part => !part || part === '.' || part === '..' || part.includes('\\'))) {
      throw new Error('Invalid model cache path.');
    }
    const root = await navigator.storage.getDirectory();
    let dir = await root.getDirectoryHandle(this.directoryName, { create: true });
    for (const part of parts.slice(0, -1)) {
      dir = await dir.getDirectoryHandle(part, { create: true });
    }
    return dir;
  }

  private async removeIfExists(dir: FileSystemDirectoryHandle, name: string): Promise<void> {
    try {
      await dir.removeEntry(name);
    } catch (error) {
      if (!(error instanceof DOMException && error.name === 'NotFoundError')) throw error;
    }
  }
}
