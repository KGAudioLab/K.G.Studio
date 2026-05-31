import React, { createContext, useEffect, useMemo, useState } from 'react';
import { ConfigManager } from '../core/config/ConfigManager';
import { normalizeLanguageSetting, resolveLanguageSetting } from './locale';
import { setCurrentLocale, translate } from './translate';
import type { I18nContextValue, LanguageSetting, ResolvedLocaleCode, TranslationParams } from './types';

const defaultValue: I18nContextValue = {
  languageSetting: 'auto',
  resolvedLocale: 'en_us',
  setLanguageSetting: async () => undefined,
  t: (key: string, params?: TranslationParams) => translate(key, params, 'en_us'),
};

export const I18nContext = createContext<I18nContextValue>(defaultValue);

function buildState(configManager: ConfigManager): { languageSetting: LanguageSetting; resolvedLocale: ResolvedLocaleCode } {
  const languageSetting = normalizeLanguageSetting(configManager.get('general.language'));
  const resolvedLocale = resolveLanguageSetting(languageSetting);
  return { languageSetting, resolvedLocale };
}

export const I18nProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [languageSetting, setLanguageSettingState] = useState<LanguageSetting>('auto');
  const [resolvedLocale, setResolvedLocaleState] = useState<ResolvedLocaleCode>('en_us');

  useEffect(() => {
    let mounted = true;
    let unsubscribe: (() => void) | undefined;
    const configManager = ConfigManager.instance();

    const syncFromConfig = () => {
      const nextState = buildState(configManager);
      setCurrentLocale(nextState.resolvedLocale);
      if (!mounted) {
        return;
      }
      setLanguageSettingState(nextState.languageSetting);
      setResolvedLocaleState(nextState.resolvedLocale);
    };

    const initialize = async () => {
      if (!configManager.getIsInitialized()) {
        await configManager.initialize();
      }

      syncFromConfig();
      unsubscribe = configManager.addChangeListener((changedKeys) => {
        if (changedKeys.includes('__all__') || changedKeys.includes('general.language')) {
          syncFromConfig();
        }
      });
    };

    void initialize();

    return () => {
      mounted = false;
      unsubscribe?.();
    };
  }, []);

  const contextValue = useMemo<I18nContextValue>(() => ({
    languageSetting,
    resolvedLocale,
    setLanguageSetting: async (value: LanguageSetting) => {
      await ConfigManager.instance().set('general.language', value);
    },
    t: (key: string, params?: TranslationParams) => translate(key, params, resolvedLocale),
  }), [languageSetting, resolvedLocale]);

  return (
    <I18nContext.Provider value={contextValue}>
      {children}
    </I18nContext.Provider>
  );
};
