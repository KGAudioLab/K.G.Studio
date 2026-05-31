import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import InstrumentSelection from './InstrumentSelection';
import { KGMidiTrack } from '../core/track/KGMidiTrack';
import { I18nContext } from '../i18n/I18nProvider';
import type { ResolvedLocaleCode } from '../i18n/types';
import { translate } from '../i18n/translate';

const midiTrack = new KGMidiTrack('Lead Track', 1, 'acoustic_grand_piano');

const storeState = {
  tracks: [midiTrack],
  selectedTrackId: '1',
  closeInstrumentSelection: vi.fn(),
  setTrackInstrument: vi.fn().mockResolvedValue(undefined),
};

vi.mock('../stores/projectStore', () => ({
  useProjectStore: () => storeState,
}));

function renderWithLocale(resolvedLocale: ResolvedLocaleCode) {
  return render(
    <I18nContext.Provider
      value={{
        languageSetting: resolvedLocale,
        resolvedLocale,
        setLanguageSetting: async () => undefined,
        t: (key, params) => translate(key, params, resolvedLocale),
      }}
    >
      <InstrumentSelection />
    </I18nContext.Provider>,
  );
}

describe('InstrumentSelection', () => {
  beforeEach(() => {
    storeState.setTrackInstrument.mockClear();
    midiTrack.setInstrument('acoustic_grand_piano');
  });

  it('renders translated group and instrument names under zh-CN', () => {
    renderWithLocale('zh_cn');

    expect(screen.getByText('钢琴与键盘')).toBeTruthy();
    expect(screen.getAllByText('原声大钢琴').length).toBeGreaterThan(0);
  });

  it('updates visible labels when locale changes', () => {
    const view = renderWithLocale('en_us');
    expect(screen.getByText('Piano and Keyboards')).toBeTruthy();
    expect(screen.getAllByText('Acoustic Grand Piano').length).toBeGreaterThan(0);

    view.rerender(
      <I18nContext.Provider
        value={{
          languageSetting: 'zh_cn',
          resolvedLocale: 'zh_cn',
          setLanguageSetting: async () => undefined,
          t: (key, params) => translate(key, params, 'zh_cn'),
        }}
      >
        <InstrumentSelection />
      </I18nContext.Provider>,
    );

    expect(screen.getByText('钢琴与键盘')).toBeTruthy();
    expect(screen.getAllByText('原声大钢琴').length).toBeGreaterThan(0);
  });

  it('keeps instrument selection behavior on the same instrument key', async () => {
    renderWithLocale('zh_cn');

    fireEvent.click(screen.getByText('电钢琴 1'));
    expect(storeState.setTrackInstrument).toHaveBeenCalledWith(1, 'electric_piano_1');
  });
});
