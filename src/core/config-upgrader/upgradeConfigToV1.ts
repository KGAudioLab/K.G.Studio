import { openDB } from 'idb';
import { plainToInstance } from 'class-transformer';
import { KGProject } from '../KGProject';
import { KGProjectStorage } from '../io/KGProjectStorage';
import { upgradeProjectToLatest } from '../project-upgrader/KGProjectUpgrader';
import { sanitizeProjectName } from '../../util/projectNameUtil';
import { DB_CONSTANTS } from '../../constants/coreConstants';

/**
 * Config upgrade V1: Migrate all projects from IndexedDB to OPFS.
 *
 * This reads directly from the old IndexedDB `projects` store (no dependency on KGStorage),
 * sanitizes project names, and writes each project to the OPFS-backed KGProjectStorage.
 *
 * Idempotent: projects already present in OPFS are skipped.
 * Non-destructive: old IndexedDB data is preserved as a backup.
 */
export async function upgradeConfigToV1(): Promise<void> {
  console.log('Config V1 upgrade: migrating projects from IndexedDB to OPFS...');

  // Read all projects from the old IndexedDB store
  const oldProjects = await readAllProjectsFromIndexedDB();

  if (oldProjects.length === 0) {
    console.log('Config V1 upgrade: no projects found in IndexedDB, nothing to migrate');
    return;
  }

  const projectStorage = KGProjectStorage.getInstance();
  let migrated = 0;
  let skipped = 0;
  const errors: string[] = [];

  for (const { name, data, lastModified } of oldProjects) {
    try {
      // Deserialize the project
      const instance = plainToInstance(KGProject, data);
      const project = Array.isArray(instance) ? instance[0] : instance;
      if (!project) {
        errors.push(`${name}: deserialization returned null`);
        continue;
      }

      // Sanitize the project name for filesystem use
      const sanitizedName = sanitizeProjectName(name);
      project.setName(sanitizedName);

      // Run the project upgrader (handles schema changes like instrument mapping, etc.)
      const upgradedProject = upgradeProjectToLatest(project);

      // Skip if already exists in OPFS
      if (await projectStorage.exists(sanitizedName)) {
        skipped++;
        continue;
      }

      // Save to OPFS — use overwrite=false since we checked exists() above
      // We call save directly which writes meta.json with createdAt = now.
      // Override createdAt with the original lastModified from IndexedDB afterwards.
      await projectStorage.save(sanitizedName, upgradedProject, false);

      // Patch meta.json to use the original lastModified as createdAt
      if (lastModified) {
        await patchMetaCreatedAt(projectStorage, sanitizedName, lastModified);
      }

      migrated++;
    } catch (error) {
      errors.push(`${name}: ${error}`);
      console.error(`Config V1 upgrade: failed to migrate project "${name}":`, error);
    }
  }

  console.log(
    `Config V1 upgrade complete: ${migrated} migrated, ${skipped} skipped, ${errors.length} errors`,
  );
  if (errors.length > 0) {
    console.warn('Config V1 upgrade errors:', errors);
  }
}

// --- Internal helpers ---

interface OldProjectEntry {
  name: string;
  data: Record<string, unknown>;
  lastModified: number;
}

/**
 * Read all projects from the old IndexedDB store directly (no KGStorage dependency).
 */
async function readAllProjectsFromIndexedDB(): Promise<OldProjectEntry[]> {
  try {
    const db = await openDB(DB_CONSTANTS.DB_NAME, DB_CONSTANTS.DB_VERSION, {
      upgrade(db) {
        // Ensure stores exist (same logic as old KGStorage)
        const requiredStores = [DB_CONSTANTS.PROJECTS_STORE_NAME, DB_CONSTANTS.CONFIG_STORE_NAME];
        for (const store of requiredStores) {
          if (!db.objectStoreNames.contains(store)) {
            db.createObjectStore(store, { keyPath: 'name' });
          }
        }
      },
    });

    const allEntries = await db.getAll(DB_CONSTANTS.PROJECTS_STORE_NAME);
    db.close();

    return allEntries.map((entry) => ({
      name: entry.name as string,
      data: entry.data as Record<string, unknown>,
      lastModified: (entry.lastModified as number) ?? Date.now(),
    }));
  } catch (error) {
    console.error('Config V1 upgrade: failed to read from IndexedDB:', error);
    return [];
  }
}

/**
 * Patch a project's meta.json to set createdAt to the original IndexedDB lastModified.
 * This is a best-effort operation — we access OPFS directly for this one-time patch.
 */
async function patchMetaCreatedAt(
  projectStorage: KGProjectStorage,
  projectName: string,
  createdAt: number,
): Promise<void> {
  try {
    const root = await navigator.storage.getDirectory();
    const projectsDir = await root.getDirectoryHandle('projects');
    const projectDir = await projectsDir.getDirectoryHandle(projectName);
    const metaHandle = await projectDir.getFileHandle('meta.json');
    const file = await metaHandle.getFile();
    const meta = JSON.parse(await file.text());
    meta.createdAt = createdAt;
    const writable = await metaHandle.createWritable();
    await writable.write(JSON.stringify(meta, null, 2));
    await writable.close();
  } catch {
    // Non-critical — createdAt will just be the migration time
  }
}
