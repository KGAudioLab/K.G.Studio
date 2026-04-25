import { instanceToPlain, plainToInstance } from 'class-transformer';
import JSZip from 'jszip';
import { KGProject } from '../KGProject';
import { upgradeProjectToLatest } from '../project-upgrader/KGProjectUpgrader';
import { isValidProjectName } from '../../util/projectNameUtil';
import { OPFS_CONSTANTS } from '../../constants/coreConstants';
import { KGAudioRegion } from '../region/KGAudioRegion';

export class DuplicateEntryError extends Error {
  constructor(name: string) {
    super(`Entry "${name}" already exists`);
    this.name = 'DuplicateEntryError';
  }
}

export interface ProjectMeta {
  name: string;
  createdAt: number;
  updatedAt: number;
  deletedAt?: number | null;
}

/**
 * KGProjectStorage — OPFS-backed storage for project files.
 * Each project lives in its own directory under the OPFS `projects/` root.
 *
 * Folder structure:
 *   projects/<ProjectName>/meta.json
 *   projects/<ProjectName>/project.json
 *   projects/<ProjectName>/media/
 */
export class KGProjectStorage {
  private static _instance: KGProjectStorage;
  private rootDirHandle: FileSystemDirectoryHandle | null = null;
  private projectsDirHandle: FileSystemDirectoryHandle | null = null;
  private _initialized = false;

  private constructor() {}

  public static getInstance(): KGProjectStorage {
    if (!KGProjectStorage._instance) {
      KGProjectStorage._instance = new KGProjectStorage();
    }
    return KGProjectStorage._instance;
  }

  /**
   * Initialize OPFS root and request persistent storage.
   * Must be called before any other method.
   */
  public async initialize(): Promise<void> {
    if (this._initialized) return;

    if (!navigator.storage?.getDirectory) {
      throw new Error(
        'OPFS is unavailable. K.G.Studio requires a secure context (HTTPS or localhost). ' +
        'Access via https:// or use localhost/127.0.0.1 instead of an IP address.',
      );
    }

    this.rootDirHandle = await navigator.storage.getDirectory();
    this.projectsDirHandle = await this.rootDirHandle.getDirectoryHandle(
      OPFS_CONSTANTS.ROOT_DIR,
      { create: true },
    );

    // Request persistent storage so the browser won't evict our data
    try {
      const persisted = await navigator.storage.persist();
      console.log(`Persistent storage ${persisted ? 'granted' : 'denied'}`);
    } catch (error) {
      console.warn('navigator.storage.persist() not available:', error);
    }

    this._initialized = true;
    console.log('KGProjectStorage initialized (OPFS)');
  }

  private ensureInitialized(): void {
    if (!this._initialized || !this.projectsDirHandle) {
      throw new Error('KGProjectStorage not initialized. Call initialize() first.');
    }
  }

  /**
   * Save a project. Creates the folder structure and writes meta.json + project.json.
   */
  public async save(name: string, data: KGProject, overwrite: boolean = false): Promise<void> {
    this.ensureInitialized();

    if (!isValidProjectName(name)) {
      throw new Error(
        `Invalid project name "${name}". Only letters, numbers, spaces, hyphens, underscores, periods, and parentheses are allowed.`,
      );
    }

    const exists = await this.exists(name);
    if (exists && !overwrite) {
      throw new DuplicateEntryError(name);
    }

    const projectDir = await this.projectsDirHandle!.getDirectoryHandle(name, { create: true });

    // Ensure media/ directory exists
    await projectDir.getDirectoryHandle(OPFS_CONSTANTS.MEDIA_DIR, { create: true });

    // Write project.json
    const projectData = instanceToPlain(data) as Record<string, unknown>;
    const projectJson = JSON.stringify(projectData, null, 2);
    await this.writeFile(projectDir, OPFS_CONSTANTS.PROJECT_FILE, projectJson);

    // Write/update meta.json
    const now = Date.now();
    let meta: ProjectMeta;
    try {
      const existingMeta = await this.readFile(projectDir, OPFS_CONSTANTS.METADATA_FILE);
      const parsed = JSON.parse(existingMeta) as ProjectMeta;
      meta = { name, createdAt: parsed.createdAt, updatedAt: now };
    } catch {
      meta = { name, createdAt: now, updatedAt: now };
    }
    await this.writeFile(projectDir, OPFS_CONSTANTS.METADATA_FILE, JSON.stringify(meta, null, 2));
  }

