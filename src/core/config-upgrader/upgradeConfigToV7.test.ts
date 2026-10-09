import { beforeEach, describe, expect, it, vi } from 'vitest';

const { getRaw, saveRaw } = vi.hoisted(() => ({ getRaw: vi.fn(), saveRaw: vi.fn() }));
vi.mock('../io/KGConfigStorage', () => ({ KGConfigStorage: { getInstance: () => ({ getRaw, saveRaw }) } }));
import { upgradeConfigToV7 } from './upgradeConfigToV7';

describe('upgradeConfigToV7', () => {
  beforeEach(() => vi.resetAllMocks());

  it('migrates regular to advanced, preserves other settings, and is idempotent', async () => {
    const config = { general: { agent_mode: 'regular', llm_provider: 'local_browser', language: 'fr_fr' } };
    getRaw.mockResolvedValue(config);
    await upgradeConfigToV7();
    expect(config.general).toEqual({ agent_mode: 'advanced', llm_provider: 'local_browser', language: 'fr_fr' });
    expect(saveRaw).toHaveBeenCalledWith('userConfig', config);
    saveRaw.mockClear();
    await upgradeConfigToV7();
    expect(saveRaw).not.toHaveBeenCalled();
  });

  it.each([null, {}, { general: null }, { general: {} },
    { general: { agent_mode: 'advanced' } }, { general: { agent_mode: 'efficient' } }])(
    'preserves missing or unaffected configurations: %j', async config => {
      getRaw.mockResolvedValue(config);
      await upgradeConfigToV7();
      expect(saveRaw).not.toHaveBeenCalled();
    },
  );

  it('propagates storage failures', async () => {
    getRaw.mockResolvedValue({ general: { agent_mode: 'regular' } });
    saveRaw.mockRejectedValueOnce(new Error('storage failed'));
    await expect(upgradeConfigToV7()).rejects.toThrow('storage failed');
  });
});
