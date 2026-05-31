import { describe, expect, it } from 'vitest';
import { translate } from './translate';

describe('translate', () => {
  it('returns translated strings for supported locales', () => {
    expect(translate('settings.general.language.auto', undefined, 'en_us')).toBe('Auto');
    expect(translate('settings.general.language.auto', undefined, 'fr_fr')).toBe('Auto');
    expect(translate('settings.general.language.auto', undefined, 'zh_cn')).toBe('自动');
  });

  it('falls back to English when a locale key is missing', () => {
    expect(translate('toolbar.button.new', undefined, 'zh_cn')).toBe('新建');
    expect(translate('nonexistent.key', undefined, 'fr_fr')).toBe('nonexistent.key');
    expect(translate('nonexistent.key', undefined, 'zh_cn')).toBe('nonexistent.key');
  });

  it('interpolates params', () => {
    expect(translate('toolbar.status.bpmChanged', { value: 120 }, 'en_us')).toBe('BPM changed to 120');
    expect(translate('toolbar.status.bpmChanged', { value: 120 }, 'fr_fr')).toBe('BPM changé à 120');
    expect(translate('toolbar.status.bpmChanged', { value: 120 }, 'zh_cn')).toBe('BPM 已改为 120');
  });
});
