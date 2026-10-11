import { ConfigManager } from './ConfigManager';

export interface LimiterVisualConfig { fps: number; historySeconds: number; minDb: number; maxDb: number }

/** Display settings can be changed at runtime without changing project FX. */
export function getDynamicsVisualConfig(kind: 'limiter' | 'compressor'): LimiterVisualConfig {
  const manager = ConfigManager.instance();
  const number = (key: string, fallback: number, min: number, max: number) => {
    const value = manager.get(`audio.fx_visual.${kind}.${key}`);
    return typeof value === 'number' && Number.isFinite(value) ? Math.max(min, Math.min(max, value)) : fallback;
  };
  return {
    fps: number('fps', 10, 1, 60),
    historySeconds: number('history_seconds', 8, 1, 30),
    minDb: number('min_db', -100, -100, -1),
    maxDb: number('max_db', 0, 0, 24),
  };
}

export function getLimiterVisualConfig(): LimiterVisualConfig { return getDynamicsVisualConfig('limiter'); }
