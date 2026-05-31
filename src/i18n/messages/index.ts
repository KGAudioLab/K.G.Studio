import type { ResolvedLocaleCode, TranslationMessages } from '../types';
import { enUsMessages } from './en_us';
import { zhCnMessages } from './zh_cn';

export const messagesByLocale: Record<ResolvedLocaleCode, TranslationMessages> = {
  en_us: enUsMessages,
  zh_cn: zhCnMessages,
};
