import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { act, render, screen, waitFor } from '@testing-library/react';
import { I18nProvider } from './I18nProvider';
import { useI18n } from './useI18n';

const configState = new Map<string, unknown>([['general.language', 'auto']]);
const listeners = new Set<(changedKeys: string[]) => void>();

const configManagerMock = {
  getIsInitialized: vi.fn(() => true),
  initialize: vi.fn().mockResolvedValue(undefined),
  get: vi.fn((key: string) => configState.get(key)),
  set: vi.fn(async (key: string, value: unknown) => {
    configState.set(key, value);
    for (const listener of listeners) {
      listener([key]);
    }
  }),
  addChangeListener: vi.fn((listener: (changedKeys: string[]) => void) => {
    listeners.add(listener);
    return () => listeners.delete(listener);
  }),
};

vi.mock('../core/config/ConfigManager', () => ({
  ConfigManager: {
    instance: () => configManagerMock,
  },
}));

function TestComponent() {
  const { t, resolvedLocale } = useI18n();
  return (
    <div>
      <span data-testid="locale">{resolvedLocale}</span>
      <span>{t('settings.sidebar.title')}</span>
    </div>
  );
}

describe('I18nProvider', () => {
  it('resolves auto to English by default', async () => {
    Object.defineProperty(window.navigator, 'languages', {
      configurable: true,
      value: ['en-US'],
    });

    render(
      <I18nProvider>
        <TestComponent />
      </I18nProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId('locale').textContent).toBe('en_us');
      expect(screen.getByText('Settings')).toBeTruthy();
    });
  });

  it('resolves auto to Chinese and updates instantly when config changes', async () => {
    configState.set('general.language', 'auto');
    Object.defineProperty(window.navigator, 'languages', {
      configurable: true,
      value: ['zh-CN'],
    });

    render(
      <I18nProvider>
        <TestComponent />
      </I18nProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId('locale').textContent).toBe('zh_cn');
      expect(screen.getByText('设置')).toBeTruthy();
    });

    await act(async () => {
      await configManagerMock.set('general.language', 'en_us');
    });

    await waitFor(() => {
      expect(screen.getByTestId('locale').textContent).toBe('en_us');
      expect(screen.getByText('Settings')).toBeTruthy();
    });
  });

  it('resolves auto to French for browser French locales', async () => {
    configState.set('general.language', 'auto');
    Object.defineProperty(window.navigator, 'languages', {
      configurable: true,
      value: ['fr-FR'],
    });

    render(
      <I18nProvider>
        <TestComponent />
      </I18nProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId('locale').textContent).toBe('fr_fr');
      expect(screen.getByText('Réglages')).toBeTruthy();
    });
  });
});
