import 'reflect-metadata';
import * as Tone from 'tone';
import { KGReverbFX, type KGFX, KGLimiterFX } from '../../core/fx';
import type { ReverbType } from '../../core/fx/KGReverbFX';
import { KGTrackFXChain } from '../../core/audio-interface/KGTrackFXChain';
import { loadReverbIR } from '../../core/audio-interface/reverbPresets';

interface ReverbFixture { type: ReverbType; wet: number; bypass?: boolean; copies?: number; sampleRate?: number; edit?: boolean; order?: 'before' | 'after' }
interface ReverbResult { difference: number; tailEnergy: number; peak: number }
declare global { interface Window {
  renderReverbFixture: (options: ReverbFixture) => Promise<ReverbResult>;
  renderReverbProjectFixture: (type: 'audio' | 'midi') => Promise<{ duration: number; tailEnergy: number; gainDb: number }>;
} }

window.renderReverbFixture = async options => {
  const sampleRate = options.sampleRate ?? 48000;
  const renders: Float32Array[][] = [];
  for (const reference of [false, true]) {
    let chain: KGTrackFXChain | undefined; const nodes: Tone.ToneAudioNode[] = [];
    try {
      const buffer = await Tone.Offline(async context => {
        const input = context.createBuffer(2, Math.round(sampleRate * .3), sampleRate);
        for (let c = 0; c < 2; c++) {
          const data = input.getChannelData(c);
          for (let i = 0; i < data.length; i++) data[i] = .05 * Math.sin(2 * Math.PI * (c ? 900 : 440) * i / sampleRate) * Math.exp(-i / (sampleRate * .1));
        }
        const source = new Tone.ToneBufferSource({ context, url: input }); nodes.push(source);
        const effect = new KGReverbFX(options.type, options.wet); effect.setEnabled(!options.bypass);
        const limiter = new KGLimiterFX({ inputGainDb: 12, thresholdDb: -30 });
        const effects: KGFX[] = Array.from({ length: options.copies ?? 1 }, () => effect.clone(true));
        if (options.order === 'before') effects.unshift(limiter);
        if (options.order === 'after') effects.push(limiter);
        if (reference) {
          let previous: Tone.ToneAudioNode = source;
          const addLimiter = () => {
            const gain = new Tone.Gain({ context, gain: Math.pow(10, 12 / 20) });
            const node = new Tone.Limiter({ context, threshold: -30 });
            nodes.push(gain, node); previous.connect(gain); gain.connect(node); previous = node;
          };
          if (options.order === 'before') addLimiter();
          for (let i = 0; i < (options.copies ?? 1); i++) {
            const output = new Tone.Gain({ context, gain: 1 });
            const mix = options.bypass ? 0 : options.wet;
            const dry = new Tone.Gain({ context, gain: 1 - mix });
            const wet = new Tone.Gain({ context, gain: mix });
            const convolver = new Tone.Convolver({ context, url: await loadReverbIR(options.type, context), normalize: true });
            nodes.push(output, dry, wet, convolver);
            previous.connect(dry); dry.connect(output); previous.connect(convolver); convolver.connect(wet); wet.connect(output); previous = output;
          }
          if (options.order === 'after') addLimiter();
          previous.toDestination();
        } else {
          chain = new KGTrackFXChain();
          chain.sync(effects, false); await chain.whenReady();
          source.connect(chain.input); chain.output.toDestination();
          if (options.edit) {
            const changed = effects.map(fx => {
              const copy = fx.clone(); if (copy instanceof KGReverbFX) { copy.setWet(0); copy.setEnabled(false); } return copy;
            });
            chain.sync(changed); chain.sync(effects); // exercise signed-safe zero/mix ramps before source starts
          }
        }
        source.start(options.edit ? .1 : 0);
      }, 11, 2, sampleRate);
      renders.push([buffer.getChannelData(0).slice(), buffer.getChannelData(1).slice()]); buffer.dispose();
    } finally { chain?.dispose(); nodes.forEach(node => node.dispose()); }
  }
  let difference = 0, tailEnergy = 0, peak = 0;
  for (let c = 0; c < 2; c++) for (let i = 0; i < renders[0][c].length; i++) {
    const expected = renders[1][c][i];
    const sample = renders[0][c][i];
    if (!Number.isFinite(sample)) throw Error('Non-finite reverb output');
    difference = Math.max(difference, Math.abs(sample - expected)); peak = Math.max(peak, Math.abs(sample));
    if (i > sampleRate) tailEnergy += sample * sample;
  }
  return { difference, tailEnergy, peak };
};

window.renderReverbProjectFixture = async type => {
  await import('../../stores/projectStore');
  const [{ KGProject }, { KGAudioTrack }, { KGMidiTrack }, { KGAudioRegion }, { KGMidiRegion }, { KGMidiNote }, { KGAudioInterface }, { KGOfflineRenderer }, { KGToneBuffersPool }] = await Promise.all([
    import('../../core/KGProject'), import('../../core/track/KGAudioTrack'), import('../../core/track/KGMidiTrack'), import('../../core/region/KGAudioRegion'), import('../../core/region/KGMidiRegion'), import('../../core/midi/KGMidiNote'), import('../../core/audio-interface/KGAudioInterface'), import('../../core/audio-interface/KGOfflineRenderer'), import('../../core/audio-interface/KGToneBuffersPool'),
  ]);
  const sr = 44100; const raw = Tone.getContext().createBuffer(2, sr, sr);
  for (let c = 0; c < 2; c++) { const data = raw.getChannelData(c); for (let i = 0; i < sr; i++) data[i] = .05 * Math.sin(2 * Math.PI * 1350 * i / sr); }
  const track = type === 'audio' ? new KGAudioTrack('Reverb fixture', 123) : new KGMidiTrack('Reverb fixture', 123);
  track.addFX(new KGReverbFX('hall', .5));
  if (track instanceof KGAudioTrack) track.setRegions([new KGAudioRegion('clip', '123', 0, 'Sine', 0, 1920, 'fixture', 'fixture.wav', 1)]);
  else { const region = new KGMidiRegion('clip', '123', 0, 'Sine', 0, 1920); region.setNotes([new KGMidiNote('note', 0, 1920, 60, 127)]); track.setRegions([region]); }
  const project = new KGProject(); project.setTracks([track]);
  const audio = KGAudioInterface.instance(); const getBuffer = audio.getAudioBuffer; audio.getAudioBuffer = () => raw;
  const pool = KGToneBuffersPool.instance(); const getBuffers = pool.getToneAudioBuffers;
  const buffers = new Tone.ToneAudioBuffers({ C4: raw }); pool.getToneAudioBuffers = async () => buffers;
  try {
    const rendered = await KGOfflineRenderer.instance().renderToBuffer(project, { sampleRate: sr, tailSeconds: 0 });
    const data = rendered.getChannelData(0); let tailEnergy = 0, sum = 0;
    for (let i = Math.round(sr * 1.1); i < data.length; i++) tailEnergy += data[i] ** 2;
    for (let i = sr / 2; i < sr * .9; i++) sum += data[i] ** 2;
    const result = { duration: rendered.duration, tailEnergy, gainDb: 20 * Math.log10(Math.sqrt(sum / (sr * .4)) / (.05 / Math.sqrt(2))) };
    rendered.dispose(); return result;
  } finally { audio.getAudioBuffer = getBuffer; pool.getToneAudioBuffers = getBuffers; buffers.dispose(); }
};
