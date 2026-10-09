import type { AireOptions, AirePoint, AireProgress, AireSection } from './types';
import { AIRE_RATE, aireWindows, aireWindowWeight, decodeAireValue, encodeAireWindow } from './encoder';
import { TICKS_PER_QUARTER } from '../../core/timing';
export type AireRunWindow = (inputs: ReturnType<typeof encodeAireWindow>) => Promise<Float32Array>;
/** Backend independent runner, also used to verify fallback and overlap behavior. */
export async function runAireSections(sections: AireSection[], options: AireOptions, run: AireRunWindow,
  onProgress: (completed: number, total: number) => void): Promise<AirePoint[]> {
  const plans = sections.map(section => aireWindows(Math.ceil(section.hardEnd * AIRE_RATE)));
  const total = plans.reduce((n, windows) => n + windows.length, 0);
  let completed = 0;
  onProgress(0, total);
  const points = new Map<number, number>();
  for (let s = 0; s < sections.length; s++) {
    const section = sections[s], windows = plans[s];
    const count = Math.ceil(section.hardEnd * AIRE_RATE);
    const sums = new Float64Array(count), weights = new Float64Array(count);
    for (let w = 0; w < windows.length; w++) {
      const window = windows[w];
      const output = await run(encodeAireWindow(section, options, window.start, window.length));
      if (output.length !== window.length) throw new Error('Unexpected AIRE output length.');
      for (let i = 0; i < output.length; i++) {
        if (!Number.isFinite(output[i]) || output[i] < 0 || output[i] > 1) throw new Error('Invalid AIRE prediction.');
        const weight = aireWindowWeight(i, w, windows);
        sums[window.start + i] += output[i] * weight; weights[window.start + i] += weight;
      }
      onProgress(++completed, total);
    }
    for (let i = 0; i < count && i / AIRE_RATE < section.duration; i++) {
      const tick = Math.round((section.originBeat + i / AIRE_RATE) * TICKS_PER_QUARTER);
      // Rounding must not push a point into the following section.
      if (tick >= (section.originBeat + section.duration) * TICKS_PER_QUARTER) continue;
      points.set(tick, decodeAireValue(sums[i] / weights[i]));
    }
  }
  return [...points].map(([tick, value]) => ({ tick, value })).sort((a, b) => a.tick - b.tick);
}
export async function withAireBackendFallback<T>(webgpu: boolean,
  run: (provider: AireProgress['provider']) => Promise<T>): Promise<T> {
  if (webgpu) {
    try { return await run('webgpu'); } catch { /* Restart the complete request with WASM. */ }
  }
  return run('wasm');
}
