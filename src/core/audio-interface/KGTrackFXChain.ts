import * as Tone from 'tone';
import { KGEQFX, KGLimiterFX, KGCompressorFX, KGReverbFX, type KGFX } from '../fx';
import type { ReverbType } from '../fx/KGReverbFX';
import { loadReverbIR } from './reverbPresets';

type SupportedFX = KGEQFX | KGLimiterFX | KGCompressorFX | KGReverbFX;
interface RuntimeFX {
  type: 'eq' | 'limiter' | 'compressor' | 'reverb';
  input: Tone.ToneAudioNode;
  output: Tone.ToneAudioNode;
  nodes: Tone.ToneAudioNode[];
  update(effect: SupportedFX, smooth: boolean): void;
  ready?(): Promise<void>;
  dispose?(): void;
}

function disposeStage(stage: RuntimeFX): void {
  if (stage.dispose) stage.dispose();
  else stage.nodes.forEach(node => node.dispose());
}

/** Short ramps avoid abrupt parameter changes during playback. */
function setParameter(param: Tone.Param<'frequency' | 'number' | 'decibels' | 'gain' | 'time' | 'positive'>, value: number, smooth: boolean): void {
  if (smooth) {
    const now = param.context.now();
    // Tone's generic dB ramps assume amplitude conversion. Native filter gain
    // and compressor threshold use signed dB, including zero, directly.
    param.cancelAndHoldAtTime(now);
    param.linearRampToValueAtTime(value, now + 0.015);
  } else param.value = value;
}

function createEQ(effect: KGEQFX, context: Tone.BaseContext): RuntimeFX {
  const filters = effect.getBands().map((_, index) => new Tone.BiquadFilter({
    context, type: effect.getBandType(index),
  }));
  filters[0].connect(filters[1]);
  filters[1].connect(filters[2]);
  return {
    type: 'eq', input: filters[0], output: filters[2], nodes: filters,
    update(effect, smooth) {
      if (!(effect instanceof KGEQFX)) return;
      effect.getBands().forEach((band, index) => {
        const filter = filters[index];
        // Preserve saved values at export sample rates below 40 kHz.
        const frequency = Math.min(band.frequencyHz, context.sampleRate / 2 - 1);
        setParameter(filter.frequency, frequency, smooth);
        setParameter(filter.Q, index === 1 ? band.q : 1, smooth);
        setParameter(filter.gain, effect.getEnabled() ? band.gainDb : 0, smooth);
      });
    },
  };
}

function createLimiter(context: Tone.BaseContext): RuntimeFX {
  const input = new Tone.Gain({ context, gain: 1 });
  const output = new Tone.Gain({ context, gain: 1 });
  const inputGain = new Tone.Gain({ context, gain: 1 });
  const limiter = new Tone.Limiter({ context });
  const dry = new Tone.Gain({ context, gain: 0 });
  const wet = new Tone.Gain({ context, gain: 1 });
  input.connect(inputGain);
  inputGain.connect(limiter);
  limiter.connect(wet);
  wet.connect(output);
  // Bypass excludes input gain too; keep the processed path warm for re-enabling.
  input.connect(dry);
  dry.connect(output);
  return {
    type: 'limiter', input, output, nodes: [input, inputGain, limiter, dry, wet, output],
    update(effect, smooth) {
      if (!(effect instanceof KGLimiterFX)) return;
      const { inputGainDb, thresholdDb } = effect.getParameters();
      setParameter(inputGain.gain, Math.pow(10, inputGainDb / 20), smooth);
      setParameter(limiter.threshold, thresholdDb, smooth);
      // Linear crossfade keeps both bypass paths at complementary gains.
      setParameter(dry.gain, effect.getEnabled() ? 0 : 1, smooth);
      setParameter(wet.gain, effect.getEnabled() ? 1 : 0, smooth);
    },
  };
}

function createCompressor(context: Tone.BaseContext): RuntimeFX {
  const input = new Tone.Gain({ context, gain: 1 });
  const output = new Tone.Gain({ context, gain: 1 });
  const compressor = new Tone.Compressor({ context, knee: 30 });
  // Tone.Compressor wraps DynamicsCompressorNode, whose automatic makeup gain
  // depends on threshold, ratio, and knee. Tone exposes no switch to disable it.
  // The UI Gain knob is additional output gain: 0 dB means unity here, but does
  // not cancel the native makeup gain. Low thresholds (e.g. -60 dB on piano)
  // can therefore boost quiet notes/tails and transients even with Gain at 0 dB;
  // reaching 0 dBFS or clipping depends on the input and the rest of the chain.
  // https://webaudio.github.io/web-audio-api/#computing-the-makeup-gain
  // TODO: Evaluate compensation for native makeup gain so users can control
  // makeup gain explicitly with the Gain knob. Keep current behavior for now.
  const outputGain = new Tone.Gain({ context, gain: 1 });
  const dry = new Tone.Gain({ context, gain: 0 });
  const wet = new Tone.Gain({ context, gain: 1 });
  input.connect(compressor);
  compressor.connect(outputGain);
  outputGain.connect(wet);
  wet.connect(output);
  // Bypass skips compression and output gain while retaining the detector state.
  input.connect(dry);
  dry.connect(output);
  return {
    type: 'compressor', input, output, nodes: [input, compressor, outputGain, dry, wet, output],
    update(effect, smooth) {
      if (!(effect instanceof KGCompressorFX)) return;
      const { thresholdDb, ratio, attackMs, releaseMs, gainDb } = effect.getParameters();
      setParameter(compressor.threshold, thresholdDb, smooth);
      setParameter(compressor.ratio, ratio, smooth);
      setParameter(compressor.attack, attackMs / 1000, smooth);
      setParameter(compressor.release, releaseMs / 1000, smooth);
      setParameter(outputGain.gain, Math.pow(10, gainDb / 20), smooth);
      setParameter(dry.gain, effect.getEnabled() ? 0 : 1, smooth);
      setParameter(wet.gain, effect.getEnabled() ? 1 : 0, smooth);
    },
  };
}

