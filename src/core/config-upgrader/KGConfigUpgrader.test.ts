import { beforeEach, describe, expect, it, vi } from 'vitest';
const { storage } = vi.hoisted(() => ({ storage: { getRaw: vi.fn(), saveRaw: vi.fn() } }));
vi.mock('../io/KGConfigStorage', () => ({ KGConfigStorage: { getInstance: () => storage } }));
vi.mock('../config/ConfigManager', () => ({ ConfigManager: { instance: () => ({ getDefaults: () => null }) } }));
import { KGConfigUpgrader } from './KGConfigUpgrader';

describe('KGConfigUpgrader V6 registration', () => {
  beforeEach(() => vi.clearAllMocks());
  it('runs V6 for a V5 user and advances the version only after saving', async () => {
    storage.getRaw.mockImplementation(async key => key === '__config_version'
      ? { version: 5 } : { general: { llm_provider: 'openai', openai: { model: 'saved-gpt' } } });
    await expect(KGConfigUpgrader.upgradeToLatest()).resolves.toBe(1);
    expect(storage.saveRaw.mock.calls[0][0]).toBe('userConfig');
    expect(storage.saveRaw.mock.calls[0][1].general.llm_provider).toBe('openai_compatible');
    expect(storage.saveRaw.mock.calls[1]).toEqual(['__config_version', { version: 6, upgradedAt: expect.any(Number) }]);
  });
  it('does not advance the version on a failed migration save', async () => {
    storage.getRaw.mockImplementation(async key => key === '__config_version' ? { version: 5 } : { general: { llm_provider: 'openai' } });
    storage.saveRaw.mockRejectedValueOnce(new Error('failed'));
    await expect(KGConfigUpgrader.upgradeToLatest()).rejects.toThrow('failed');
    expect(storage.saveRaw).toHaveBeenCalledTimes(1);
  });
  it('skips configurations already upgraded to V6', async () => {
    storage.getRaw.mockResolvedValue({ version: 6 });
    await expect(KGConfigUpgrader.upgradeToLatest()).resolves.toBe(0);
    expect(storage.saveRaw).not.toHaveBeenCalled();
  });
});