  /**
   * Load a project by name. Runs the project upgrader on the loaded data.
   */
  public async load(name: string): Promise<KGProject | null> {
    this.ensureInitialized();

    try {
      const projectDir = await this.projectsDirHandle!.getDirectoryHandle(name);
      const projectJson = await this.readFile(projectDir, OPFS_CONSTANTS.PROJECT_FILE);
      const plainData = JSON.parse(projectJson);

      const instance = plainToInstance(KGProject, plainData);
      const project = Array.isArray(instance) ? instance[0] || null : instance;

      if (!project) return null;

      project.setName(name);
      return upgradeProjectToLatest(project);
    } catch (error) {
      console.error(`Error loading project "${name}":`, error);
      return null;
    }
  }

  /**
   * List all project names (folder names under projects/).
   */
  public async list(): Promise<string[]> {
    this.ensureInitialized();

    const names: string[] = [];
    // FileSystemDirectoryHandle.entries() returns AsyncIterableIterator
    // TypeScript's lib.dom.d.ts may lack full typing for this, so we iterate via values()
    for await (const entry of this.projectsDirHandle!.values()) {
      if (entry.kind === 'directory') {
        names.push(entry.name);
      }
    }
    return names.sort();
  }

  /**
   * List all projects with metadata (name, createdAt, updatedAt).
   * Reads each project's meta.json without loading the full project data.
   * @param deleted - if true, return only soft-deleted projects; if false (default), return only non-deleted projects.
   */
  public async listWithMeta(deleted: boolean = false): Promise<ProjectMeta[]> {
    this.ensureInitialized();

    const results: ProjectMeta[] = [];
    for await (const entry of this.projectsDirHandle!.values()) {
      if (entry.kind === 'directory') {
        try {
          const dirHandle = await this.projectsDirHandle!.getDirectoryHandle(entry.name);
          const metaJson = await this.readFile(dirHandle, OPFS_CONSTANTS.METADATA_FILE);
          const meta = JSON.parse(metaJson) as ProjectMeta;
          const isDeleted = !!meta.deletedAt;
          if (isDeleted === deleted) {
            results.push(meta);
          }
        } catch {
          // Skip folders without a valid meta.json (e.g. temporary unsaved projects)
        }
      }
    }
    return results.sort((a, b) => b.updatedAt - a.updatedAt);
  }

  /**
   * Soft-delete a project by setting deletedAt in its meta.json.
   */
  public async softDelete(name: string): Promise<void> {
    this.ensureInitialized();
    const projectDir = await this.projectsDirHandle!.getDirectoryHandle(name);
    const meta = await this.readMeta(projectDir, name);
    meta.deletedAt = Date.now();
    await this.writeFile(projectDir, OPFS_CONSTANTS.METADATA_FILE, JSON.stringify(meta, null, 2));
  }

  /**
   * Restore a soft-deleted project by removing deletedAt from its meta.json.
   */
  public async restore(name: string): Promise<void> {
    this.ensureInitialized();
    const projectDir = await this.projectsDirHandle!.getDirectoryHandle(name);
    const meta = await this.readMeta(projectDir, name);
    delete meta.deletedAt;
    await this.writeFile(projectDir, OPFS_CONSTANTS.METADATA_FILE, JSON.stringify(meta, null, 2));
  }

