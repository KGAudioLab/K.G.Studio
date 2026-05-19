import { KGConfigStorage } from '../io/KGConfigStorage';

const CONFIG_KEY = 'userConfig';

export async function upgradeConfigToV4(): Promise<void> {
  const storage = KGConfigStorage.getInstance();
  const rawConfig = await storage.getRaw(CONFIG_KEY);
  if (!rawConfig || typeof rawConfig !== 'object') {
    return;
  }

  const config = rawConfig as Record<string, unknown>;
  const audio = config.audio;

  if (!audio || typeof audio !== 'object') {
    config.audio = {
      bounce_starts_from_beat_1: true,
    };
    await storage.saveRaw(CONFIG_KEY, config);
    return;
  }

  const audioRecord = audio as Record<string, unknown>;
  if ('bounce_starts_from_beat_1' in audioRecord) {
    return;
  }

  audioRecord.bounce_starts_from_beat_1 = true;
  await storage.saveRaw(CONFIG_KEY, config);
}
