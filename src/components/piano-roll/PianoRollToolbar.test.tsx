import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import PianoRollToolbar from './PianoRollToolbar';
import { I18nContext } from '../../i18n/I18nProvider';
import type { ResolvedLocaleCode } from '../../i18n/types';
import { translate } from '../../i18n/translate';

vi.mock('../common', () => ({
  KGDropdown: ({
    value,
    onChange,
    options,
    label,
    showValueAsLabel,
  }: {
    value: string;
    onChange: (value: string) => void;
    options: Array<string | { label: string; value: string }>;
    label: string;
    showValueAsLabel?: boolean;
  }) => {
    const selected = options.find(option => (typeof option === 'string' ? option : option.value) === value);
    const text = showValueAsLabel
      ? (typeof selected === 'string' ? selected : selected?.label) ?? value
      : label;
    return (
      <button type="button" onClick={() => onChange('cc-11')} aria-label={text}>
        {text}
      </button>
    );
  },
  ColorPalettePopup: ({ onSelect }: { onSelect: (value: string | null) => void }) => (
    <div>
      <button type="button" aria-label="Reset color" onClick={() => onSelect(null)}>
        Reset
      </button>
      <button type="button" onClick={() => onSelect('#3C8AC4')}>
        Color Swatch
      </button>
    </div>
  ),
}));

vi.mock('../../core/KGCore', () => ({
  KGCore: {
    FUNCTIONAL_CHORDS_DATA: {
      ionian: { name: 'Ionian' },
      dorian: { name: 'Dorian' },
      harmonic_minor: { name: 'Harmonic Minor' },
    },
  },
}));

