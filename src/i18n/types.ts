export type LanguageSetting = 'auto' | 'en_us' | 'zh_cn';

export type ResolvedLocaleCode = Exclude<LanguageSetting, 'auto'>;

export type TranslationParams = Record<string, string | number>;

export type TranslationMessages = Record<string, string>;

export interface I18nContextValue {
  languageSetting: LanguageSetting;
  resolvedLocale: ResolvedLocaleCode;
  setLanguageSetting: (value: LanguageSetting) => Promise<void>;
  t: (key: string, params?: TranslationParams) => string;
}
