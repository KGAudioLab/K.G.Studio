import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MockBiquadFilter, MockGain, MockLimiter, MockCompressor, MockConvolver } from '../../test/mocks/tone';
import { KGEQFX, KGReverbFX, KGLimiterFX, KGCompressorFX } from '../fx';
import { KGTrackFXChain } from './KGTrackFXChain';
import { loadReverbIR, getReverbTailSeconds } from './reverbPresets';
vi.mock('./reverbPresets', async importOriginal => ({
  ...await importOriginal<typeof import('./reverbPresets')>(),
  loadReverbIR: vi.fn().mockResolvedValue({ duration: 3 }),
}));

describe('track EQ routing', () => {
  beforeEach(() => { MockBiquadFilter.mockClear(); MockGain.mockClear(); MockLimiter.mockClear(); });

  it('chains duplicate EQs in order, reuses nodes for edits, and disposes removed nodes', () => {
    const chain = new KGTrackFXChain();
    const first = new KGEQFX(); const second = new KGEQFX();
    chain.sync([first, second], false);
    const filters = MockBiquadFilter.mock.results.map(result => result.value);
    expect(filters.map(filter => filter.type)).toEqual(['lowshelf', 'peaking', 'highshelf', 'lowshelf', 'peaking', 'highshelf']);
    expect(filters[2].connect).toHaveBeenLastCalledWith(filters[3]);
    expect(filters[5].connect).toHaveBeenLastCalledWith(chain.output);
    const bands = first.getBands(); bands[1].gainDb = 8; first.setBands(bands);
    chain.sync([first, second]);
    expect(MockBiquadFilter).toHaveBeenCalledTimes(6);
    expect(filters[1].gain.linearRampToValueAtTime).toHaveBeenLastCalledWith(8, 0.015);
    chain.sync([second, first]);
    expect(filters[5].connect).toHaveBeenLastCalledWith(filters[0]);
    chain.sync([second]);
    filters.slice(0, 3).forEach(filter => expect(filter.dispose).toHaveBeenCalledOnce());
    chain.sync([]);
    expect(chain.input.connect).toHaveBeenLastCalledWith(chain.output);
    filters.slice(3).forEach(filter => expect(filter.dispose).toHaveBeenCalledOnce());
    chain.dispose();
    expect(chain.output.dispose).toHaveBeenCalledOnce();
  });

  it('flattens bypassed EQ and restores gain without replacing its filters', () => {
    const chain = new KGTrackFXChain();
    const eq = new KGEQFX([{ frequencyHz: 200, q: 4, gainDb: 6 },
      { frequencyHz: 1350, q: 2, gainDb: -8 }, { frequencyHz: 6500, q: 8, gainDb: 3 }]);
    chain.sync([eq], false);
    const filters = MockBiquadFilter.mock.results.map(result => result.value);
    expect(filters.map(filter => filter.Q.value)).toEqual([1, 2, 1]);
    eq.setEnabled(false); chain.sync([eq]);
    filters.forEach(filter => expect(filter.gain.linearRampToValueAtTime).toHaveBeenLastCalledWith(0, 0.015));
    eq.setEnabled(true); chain.sync([eq]);
    expect(filters[1].gain.linearRampToValueAtTime).toHaveBeenLastCalledWith(-8, 0.015);
    expect(MockBiquadFilter).toHaveBeenCalledTimes(3);
  });
});


