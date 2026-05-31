import { describe, expect, it } from 'vitest';
import { normalizeLanguageSetting, resolveLanguageSetting } from './locale';

describe('locale resolution', () => {
  it('normalizes supported language settings', () => {
    expect(normalizeLanguageSetting('auto')).toBe('auto');
    expect(normalizeLanguageSetting('en_us')).toBe('en_us');
    expect(normalizeLanguageSetting('zh_cn')).toBe('zh_cn');
    expect(normalizeLanguageSetting('zh_hk')).toBe('zh_hk');
    expect(normalizeLanguageSetting('unknown')).toBe('auto');
  });

  it('resolves auto to English for non-Chinese locales', () => {
    expect(resolveLanguageSetting('auto', ['en-US'])).toBe('en_us');
  });

  it('resolves auto to Simplified Chinese for Simplified Chinese locales', () => {
    expect(resolveLanguageSetting('auto', ['zh-CN'])).toBe('zh_cn');
    expect(resolveLanguageSetting('auto', ['zh-SG'])).toBe('zh_cn');
    expect(resolveLanguageSetting('auto', ['zh-Hans'])).toBe('zh_cn');
    expect(resolveLanguageSetting('auto', ['zh'])).toBe('zh_cn');
  });

  it('resolves auto to Traditional Chinese for Traditional Chinese locales', () => {
    expect(resolveLanguageSetting('auto', ['zh-HK'])).toBe('zh_hk');
    expect(resolveLanguageSetting('auto', ['zh-TW'])).toBe('zh_hk');
    expect(resolveLanguageSetting('auto', ['zh-MO'])).toBe('zh_hk');
    expect(resolveLanguageSetting('auto', ['zh-Hant'])).toBe('zh_hk');
    expect(resolveLanguageSetting('auto', ['zh-Hant-HK'])).toBe('zh_hk');
    expect(resolveLanguageSetting('auto', ['zh-Hant-TW'])).toBe('zh_hk');
  });

  it('falls back to English when locale list is empty or unknown', () => {
    expect(resolveLanguageSetting('auto', [])).toBe('en_us');
    expect(resolveLanguageSetting('auto', ['fr-FR'])).toBe('en_us');
  });

  it('keeps explicit locale selections', () => {
    expect(resolveLanguageSetting('en_us', ['zh-CN'])).toBe('en_us');
    expect(resolveLanguageSetting('zh_cn', ['en-US'])).toBe('zh_cn');
    expect(resolveLanguageSetting('zh_hk', ['en-US'])).toBe('zh_hk');
    expect(resolveLanguageSetting('zh_hk', ['zh-CN'])).toBe('zh_hk');
  });
});
