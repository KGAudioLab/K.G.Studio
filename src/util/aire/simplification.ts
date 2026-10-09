import type { AirePoint, AireSimplification } from './types';

export const AIRE_SIMPLIFICATION_TOLERANCES = { mild: 1, medium: 2, aggressive: 4 } as const;

/** Input is the sorted, distinct-tick, decoded AIRE curve. Retained points are never moved. */
export function simplifyAirePoints(points: AirePoint[], level: AireSimplification = 'none', joinTicks: readonly number[] = []): AirePoint[] {
  if (level === 'none' || points.length < 3) return points;
  const tolerance = AIRE_SIMPLIFICATION_TOLERANCES[level];
  const anchors = new Set<number>([0, points.length - 1]);

  // Treat equal-value runs as plateaus, preserving both edges only at a turn.
  let runStart = 0;
  while (runStart < points.length) {
    let runEnd = runStart;
    while (runEnd + 1 < points.length && points[runEnd + 1].value === points[runStart].value) runEnd++;
    if (runStart > 0 && runEnd + 1 < points.length) {
      const incoming = Math.sign(points[runStart].value - points[runStart - 1].value);
      const outgoing = Math.sign(points[runEnd + 1].value - points[runEnd].value);
      if (incoming !== outgoing) { anchors.add(runStart); anchors.add(runEnd); }
    }
    runStart = runEnd + 1;
  }

  for (const tick of joinTicks) {
    // Lower bound also handles sections too short to have an exact sampled tick.
    let lo = 0, hi = points.length;
    while (lo < hi) {
      const mid = Math.floor((lo + hi) / 2);
      if (points[mid].tick < tick) lo = mid + 1;
      else hi = mid;
    }
    if (lo > 0) anchors.add(lo - 1);
    if (lo < points.length) anchors.add(lo);
  }

  const ordered = [...anchors].sort((a, b) => a - b);
  const keep = new Set(anchors);
  const stack: [number, number][] = [];
  for (let i = 1; i < ordered.length; i++) stack.push([ordered[i - 1], ordered[i]]);
  while (stack.length) {
    const [start, end] = stack.pop()!;
    const first = points[start], last = points[end];
    let maxError: number = tolerance;
    let split = -1;
    for (let i = start + 1; i < end; i++) {
      const interpolated = first.value + (last.value - first.value) * (points[i].tick - first.tick) / (last.tick - first.tick);
      const error = Math.abs(points[i].value - interpolated);
      // Strict comparison picks the earliest point when maximum errors tie.
      if (error > maxError) { maxError = error; split = i; }
    }
    if (split !== -1) { keep.add(split); stack.push([start, split], [split, end]); }
  }
  return points.filter((_, i) => keep.has(i));
}
