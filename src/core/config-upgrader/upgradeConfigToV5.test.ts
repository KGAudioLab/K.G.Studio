import { beforeEach, describe, expect, it, vi } from 'vitest';

const getRawMock = vi.fn();
const saveRawMock = vi.fn();

vi.mock('../io/KGConfigStorage', () => ({
  KGConfigStorage: {
    getInstance: vi.fn(() => ({
      getRaw: getRawMock,
      saveRaw: saveRawMock,
    })),
  },
}));

import { upgradeConfigToV5 } from './upgradeConfigToV5';

describe('upgradeConfigToV5', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('defaults general.agent_mode to regular when the key is missing', async () => {
    const config: Record<string, unknown> = {
      general: {
        llm_provider: 'openai',
      },
    };
    getRawMock.mockResolvedValue(config);

    await upgradeConfigToV5();

    expect(config.general).toEqual({
      llm_provider: 'openai',
      agent_mode: 'regular',
    });
    expect(saveRawMock).toHaveBeenCalledWith('userConfig', config);
  });

  it('preserves an explicit general.agent_mode value', async () => {
    const config: Record<string, unknown> = {
      general: {
        agent_mode: 'efficient',
      },
    };
    getRawMock.mockResolvedValue(config);

    await upgradeConfigToV5();

    expect(saveRawMock).not.toHaveBeenCalled();
    expect((config.general as Record<string, unknown>).agent_mode).toBe('efficient');
  });
});
