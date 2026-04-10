import { KGConfigStorage } from '../io/KGConfigStorage';
import { CONFIG_UPGRADER_CONSTANTS } from '../../constants/coreConstants';
import { upgradeConfigToV1 } from './upgradeConfigToV1';

/**
 * KGConfigUpgrader — Orchestrates app-level migrations (e.g., storage backend changes).
 * Mirrors the KGProjectUpgrader pattern but operates on global app state, not individual projects.
 *
 * Version is tracked via a `__config_version` key in the IndexedDB config store.
 */
export class KGConfigUpgrader {
  /**
   * Run all pending config upgrades sequentially.
   * Returns the number of upgrade steps that were executed.
   */
  public static async upgradeToLatest(): Promise<number> {
    const storage = KGConfigStorage.getInstance();
    const currentVersion = await KGConfigUpgrader.getConfigVersion(storage);
    const targetVersion = CONFIG_UPGRADER_CONSTANTS.CURRENT_VERSION;

    if (currentVersion >= targetVersion) {
      console.log(`Config is up to date (version ${currentVersion})`);
      return 0;
    }

    console.log(`Config upgrade needed: v${currentVersion} -> v${targetVersion}`);

    let stepsExecuted = 0;

    for (let nextVersion = currentVersion + 1; nextVersion <= targetVersion; nextVersion++) {
      switch (nextVersion) {
        case 1: {
          await upgradeConfigToV1();
          break;
        }
        default: {
          throw new Error(`No config upgrader found for version ${nextVersion}`);
        }
      }

      // Persist the version after each successful step
      await KGConfigUpgrader.setConfigVersion(storage, nextVersion);
      stepsExecuted++;
      console.log(`Config upgraded to version ${nextVersion}`);
    }

    return stepsExecuted;
  }

  private static async getConfigVersion(storage: KGConfigStorage): Promise<number> {
    const raw = await storage.getRaw(CONFIG_UPGRADER_CONSTANTS.VERSION_KEY);
    if (!raw || typeof raw.version !== 'number') return 0;
    return raw.version;
  }

  private static async setConfigVersion(storage: KGConfigStorage, version: number): Promise<void> {
    await storage.saveRaw(CONFIG_UPGRADER_CONSTANTS.VERSION_KEY, {
      version,
      upgradedAt: Date.now(),
    });
  }
}
