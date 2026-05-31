import { messagesByLocale } from './messages';
import type { ResolvedLocaleCode, TranslationMessages, TranslationParams } from './types';

let currentLocale: ResolvedLocaleCode = 'en_us';

function interpolate(template: string, params?: TranslationParams): string {
  if (!params) {
    return template;
  }

  return template.replace(/\{(\w+)\}/g, (_match, key: string) => {
    const value = params[key];
    return value === undefined ? `{${key}}` : String(value);
  });
}

export function setCurrentLocale(locale: ResolvedLocaleCode): void {
  currentLocale = locale;
}

export function getCurrentLocale(): ResolvedLocaleCode {
  return currentLocale;
}

export function getMessagesForLocale(locale: ResolvedLocaleCode): TranslationMessages {
  return messagesByLocale[locale];
}

export function translate(
  key: string,
  params?: TranslationParams,
  locale: ResolvedLocaleCode = currentLocale,
): string {
  const localeMessages = messagesByLocale[locale];
  const englishMessages = messagesByLocale.en_us;
  const template = localeMessages[key] ?? englishMessages[key] ?? key;
  return interpolate(template, params);
}
