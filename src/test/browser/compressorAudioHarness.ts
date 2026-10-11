import 'reflect-metadata';
import * as Tone from 'tone';
import { KGEQFX, KGCompressorFX, type KGFX } from '../../core/fx';
import { KGTrackFXChain } from '../../core/audio-interface/KGTrackFXChain';

interface CompressorFixture {
  gainDb: number;
  thresholdDb: number;
  ratio: number;
  attackMs: number;
  releaseMs: number;
  pulse?: boolean;
  bypass?: boolean;
  sampleRate?: number;
  copies?: number;
  eqOrder?: 'before' | 'after';
  edit?: boolean;
  enable?: boolean;
  remove?: boolean;
}
declare global { interface Window {
  renderCompressorFixture: (options: CompressorFixture, reference?: boolean) => Promise<number>;
} }

/** Compare the app chain to a direct Tone.Compressor reference using actual audio. */
window.renderCompressorFixture = async (options, reference = false) => {
  const sampleRate = options.sampleRate ?? 48000;
  const amplitude = 0.5;
  const effect = new KGCompressorFX(options); effect.setEnabled(!options.bypass);
  const effects: KGFX[] = Array.from({ length: options.copies ?? 1 }, () => effect.clone(true));
  if (options.eqOrder) {
    const eq = new KGEQFX(); const bands = eq.getBands(); bands[1].frequencyHz = 1350; bands[1].q = 0.5; bands[1].gainDb = 12; eq.setBands(bands);
    if (options.eqOrder === 'before') effects.unshift(eq); else effects.push(eq);
  }
  let chain: KGTrackFXChain | undefined;
  const nodes: Tone.ToneAudioNode[] = [];
  try {
    const rendered = await Tone.Offline(context => {
      const buffer = context.createBuffer(2, sampleRate, sampleRate);
      for (let channel = 0; channel < 2; channel++) {
        const data = buffer.getChannelData(channel);
        for (let i = 0; i < sampleRate; i++) data[i] = (options.pulse && i / sampleRate > 0.35 ? amplitude / 20 : amplitude) * Math.sin(2 * Math.PI * 1350 * i / sampleRate);
      }
      const source = new Tone.ToneBufferSource(buffer); nodes.push(source);
      if (reference) {
        let previous: Tone.ToneAudioNode = source;
        const eq = options.eqOrder ? new Tone.BiquadFilter({ type: 'peaking', frequency: 1350, Q: 0.5, gain: 12 }) : undefined;
        if (eq) nodes.push(eq);
        if (eq && options.eqOrder === 'before') { previous.connect(eq); previous = eq; }
        if (!options.bypass && !options.remove) {
          for (let i = 0; i < (options.copies ?? 1); i++) {
            const gain = new Tone.Gain(Math.pow(10, options.gainDb / 20));
            const compressor = new Tone.Compressor({ threshold: options.thresholdDb, ratio: options.ratio, attack: options.attackMs / 1000, release: options.releaseMs / 1000, knee: 30 });
            nodes.push(gain, compressor); previous.connect(compressor); compressor.connect(gain); previous = gain;
          }
        }
        if (eq && options.eqOrder === 'after') { previous.connect(eq); previous = eq; }
        previous.toDestination();
      } else {
        chain = new KGTrackFXChain();
        const initial = options.edit || options.enable ? effects.map(effect => {
          const copy = effect.clone();
          if (options.enable) copy.setEnabled(false);
          if (options.edit && copy instanceof KGCompressorFX) copy.setParameters({ gainDb: 0, thresholdDb: 0, ratio: 1, attackMs: 0, releaseMs: 0 });
          return copy;
        }) : effects;
        chain.sync(initial, false); source.connect(chain.input); chain.output.toDestination();
        if (options.edit || options.enable) context.transport.schedule(() => chain!.sync(effects), 0.1);
        if (options.remove) context.transport.schedule(() => chain!.sync([]), 0.2);
        context.transport.start(0);
      }
      source.start(0);
    }, 1, 2, sampleRate);
    const rms = (channel: number) => {
      const data = rendered.getChannelData(channel); let sum = 0;
      for (let i = sampleRate / 2; i < sampleRate; i++) sum += data[i] * data[i];
      return Math.sqrt(sum / (sampleRate / 2));
    };
    const left = rms(0); const right = rms(1);
    if (Math.abs(left - right) > 1e-6) throw new Error('Compressor changed stereo balance');
    rendered.dispose();
    return 20 * Math.log10(left / (amplitude / Math.sqrt(2)));
  } finally { chain?.dispose(); nodes.forEach(node => node.dispose()); }
};


declare global { interface Window {
  renderCompressorProjectFixture: (type: 'audio' | 'midi') => Promise<number>;
} }
window.renderCompressorProjectFixture = async type => {
  await import('./eqAudioHarness');
  return window.renderEQProjectFixture(type, 'compressor');
};

