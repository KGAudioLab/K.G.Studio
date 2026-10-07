import { beforeEach, describe, expect, it, vi } from 'vitest';

const { getRaw, saveRaw } = vi.hoisted(() => ({ getRaw: vi.fn(), saveRaw: vi.fn() }));
vi.mock('../io/KGConfigStorage', () => ({ KGConfigStorage: { getInstance: () => ({ getRaw, saveRaw }) } }));
import { upgradeConfigToV6 } from './upgradeConfigToV6';

describe('upgradeConfigToV6', () => {
  beforeEach(() => vi.clearAllMocks());

  it.each([
    ['openai', { api_key: 'openai-key', model: 'saved-gpt', flex: true }, 'https://api.openai.com/v1'],
    ['claude_openrouter', { api_key: 'router-key', model: 'anthropic/custom', base_url: 'https://custom.example/v1' }, 'https://custom.example/v1'],
  ])('migrates active %s, replaces compatible fields, and retains source data', async (provider, source, url) => {
    const config = { general: { llm_provider: provider, [provider]: source,
      openai_compatible: { api_key: 'old', base_url: 'old', model: 'old' }, language: 'fr_fr' } };
    getRaw.mockResolvedValue(config);
    await upgradeConfigToV6();
    expect(config.general.llm_provider).toBe('openai_compatible');
    expect(config.general.openai_compatible).toEqual({ api_key: source.api_key, model: source.model, base_url: url });
    expect(config.general[provider]).toEqual(source);
    expect(config.general.language).toBe('fr_fr');
    expect(saveRaw).toHaveBeenCalledWith('userConfig', config);
    saveRaw.mockClear();
    await upgradeConfigToV6();
    expect(saveRaw).not.toHaveBeenCalled();
  });

  it.each(['openai', 'claude_openrouter'])('preserves explicit empty strings for %s', async provider => {
    const config = { general: { llm_provider: provider, [provider]: { api_key: '', model: '', base_url: '' } } };
    getRaw.mockResolvedValue(config);
    await upgradeConfigToV6();
    expect((config.general as Record<string, unknown>).openai_compatible).toEqual({
      api_key: '', model: '', base_url: provider === 'openai' ? 'https://api.openai.com/v1' : '',
    });
  });

  it.each(['openai', 'claude_openrouter'])('resolves missing %s fields from configured defaults', async provider => {
    const config = { general: { llm_provider: provider } };
    getRaw.mockResolvedValue(config);
    await upgradeConfigToV6({
      openai: { api_key: '', model: 'default-gpt' },
      claude_openrouter: { api_key: '', model: 'default-claude', base_url: 'https://default.example/v1' },
    });
    expect((config.general as Record<string, unknown>).openai_compatible).toEqual({ api_key: '',
      model: provider === 'openai' ? 'default-gpt' : 'default-claude',
      base_url: provider === 'openai' ? 'https://api.openai.com/v1' : 'https://default.example/v1',
    });
  });

  it.each([null, {}, { general: null }, { general: { llm_provider: 'local_browser' } },
    { general: { llm_provider: 'openai_compatible', openai_compatible: { model: 'keep' } } }])('leaves unaffected or missing configurations unchanged: %j', async config => {
    getRaw.mockResolvedValue(config);
    await upgradeConfigToV6();
    expect(saveRaw).not.toHaveBeenCalled();
  });

  it('propagates storage failures so the upgrade version is not advanced', async () => {
    getRaw.mockResolvedValue({ general: { llm_provider: 'openai' } });
    saveRaw.mockRejectedValueOnce(new Error('storage failed'));
    await expect(upgradeConfigToV6()).rejects.toThrow('storage failed');
  });
});
