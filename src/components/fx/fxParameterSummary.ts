import { KGEQFX, KGReverbFX, KGCompressorFX, KGLimiterFX, type KGFX } from '../../core/fx';
import type { I18nContextValue } from '../../i18n/types';

export function fxParameterSummary(effect: KGFX, t: I18nContextValue['t']): string {
  const fields = [t(effect.getEnabled() ? 'fx.importDialog.enabled' : 'fx.importDialog.bypassed')];
  const field = (key: string, value: string) => `${t(key)}: ${value}`;
  const db = (value: number) => `${value.toFixed(1)} dB`;
  if (effect instanceof KGEQFX) {
    effect.getBands().forEach((band, index) => {
      const frequency = band.frequencyHz >= 1000 ? `${(band.frequencyHz / 1000).toFixed(2)} kHz` : `${Math.round(band.frequencyHz)} Hz`;
      fields.push(`${t('fx.eq.band', { number: index + 1 })}: ${field('fx.eq.frequency', frequency)}, ${field('fx.eq.q', band.q.toFixed(2))}, ${field('fx.eq.gain', db(band.gainDb))}`);
    });
  } else if (effect instanceof KGReverbFX) {
    fields.push(field('fx.reverb.type', t(`fx.reverb.type.${effect.getReverbType()}`)), field('fx.reverb.mix', `${Math.round(effect.getWet() * 100)}%`));
  } else if (effect instanceof KGCompressorFX) {
    const p = effect.getParameters();
    fields.push(field('fx.compressor.threshold', db(p.thresholdDb)), field('fx.compressor.ratio', `${p.ratio.toFixed(1)}:1`),
      field('fx.compressor.attack', `${p.attackMs.toFixed(1)} ms`), field('fx.compressor.release', `${p.releaseMs.toFixed(0)} ms`), field('fx.compressor.gain', db(p.gainDb)));
  } else if (effect instanceof KGLimiterFX) {
    const p = effect.getParameters();
    fields.push(field('fx.limiter.inputGain', db(p.inputGainDb)), field('fx.limiter.threshold', db(p.thresholdDb)));
  }
  return fields.join(' · ');
}
