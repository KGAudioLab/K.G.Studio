import { describe, expect, it } from 'vitest';
import { normalizeLanguageSetting, resolveLanguageSetting } from './locale';

describe('locale resolution', () => {
  it('normalizes supported language settings', () => {
    expect(normalizeLanguageSetting('auto')).toBe('auto');
    expect(normalizeLanguageSetting('en_us')).toBe('en_us');
    expect(normalizeLanguageSetting('zh_cn')).toBe('zh_cn');
    expect(normalizeLanguageSetting('unknown')).toBe('auto');
  });

  it('resolves auto to English for non-Chinese locales', () => {
    expect(resolveLanguageSetting('auto', ['en-US'])).toBe('en_us');
  });

  it('resolves auto to Simplified Chinese for Chinese locales', () => {
    expect(resolveLanguageSetting('auto', ['zh-CN'])).toBe('zh_cn');
    expect(resolveLanguageSetting('auto', ['zh-SG'])).toBe('zh_cn');
    expect(resolveLanguageSetting('auto', ['zh-TW'])).toBe('zh_cn');
    expect(resolveLanguageSetting('auto', ['zh-HK'])).toBe('zh_cn');
    expect(resolveLanguageSetting('auto', ['zh-MO'])).toBe('zh_cn');
  });

  it('falls back to English when locale list is empty or unknown', () => {
    expect(resolveLanguageSetting('auto', [])).toBe('en_us');
    expect(resolveLanguageSetting('auto', ['fr-FR'])).toBe('en_us');
  });

  it('keeps explicit locale selections', () => {
    expect(resolveLanguageSetting('en_us', ['zh-CN'])).toBe('en_us');
    expect(resolveLanguageSetting('zh_cn', ['en-US'])).toBe('zh_cn');
  });
});
