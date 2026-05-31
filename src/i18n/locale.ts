import type { LanguageSetting, ResolvedLocaleCode } from './types';

const CHINESE_LANGUAGE_PREFIX = 'zh';
const DEFAULT_LOCALE: ResolvedLocaleCode = 'en_us';

// BCP 47 subtags that indicate Traditional Chinese (Hant script or HK/TW/MO regions)
const TRADITIONAL_CHINESE_SUBTAGS = new Set(['hk', 'tw', 'mo', 'hant']);

export function normalizeLanguageSetting(value: unknown): LanguageSetting {
  return value === 'zh_cn' || value === 'en_us' || value === 'zh_hk' || value === 'auto' ? value : 'auto';
}

export function getBrowserLocales(): string[] {
  if (typeof navigator === 'undefined') {
    return [];
  }

  if (Array.isArray(navigator.languages) && navigator.languages.length > 0) {
    return navigator.languages.filter((value): value is string => typeof value === 'string' && value.length > 0);
  }

  return typeof navigator.language === 'string' && navigator.language.length > 0
    ? [navigator.language]
    : [];
}

export function resolveLanguageSetting(
  setting: LanguageSetting,
  browserLocales: string[] = getBrowserLocales(),
): ResolvedLocaleCode {
  if (setting === 'en_us' || setting === 'zh_cn' || setting === 'zh_hk') {
    return setting;
  }

  for (const locale of browserLocales) {
    const normalizedLocale = locale.trim().toLowerCase();
    if (normalizedLocale === CHINESE_LANGUAGE_PREFIX) {
      return 'zh_cn';
    }
    if (normalizedLocale.startsWith(`${CHINESE_LANGUAGE_PREFIX}-`)) {
      const subtags = normalizedLocale.slice(CHINESE_LANGUAGE_PREFIX.length + 1).split('-');
      const isTraditional = subtags.some((tag) => TRADITIONAL_CHINESE_SUBTAGS.has(tag));
      return isTraditional ? 'zh_hk' : 'zh_cn';
    }
  }

  return DEFAULT_LOCALE;
}
