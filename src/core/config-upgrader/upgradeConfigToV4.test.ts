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

import { upgradeConfigToV4 } from './upgradeConfigToV4';

describe('upgradeConfigToV4', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('creates the audio config and defaults bounce_starts_from_beat_1 to true when audio is missing', async () => {
    const config: Record<string, unknown> = {
      general: {},
    };
    getRawMock.mockResolvedValue(config);

    await upgradeConfigToV4();

    expect(config.audio).toEqual({ bounce_starts_from_beat_1: true });
    expect(saveRawMock).toHaveBeenCalledWith('userConfig', config);
  });

  it('defaults bounce_starts_from_beat_1 to true when the key is missing', async () => {
    const config: Record<string, unknown> = {
      audio: {
        playback_delay: 0.2,
      },
    };
    getRawMock.mockResolvedValue(config);

    await upgradeConfigToV4();

    expect(config.audio).toEqual({
      playback_delay: 0.2,
      bounce_starts_from_beat_1: true,
    });
    expect(saveRawMock).toHaveBeenCalledWith('userConfig', config);
  });

  it('preserves an explicit false value', async () => {
    const config: Record<string, unknown> = {
      audio: {
        bounce_starts_from_beat_1: false,
      },
    };
    getRawMock.mockResolvedValue(config);

    await upgradeConfigToV4();

    expect(saveRawMock).not.toHaveBeenCalled();
    expect((config.audio as Record<string, unknown>).bounce_starts_from_beat_1).toBe(false);
  });
});
