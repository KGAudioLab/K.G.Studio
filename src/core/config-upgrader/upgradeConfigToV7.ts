import { KGConfigStorage } from '../io/KGConfigStorage';

/** Switch existing Regular Mode users to Advanced Mode once. */
export async function upgradeConfigToV7(): Promise<void> {
  const storage = KGConfigStorage.getInstance();
  const config = await storage.getRaw('userConfig');
  if (!config || typeof config !== 'object') return;

  const general = config.general;
  if (!general || typeof general !== 'object') return;
  const generalRecord = general as Record<string, unknown>;
  if (generalRecord.agent_mode !== 'regular') return;

  generalRecord.agent_mode = 'advanced';
  await storage.saveRaw('userConfig', config);
}
