import { ConfigManager } from './ConfigManager';

export interface EQVisualConfig { fps: number; fftSize: number }

/** Runtime settings, independent of project FX and presets. */
export function getEQVisualConfig(): EQVisualConfig {
  const manager = ConfigManager.instance();
  const fps = manager.get('audio.fx_visual.eq.fps');
  const fftSize = manager.get('audio.fx_visual.eq.fft_size');
  return {
    fps: typeof fps === 'number' && Number.isFinite(fps) ? Math.max(1, Math.min(60, fps)) : 10,
    fftSize: typeof fftSize === 'number' && Number.isInteger(fftSize)
      && fftSize >= 32 && fftSize <= 32768 && (fftSize & (fftSize - 1)) === 0 ? fftSize : 2048,
  };
}
