import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MockGain } from '../../test/mocks/tone';

vi.mock('tone', async () => {
  const { ToneMock } = await import('../../test/mocks/tone');
  return ToneMock;
});

import { KGAudioPlayerBus } from './KGAudioPlayerBus';

describe('KGAudioPlayerBus mute and solo precedence', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    MockGain.mockClear();
  });

  it('lets solo override mute while any track is soloed', async () => {
    const audioBus = await KGAudioPlayerBus.create(0, 0, true, true);
    const gainNode = MockGain.mock.results[0].value;

    expect(audioBus.shouldPlayWithSolo(true)).toBe(true);
    audioBus.applyEffectiveVolume(true);
    expect(gainNode.gain.value).toBe(1);
  });

  it('restores mute behavior after solo is removed', async () => {
    const audioBus = await KGAudioPlayerBus.create(0, 0, true, false);
    const gainNode = MockGain.mock.results[0].value;

    expect(audioBus.shouldPlayWithSolo(false)).toBe(false);
    audioBus.applyEffectiveVolume(false);
    expect(gainNode.gain.value).toBe(0);
  });
});
