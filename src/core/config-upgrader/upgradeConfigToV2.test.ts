import { beforeEach, describe, expect, it, vi } from 'vitest';

const configStore = new Map<string, { name: string; data: Record<string, unknown>; lastModified: number }>();

vi.mock('../io/KGConfigStorage', () => ({
  KGConfigStorage: {
    getInstance: () => ({
      getRaw: vi.fn(async (name: string) => configStore.get(name)?.data ?? null),
      saveRaw: vi.fn(async (name: string, data: Record<string, unknown>) => {
        configStore.set(name, { name, data, lastModified: Date.now() });
      }),
    }),
  },
}));

import { upgradeConfigToV2 } from './upgradeConfigToV2';

describe('upgradeConfigToV2', () => {
  beforeEach(() => {
    configStore.clear();
  });

  it('pins legacy installs without an explicit provider to the old default provider', async () => {
    configStore.set('userConfig', {
      name: 'userConfig',
      data: {
        general: {
          openai: { api_key: '', model: 'gpt-5.4-mini', flex: false },
        },
      },
      lastModified: Date.now(),
    });

    await upgradeConfigToV2();

    expect((configStore.get('userConfig')?.data.general as Record<string, unknown>).llm_provider).toBe('openai');
  });

  it('leaves explicit providers unchanged', async () => {
    configStore.set('userConfig', {
      name: 'userConfig',
      data: {
        general: {
          llm_provider: 'openai_compatible',
        },
      },
      lastModified: Date.now(),
    });

    await upgradeConfigToV2();

    expect((configStore.get('userConfig')?.data.general as Record<string, unknown>).llm_provider).toBe('openai_compatible');
  });
});