function createReverb(context: Tone.BaseContext): RuntimeFX {
  const input = new Tone.Gain({ context, gain: 1 });
  const output = new Tone.Gain({ context, gain: 1 });
  const dry = new Tone.Gain({ context, gain: 1 });
  input.connect(dry); dry.connect(output);
  const nodes: Tone.ToneAudioNode[] = [input, output, dry];
  let active: { type: ReverbType; convolver: Tone.Convolver; gain: Tone.Gain } | undefined;
  let requested: ReverbType | undefined;
  let mix = 0;
  let generation = 0;
  let disposed = false;
  let pending: Promise<void> = Promise.resolve();
  const timers = new Set<number>();

  const applyMix = (smooth: boolean) => {
    // Stay fully dry while the first IR loads or a request fails.
    setParameter(dry.gain, active ? 1 - mix : 1, smooth);
    if (active) setParameter(active.gain.gain, mix, smooth);
  };
  const retire = (previous: NonNullable<typeof active>, smooth: boolean) => {
    setParameter(previous.gain.gain, 0, smooth);
    const release = () => {
      input.disconnect(previous.convolver);
      for (const node of [previous.convolver, previous.gain]) {
        node.dispose(); nodes.splice(nodes.indexOf(node), 1);
      }
    };
    if (smooth) {
      const timer = context.setTimeout(() => { timers.delete(timer); release(); }, 0.05);
      timers.add(timer);
    } else release();
  };
  return {
    type: 'reverb', input, output, nodes,
    update(effect, smooth) {
      if (!(effect instanceof KGReverbFX) || disposed) return;
      mix = effect.getEnabled() ? effect.getWet() : 0;
      applyMix(smooth);
      const type = effect.getReverbType();
      if (requested === type) return;
      requested = type;
      const version = ++generation;
      pending = loadReverbIR(type, context).then(buffer => {
        if (disposed || version !== generation) return;
        const convolver = new Tone.Convolver({ context, url: buffer, normalize: true });
        const gain = new Tone.Gain({ context, gain: 0 });
        nodes.push(convolver, gain);
        input.connect(convolver); convolver.connect(gain); gain.connect(output);
        const previous = active;
        active = { type, convolver, gain };
        const fade = smooth || !context.isOffline;
        applyMix(fade);
        if (previous) retire(previous, fade);
      });
      // Live playback keeps the last loaded sound (or dry passthrough) on error.
      // Keep the rejected promise for whenReady() so exports cannot silently omit FX.
      void pending.catch(error => {
        if (!disposed && version === generation) {
          requested = undefined;
          console.error('Track reverb IR failed to load:', type, error);
        }
      });
    },
    ready: () => pending,
    dispose() {
      disposed = true; generation++;
      timers.forEach(timer => context.clearTimeout(timer));
      nodes.forEach(node => node.dispose()); nodes.length = 0;
    },
  };
}

/** Stable track output, with independent processing nodes for each FX instance. */
export class KGTrackFXChain {
  readonly input = new Tone.Gain(1);
  readonly output = new Tone.Gain({ gain: 1, context: this.input.context });
  private stages = new Map<number, RuntimeFX>();
  private order: number[] = [];

  constructor() { this.input.connect(this.output); }

  sync(effects: readonly KGFX[], smooth = true): void {
    const supported = effects.filter((effect): effect is SupportedFX =>
      effect instanceof KGEQFX || effect instanceof KGLimiterFX || effect instanceof KGCompressorFX || effect instanceof KGReverbFX);
    const order = supported.map(effect => effect.getId());
    let replaced = false;
    for (const effect of supported) {
      let stage = this.stages.get(effect.getId());
      if (stage && stage.type !== effect.getType()) {
        disposeStage(stage);
        stage = undefined;
        replaced = true;
      }
      const isNew = !stage;
      if (!stage) {
        stage = effect instanceof KGEQFX ? createEQ(effect, this.input.context)
          : effect instanceof KGLimiterFX ? createLimiter(this.input.context)
          : effect instanceof KGReverbFX ? createReverb(this.input.context) : createCompressor(this.input.context);
        this.stages.set(effect.getId(), stage);
      }
      stage.update(effect, smooth && !isNew);
    }
    if (replaced || order.length !== this.order.length || order.some((id, index) => id !== this.order[index])) {
      this.input.disconnect();
      for (const stage of this.stages.values()) stage.output.disconnect();
      let previous: Tone.ToneAudioNode = this.input;
      for (const id of order) {
        const stage = this.stages.get(id)!;
        previous.connect(stage.input);
        previous = stage.output;
      }
      previous.connect(this.output);
      this.order = order;
    }
    for (const [id, stage] of this.stages) {
      if (!order.includes(id)) {
        disposeStage(stage);
        this.stages.delete(id);
      }
    }
  }

  async whenReady(): Promise<void> {
    await Promise.all([...this.stages.values()].map(stage => stage.ready?.()));
  }

  dispose(): void {
    this.input.dispose();
    this.output.dispose();
    for (const stage of this.stages.values()) disposeStage(stage);
    this.stages.clear();
    this.order = [];
  }
}
