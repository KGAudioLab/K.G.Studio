import { OPFS_CONSTANTS } from '../../constants/coreConstants';
import type { SavedConversationDocument, SavedConversationMeta } from '../../types/conversationTypes';

export class KGConversationStorage {
  private static _instance: KGConversationStorage;
  private rootDirHandle: FileSystemDirectoryHandle | null = null;
  private projectsDirHandle: FileSystemDirectoryHandle | null = null;
  private _initialized = false;

  private constructor() {}

  public static getInstance(): KGConversationStorage {
    if (!KGConversationStorage._instance) {
      KGConversationStorage._instance = new KGConversationStorage();
    }
    return KGConversationStorage._instance;
  }

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
    this._initialized = true;
  }

  public async saveConversation(
    projectName: string,
    document: SavedConversationDocument,
    meta: SavedConversationMeta,
  ): Promise<void> {
    this.ensureInitialized();

    const conversationDir = await this.getConversationDir(projectName, document.conversationId, true);
    await this.writeFile(
      conversationDir,
      OPFS_CONSTANTS.CONVERSATION_FILE,
      JSON.stringify(document, null, 2),
    );
    await this.writeFile(
      conversationDir,
      OPFS_CONSTANTS.METADATA_FILE,
      JSON.stringify(meta, null, 2),
    );
  }

  public async loadConversation(
    projectName: string,
    conversationId: string,
  ): Promise<{ document: SavedConversationDocument; meta: SavedConversationMeta } | null> {
    this.ensureInitialized();

    try {
      const conversationDir = await this.getConversationDir(projectName, conversationId, false);
      const [documentRaw, metaRaw] = await Promise.all([
        this.readFile(conversationDir, OPFS_CONSTANTS.CONVERSATION_FILE),
        this.readFile(conversationDir, OPFS_CONSTANTS.METADATA_FILE),
      ]);
      return {
        document: JSON.parse(documentRaw) as SavedConversationDocument,
        meta: JSON.parse(metaRaw) as SavedConversationMeta,
      };
    } catch (error) {
      console.error(`Error loading conversation "${conversationId}" for project "${projectName}":`, error);
      return null;
    }
  }

  public async listConversations(projectName: string): Promise<SavedConversationMeta[]> {
    this.ensureInitialized();

    let conversationsDir: FileSystemDirectoryHandle;
    try {
      conversationsDir = await this.getConversationsDir(projectName, false);
    } catch {
      return [];
    }

    const metas: SavedConversationMeta[] = [];
    for await (const entry of conversationsDir.values()) {
      if (entry.kind !== 'directory') {
        continue;
      }

      try {
        const conversationDir = await conversationsDir.getDirectoryHandle(entry.name);
        const metaRaw = await this.readFile(conversationDir, OPFS_CONSTANTS.METADATA_FILE);
        metas.push(JSON.parse(metaRaw) as SavedConversationMeta);
      } catch {
        // Skip malformed entries.
      }
    }

    return metas.sort((a, b) => b.lastTurnAt - a.lastTurnAt);
  }

  public async deleteConversation(projectName: string, conversationId: string): Promise<void> {
    this.ensureInitialized();
    const conversationsDir = await this.getConversationsDir(projectName, false);
    await conversationsDir.removeEntry(conversationId, { recursive: true });
  }

  private ensureInitialized(): void {
    if (!this._initialized || !this.projectsDirHandle) {
      throw new Error('KGConversationStorage not initialized. Call initialize() first.');
    }
  }

  private async getConversationsDir(
    projectName: string,
    create: boolean,
  ): Promise<FileSystemDirectoryHandle> {
    const projectDir = await this.projectsDirHandle!.getDirectoryHandle(projectName, { create });
    return projectDir.getDirectoryHandle(OPFS_CONSTANTS.CONVERSATIONS_DIR, { create });
  }

  private async getConversationDir(
    projectName: string,
    conversationId: string,
    create: boolean,
  ): Promise<FileSystemDirectoryHandle> {
    const conversationsDir = await this.getConversationsDir(projectName, create);
    return conversationsDir.getDirectoryHandle(conversationId, { create });
  }

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
}
