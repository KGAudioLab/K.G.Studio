import { OPFS_CONSTANTS } from '../../constants/coreConstants';

/**
 * KGAudioFileStorage — Utility for storing and loading audio files
 * in the OPFS media/ directory alongside project data.
 */
export class KGAudioFileStorage {
  /**
   * Store an audio file in the project's media/ directory.
   * Creates the project and media directories if they don't exist yet.
   */
  public static async storeAudioFile(
    projectName: string,
    fileId: string,
    file: File
  ): Promise<void> {
    const mediaDir = await KGAudioFileStorage.getOrCreateMediaDir(projectName);
    const fileHandle = await mediaDir.getFileHandle(fileId, { create: true });
    const writable = await fileHandle.createWritable();
    await writable.write(await file.arrayBuffer());
    await writable.close();
    console.log(`Stored audio file ${fileId} (${file.size} bytes) for project "${projectName}"`);
  }

  /**
   * Load an audio file as ArrayBuffer from the project's media/ directory.
   */
  public static async loadAudioFile(
    projectName: string,
    fileId: string
  ): Promise<ArrayBuffer> {
    const mediaDir = await KGAudioFileStorage.getMediaDir(projectName);
    const fileHandle = await mediaDir.getFileHandle(fileId);
    const file = await fileHandle.getFile();
    return file.arrayBuffer();
  }

  /**
   * Delete an audio file from the project's media/ directory.
   */
  public static async deleteAudioFile(
    projectName: string,
    fileId: string
  ): Promise<void> {
    try {
      const mediaDir = await KGAudioFileStorage.getMediaDir(projectName);
      await mediaDir.removeEntry(fileId);
      console.log(`Deleted audio file ${fileId} from project "${projectName}"`);
    } catch (error) {
      console.warn(`Failed to delete audio file ${fileId}:`, error);
    }
  }

  /**
   * Generate a unique audio file ID preserving the original file extension.
   */
  public static generateAudioFileId(originalFileName: string): string {
    const ext = originalFileName.split('.').pop()?.toLowerCase() || 'wav';
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 10);
    return `audio_${timestamp}_${random}.${ext}`;
  }

  /**
   * Get the media directory handle for an existing project (read/delete path).
   * Does NOT create directories — fails if project folder doesn't exist.
   */
  private static async getMediaDir(projectName: string): Promise<FileSystemDirectoryHandle> {
    const root = await navigator.storage.getDirectory();
    const projectsDir = await root.getDirectoryHandle(OPFS_CONSTANTS.ROOT_DIR);
    const projectDir = await projectsDir.getDirectoryHandle(projectName);
    return projectDir.getDirectoryHandle(OPFS_CONSTANTS.MEDIA_DIR, { create: true });
  }

  /**
   * Get or create the media directory handle for a project (write path).
   * Creates project and media directories if they don't exist.
   */
  private static async getOrCreateMediaDir(projectName: string): Promise<FileSystemDirectoryHandle> {
    const root = await navigator.storage.getDirectory();
    const projectsDir = await root.getDirectoryHandle(OPFS_CONSTANTS.ROOT_DIR, { create: true });
    const projectDir = await projectsDir.getDirectoryHandle(projectName, { create: true });
    return projectDir.getDirectoryHandle(OPFS_CONSTANTS.MEDIA_DIR, { create: true });
  }
}
