/**
 * Type augmentations for the Origin Private File System (OPFS) async iterable APIs.
 * These are part of the File System Access API but not yet fully typed in TypeScript's lib.dom.d.ts.
 */
interface FileSystemDirectoryHandle {
  values(): AsyncIterableIterator<FileSystemDirectoryHandle | FileSystemFileHandle>;
  keys(): AsyncIterableIterator<string>;
  entries(): AsyncIterableIterator<[string, FileSystemDirectoryHandle | FileSystemFileHandle]>;
}
