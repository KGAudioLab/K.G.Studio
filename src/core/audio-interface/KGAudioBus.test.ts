import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MockBufferSource, MockGain, MockSampler } from '../../test/mocks/tone';

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
    MockGain.mockClear();

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

  it('uses timed playback-rate automation when scheduling pitch bend updates', async () => {
    const audioBus = await KGAudioBus.create('acoustic_grand_piano');

    audioBus.triggerLiveMidiAttack(60, 0, 1);

    const source = MockBufferSource.mock.results[0].value;
    audioBus.scheduleLiveMidiPitchBend(1, 2);

    expect(source.playbackRate.setValueAtTime).toHaveBeenCalledWith(Math.pow(2, 2 / 12), 2);
  });

  it('updates held live MIDI note gain when expression changes', async () => {
    const audioBus = await KGAudioBus.create('acoustic_grand_piano');

    audioBus.triggerLiveMidiAttack(60, 0, 1);
    const gainNode = MockGain.mock.results[0].value;

    audioBus.setLiveMidiExpression(0.25);

    expect(gainNode.gain.value).toBeCloseTo(0.25, 5);
  });

  it('applies current expression to newly triggered notes', async () => {
    const audioBus = await KGAudioBus.create('acoustic_grand_piano');

    audioBus.setLiveMidiExpression(0.4);
    audioBus.triggerLiveMidiAttack(60, 0, 1);

    const gainNode = MockGain.mock.results[0].value;
    expect(MockGain).toHaveBeenCalledWith(0.4);
    expect(gainNode.gain.value).toBeCloseTo(0.4, 5);
  });

  it('defers release while sustain is held and flushes on pedal up', async () => {
    const audioBus = await KGAudioBus.create('acoustic_grand_piano');

    audioBus.triggerLiveMidiAttack(60, 0, 0.5);
    const source = MockBufferSource.mock.results[0].value;

    audioBus.setLiveMidiSustain(true);
    audioBus.releaseLiveMidiNote(60, 1.25);
    expect(source.stop).not.toHaveBeenCalled();

    audioBus.setLiveMidiSustain(false, 2);
    expect(source.stop).toHaveBeenCalledWith(2);
  });

  it('keeps physically held notes sounding when sustain is released', async () => {
    const audioBus = await KGAudioBus.create('acoustic_grand_piano');

    audioBus.triggerLiveMidiAttack(60, 0, 0.5);
    const source = MockBufferSource.mock.results[0].value;

    audioBus.setLiveMidiSustain(true);
    audioBus.setLiveMidiSustain(false, 2);

    expect(source.stop).not.toHaveBeenCalled();
  });

  it('resets live CC state on releaseAll', async () => {
    const audioBus = await KGAudioBus.create('acoustic_grand_piano');

    audioBus.triggerLiveMidiAttack(60, 0, 0.5);
    const source = MockBufferSource.mock.results[0].value;
    const gainNode = MockGain.mock.results[0].value;

    audioBus.setLiveMidiExpression(0.2);
    audioBus.setLiveMidiSustain(true);
    audioBus.releaseAll();
    audioBus.triggerLiveMidiAttack(60, 0, 0.5);

    expect(source.stop).toHaveBeenCalled();
    expect(gainNode.dispose).toHaveBeenCalled();
    expect(MockGain.mock.calls[1]?.[0]).toBe(1);
  });

  it('lets solo override mute while any track is soloed', async () => {
    const audioBus = await KGAudioBus.create('acoustic_grand_piano', 0, 0, true, true);
    const sampler = MockSampler.mock.results[0].value;

    expect(audioBus.shouldPlayWithSolo(true)).toBe(true);
    audioBus.applyEffectiveVolume(true);
    expect(sampler.volume.value).toBe(0);

    audioBus.triggerAttackRelease('C4', '4n', 0, 1, true);
    expect(sampler.triggerAttackRelease).toHaveBeenCalledWith('C4', '4n', 0, 1);
  });

  it('restores mute behavior after solo is removed', async () => {
    const audioBus = await KGAudioBus.create('acoustic_grand_piano', 0, 0, true, false);
    const sampler = MockSampler.mock.results[0].value;

    expect(audioBus.shouldPlayWithSolo(false)).toBe(false);
    audioBus.applyEffectiveVolume(false);
    expect(sampler.volume.value).toBe(-Infinity);
  });
});
