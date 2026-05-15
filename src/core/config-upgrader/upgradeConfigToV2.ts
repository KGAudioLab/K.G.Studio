import { KGConfigStorage } from '../io/KGConfigStorage';

const CONFIG_KEY = 'userConfig';
const LEGACY_DEFAULT_PROVIDER = 'openai';

export async function upgradeConfigToV2(): Promise<void> {
  const storage = KGConfigStorage.getInstance();
  const rawConfig = await storage.getRaw(CONFIG_KEY);
  if (!rawConfig || typeof rawConfig !== 'object') {
    return;
  }

  const config = rawConfig as Record<string, unknown>;
  const general = config.general;
  if (!general || typeof general !== 'object') {
    return;
  }

  if ('llm_provider' in (general as Record<string, unknown>)) {
    return;
  }

  (general as Record<string, unknown>).llm_provider = LEGACY_DEFAULT_PROVIDER;
  await storage.saveRaw(CONFIG_KEY, config);
}
