import { KGConfigStorage } from '../io/KGConfigStorage';
import { LOCAL_LLM_DEFAULT_CONTEXT_LENGTH } from '../../util/localLLMConfig';

const CONFIG_KEY = 'userConfig';

export async function upgradeConfigToV3(): Promise<void> {
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

  const generalRecord = general as Record<string, unknown>;
  const localBrowser = generalRecord.local_browser;

  if (!localBrowser || typeof localBrowser !== 'object') {
    generalRecord.local_browser = { context_length: LOCAL_LLM_DEFAULT_CONTEXT_LENGTH };
    await storage.saveRaw(CONFIG_KEY, config);
    return;
  }

  const localBrowserRecord = localBrowser as Record<string, unknown>;
  if ('context_length' in localBrowserRecord) {
    return;
  }

  localBrowserRecord.context_length = LOCAL_LLM_DEFAULT_CONTEXT_LENGTH;
  await storage.saveRaw(CONFIG_KEY, config);
}