describe('PianoRollToolbar', () => {
  const renderWithLocale = (ui: React.ReactElement, locale: ResolvedLocaleCode = 'en_us') => render(
    <I18nContext.Provider
      value={{
        languageSetting: locale,
        resolvedLocale: locale,
        setLanguageSetting: async () => undefined,
        t: (key, params) => translate(key, params, locale),
      }}
    >
      {ui}
    </I18nContext.Provider>
  );

  const baseProps = {
    sheetMusicViewEnabled: false,
    onSheetMusicViewToggle: vi.fn(),
    sheetMusicTrackScopeEnabled: false,
    onSheetMusicTrackScopeToggle: vi.fn(),
    sheetQuantization: '16,48',
    onSheetQuantizationChange: vi.fn(),
    sheetQuantizationOptions: ['16,48', '32,96'],
    activeTool: 'pointer' as const,
    onToolSelect: vi.fn(),
    quantPosition: '1/8',
    quantLength: '1/8',
    onQuantSelect: vi.fn(),
    snapping: 'none',
    onSnappingSelect: vi.fn(),
    selectedMode: 'ionian',
    onModeChange: vi.fn(),
    chordGuide: 'N' as const,
    onChordGuideChange: vi.fn(),
    zoom: 1,
    onZoomChange: vi.fn(),
    onDetectChords: vi.fn(),
  };

  it('shows automation controls in midi mode and toggles the lane', () => {
    const onAutomationToggle = vi.fn();

    renderWithLocale(
      <PianoRollToolbar
        {...baseProps}
        mode="midi-edit"
        showAutomationControls={true}
        automationEnabled={false}
        automationType="pitch-bend"
        onAutomationToggle={onAutomationToggle}
        onAutomationTypeChange={vi.fn()}
      />
    );

    expect(screen.getByRole('button', { name: 'Toggle automation lane' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Pitch Bend/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Sheet Music View' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Toggle automation lane' }));
    expect(onAutomationToggle).toHaveBeenCalledTimes(1);
  });

  it('changes the automation type from the dropdown', () => {
    const onAutomationTypeChange = vi.fn();

    renderWithLocale(
      <PianoRollToolbar
        {...baseProps}
        mode="hybrid"
        showAutomationControls={true}
        automationEnabled={true}
        automationType="pitch-bend"
        onAutomationToggle={vi.fn()}
        onAutomationTypeChange={onAutomationTypeChange}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: /Pitch Bend/i }));

    expect(onAutomationTypeChange).toHaveBeenCalledWith('cc-11');
  });

  it('renders chord guide toggle buttons and marks off as active by default', () => {
    renderWithLocale(
      <PianoRollToolbar
        {...baseProps}
        mode="midi-edit"
        showAutomationControls={false}
      />
    );

    expect(screen.getByRole('button', { name: 'Chord guide off' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Chord guide tonic' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Chord guide subdominant' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Chord guide dominant' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Chord guide off' }).className).toContain('active');
    expect(screen.queryByRole('button', { name: 'Chord' })).not.toBeInTheDocument();
  });

  it('emits the selected chord guide value when toggle buttons are clicked', () => {
    const onChordGuideChange = vi.fn();

    renderWithLocale(
      <PianoRollToolbar
        {...baseProps}
        mode="midi-edit"
        showAutomationControls={false}
        onChordGuideChange={onChordGuideChange}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Chord guide off' }));
    fireEvent.click(screen.getByRole('button', { name: 'Chord guide tonic' }));
    fireEvent.click(screen.getByRole('button', { name: 'Chord guide subdominant' }));
    fireEvent.click(screen.getByRole('button', { name: 'Chord guide dominant' }));

    expect(onChordGuideChange).toHaveBeenNthCalledWith(1, 'N');
    expect(onChordGuideChange).toHaveBeenNthCalledWith(2, 'T');
    expect(onChordGuideChange).toHaveBeenNthCalledWith(3, 'S');
    expect(onChordGuideChange).toHaveBeenNthCalledWith(4, 'D');
  });

  it('hides automation controls in spectrogram mode', () => {
    renderWithLocale(
      <PianoRollToolbar
        {...baseProps}
        mode="spectrogram"
        showAutomationControls={false}
      />
    );

    expect(screen.queryByRole('button', { name: 'Toggle automation lane' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Pitch Bend/i })).not.toBeInTheDocument();
  });

  it('shows the spectrogram toggle for pure audio waveform mode and toggles it', () => {
    const onAudioSpectrogramToggle = vi.fn();

    renderWithLocale(
      <PianoRollToolbar
        {...baseProps}
        mode="audio-waveform"
        showAudioSpectrogramToggle={true}
        audioSpectrogramEnabled={false}
        onAudioSpectrogramToggle={onAudioSpectrogramToggle}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Spectrogram View' }));

    expect(onAudioSpectrogramToggle).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: 'Spectrogram View' }).className).not.toContain('active');
  });

  it('hides the spectrogram toggle in hybrid mode', () => {
    renderWithLocale(
      <PianoRollToolbar
        {...baseProps}
        mode="hybrid"
        showAudioSpectrogramToggle={false}
      />
    );

    expect(screen.queryByRole('button', { name: 'Spectrogram View' })).not.toBeInTheDocument();
  });

  it('shows the detect chords action in spectrogram mode and triggers it', () => {
    const onDetectChords = vi.fn();

    renderWithLocale(
      <PianoRollToolbar
        {...baseProps}
        mode="spectrogram"
        showAutomationControls={false}
        onDetectChords={onDetectChords}
      />
    );

    fireEvent.click(screen.getByTitle('More options'));
    fireEvent.click(screen.getByText('Detect chords...'));

    expect(onDetectChords).toHaveBeenCalledTimes(1);
  });

  it('shows the detect tempo action when the audio callback is provided and triggers it', () => {
    const onDetectTempo = vi.fn();

    renderWithLocale(
      <PianoRollToolbar
        {...baseProps}
        mode="spectrogram"
        showAutomationControls={false}
        onDetectTempo={onDetectTempo}
      />
    );

    fireEvent.click(screen.getByTitle('More options'));
    fireEvent.click(screen.getByText('Detect tempo...'));

    expect(onDetectTempo).toHaveBeenCalledTimes(1);
  });

  it('shows the detect chords action in midi mode and triggers it', () => {
    const onDetectChords = vi.fn();

    renderWithLocale(
      <PianoRollToolbar
        {...baseProps}
        mode="midi-edit"
        showAutomationControls={false}
        onDetectChords={onDetectChords}
      />
    );

    fireEvent.click(screen.getByTitle('More options'));
    fireEvent.click(screen.getByText('Detect chords...'));

    expect(onDetectChords).toHaveBeenCalledTimes(1);
  });

  it('disables the detect chords action while detection is running', () => {
    const onDetectChords = vi.fn();

    renderWithLocale(
      <PianoRollToolbar
        {...baseProps}
        mode="spectrogram"
        showAutomationControls={false}
        detectingChords={true}
        onDetectChords={onDetectChords}
      />
    );

    fireEvent.click(screen.getByTitle('More options'));
    const detectItem = screen.getByText('Detecting chords...');
    expect(detectItem).toHaveAttribute('aria-disabled', 'true');
    fireEvent.click(detectItem);
    expect(onDetectChords).not.toHaveBeenCalled();
  });

  it('disables the detect tempo action while detection is running', () => {
    const onDetectTempo = vi.fn();

    renderWithLocale(
      <PianoRollToolbar
        {...baseProps}
        mode="spectrogram"
        showAutomationControls={false}
        onDetectChords={undefined}
        detectingTempo={true}
        onDetectTempo={onDetectTempo}
      />
    );

    fireEvent.click(screen.getByTitle('More options'));
    const detectItem = screen.getByText('Detecting tempo...');
    expect(detectItem).toHaveAttribute('aria-disabled', 'true');
    fireEvent.click(detectItem);
    expect(onDetectTempo).not.toHaveBeenCalled();
  });

  it('does not show the detect tempo action without the audio callback', () => {
    renderWithLocale(
      <PianoRollToolbar
        {...baseProps}
        mode="midi-edit"
        showAutomationControls={false}
      />
    );

    fireEvent.click(screen.getByTitle('More options'));
    expect(screen.queryByText('Detect tempo...')).not.toBeInTheDocument();
  });

  it('shows the convert to MIDI action as the last audio option and triggers it', () => {
    const onConvertToMidi = vi.fn();

    renderWithLocale(
      <PianoRollToolbar
        {...baseProps}
        mode="spectrogram"
        showAutomationControls={false}
        onConvertToMidi={onConvertToMidi}
      />
    );

    fireEvent.click(screen.getByTitle('More options'));
    const options = screen.getAllByText(/Detect chords...|Convert to MIDI.../);
    expect(options[options.length - 1]).toHaveTextContent('Convert to MIDI...');
    fireEvent.click(screen.getByText('Convert to MIDI...'));

    expect(onConvertToMidi).toHaveBeenCalledTimes(1);
  });

  it('disables the convert to MIDI action when no MIDI tracks are available', () => {
    const onConvertToMidi = vi.fn();

    renderWithLocale(
      <PianoRollToolbar
        {...baseProps}
        mode="spectrogram"
        showAutomationControls={false}
        onConvertToMidi={onConvertToMidi}
        convertToMidiDisabled={true}
      />
    );

    fireEvent.click(screen.getByTitle('More options'));
    const convertItem = screen.getByText('Convert to MIDI...');
    expect(convertItem).toHaveAttribute('aria-disabled', 'true');
    fireEvent.click(convertItem);
    expect(onConvertToMidi).not.toHaveBeenCalled();
  });

  it('shows only the sheet controls when sheet mode is enabled', () => {
    renderWithLocale(
      <PianoRollToolbar
        {...baseProps}
        sheetMusicViewEnabled={true}
        mode="midi-edit"
      />
    );

    expect(screen.getByRole('button', { name: 'Sheet Music View' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /16,48/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Show Entire Track' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '1x' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Pointer Tool' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Pitch Bend/i })).not.toBeInTheDocument();
  });

  it('shows the zoom button outside sheet mode', () => {
    renderWithLocale(
      <PianoRollToolbar
        {...baseProps}
        sheetMusicViewEnabled={false}
        mode="midi-edit"
      />
    );

    expect(screen.getByRole('button', { name: 'Zoom' })).toBeInTheDocument();
  });

  it('toggles the full-track sheet scope button', () => {
    const onSheetMusicTrackScopeToggle = vi.fn();

    renderWithLocale(
      <PianoRollToolbar
        {...baseProps}
        sheetMusicViewEnabled={true}
        mode="hybrid"
        onSheetMusicTrackScopeToggle={onSheetMusicTrackScopeToggle}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Show Entire Track' }));
    expect(onSheetMusicTrackScopeToggle).toHaveBeenCalledTimes(1);
  });

  it('hides the full-track sheet scope button outside sheet mode and spectrogram mode', () => {
    const localeValue = {
      languageSetting: 'en_us' as const,
      resolvedLocale: 'en_us' as const,
      setLanguageSetting: async () => undefined,
      t: (key: string, params?: Record<string, string | number>) => translate(key, params, 'en_us'),
    };

    const { rerender } = render(
      <I18nContext.Provider value={localeValue}>
        <PianoRollToolbar
          {...baseProps}
          sheetMusicViewEnabled={false}
          mode="midi-edit"
        />
      </I18nContext.Provider>
    );

    expect(screen.queryByRole('button', { name: 'Show Entire Track' })).not.toBeInTheDocument();

    rerender(
      <I18nContext.Provider value={localeValue}>
        <PianoRollToolbar
          {...baseProps}
          sheetMusicViewEnabled={true}
          mode="spectrogram"
        />
      </I18nContext.Provider>
    );

    expect(screen.queryByRole('button', { name: 'Show Entire Track' })).not.toBeInTheDocument();
  });

  it('renders translated compact/full labels in zh-CN while emitting stable values', () => {
    const onAutomationTypeChange = vi.fn();

    renderWithLocale(
      <PianoRollToolbar
        {...baseProps}
        mode="midi-edit"
        showAutomationControls={true}
        automationEnabled={true}
        automationType="pitch-bend"
        onAutomationToggle={vi.fn()}
        onAutomationTypeChange={onAutomationTypeChange}
      />,
      'zh_cn',
    );

    expect(screen.getByRole('button', { name: '弯音' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '伊奥尼亚' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '无吸附' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '位置量化' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '长度量化' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '弯音' }));
    expect(onAutomationTypeChange).toHaveBeenCalledWith('cc-11');
  });

  it('translates extended mode labels like harmonic minor', () => {
    renderWithLocale(
      <PianoRollToolbar
        {...baseProps}
        mode="midi-edit"
        selectedMode="harmonic_minor"
      />,
      'zh_cn',
    );

    expect(screen.getByRole('button', { name: '和声小调' })).toBeInTheDocument();
  });

  it('shows the region color action in the more menu and emits the chosen color', () => {
    const onRegionColorSelect = vi.fn();

    renderWithLocale(
      <PianoRollToolbar
        {...baseProps}
        mode="midi-edit"
        onRegionColorSelect={onRegionColorSelect}
        selectedRegionColor="#3C8AC4"
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'More options' }));
    fireEvent.click(screen.getByText('Region Color...'));
    fireEvent.click(screen.getByRole('button', { name: 'Reset color' }));

    expect(onRegionColorSelect).toHaveBeenCalledWith(null);
  });
});
