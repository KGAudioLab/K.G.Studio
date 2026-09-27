import * as Tone from 'tone';
import { KGToneSamplerFactory } from './KGToneSamplerFactory';

/**
 * KGMetronome - click track synchronized with Tone.Transport
 * Uses Tone.Loop so it automatically respects loop points and play position.
 */
export class KGMetronome {
  private loop: Tone.Loop | null = null;
  private sampler: Tone.Sampler | null = null;
  private prerollTimeoutIds: number[] = [];

  /**
   * Load the woodblock sampler. Called once from KGAudioInterface.initialize() —
   * runs in background (caller should not await).
   */
  async initialize(masterOutput: Tone.ToneAudioNode): Promise<void> {
    try {
      this.sampler = await KGToneSamplerFactory.instance().createSampler('woodblock');
      this.sampler.connect(masterOutput);
      console.log('KGMetronome: woodblock sampler loaded');
    } catch (error) {
      console.error('KGMetronome: failed to load woodblock sampler', error);
    }
  }

  /**
   * Start the metronome click loop.
   * @param startTick - Transport start position in project ticks
   * @param ticksPerBar - ticks in one bar
   * @param ticksPerMeterBeat - ticks in one denominator-note beat
   * @param playbackDelay - seconds to offset audio trigger, matching MIDI note scheduling delay
   */
  start(startTick: number, ticksPerBar: number, ticksPerMeterBeat: number, playbackDelay = 0): void {
    this.stop();

    this.schedulePrerollClicks(startTick, ticksPerBar, ticksPerMeterBeat, playbackDelay);

    this.loop = new Tone.Loop((time) => {
      if (this.sampler?.loaded) {
        // Derive bar position from the exact Transport tick count at the
        // scheduled audio time — no beatCount tracking needed, which avoids
        // all phase initialisation errors when playing from mid-bar.
        const ticks = Math.round(Tone.Transport.getTicksAtTime(time));
        const note = ((ticks % ticksPerBar) + ticksPerBar) % ticksPerBar === 0 ? 'C5' : 'C4';
        this.sampler.triggerAttackRelease(note, '16n', time + playbackDelay);
      }
    }, `${ticksPerMeterBeat}i`);

    this.loop.start(0);
    console.log(`KGMetronome: started at tick ${startTick} (${ticksPerBar} ticks/bar), delay ${playbackDelay}s`);
  }

  /** Stop and dispose the loop only — sampler is kept alive for reuse. */
  stop(): void {
    const context = Tone.getContext();
    this.prerollTimeoutIds.forEach(timeoutId => context.clearTimeout(timeoutId));
    this.prerollTimeoutIds = [];

    if (this.loop) {
      this.loop.dispose();
      this.loop = null;
    }
  }

  dispose(): void {
    this.stop();
    if (this.sampler) {
      this.sampler.dispose();
      this.sampler = null;
    }
  }

  private schedulePrerollClicks(startTick: number, ticksPerBar: number, ticksPerMeterBeat: number, playbackDelay: number): void {
    if (startTick >= 0 || !this.sampler?.loaded) {
      return;
    }

    const secondsPerQuarter = 60 / Tone.Transport.bpm.value;
    const context = Tone.getContext();
    const firstTick = Math.ceil(startTick / ticksPerMeterBeat) * ticksPerMeterBeat;

    for (let tick = firstTick; tick < 0; tick += ticksPerMeterBeat) {
      const waitSeconds = Math.max(0, ((tick - startTick) / Tone.Transport.PPQ) * secondsPerQuarter + playbackDelay);
      const note = ((tick % ticksPerBar) + ticksPerBar) % ticksPerBar === 0 ? 'C5' : 'C4';
      const timeoutId = context.setTimeout(() => {
        if (this.sampler?.loaded) {
          this.sampler.triggerAttackRelease(note, '16n', Tone.now());
        }
      }, waitSeconds);
      this.prerollTimeoutIds.push(timeoutId);
    }
  }
}
