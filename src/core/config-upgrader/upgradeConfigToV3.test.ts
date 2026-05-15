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

import { upgradeConfigToV3 } from './upgradeConfigToV3';

describe('upgradeConfigToV3', () => {
  beforeEach(() => {
    configStore.clear();
  });

  it('adds the default local browser context length when missing', async () => {
    configStore.set('userConfig', {
      name: 'userConfig',
      data: {
        general: {
          llm_provider: 'local_browser',
        },
      },
      lastModified: Date.now(),
    });

    await upgradeConfigToV3();

    expect(
      ((configStore.get('userConfig')?.data.general as Record<string, unknown>).local_browser as Record<string, unknown>).context_length,
    ).toBe(32768);
  });

  it.each([32768, 65536, 131072])('preserves existing context length %s', async (existingValue) => {
    configStore.set('userConfig', {
      name: 'userConfig',
      data: {
        general: {
          local_browser: {
            context_length: existingValue,
          },
        },
      },
      lastModified: Date.now(),
    });

    await upgradeConfigToV3();

    expect(
      ((configStore.get('userConfig')?.data.general as Record<string, unknown>).local_browser as Record<string, unknown>).context_length,
    ).toBe(existingValue);
  });

  it('is a no-op when general is missing', async () => {
    configStore.set('userConfig', {
      name: 'userConfig',
      data: {},
      lastModified: Date.now(),
    });

    await upgradeConfigToV3();

    expect(configStore.get('userConfig')?.data).toEqual({});
  });

  it('is a no-op when general is malformed', async () => {
    configStore.set('userConfig', {
      name: 'userConfig',
      data: {
        general: 'invalid',
      },
      lastModified: Date.now(),
    });

    await upgradeConfigToV3();

    expect(configStore.get('userConfig')?.data).toEqual({
      general: 'invalid',
    });
  });
});
