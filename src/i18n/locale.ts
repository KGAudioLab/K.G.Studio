import type { LanguageSetting, ResolvedLocaleCode } from './types';

const CHINESE_LANGUAGE_PREFIX = 'zh';
const DEFAULT_LOCALE: ResolvedLocaleCode = 'en_us';

export function normalizeLanguageSetting(value: unknown): LanguageSetting {
  return value === 'zh_cn' || value === 'en_us' || value === 'auto' ? value : 'auto';
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
  if (setting === 'en_us' || setting === 'zh_cn') {
    return setting;
  }

  for (const locale of browserLocales) {
    const normalizedLocale = locale.trim().toLowerCase();
    if (normalizedLocale === CHINESE_LANGUAGE_PREFIX || normalizedLocale.startsWith(`${CHINESE_LANGUAGE_PREFIX}-`)) {
      return 'zh_cn';
    }
  }

  return DEFAULT_LOCALE;
}
