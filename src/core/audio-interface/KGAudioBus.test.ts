import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MockBufferSource, MockSampler } from '../../test/mocks/tone';

vi.mock('tone', async () => {
  const { ToneMock } = await import('../../test/mocks/tone');
  return ToneMock;
});

const getToneAudioBuffersMock = vi.fn();
const createSamplerMock = vi.fn();

vi.mock('./KGToneBuffersPool', () => ({
  KGToneBuffersPool: {
    instance: () => ({
      getToneAudioBuffers: getToneAudioBuffersMock,
    }),
  },
}));

vi.mock('./KGToneSamplerFactory', () => ({
  KGToneSamplerFactory: {
    instance: () => ({
      createSampler: createSamplerMock,
    }),
  },
}));

import { KGAudioBus } from './KGAudioBus';

describe('KGAudioBus live MIDI pitch bend', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    MockSampler.mockClear();
    MockBufferSource.mockClear();

    const sampler = MockSampler();
    createSamplerMock.mockResolvedValue(sampler);
    getToneAudioBuffersMock.mockResolvedValue({
      loaded: true,
      has: (key: string) => key === 'C4',
      get: (key: string) => key === 'C4' ? { duration: 1 } : undefined,
    });
  });

  it('retunes held live MIDI notes when pitch bend changes', async () => {
    const audioBus = await KGAudioBus.create('acoustic_grand_piano');

    audioBus.triggerLiveMidiAttack(60, 0, 1);

    expect(MockBufferSource).toHaveBeenCalledTimes(1);
    const source = MockBufferSource.mock.results[0].value;
    expect(source.start).toHaveBeenCalledWith(0, 0, 1, 1);
    expect(source.playbackRate.value).toBeCloseTo(1, 5);

    audioBus.setLiveMidiPitchBend(1);

    expect(source.playbackRate.value).toBeCloseTo(Math.pow(2, 2 / 12), 5);
  });

  it('stops active live MIDI sources on release and reset paths', async () => {
    const audioBus = await KGAudioBus.create('acoustic_grand_piano');

    audioBus.triggerLiveMidiAttack(60, 0, 0.5);
    const source = MockBufferSource.mock.results[0].value;

    audioBus.releaseLiveMidiNote(60, 1.25);
    expect(source.stop).toHaveBeenCalledWith(1.25);
  });
});
