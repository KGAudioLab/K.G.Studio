import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import PianoKeys from './PianoKeys';
import { createMockMidiNote, createMockMidiRegion, createMockMidiTrack } from '../../test/utils/mock-data';
import { I18nContext } from '../../i18n/I18nProvider';
import type { ResolvedLocaleCode } from '../../i18n/types';
import { translate } from '../../i18n/translate';

type TestLiveNoteActivityListener = (...args: [{ pitch: number; isNoteOn: boolean }]) => void;

const storeState = {
  tracks: [createMockMidiTrack({ id: 1 })],
  playheadPosition: 0,
  isPlaying: false,
};

const audioInterfaceMock = {
  getIsInitialized: vi.fn(),
  getIsAudioContextStarted: vi.fn(),
  startAudioContext: vi.fn(),
  triggerNoteAttack: vi.fn(),
  releaseNote: vi.fn(),
};

let liveNoteActivityListener: TestLiveNoteActivityListener | null = null;
const midiInputMock = {
  addLiveNoteActivityListener: vi.fn((listener: TestLiveNoteActivityListener) => {
    liveNoteActivityListener = listener;
  }),
  removeLiveNoteActivityListener: vi.fn((listener: TestLiveNoteActivityListener) => {
    if (liveNoteActivityListener === listener) {
      liveNoteActivityListener = null;
    }
  }),
};

vi.mock('../../stores/projectStore', () => ({
  useProjectStore: (selector: (...args: [typeof storeState]) => unknown) => selector(storeState),
}));

vi.mock('../../core/audio-interface/KGAudioInterface', () => ({
  KGAudioInterface: {
    instance: () => audioInterfaceMock,
  },
}));

vi.mock('../../core/midi-input/KGMidiInput', () => ({
  KGMidiInput: {
    instance: () => midiInputMock,
  },
}));

function renderWithLocale(
  ui: React.ReactElement,
  resolvedLocale: ResolvedLocaleCode = 'en_us',
) {
  return render(
    <I18nContext.Provider
      value={{
        languageSetting: resolvedLocale,
        resolvedLocale,
        setLanguageSetting: async () => undefined,
        t: (key, params) => translate(key, params, resolvedLocale),
      }}
    >
      {ui}
    </I18nContext.Provider>,
  );
}

