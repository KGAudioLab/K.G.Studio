import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import PianoRoll from './PianoRoll';
import { UpdateRegionCommand } from '../../core/commands';
import { KGAudioRegion } from '../../core/region/KGAudioRegion';
import { TrackType } from '../../core/track/KGTrack';
import { createMockMidiRegion, createMockMidiTrack } from '../../test/utils/mock-data';

const executeCommandMock = vi.fn((command: { execute?: () => void }) => {
  command.execute?.();
});

const pianoRollState = {
  zoom: 1,
  getCurrentSnap: vi.fn(() => 'none'),
  getActiveTool: vi.fn(() => 'pointer'),
  getAutomationViewEnabled: vi.fn(() => false),
  getCurrentAutomationType: vi.fn(() => 'pitch-bend'),
  getPianoRollZoom: vi.fn(() => pianoRollState.zoom),
  setPianoRollZoom: vi.fn(),
  getSheetMusicViewEnabled: vi.fn(() => false),
  getSheetMusicTrackScopeEnabled: vi.fn(() => false),
  getSheetQuantization: vi.fn(() => '16,48'),
  setSheetMusicViewEnabled: vi.fn(),
  setActiveTool: vi.fn(),
  setAutomationViewEnabled: vi.fn(),
  setCurrentAutomationType: vi.fn(),
  setSheetQuantization: vi.fn(),
  setSheetMusicTrackScopeEnabled: vi.fn(),
  setCurrentSnap: vi.fn(),
  setCurrentSuitableChords: vi.fn(),
  setCurrentSuitableChordsPitchClasses: vi.fn(),
  setCurrentHoveredChordGuideCandidate: vi.fn(),
};

const midiRegion = createMockMidiRegion({
  id: 'midi-region-1',
  trackId: '1',
  trackIndex: 0,
  name: 'MIDI Region',
});
const midiTrack = createMockMidiTrack({ id: 1, regions: [midiRegion] });

const audioRegion = new KGAudioRegion(
  'audio-region-1',
  '2',
  1,
  'Audio Region',
  0,
  4,
  'audio-file-1',
  'audio.wav',
  2.5,
);

const audioTrack = {
  getId: () => 2,
  getName: () => 'Audio Track',
  getRegions: () => [audioRegion],
  getType: () => TrackType.Wave,
};

const storeState = {
  maxBars: 8,
  tracks: [midiTrack, audioTrack],
  updateTrack: vi.fn(),
  updateRegionProperties: vi.fn(),
  timeSignature: { numerator: 4, denominator: 4 },
  pianoRollHeight: 500,
  setPianoRollHeight: vi.fn(),
  showChatBox: false,
  showKGOnePanel: false,
  showEventListPanel: false,
  showInstrumentSelection: false,
  keySignature: 'C major',
  selectedMode: 'ionian',
  setSelectedMode: vi.fn(),
  playheadPosition: 0,
  isPlaying: false,
  autoScrollEnabled: false,
  bpm: 120,
  pianoRollScrollRequest: null,
  selectedNoteIds: [],
  selectedRegionIds: [],
  automationRedrawVersion: 0,
  refreshProjectState: vi.fn(),
  setBpm: vi.fn(),
  isLooping: false,
  loopingRange: [0, 0] as [number, number],
};

vi.mock('../../stores/projectStore', () => ({
  useProjectStore: Object.assign(
    (selector?: (state: typeof storeState) => unknown) => selector ? selector(storeState) : storeState,
    {
      getState: () => ({ setAutoScrollEnabled: vi.fn() }),
      setState: vi.fn(),
    }
  ),
}));

vi.mock('../../core/state/KGPianoRollState', () => ({
  KGPianoRollState: {
    instance: () => pianoRollState,
    SNAP_OPTIONS: [{ value: 'none', labelKey: 'pianoRoll.snap.none' }],
    QUANT_POS_OPTIONS: [{ value: '1/8', labelKey: 'pianoRoll.quantize.1/8' }],
    QUANT_LEN_OPTIONS: [{ value: '1/8', labelKey: 'pianoRoll.quantize.1/8' }],
  },
  PIANO_ROLL_NO_SNAP: 'none',
}));

vi.mock('../../core/KGCore', () => ({
  KGCore: {
    FUNCTIONAL_CHORDS_DATA: { ionian: { name: 'Ionian' } },
    instance: () => ({
      getCurrentProject: () => ({
        setPianoRollZoom: vi.fn(),
        getTracks: () => storeState.tracks,
      }),
      getSelectedItems: () => [],
      executeCommand: executeCommandMock,
    }),
  },
}));

vi.mock('../../core/config/ConfigManager', () => ({
  ConfigManager: {
    instance: () => ({
      getIsInitialized: () => true,
      get: vi.fn(),
      addChangeListener: () => () => undefined,
    }),
  },
}));

vi.mock('../../util/dialogUtil', () => ({
  showAlert: vi.fn(),
  showAudioToMidiOptions: vi.fn(),
  showChordDetectionOptions: vi.fn(),
  showMidiChordDetectionOptions: vi.fn(),
  showTempoApply: vi.fn(),
  showTempoDetectionOptions: vi.fn(),
}));

