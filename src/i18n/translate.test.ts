import { describe, expect, it } from 'vitest';
import { translate } from './translate';

describe('translate', () => {
  it('returns translated strings for both locales', () => {
    expect(translate('settings.general.language.auto', undefined, 'en_us')).toBe('Auto');
    expect(translate('settings.general.language.auto', undefined, 'zh_cn')).toBe('自动');
  });

  it('falls back to English when a zh-CN key is missing', () => {
    expect(translate('toolbar.button.new', undefined, 'zh_cn')).toBe('新建');
    expect(translate('nonexistent.key', undefined, 'zh_cn')).toBe('nonexistent.key');
  });

  it('interpolates params', () => {
    expect(translate('toolbar.status.bpmChanged', { value: 120 }, 'en_us')).toBe('BPM changed to 120');
    expect(translate('toolbar.status.bpmChanged', { value: 120 }, 'zh_cn')).toBe('BPM 已改为 120');
  });
});
