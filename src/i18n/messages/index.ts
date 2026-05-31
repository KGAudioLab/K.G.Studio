import type { ResolvedLocaleCode, TranslationMessages } from '../types';
import { enUsMessages } from './en_us';
import { frFrMessages } from './fr_fr';
import { zhCnMessages } from './zh_cn';
import { zhHkMessages } from './zh_hk';

export const messagesByLocale: Record<ResolvedLocaleCode, TranslationMessages> = {
  en_us: enUsMessages,
  fr_fr: frFrMessages,
  zh_cn: zhCnMessages,
  zh_hk: zhHkMessages,
};