vi.mock('./PianoRollHeader', () => ({
  default: (props: {
    title: string;
    isEditingTitle: boolean;
    titleInputValue: string;
    onTitleClick: () => void;
    onTitleInputChange: (value: string) => void;
    onTitleCommit: () => void;
    onTitleCancel: () => void;
  }) => (
    <div>
      {props.isEditingTitle ? (
        <input
          aria-label="Region title input"
          value={props.titleInputValue}
          onChange={(event) => props.onTitleInputChange(event.target.value)}
          onBlur={props.onTitleCommit}
          onKeyDown={(event) => {
            if (event.key === 'Escape') {
              props.onTitleCancel();
            }
          }}
        />
      ) : (
        <button type="button" onClick={props.onTitleClick}>
          {props.title}
        </button>
      )}
    </div>
  ),
}));

vi.mock('./NoteAttributeBar', () => ({ default: () => <div data-testid="note-attribute-bar" /> }));
vi.mock('./PianoRollContent', () => ({ default: () => <div data-testid="content" /> }));
vi.mock('./PianoRollToolbar', () => ({ default: () => <div data-testid="toolbar" /> }));

vi.mock('./chordGuideUtil', async () => {
  const actual = await vi.importActual<typeof import('./chordGuideUtil')>('./chordGuideUtil');
  return {
    ...actual,
    resolveChordGuideContext: vi.fn(() => ({
      keySignature: 'C major',
      mode: 'ionian',
    })),
  };
});

describe('PianoRoll region renaming', () => {
  beforeEach(() => {
    executeCommandMock.mockClear();
    midiRegion.setName('MIDI Region');
    audioRegion.setName('Audio Region');
  });

  it.each([
    { mode: 'audio-waveform' as const, title: 'WAVEFORM — Audio Region' },
    { mode: 'spectrogram' as const, title: 'SPECTROGRAM — Audio Region' },
  ])('renames audio regions in $mode mode', async ({ mode, title }) => {
    render(
      <PianoRoll
        onClose={vi.fn()}
        regionId={null}
        audioRegion={audioRegion}
        mode={mode}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: title }));

    const input = screen.getByLabelText('Region title input');
    expect(input).toHaveValue('Audio Region');

    fireEvent.change(input, { target: { value: 'Renamed Audio Region' } });
    fireEvent.blur(input);

    await waitFor(() => {
      expect(executeCommandMock).toHaveBeenCalledTimes(1);
    });

    const command = executeCommandMock.mock.calls[0][0];
    expect(command).toBeInstanceOf(UpdateRegionCommand);
    expect((command as UpdateRegionCommand).getRegionId()).toBe(audioRegion.getId());
    expect(audioRegion.getName()).toBe('Renamed Audio Region');
  });

  it('does not allow renaming in hybrid mode', () => {
    render(
      <PianoRoll
        onClose={vi.fn()}
        regionId={midiRegion.getId()}
        audioRegion={audioRegion}
        mode="hybrid"
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'MIDI Region + Audio Region' }));

    expect(screen.queryByLabelText('Region title input')).not.toBeInTheDocument();
    expect(executeCommandMock).not.toHaveBeenCalled();
  });

  it('skips rename commands for blank or unchanged values', async () => {
    const { rerender } = render(
      <PianoRoll
        onClose={vi.fn()}
        regionId={null}
        audioRegion={audioRegion}
        mode="audio-waveform"
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'WAVEFORM — Audio Region' }));
    let input = screen.getByLabelText('Region title input');
    fireEvent.change(input, { target: { value: 'Audio Region' } });
    fireEvent.blur(input);

    await waitFor(() => {
      expect(screen.queryByLabelText('Region title input')).not.toBeInTheDocument();
    });
    expect(executeCommandMock).not.toHaveBeenCalled();

    rerender(
      <PianoRoll
        onClose={vi.fn()}
        regionId={null}
        audioRegion={audioRegion}
        mode="audio-waveform"
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'WAVEFORM — Audio Region' }));
    input = screen.getByLabelText('Region title input');
    fireEvent.change(input, { target: { value: '   ' } });
    fireEvent.blur(input);

    await waitFor(() => {
      expect(screen.queryByLabelText('Region title input')).not.toBeInTheDocument();
    });
    expect(executeCommandMock).not.toHaveBeenCalled();
  });

  it('still renames MIDI regions in midi-edit mode', async () => {
    render(
      <PianoRoll
        onClose={vi.fn()}
        regionId={midiRegion.getId()}
        mode="midi-edit"
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'MIDI Region (at 1:1)' }));

    const input = screen.getByLabelText('Region title input');
    fireEvent.change(input, { target: { value: 'Renamed MIDI Region' } });
    fireEvent.blur(input);

    await waitFor(() => {
      expect(executeCommandMock).toHaveBeenCalledTimes(1);
    });

    const command = executeCommandMock.mock.calls[0][0];
    expect(command).toBeInstanceOf(UpdateRegionCommand);
    expect((command as UpdateRegionCommand).getRegionId()).toBe(midiRegion.getId());
    expect(midiRegion.getName()).toBe('Renamed MIDI Region');
  });
});