// Continuous metering catches single-sample transients, including antiphase stereo.
declare global { interface Window { checkCompressorHistory: () => Promise<{
  peaks: number[]; reduction: number; reordered: boolean; removed: boolean;
}> } }
window.checkCompressorHistory = async () => {
  await Tone.start();
  const chain = new KGTrackFXChain();
  const limiter = new KGCompressorFX({ gainDb: 12, thresholdDb: -18, ratio: 4, attackMs: 10, releaseMs: 100 });
  const eq = new KGEQFX();
  const levels: import('../../core/audio-interface/limiterPeakMonitor').LimiterLevel[] = [];
  const sampleRate = chain.input.context.sampleRate;
  const buffer = chain.input.context.createBuffer(2, sampleRate / 2, sampleRate);
  for (let pulse = 0; pulse < 5; pulse++) {
    const index = Math.round((0.075 + pulse * 0.1) * sampleRate);
    buffer.getChannelData(0)[index] = 0.5;
    buffer.getChannelData(1)[index] = -0.5;
  }
  let monitor: import('../../core/audio-interface/limiterPeakMonitor').LimiterMonitor | null = null;
  let source: Tone.ToneBufferSource | undefined;
  let oscillator: Tone.Oscillator | undefined;
  try {
    chain.sync([limiter, eq], false);
    chain.output.toDestination();
    monitor = await chain.openCompressorMonitor(limiter.getId(), 10, level => levels.push(level));
    source = new Tone.ToneBufferSource(buffer).connect(chain.input);
    source.start(Tone.now());
    await new Promise(resolve => setTimeout(resolve, 750));
    const peaks = levels.filter(level => level.peakDb > -10).map(level => level.peakDb);
    oscillator = new Tone.Oscillator({ frequency: 1000, volume: -6 }).connect(chain.input).start();
    await new Promise(resolve => setTimeout(resolve, 500));
    const reduction = Math.min(...levels.map(level => level.reductionDb));
    const before = levels.length;
    chain.sync([eq, limiter], false);
    await new Promise(resolve => setTimeout(resolve, 250));
    const reordered = levels.length > before && !monitor!.closed;
    chain.sync([eq], false);
    const removed = monitor!.closed;
    return { peaks, reduction, reordered, removed };
  } finally { monitor?.dispose(); source?.dispose(); oscillator?.dispose(); chain.dispose(); }
};

// Render the production card against a real processing chain for visual/interaction QA.
declare global { interface Window { mountCompressorHistoryPreview: () => Promise<void> } }
window.mountCompressorHistoryPreview = async () => {
  await import('../../stores/projectStore');
  const [{ createElement }, { createRoot }, { default: CompressorCard }, { KGAudioInterface }] = await Promise.all([
    import('react'), import('react-dom/client'), import('../../components/fx/CompressorCard'),
    import('../../core/audio-interface/KGAudioInterface'), import('../../components/fx/EqCard.css'),
  ]);
  await Tone.start();
  const chain = new KGTrackFXChain();
  const effect = new KGCompressorFX({ thresholdDb: -18, ratio: 4, attackMs: 10, releaseMs: 100 });
  chain.sync([effect], false);
  chain.output.toDestination();
  const context = chain.input.context;
  const buffer = context.createBuffer(2, context.sampleRate * 5, context.sampleRate);
  for (let i = 0; i < buffer.length; i++) {
    const time = i / context.sampleRate;
    const envelope = (time % 2.5 < 1.8) ? 0.08 + 0.18 * Math.sin(time * 3) ** 2 : 0;
    const value = envelope * Math.sin(2 * Math.PI * 220 * time);
    buffer.getChannelData(0)[i] = value;
    buffer.getChannelData(1)[i] = value;
  }
  new Tone.ToneBufferSource({ url: buffer, loop: true }).connect(chain.input).start();
  const audio = KGAudioInterface.instance();
  audio.openCompressorMonitor = async (_trackId, id, fps, onLevel) => chain.openCompressorMonitor(id, fps, onLevel);
  const host = document.createElement('div');
  host.style.cssText = 'width:560px;margin:30px;background:#252525';
  document.body.style.background = '#202020';
  document.body.append(host);
  const root = createRoot(host);
  let state = { enabled: true, expanded: true, gain: 0, threshold: -18, ratio: 4, attack: 10, release: 100 };
  const draw = () => root.render(createElement(CompressorCard, { state, trackId: 'preview', effectId: effect.getId(),
    onRemove: () => { root.unmount(); chain.dispose(); },
    onChange: next => {
      state = next;
      effect.setEnabled(next.enabled);
      effect.setParameters({ thresholdDb: next.threshold, gainDb: next.gain, ratio: next.ratio, attackMs: next.attack, releaseMs: next.release });
      chain.sync([effect]);
      draw();
    },
  }));
  draw();
};