  /**
   * Duplicate a project under a new name, copying all files including media.
   */
  public async duplicate(sourceName: string, targetName: string): Promise<void> {
    this.ensureInitialized();

    if (!isValidProjectName(targetName)) {
      throw new Error(`Invalid project name "${targetName}".`);
    }

    // Load the source project
    const project = await this.load(sourceName);
    if (!project) {
      throw new Error(`Project "${sourceName}" not found.`);
    }

    // Save to new location with fresh timestamps
    project.setName(targetName);
    await this.save(targetName, project, false);

    // Copy media files
    await this.copyMediaFiles(sourceName, targetName);
  }

  /**
   * Permanently delete all soft-deleted projects older than the given age in milliseconds.
   */
  public async purgeDeletedOlderThan(ageMs: number): Promise<void> {
    this.ensureInitialized();
    const cutoff = Date.now() - ageMs;
    const deleted = await this.listWithMeta(true);
    for (const meta of deleted) {
      if (meta.deletedAt && meta.deletedAt < cutoff) {
        await this.delete(meta.name);
      }
    }
  }

  /**
   * Remove orphan media files that are not referenced by any track in the project.
   */
  public async cleanupOrphanMedia(name: string, project: KGProject): Promise<void> {
    this.ensureInitialized();

    try {
      const projectDir = await this.projectsDirHandle!.getDirectoryHandle(name);
      let mediaDir: FileSystemDirectoryHandle;
      try {
        mediaDir = await projectDir.getDirectoryHandle(OPFS_CONSTANTS.MEDIA_DIR);
      } catch {
        return; // No media directory — nothing to clean up
      }

      // Collect all referenced audio file IDs from the project
      const referencedIds = new Set<string>();
      for (const track of project.getTracks()) {
        for (const region of track.getRegions()) {
          if (region instanceof KGAudioRegion) {
            const fileId = region.getAudioFileId();
            if (fileId) referencedIds.add(fileId);
          }
        }
      }

      // Iterate media files and remove orphans
      const orphans: string[] = [];
      for await (const entry of mediaDir.values()) {
        if (entry.kind === 'file' && !referencedIds.has(entry.name)) {
          orphans.push(entry.name);
        }
      }

      for (const orphan of orphans) {
        await mediaDir.removeEntry(orphan);
        console.log(`Removed orphan media file "${orphan}" from project "${name}"`);
      }
    } catch (error) {
      // Non-critical — log but don't throw
      console.warn(`Error cleaning up orphan media for project "${name}":`, error);
    }
  }

  /**
   * Delete a project and all its files.
   */
  public async delete(name: string): Promise<void> {
    this.ensureInitialized();

    try {
      await this.projectsDirHandle!.removeEntry(name, { recursive: true });
    } catch (error) {
      console.error(`Error deleting project "${name}":`, error);
      throw error;
    }
  }

