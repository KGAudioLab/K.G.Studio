import type { LimiterLevel } from '../../core/audio-interface/limiterPeakMonitor';
import type { LimiterVisualConfig } from '../../core/config/limiterVisualConfig';

/** Keep the filled shape continuous at the window boundary as old samples leave. */
function historyAreaPath(history: readonly LimiterLevel[], historySeconds: number, baseline: number,
  y: (level: LimiterLevel) => number): string {
  if (!history.length) return '';
  const end = history[history.length - 1].time;
  const start = end - historySeconds;
  const x = (time: number) => Math.max(0, Math.min(600, (time - start) / historySeconds * 600));
  let index = 0;
  while (index + 1 < history.length && history[index + 1].time <= start) index++;
  const first = history[index];
  let firstX = x(first.time);
  let firstY = y(first);
  const next = history[index + 1];
  if (first.time <= start && next && next.time > start) {
    const fraction = (start - first.time) / (next.time - first.time);
    firstX = 0;
    firstY += (y(next) - firstY) * fraction;
  }
  let path = `M${firstX.toFixed(2)},${baseline} L${firstX.toFixed(2)},${firstY.toFixed(2)}`;
  for (let i = index + 1; i < history.length; i++) {
    path += ` L${x(history[i].time).toFixed(2)},${y(history[i]).toFixed(2)}`;
  }
  return `${path} L600,${baseline} Z`;
}

export function limiterHistoryPath(history: readonly LimiterLevel[], settings: LimiterVisualConfig): string {
  return historyAreaPath(history, settings.historySeconds, 110, level => {
    const db = Number.isFinite(level.peakDb) ? level.peakDb : settings.minDb;
    return 110 * (1 - Math.max(0, Math.min(1, (db - settings.minDb) / (settings.maxDb - settings.minDb))));
  });
}

/** Gain reduction uses 0 dB at the top and positive attenuation downward. */
export function reductionHistoryPath(history: readonly LimiterLevel[], historySeconds: number, rangeDb: number): string {
  return historyAreaPath(history, historySeconds, 0, level => {
    const amount = Number.isFinite(level.reductionDb) ? Math.max(0, -level.reductionDb) : 0;
    return Math.min(1, amount / rangeDb) * 110;
  });
}
