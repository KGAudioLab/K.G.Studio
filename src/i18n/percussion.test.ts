import { describe, expect, it } from 'vitest';
import { getPercussionKeyFullLabel, getPercussionKeyShortLabel, isGmDrumKitInstrument } from './percussion';
import { translate } from './translate';

describe('percussion i18n helpers', () => {
  it('returns translated short labels for supported locales', () => {
    expect(getPercussionKeyShortLabel(35, (key, params) => translate(key, params, 'en_us'))).toBe('Ac.Bass');
    expect(getPercussionKeyShortLabel(35, (key, params) => translate(key, params, 'zh_cn'))).toBe('原底鼓');
  });

  it('returns translated full labels when available', () => {
    expect(getPercussionKeyFullLabel(42, (key, params) => translate(key, params, 'en_us'))).toBe('Closed Hi Hat');
    expect(getPercussionKeyFullLabel(42, (key, params) => translate(key, params, 'zh_cn'))).toBe('闭合踩镲');
  });

  it('falls back to English labels when translation is missing', () => {
    expect(getPercussionKeyShortLabel(42, () => '')).toBe('ClosedHH');
    expect(getPercussionKeyFullLabel(42, () => '')).toBe('Closed Hi Hat');
  });

  it('returns null for unknown pitches', () => {
    expect(getPercussionKeyShortLabel(10, (key, params) => translate(key, params, 'en_us'))).toBeNull();
    expect(getPercussionKeyFullLabel(10, (key, params) => translate(key, params, 'en_us'))).toBeNull();
  });

  it('keeps drum-kit eligibility explicit', () => {
    expect(isGmDrumKitInstrument('standard')).toBe(true);
    expect(isGmDrumKitInstrument('orchestra_kit')).toBe(true);
    expect(isGmDrumKitInstrument('taiko_drum')).toBe(false);
  });
});
