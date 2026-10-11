import type * as Tone from 'tone';
import { KGReverbFX, type KGFX } from '../fx';
import type { ReverbType } from '../fx/KGReverbFX';

/** Stable asset names keep existing projects tied to the same factory sounds. */
export const REVERB_PRESETS: Record<ReverbType, { file: string; durationSeconds: number }> = {
  hall: { file: 'hall.wav', durationSeconds: 2.986667 },
  room: { file: 'room.wav', durationSeconds: 1.226667 },
  chamber: { file: 'chamber.wav', durationSeconds: 2.005646 },
  plate: { file: 'plate.wav', durationSeconds: 2.984646 },
  spring: { file: 'spring.wav', durationSeconds: 4.821334 },
};

const buffers = new Map<string, Promise<AudioBuffer>>();

/** Share decoded IRs, but never processing nodes, between tracks and exports. */
export function loadReverbIR(type: ReverbType, context: Tone.BaseContext): Promise<AudioBuffer> {
  const key = `${context.sampleRate}:${type}`;
  let pending = buffers.get(key);
  if (!pending) {
    const url = `${import.meta.env.BASE_URL}resources/fx/reverb/${REVERB_PRESETS[type].file}`;
    pending = fetch(url).then(response => {
      if (!response.ok) throw new Error(`Reverb IR load failed (${response.status}): ${type}`);
      return response.arrayBuffer();
    }).then(data => context.decodeAudioData(data)).catch(error => {
      buffers.delete(key); // A failed request must not poison future attempts.
      throw error;
    });
    buffers.set(key, pending);
  }
  return pending;
}

/** Serial reverbs can extend each other's tails, so add their durations. */
export function getReverbTailSeconds(effects: readonly KGFX[]): number {
  return effects.reduce((tail, effect) => tail + (
    effect instanceof KGReverbFX && effect.getEnabled() && effect.getWet() > 0
      ? REVERB_PRESETS[effect.getReverbType()].durationSeconds : 0
  ), 0);
}