describe('track limiter routing', () => {
  beforeEach(() => { MockBiquadFilter.mockClear(); MockGain.mockClear(); MockLimiter.mockClear(); });

  it('applies input gain before limiting, smooths edits, and bypasses both controls', () => {
    const chain = new KGTrackFXChain();
    const effect = new KGLimiterFX({ inputGainDb: 6, thresholdDb: -10 });
    chain.sync([effect], false);
    const [input, output, inputGain, dry, wet] = MockGain.mock.results.slice(2).map(result => result.value);
    const limiter = MockLimiter.mock.results[0].value;
    expect(input.connect).toHaveBeenCalledWith(inputGain);
    expect(inputGain.connect).toHaveBeenCalledWith(limiter);
    expect(inputGain.gain.value).toBeCloseTo(Math.pow(10, 6 / 20));
    expect(limiter.threshold.value).toBe(-10);
    expect(limiter.connect).toHaveBeenCalledWith(wet);
    expect(wet.connect).toHaveBeenCalledWith(output);
    effect.setParameters({ inputGainDb: -6, thresholdDb: -20 }); chain.sync([effect]);
    expect(MockLimiter).toHaveBeenCalledTimes(1);
    expect(inputGain.gain.linearRampToValueAtTime).toHaveBeenLastCalledWith(Math.pow(10, -6 / 20), 0.015);
    expect(limiter.threshold.linearRampToValueAtTime).toHaveBeenLastCalledWith(-20, 0.015);
    effect.setEnabled(false); chain.sync([effect]);
    expect(dry.gain.linearRampToValueAtTime).toHaveBeenLastCalledWith(1, 0.015);
    expect(wet.gain.linearRampToValueAtTime).toHaveBeenLastCalledWith(0, 0.015);
    effect.setEnabled(true); chain.sync([effect]);
    expect(dry.gain.linearRampToValueAtTime).toHaveBeenLastCalledWith(0, 0.015);
    expect(wet.gain.linearRampToValueAtTime).toHaveBeenLastCalledWith(1, 0.015);
    chain.dispose();
    [input, inputGain, dry, wet, output, limiter].forEach(node => expect(node.dispose).toHaveBeenCalledOnce());
  });

  it('keeps duplicate limiters independent and honors their order relative to EQ', () => {
    const chain = new KGTrackFXChain(); const eq = new KGEQFX();
    const first = new KGLimiterFX({ thresholdDb: -8 });
    const second = new KGLimiterFX({ thresholdDb: -20 });
    chain.sync([eq, first, second], false);
    const filters = MockBiquadFilter.mock.results.map(result => result.value);
    const limiters = MockLimiter.mock.results.map(result => result.value);
    const gains = MockGain.mock.results.map(result => result.value);
    expect(filters[2].connect).toHaveBeenLastCalledWith(gains[2]);
    expect(gains[3].connect).toHaveBeenLastCalledWith(gains[7]);
    expect(limiters.map(node => node.threshold.value)).toEqual([-8, -20]);
    chain.sync([second, eq, first]);
    expect(gains[8].connect).toHaveBeenLastCalledWith(filters[0]);
    expect(MockLimiter).toHaveBeenCalledTimes(2);
    chain.sync([eq, second]);
    expect(limiters[0].dispose).toHaveBeenCalledOnce();
    expect(limiters[1].dispose).not.toHaveBeenCalled();
    chain.sync([]); expect(chain.input.connect).toHaveBeenLastCalledWith(chain.output);
    chain.dispose(); expect(limiters[1].dispose).toHaveBeenCalledOnce();
  });
});


describe('track compressor routing', () => {
  beforeEach(() => { MockGain.mockClear(); MockLimiter.mockClear(); MockCompressor.mockClear(); });

  it('uses soft knee, converts ms to seconds, and applies gain after compression', () => {
    const chain = new KGTrackFXChain(); const effect = new KGCompressorFX({ gainDb: 6 });
    chain.sync([effect], false);
    const comp = MockCompressor.mock.results[0].value;
    const [input, output, gain, dry, wet] = MockGain.mock.results.slice(2).map(result => result.value);
    expect(MockCompressor.mock.calls[0][0]).toMatchObject({ knee: 30 });
    expect(input.connect).toHaveBeenCalledWith(comp);
    expect(comp.connect).toHaveBeenCalledWith(gain);
    expect(gain.connect).toHaveBeenCalledWith(wet);
    expect(wet.connect).toHaveBeenCalledWith(output);
    expect(comp.threshold.value).toBe(-20); expect(comp.ratio.value).toBe(4);
    expect(comp.attack.value).toBe(0.01); expect(comp.release.value).toBe(0.1);
    expect(gain.gain.value).toBeCloseTo(Math.pow(10, 6 / 20));
    effect.setParameters({ thresholdDb: 0, ratio: 20, attackMs: 0, releaseMs: 1000, gainDb: -24 });
    chain.sync([effect]);
    expect(MockCompressor).toHaveBeenCalledTimes(1);
    expect(comp.threshold.linearRampToValueAtTime).toHaveBeenLastCalledWith(0, 0.015);
    expect(comp.ratio.linearRampToValueAtTime).toHaveBeenLastCalledWith(20, 0.015);
    expect(comp.attack.linearRampToValueAtTime).toHaveBeenLastCalledWith(0, 0.015);
    expect(comp.release.linearRampToValueAtTime).toHaveBeenLastCalledWith(1, 0.015);
    effect.setEnabled(false); chain.sync([effect]);
    expect(dry.gain.linearRampToValueAtTime).toHaveBeenLastCalledWith(1, 0.015);
    expect(wet.gain.linearRampToValueAtTime).toHaveBeenLastCalledWith(0, 0.015);
    chain.dispose();
    [input, output, gain, dry, wet, comp].forEach(node => expect(node.dispose).toHaveBeenCalledOnce());
  });

  it('keeps duplicate compressors independent and reorders them around a limiter', () => {
    const chain = new KGTrackFXChain(); const first = new KGCompressorFX({ ratio: 2 });
    const second = new KGCompressorFX({ ratio: 8 }); const limiter = new KGLimiterFX();
    chain.sync([first, limiter, second], false);
    const comps = MockCompressor.mock.results.map(result => result.value);
    const gains = MockGain.mock.results.map(result => result.value);
    expect(comps.map(comp => comp.ratio.value)).toEqual([2, 8]);
    expect(gains[3].connect).toHaveBeenLastCalledWith(gains[7]);
    expect(gains[8].connect).toHaveBeenLastCalledWith(gains[12]);
    chain.sync([second, first, limiter]);
    expect(gains[13].connect).toHaveBeenLastCalledWith(gains[2]);
    expect(MockCompressor).toHaveBeenCalledTimes(2);
    chain.sync([second]); expect(comps[0].dispose).toHaveBeenCalledOnce();
    expect(comps[1].dispose).not.toHaveBeenCalled();
    chain.dispose(); expect(comps[1].dispose).toHaveBeenCalledOnce();
  });
});

