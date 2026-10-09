import { beforeEach, describe, expect, it, vi } from 'vitest';
const { storage } = vi.hoisted(() => ({ storage: { getRaw: vi.fn(), saveRaw: vi.fn() } }));
vi.mock('../io/KGConfigStorage', () => ({ KGConfigStorage: { getInstance: () => storage } }));
vi.mock('../config/ConfigManager', () => ({ ConfigManager: { instance: () => ({ getDefaults: () => null }) } }));
import { KGConfigUpgrader } from './KGConfigUpgrader';

describe('KGConfigUpgrader registration', () => {
  beforeEach(() => vi.clearAllMocks());
  it('runs V6 and V7 for a V5 user and advances the version only after saving', async () => {
    storage.getRaw.mockImplementation(async key => key === '__config_version'
      ? { version: 5 } : { general: { llm_provider: 'openai', openai: { model: 'saved-gpt' } } });
    await expect(KGConfigUpgrader.upgradeToLatest()).resolves.toBe(2);
    expect(storage.saveRaw.mock.calls[0][0]).toBe('userConfig');
    expect(storage.saveRaw.mock.calls[0][1].general.llm_provider).toBe('openai_compatible');
    expect(storage.saveRaw.mock.calls[1]).toEqual(['__config_version', { version: 6, upgradedAt: expect.any(Number) }]);
    expect(storage.saveRaw.mock.calls[2]).toEqual(['__config_version', { version: 7, upgradedAt: expect.any(Number) }]);
  });
  it('does not advance the version on a failed migration save', async () => {
    storage.getRaw.mockImplementation(async key => key === '__config_version' ? { version: 5 } : { general: { llm_provider: 'openai' } });
    storage.saveRaw.mockRejectedValueOnce(new Error('failed'));
    await expect(KGConfigUpgrader.upgradeToLatest()).rejects.toThrow('failed');
    expect(storage.saveRaw).toHaveBeenCalledTimes(1);
  });
  it('migrates V6 regular users and records V7 after saving', async () => {
    const config = { general: { agent_mode: 'regular' } };
    storage.getRaw.mockImplementation(async key => key === '__config_version' ? { version: 6 } : config);
    await expect(KGConfigUpgrader.upgradeToLatest()).resolves.toBe(1);
    expect(storage.saveRaw.mock.calls).toEqual([
      ['userConfig', { general: { agent_mode: 'advanced' } }],
      ['__config_version', { version: 7, upgradedAt: expect.any(Number) }],
    ]);
  });
  it('does not advance V7 on a failed migration save', async () => {
    storage.getRaw.mockImplementation(async key => key === '__config_version'
      ? { version: 6 } : { general: { agent_mode: 'regular' } });
    storage.saveRaw.mockRejectedValueOnce(new Error('failed'));
    await expect(KGConfigUpgrader.upgradeToLatest()).rejects.toThrow('failed');
    expect(storage.saveRaw).toHaveBeenCalledTimes(1);
  });
  it('skips configurations already upgraded to V7', async () => {
    storage.getRaw.mockResolvedValue({ version: 7 });
    await expect(KGConfigUpgrader.upgradeToLatest()).resolves.toBe(0);
    expect(storage.saveRaw).not.toHaveBeenCalled();
  });
});