  /**
   * Check if a project exists.
   */
  public async exists(name: string): Promise<boolean> {
    this.ensureInitialized();

    try {
      await this.projectsDirHandle!.getDirectoryHandle(name);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Rename a project by copying its directory contents to a new name and deleting the old one.
   */
  public async rename(oldName: string, newName: string): Promise<void> {
    this.ensureInitialized();

    if (!isValidProjectName(newName)) {
      throw new Error(`Invalid project name "${newName}".`);
    }

    if (await this.exists(newName)) {
      throw new DuplicateEntryError(newName);
    }

    // Load the project from the old location
    const project = await this.load(oldName);
    if (!project) {
      throw new Error(`Project "${oldName}" not found.`);
    }

    // Save to new location
    project.setName(newName);
    await this.save(newName, project, false);

    // Copy media files from old to new location
    await this.copyMediaFiles(oldName, newName);

    // Delete old location
    await this.delete(oldName);
  }

  /**
   * Save a project under a new name, migrating media files from the old folder.
   * Used when the user renames the project and saves. Handles the case where the
   * old folder doesn't exist yet (new project never saved).
   */
  public async saveWithRename(oldName: string, newName: string, data: KGProject, overwrite: boolean = false): Promise<void> {
    this.ensureInitialized();

    // Save project JSON to the new folder
    await this.save(newName, data, overwrite);

    // Migrate media files only if the old folder exists
    if (await this.exists(oldName)) {
      await this.copyMediaFiles(oldName, newName);
      await this.delete(oldName);
    }
  }

  /**
   * Export a project folder as a zip Blob (.kgstudio bundle).
   * Includes project.json, meta.json, and all files in media/.
   */
  public async exportAsZip(name: string): Promise<Blob> {
    this.ensureInitialized();

    const projectDir = await this.projectsDirHandle!.getDirectoryHandle(name);
    const zip = new JSZip();

    await this.addDirectoryToZip(zip, projectDir);

    return zip.generateAsync({ type: 'blob' });
  }

  /**
   * Recursively add all files and subdirectories from an OPFS directory to a JSZip instance.
   */
  private async addDirectoryToZip(
    zip: JSZip,
    dirHandle: FileSystemDirectoryHandle,
    path: string = '',
  ): Promise<void> {
    for await (const entry of dirHandle.values()) {
      const entryPath = path ? `${path}/${entry.name}` : entry.name;

      if (entry.kind === 'file') {
        const fileHandle = entry as FileSystemFileHandle;
        const file = await fileHandle.getFile();
        zip.file(entryPath, file.arrayBuffer());
      } else {
        const subDir = entry as FileSystemDirectoryHandle;
        await this.addDirectoryToZip(zip, subDir, entryPath);
      }
    }
  }

  /**
   * Import a .kgstudio zip bundle into OPFS.
   * Validates that meta.json exists and is valid.
   * Returns the project name on success.
   * On failure, cleans up any partially written folder and throws.
   */
  public async importFromZip(blob: Blob): Promise<string> {
    this.ensureInitialized();

    const zip = await JSZip.loadAsync(blob);

    // Validate meta.json
    const metaFile = zip.file(OPFS_CONSTANTS.METADATA_FILE);
    if (!metaFile) {
      throw new Error('Invalid .kgstudio file: missing meta.json');
    }

    let meta: { name?: string };
    try {
      const metaText = await metaFile.async('text');
      meta = JSON.parse(metaText);
    } catch {
      throw new Error('Invalid .kgstudio file: meta.json is corrupted');
    }

    if (!meta.name || typeof meta.name !== 'string') {
      throw new Error('Invalid .kgstudio file: meta.json missing project name');
    }

    const projectName = await this.resolveUniqueName(meta.name);

    const projectDir = await this.projectsDirHandle!.getDirectoryHandle(projectName, { create: true });

    try {
      // Write all files from the zip into the OPFS project directory
      for (const [relativePath, zipEntry] of Object.entries(zip.files)) {
        if (zipEntry.dir) {
          // Create subdirectory
          await this.getOrCreateSubDir(projectDir, relativePath);
        } else {
          // Write file
          const data = await zipEntry.async('arraybuffer');
          const parts = relativePath.split('/');
          const fileName = parts.pop()!;

          let targetDir = projectDir;
          if (parts.length > 0) {
            targetDir = await this.getOrCreateSubDir(projectDir, parts.join('/'));
          }

          const fileHandle = await targetDir.getFileHandle(fileName, { create: true });
          const writable = await fileHandle.createWritable();
          await writable.write(data);
          await writable.close();
        }
      }

      // If the name was deduplicated, update meta.json and project.json to reflect it
      if (projectName !== meta.name) {
        // Patch meta.json
        try {
          const metaHandle = await projectDir.getFileHandle(OPFS_CONSTANTS.METADATA_FILE);
          const metaFileObj = await metaHandle.getFile();
          const metaData = JSON.parse(await metaFileObj.text());
          metaData.name = projectName;
          const w1 = await metaHandle.createWritable();
          await w1.write(JSON.stringify(metaData, null, 2));
          await w1.close();
        } catch { /* best effort */ }

        // Patch project.json name field
        try {
          const projHandle = await projectDir.getFileHandle(OPFS_CONSTANTS.PROJECT_FILE);
          const projFileObj = await projHandle.getFile();
          const projData = JSON.parse(await projFileObj.text());
          projData.name = projectName;
          const w2 = await projHandle.createWritable();
          await w2.write(JSON.stringify(projData, null, 2));
          await w2.close();
        } catch { /* best effort */ }
      }

      return projectName;
    } catch (error) {
      // Clean up the partially written folder
      try {
        await this.projectsDirHandle!.removeEntry(projectName, { recursive: true });
      } catch {
        // Best effort cleanup
      }
      throw error;
    }
  }

  /**
   * Get or create a nested subdirectory from a path like "media/subfolder".
   */
  private async getOrCreateSubDir(
    root: FileSystemDirectoryHandle,
    path: string,
  ): Promise<FileSystemDirectoryHandle> {
    const segments = path.replace(/\/$/, '').split('/').filter(Boolean);
    let current = root;
    for (const seg of segments) {
      current = await current.getDirectoryHandle(seg, { create: true });
    }
    return current;
  }

  /**
   * Return a unique project name by appending (1), (2), etc. if the name already exists.
   */
  public async resolveUniqueName(name: string): Promise<string> {
    this.ensureInitialized();

    if (!(await this.exists(name))) return name;

    let counter = 1;
    let candidate: string;
    do {
      candidate = `${name} (${counter})`;
      counter++;
    } while (await this.exists(candidate));

    return candidate;
  }

  // --- Media migration ---

  /**
   * Copy all files from projects/<fromName>/media/ to projects/<toName>/media/.
   * If the source media directory doesn't exist, returns without error.
   */
  private async copyMediaFiles(fromName: string, toName: string): Promise<void> {
    try {
      const fromDir = await this.projectsDirHandle!.getDirectoryHandle(fromName);
      let fromMedia: FileSystemDirectoryHandle;
      try {
        fromMedia = await fromDir.getDirectoryHandle(OPFS_CONSTANTS.MEDIA_DIR);
      } catch {
        // No media directory in source — nothing to copy
        return;
      }

      const toDir = await this.projectsDirHandle!.getDirectoryHandle(toName);
      const toMedia = await toDir.getDirectoryHandle(OPFS_CONSTANTS.MEDIA_DIR, { create: true });

      for await (const entry of fromMedia.values()) {
        if (entry.kind === 'file') {
          const fileHandle = entry as FileSystemFileHandle;
          const file = await fileHandle.getFile();
          const newHandle = await toMedia.getFileHandle(entry.name, { create: true });
          const writable = await newHandle.createWritable();
          await writable.write(await file.arrayBuffer());
          await writable.close();
        }
      }
    } catch (error) {
      console.error(`Error copying media files from "${fromName}" to "${toName}":`, error);
      throw error;
    }
  }

  // --- File I/O helpers ---

  private async writeFile(
    dirHandle: FileSystemDirectoryHandle,
    fileName: string,
    content: string,
  ): Promise<void> {
    const fileHandle = await dirHandle.getFileHandle(fileName, { create: true });
    const writable = await fileHandle.createWritable();
    await writable.write(content);
    await writable.close();
  }

  private async readFile(
    dirHandle: FileSystemDirectoryHandle,
    fileName: string,
  ): Promise<string> {
    const fileHandle = await dirHandle.getFileHandle(fileName);
    const file = await fileHandle.getFile();
    return file.text();
  }

  private async readMeta(
    projectDir: FileSystemDirectoryHandle,
    name: string,
  ): Promise<ProjectMeta> {
    try {
      const raw = await this.readFile(projectDir, OPFS_CONSTANTS.METADATA_FILE);
      return JSON.parse(raw) as ProjectMeta;
    } catch {
      return { name, createdAt: 0, updatedAt: 0 };
    }
  }
}
