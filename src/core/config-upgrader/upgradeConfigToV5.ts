import { KGConfigStorage } from '../io/KGConfigStorage';

const CONFIG_KEY = 'userConfig';

export async function upgradeConfigToV5(): Promise<void> {
  const storage = KGConfigStorage.getInstance();
  const rawConfig = await storage.getRaw(CONFIG_KEY);
  if (!rawConfig || typeof rawConfig !== 'object') {
    return;
  }

  const config = rawConfig as Record<string, unknown>;
  const general = config.general;

  if (!general || typeof general !== 'object') {
    config.general = {
      agent_mode: 'regular',
    };
    await storage.saveRaw(CONFIG_KEY, config);
    return;
  }

  const generalRecord = general as Record<string, unknown>;
  if ('agent_mode' in generalRecord) {
    return;
  }

  generalRecord.agent_mode = 'regular';
  await storage.saveRaw(CONFIG_KEY, config);
}