describe('track reverb lifecycle', () => {
  beforeEach(() => {
    MockGain.mockClear(); MockConvolver.mockClear();
    vi.mocked(loadReverbIR).mockReset().mockResolvedValue({ duration: 3 } as AudioBuffer);
  });

  it('loads independent duplicate nodes, mixes dry/wet, and bypasses without replacing the IR', async () => {
    const chain = new KGTrackFXChain(); const first = new KGReverbFX('hall', .25);
    const second = new KGReverbFX('plate', .5);
    chain.sync([first, second], false); await chain.whenReady();
    expect(MockConvolver).toHaveBeenCalledTimes(2);
    expect(MockConvolver.mock.calls.map(call => call[0].normalize)).toEqual([true, true]);
    const gains = MockGain.mock.results.map(result => result.value);
    expect(gains[4].gain.value).toBe(.75); expect(gains[8].gain.value).toBe(.25);
    expect(gains[7].gain.value).toBe(.5); expect(gains[9].gain.value).toBe(.5);
    first.setEnabled(false); chain.sync([first, second]);
    expect(gains[4].gain.linearRampToValueAtTime).toHaveBeenLastCalledWith(1, .015);
    expect(gains[8].gain.linearRampToValueAtTime).toHaveBeenLastCalledWith(0, .015);
    first.setEnabled(true); first.setWet(1); chain.sync([first, second]);
    expect(gains[4].gain.linearRampToValueAtTime).toHaveBeenLastCalledWith(0, .015);
    expect(gains[8].gain.linearRampToValueAtTime).toHaveBeenLastCalledWith(1, .015);
    expect(MockConvolver).toHaveBeenCalledTimes(2);
    chain.sync([second, first]); expect(gains[6].connect).toHaveBeenLastCalledWith(gains[2]);
    chain.dispose(); MockConvolver.mock.results.forEach(result => expect(result.value.dispose).toHaveBeenCalledOnce());
  });

  it('rejects stale loads and safely removes a card while its IR is loading', async () => {
    const resolvers: Array<(buffer: AudioBuffer) => void> = [];
    vi.mocked(loadReverbIR).mockImplementation(() => new Promise(resolve => resolvers.push(resolve)));
    const chain = new KGTrackFXChain(); const effect = new KGReverbFX();
    chain.sync([effect], false); effect.setReverbType('room'); chain.sync([effect], false);
    resolvers[0]({ duration: 3 } as AudioBuffer); await Promise.resolve();
    expect(MockConvolver).not.toHaveBeenCalled();
    resolvers[1]({ duration: 1 } as AudioBuffer); await chain.whenReady();
    expect(MockConvolver).toHaveBeenCalledTimes(1);
    effect.setReverbType('spring'); chain.sync([effect]); chain.sync([]);
    resolvers[2]({ duration: 5 } as AudioBuffer); await Promise.resolve();
    expect(MockConvolver).toHaveBeenCalledTimes(1);
    expect(MockConvolver.mock.results[0].value.dispose).toHaveBeenCalledOnce(); chain.dispose();
  });

  it('keeps the previous preset on load failure and reports failure to export callers', async () => {
    const error = new Error('IR missing'); const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    const chain = new KGTrackFXChain(); const effect = new KGReverbFX();
    chain.sync([effect], false); await chain.whenReady();
    vi.mocked(loadReverbIR).mockRejectedValueOnce(error); effect.setReverbType('room'); chain.sync([effect]);
    await expect(chain.whenReady()).rejects.toThrow('IR missing');
    expect(MockConvolver).toHaveBeenCalledTimes(1);
    expect(MockConvolver.mock.results[0].value.dispose).not.toHaveBeenCalled();
    chain.sync([effect], false); await chain.whenReady(); expect(MockConvolver).toHaveBeenCalledTimes(2);
    chain.dispose(); log.mockRestore();
  });

  it('adds enabled serial tails while excluding bypassed and fully dry effects', () => {
    const hall = new KGReverbFX('hall', 1); const spring = new KGReverbFX('spring', .1);
    const dry = new KGReverbFX('plate', 0); const bypassed = new KGReverbFX('room', 1); bypassed.setEnabled(false);
    expect(getReverbTailSeconds([hall, spring, dry, bypassed])).toBeCloseTo(7.808001, 5);
  });
});
