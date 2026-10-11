import { ConfigManager } from './ConfigManager';
import { getDynamicsVisualConfig, type LimiterVisualConfig } from './limiterVisualConfig';

export interface CompressorVisualConfig extends LimiterVisualConfig { reductionRangeDb: number }

export function getCompressorVisualConfig(): CompressorVisualConfig {
  const range = ConfigManager.instance().get('audio.fx_visual.compressor.reduction_range_db');
  return { ...getDynamicsVisualConfig('compressor'),
    reductionRangeDb: typeof range === 'number' && Number.isFinite(range) ? Math.max(1, Math.min(100, range)) : 30 };
}
