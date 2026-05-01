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
   * @param startPositionBeats - Transport start position in beats (unused beyond logging)
   * @param beatsPerBar - numerator of the time signature
   * @param playbackDelay - seconds to offset audio trigger, matching MIDI note scheduling delay
   */
  start(startPositionBeats: number, beatsPerBar: number, playbackDelay = 0): void {
    this.stop();

    const ppq = Tone.Transport.PPQ;

    this.schedulePrerollClicks(startPositionBeats, beatsPerBar, playbackDelay);

    this.loop = new Tone.Loop((time) => {
      if (this.sampler?.loaded) {
        // Derive bar position from the exact Transport tick count at the
        // scheduled audio time — no beatCount tracking needed, which avoids
        // all phase initialisation errors when playing from mid-bar.
        const ticks = Tone.Transport.getTicksAtTime(time);
        const beatNumber = Math.round(ticks / ppq);
        const note = beatNumber % beatsPerBar === 0 ? 'C5' : 'C4';
        this.sampler.triggerAttackRelease(note, '16n', time + playbackDelay);
      }
    }, '4n');

    this.loop.start(0);
    console.log(`KGMetronome: started at beat ${startPositionBeats} (${beatsPerBar} beats/bar), delay ${playbackDelay}s`);
  }

  /** Stop and dispose the loop only — sampler is kept alive for reuse. */
  stop(): void {
    this.prerollTimeoutIds.forEach(timeoutId => window.clearTimeout(timeoutId));
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

  private schedulePrerollClicks(startPositionBeats: number, beatsPerBar: number, playbackDelay: number): void {
    if (startPositionBeats >= 0 || !this.sampler?.loaded) {
      return;
    }

    const secondsPerBeat = 60 / Tone.Transport.bpm.value;
    const firstBeat = Math.ceil(startPositionBeats);

    for (let beat = firstBeat; beat < 0; beat += 1) {
      const waitMs = Math.max(0, ((beat - startPositionBeats) * secondsPerBeat + playbackDelay) * 1000);
      const note = beat % beatsPerBar === 0 ? 'C5' : 'C4';
      const timeoutId = window.setTimeout(() => {
        if (this.sampler?.loaded) {
          this.sampler.triggerAttackRelease(note, '16n', Tone.now());
        }
      }, waitMs);
      this.prerollTimeoutIds.push(timeoutId);
    }
  }
}
