import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import InstrumentSelection from './InstrumentSelection';
import { KGAudioTrack } from '../core/track/KGAudioTrack';
import type { KGTrack } from '../core/track/KGTrack';
import { KGMidiTrack } from '../core/track/KGMidiTrack';
import { I18nContext } from '../i18n/I18nProvider';
import type { ResolvedLocaleCode } from '../i18n/types';
import { translate } from '../i18n/translate';

const midiTrack = new KGMidiTrack('Lead Track', 1, 'acoustic_grand_piano');

const storeState = {
  tracks: [midiTrack] as KGTrack[],
  selectedTrackId: '1',
  closeInstrumentSelection: vi.fn(),
  updateTrackProperties: vi.fn(),
  setTrackInstrument: vi.fn().mockResolvedValue(undefined),
};

vi.mock('../stores/projectStore', () => ({
  useProjectStore: (selector?: (state: typeof storeState) => unknown) => selector ? selector(storeState) : storeState,
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
    storeState.tracks = [midiTrack];
    storeState.selectedTrackId = '1';
    storeState.updateTrackProperties.mockClear();
    midiTrack.setImageName(undefined);
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

  it('keeps a newly selected instrument group open', () => {
    renderWithLocale('en_us');

    fireEvent.click(screen.getByText('Guitar'));

    expect(screen.getByText('Acoustic Guitar (nylon)')).toBeTruthy();
    expect(screen.queryByText('Bright Acoustic Piano')).toBeNull();
  });
  it('defers the image update until OK and displays the saved choice', () => {
    midiTrack.setImageName('violin.png');
    const view = renderWithLocale('en_us');
    expect(document.querySelector('.instrument-preview img')).toHaveAttribute('src', expect.stringContaining('/resources/instruments/violin.png'));
    fireEvent.click(screen.getByRole('button', { name: 'Choose track image' }));
    expect(screen.getByRole('button', { name: 'violin' })).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(screen.getByRole('button', { name: 'cello' }));
    expect(storeState.updateTrackProperties).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'OK' }));
    expect(storeState.updateTrackProperties).toHaveBeenCalledWith(1, { imageName: 'cello.png' });
    expect(screen.queryByRole('dialog')).toBeNull();
    midiTrack.setImageName('cello.png');
    view.rerender(<InstrumentSelection />);
    expect(document.querySelector('.instrument-preview img')).toHaveAttribute('src', expect.stringContaining('cello.png'));
  });

  it('allows audio tracks to customize their speaker default', () => {
    storeState.tracks = [new KGAudioTrack('Audio', 1)];
    renderWithLocale('en_us');
    fireEvent.click(screen.getByRole('button', { name: 'Choose track image' }));
    expect(screen.getByRole('button', { name: 'speaker' })).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(screen.getByRole('button', { name: 'microphone' }));
    fireEvent.click(screen.getByRole('button', { name: 'OK' }));
    expect(storeState.updateTrackProperties).toHaveBeenCalledWith(1, { imageName: 'microphone.png' });
  });

  it('discards the picker when the selected track changes or disappears', () => {
    const view = renderWithLocale('en_us');
    fireEvent.click(screen.getByRole('button', { name: 'Choose track image' }));
    storeState.tracks = [new KGMidiTrack('Other', 2)];
    storeState.selectedTrackId = '2';
    view.rerender(<InstrumentSelection />);
    expect(screen.queryByRole('dialog')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Choose track image' }));
    storeState.tracks = [];
    view.rerender(<InstrumentSelection />);
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(storeState.updateTrackProperties).not.toHaveBeenCalled();
  });

});
