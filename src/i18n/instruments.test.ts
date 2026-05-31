import { describe, expect, it } from 'vitest';
import { getEnglishInstrumentDisplayName, getInstrumentDisplayName, getInstrumentGroupLabel } from './instruments';
import { translate } from './translate';

describe('instrument i18n helpers', () => {
  it('returns translated instrument display names for supported locales', () => {
    expect(getInstrumentDisplayName('acoustic_grand_piano', (key, params) => translate(key, params, 'en_us'))).toBe('Acoustic Grand Piano');
    expect(getInstrumentDisplayName('acoustic_grand_piano', (key, params) => translate(key, params, 'fr_fr'))).toBe('Piano à queue acoustique');
    expect(getInstrumentDisplayName('acoustic_grand_piano', (key, params) => translate(key, params, 'zh_cn'))).toBe('原声大钢琴');
  });

  it('returns translated instrument group labels for supported locales', () => {
    expect(getInstrumentGroupLabel('PIANO_AND_KEYBOARDS', (key, params) => translate(key, params, 'en_us'))).toBe('Piano and Keyboards');
    expect(getInstrumentGroupLabel('PIANO_AND_KEYBOARDS', (key, params) => translate(key, params, 'fr_fr'))).toBe('Pianos et claviers');
    expect(getInstrumentGroupLabel('PIANO_AND_KEYBOARDS', (key, params) => translate(key, params, 'zh_cn'))).toBe('钢琴与键盘');
  });

  it('keeps stable English fallback names available for non-UI callers', () => {
    expect(getEnglishInstrumentDisplayName('standard')).toBe('Standard Drum Kit');
    expect(getEnglishInstrumentDisplayName('trumpet')).toBe('Trumpet');
  });
});
