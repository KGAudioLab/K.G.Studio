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
