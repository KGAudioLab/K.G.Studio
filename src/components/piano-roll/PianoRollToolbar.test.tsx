import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import PianoRollToolbar from './PianoRollToolbar';

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
}));

vi.mock('../../core/KGCore', () => ({
  KGCore: {
    FUNCTIONAL_CHORDS_DATA: {
      ionian: { name: 'Ionian' },
      dorian: { name: 'Dorian' },
    },
  },
}));

describe('PianoRollToolbar', () => {
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
    snapping: 'NO SNAP',
    onSnappingSelect: vi.fn(),
    selectedMode: 'ionian',
    onModeChange: vi.fn(),
    chordGuide: 'N',
    onChordGuideChange: vi.fn(),
    zoom: 1,
    onZoomChange: vi.fn(),
  };

  it('shows automation controls in midi mode and toggles the lane', () => {
    const onAutomationToggle = vi.fn();

    render(
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

    render(
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

  it('hides automation controls in spectrogram mode', () => {
    render(
      <PianoRollToolbar
        {...baseProps}
        mode="spectrogram"
        showAutomationControls={false}
      />
    );

    expect(screen.queryByRole('button', { name: 'Toggle automation lane' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Pitch Bend/i })).not.toBeInTheDocument();
  });

  it('shows only the sheet controls when sheet mode is enabled', () => {
    render(
      <PianoRollToolbar
        {...baseProps}
        sheetMusicViewEnabled={true}
        mode="midi-edit"
      />
    );

    expect(screen.getByRole('button', { name: 'Sheet Music View' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /16,48/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Show Entire Track' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Pointer Tool' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Pitch Bend/i })).not.toBeInTheDocument();
  });

  it('toggles the full-track sheet scope button', () => {
    const onSheetMusicTrackScopeToggle = vi.fn();

    render(
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
    const { rerender } = render(
      <PianoRollToolbar
        {...baseProps}
        sheetMusicViewEnabled={false}
        mode="midi-edit"
      />
    );

    expect(screen.queryByRole('button', { name: 'Show Entire Track' })).not.toBeInTheDocument();

    rerender(
      <PianoRollToolbar
        {...baseProps}
        sheetMusicViewEnabled={true}
        mode="spectrogram"
      />
    );

    expect(screen.queryByRole('button', { name: 'Show Entire Track' })).not.toBeInTheDocument();
  });
});