describe('PianoKeys', () => {
  const activeRegion = createMockMidiRegion({
    trackId: '1',
    notes: [createMockMidiNote({ id: 'note-c4', pitch: 60, startBeat: 0, endBeat: 2 })],
  });

  beforeEach(() => {
    storeState.tracks = [createMockMidiTrack({ id: 1 })];
    storeState.playheadPosition = 0;
    storeState.isPlaying = false;
    liveNoteActivityListener = null;
    vi.clearAllMocks();
    audioInterfaceMock.getIsInitialized.mockReturnValue(true);
    audioInterfaceMock.getIsAudioContextStarted.mockReturnValue(true);
    audioInterfaceMock.startAudioContext.mockResolvedValue(undefined);
  });

  it('shows dot and background feedback for mouse preview while held', () => {
    const { container } = renderWithLocale(<PianoKeys activeRegion={activeRegion} />);
    const key = container.querySelector('[data-note="C4"]') as HTMLElement;

    fireEvent.mouseDown(key);

    expect(key.className).toContain('visual-active');
    expect(screen.getByTestId('piano-key-dot-C4')).toBeInTheDocument();

    fireEvent.mouseUp(key);

    expect(key.className).not.toContain('visual-active');
    expect(screen.queryByTestId('piano-key-dot-C4')).not.toBeInTheDocument();
  });

  it('shows MIDI activity dot without background feedback', () => {
    const { container } = renderWithLocale(<PianoKeys activeRegion={activeRegion} />);
    const key = container.querySelector('[data-note="C4"]') as HTMLElement;
    expect(midiInputMock.addLiveNoteActivityListener).toHaveBeenCalledTimes(1);

    act(() => {
      liveNoteActivityListener?.({ pitch: 60, isNoteOn: true });
    });

    expect(screen.getByTestId('piano-key-dot-C4')).toBeInTheDocument();
    expect(key.className).not.toContain('visual-active');

    act(() => {
      liveNoteActivityListener?.({ pitch: 60, isNoteOn: false });
    });

    expect(screen.queryByTestId('piano-key-dot-C4')).not.toBeInTheDocument();
  });

  it('shows playback background feedback without dot for sounding notes in the active region', () => {
    storeState.isPlaying = true;
    storeState.playheadPosition = 1;

    const { container } = renderWithLocale(<PianoKeys activeRegion={activeRegion} />);
    const key = container.querySelector('[data-note="C4"]') as HTMLElement;

    expect(key.className).toContain('playback-active');
    expect(key.className).toContain('visual-active');
    expect(screen.queryByTestId('piano-key-dot-C4')).not.toBeInTheDocument();
  });

  it('preserves source-specific feedback while mouse, MIDI, and playback overlap', () => {
    storeState.isPlaying = true;
    storeState.playheadPosition = 1;

    const { container, rerender } = renderWithLocale(<PianoKeys activeRegion={activeRegion} />);
    const key = container.querySelector('[data-note="C4"]') as HTMLElement;

    fireEvent.mouseDown(key);
    act(() => {
      liveNoteActivityListener?.({ pitch: 60, isNoteOn: true });
    });

    expect(key.className).toContain('visual-active');
    expect(screen.getByTestId('piano-key-dot-C4')).toBeInTheDocument();

    storeState.isPlaying = false;
    rerender(
      <I18nContext.Provider
        value={{
          languageSetting: 'en_us',
          resolvedLocale: 'en_us',
          setLanguageSetting: async () => undefined,
          t: (key, params) => translate(key, params, 'en_us'),
        }}
      >
        <PianoKeys activeRegion={activeRegion} />
      </I18nContext.Provider>,
    );

    expect(key.className).toContain('visual-active');
    expect(screen.getByTestId('piano-key-dot-C4')).toBeInTheDocument();

    fireEvent.mouseUp(key);

    expect(key.className).not.toContain('visual-active');
    expect(screen.getByTestId('piano-key-dot-C4')).toBeInTheDocument();

    act(() => {
      liveNoteActivityListener?.({ pitch: 60, isNoteOn: false });
    });

    expect(screen.queryByTestId('piano-key-dot-C4')).not.toBeInTheDocument();
  });

  it('renders translated drum key labels under zh-CN for GM drum-kit tracks', () => {
    storeState.tracks = [createMockMidiTrack({ id: 1, instrument: 'standard' })];

    const drumRegion = createMockMidiRegion({
      trackId: '1',
      notes: [createMockMidiNote({ id: 'kick', pitch: 35, startBeat: 0, endBeat: 1 })],
    });

    const { container } = renderWithLocale(<PianoKeys activeRegion={drumRegion} />, 'zh_cn');
    const key = container.querySelector('[data-note="B1"]');

    expect(key?.querySelector('.key-label')?.textContent).toBe('原底鼓');
  });

  it('updates visible drum labels when locale changes', () => {
    storeState.tracks = [createMockMidiTrack({ id: 1, instrument: 'standard' })];

    const drumRegion = createMockMidiRegion({
      trackId: '1',
      notes: [createMockMidiNote({ id: 'hihat', pitch: 42, startBeat: 0, endBeat: 1 })],
    });

    const view = renderWithLocale(<PianoKeys activeRegion={drumRegion} />, 'en_us');
    expect(screen.getByText('ClosedHH')).toBeInTheDocument();

    view.rerender(
      <I18nContext.Provider
        value={{
          languageSetting: 'zh_cn',
          resolvedLocale: 'zh_cn',
          setLanguageSetting: async () => undefined,
          t: (key, params) => translate(key, params, 'zh_cn'),
        }}
      >
        <PianoKeys activeRegion={drumRegion} />
      </I18nContext.Provider>,
    );

    expect(screen.getByText('闭镲')).toBeInTheDocument();
  });

  it('keeps tuned percussion tracks on standard note labels', () => {
    storeState.tracks = [createMockMidiTrack({ id: 1, instrument: 'taiko_drum' })];

    const { container } = renderWithLocale(<PianoKeys activeRegion={activeRegion} />, 'zh_cn');
    const key = container.querySelector('[data-note="C4"]');

    expect(key?.querySelector('.key-label')?.textContent).toBe('C4');
    expect(screen.queryByText('原底鼓')).not.toBeInTheDocument();
  });
});
