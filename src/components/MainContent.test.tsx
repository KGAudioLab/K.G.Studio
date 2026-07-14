import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import MainContent from './MainContent';
import { KGMidiRegion } from '../core/region/KGMidiRegion';
import { KGAudioRegion } from '../core/region/KGAudioRegion';
import { KGChordRegion } from '../core/region/KGChordRegion';
import { KGTempoRegion } from '../core/region/KGTempoRegion';
import { KGAudioTrack } from '../core/track/KGAudioTrack';
import { createDefaultGlobalTracks, GlobalTrackType } from '../core/global-track';
import { createMockMidiTrack } from '../test/utils/mock-data';

const executeCommandMock = vi.fn();
const midiRegion = new KGMidiRegion('region-1', '1', 0, 'Region 1', 0, 4);
const anotherMidiRegion = new KGMidiRegion('region-2', '1', 0, 'Region 2', 8, 4);
const audioRegion = new KGAudioRegion('audio-1', '2', 1, 'Audio 1', 4, 4);
const midiTrack = createMockMidiTrack({ id: 1, regions: [midiRegion, anotherMidiRegion] });
const audioTrack = new KGAudioTrack('Audio Track', 2);
audioTrack.setTrackIndex(1);
audioTrack.setRegions([audioRegion]);

const storeState = {
  tracks: [midiTrack, audioTrack],
  globalTracks: createDefaultGlobalTracks(),
  maxBars: 8,
  barWidthMultiplier: 1,
  reorderTracks: vi.fn(),
  updateTrack: vi.fn(),
  updateTrackProperties: vi.fn(),
  timeSignature: { numerator: 4, denominator: 4 },
  setPlayheadPosition: vi.fn(),
  playheadPosition: 0,
  isPlaying: false,
  autoScrollEnabled: false,
  setAutoScrollEnabled: vi.fn(),
  clearAllSelections: vi.fn(() => {
    storeState.selectedRegionIds = [];
  }),
  setSelectedTrack: vi.fn(),
  selectedRegionIds: [] as string[],
  showPianoRoll: false,
  pianoRollHeight: 500,
  activeRegionId: null as string | null,
  setShowPianoRoll: vi.fn((show: boolean) => {
    storeState.showPianoRoll = show;
  }),
  setPianoRollHeight: vi.fn((height: number) => {
    storeState.pianoRollHeight = height;
  }),
  setActiveRegionId: vi.fn((regionId: string | null) => {
    storeState.activeRegionId = regionId;
  }),
  pianoRollMode: 'midi-edit' as const,
  requestedSheetMusicViewEnabled: false,
  pianoRollViewRequestVersion: 0,
  openMidiPianoRoll: vi.fn(),
  openAudioWaveformViewer: vi.fn(),
  openSpectrogramViewer: vi.fn(),
  openHybridMode: vi.fn(),
  hybridAudioRegionId: null as string | null,
  addTrack: vi.fn(),
  addAudioTrack: vi.fn(),
  projectName: 'Test Project',
  savedProjectName: 'Test Project',
  showGlobalTracks: false,
  setShowGlobalTracks: vi.fn((show: boolean) => {
    storeState.showGlobalTracks = show;
  }),
  requestPianoRollScroll: vi.fn(),
  mainContentScrollRequest: null,
  activeTrackAutomationTrackId: null,
  activeTrackAutomationType: null,
  selectedTrackAutomationPointIds: [],
  bumpTrackAutomationRedrawVersion: vi.fn(),
  refreshProjectState: vi.fn(),
  showInstrumentSelection: false,
  isLooping: false,
  loopingRange: [0, 0] as [number, number],
};

// eslint-disable-next-line no-unused-vars
type StoreSelector = (...args: [typeof storeState]) => unknown;
// eslint-disable-next-line no-unused-vars
type RegionClickHandler = (...args: [string, { shiftKey: boolean; metaKey: boolean; ctrlKey: boolean }]) => void;

const finishTrackCreateDialogClose = () => {
  const overlay = document.querySelector('.dialog-overlay');
  if (overlay) {
    fireEvent.animationEnd(overlay);
  }
};

const toggleGlobalTracksAndRerender = (rerender: (ui: React.ReactNode) => void) => {
  fireEvent.click(screen.getByRole('button', { name: 'Show global tracks' }));
  rerender(<MainContent />);
};

vi.mock('../stores/projectStore', () => ({
  useProjectStore: (selector?: StoreSelector) => (
    selector ? selector(storeState) : storeState
  ),
}));

vi.mock('../core/KGCore', () => ({
  KGCore: {
    instance: () => ({
      addSelectedItems: (items: Array<{ getId(): string }>) => {
        storeState.selectedRegionIds = items.map(item => item.getId());
      },
      clearSelectedItems: () => {
        storeState.selectedRegionIds = [];
      },
      executeCommand: executeCommandMock,
      getCurrentProject: () => ({
        getTracks: () => storeState.tracks,
      }),
    }),
  },
}));

vi.mock('../hooks/useRegionOperations', () => ({
  useRegionOperations: () => ({
    deleteSelectedRegions: vi.fn(() => false),
  }),
}));

vi.mock('./track/TrackInfoPanel', () => ({
  default: () => <div data-testid="track-info-panel" />,
}));

vi.mock('./track/TrackGridPanel', () => ({
  default: ({ onRegionClick }: { onRegionClick?: RegionClickHandler }) => (
    <>
      <button type="button" onClick={() => onRegionClick?.('region-1', { shiftKey: false, metaKey: false, ctrlKey: false })}>
        select-midi-region
      </button>
      <button type="button" onClick={() => onRegionClick?.('region-2', { shiftKey: false, metaKey: false, ctrlKey: false })}>
        select-second-midi-region
      </button>
      <button type="button" onClick={() => onRegionClick?.('region-2', { shiftKey: true, metaKey: false, ctrlKey: false })}>
        shift-select-second-midi-region
      </button>
      <button type="button" onClick={() => onRegionClick?.('region-2', { shiftKey: false, metaKey: true, ctrlKey: false })}>
        meta-select-second-midi-region
      </button>
      <button type="button" onClick={() => onRegionClick?.('region-2', { shiftKey: true, metaKey: true, ctrlKey: false })}>
        shift-meta-select-second-midi-region
      </button>
      <button type="button" onClick={() => onRegionClick?.('audio-1', { shiftKey: false, metaKey: false, ctrlKey: false })}>
        select-audio-region
      </button>
      <button type="button" onClick={() => onRegionClick?.('audio-1', { shiftKey: false, metaKey: true, ctrlKey: false })}>
        meta-select-audio-region
      </button>
      <button type="button" onClick={() => onRegionClick?.('audio-1', { shiftKey: true, metaKey: false, ctrlKey: false })}>
        shift-select-audio-region
      </button>
    </>
  ),
}));

vi.mock('./piano-roll/PianoRoll', () => ({
  default: ({ onClose }: { onClose?: () => void }) => (
    <div data-testid="piano-roll">
      <button type="button" onClick={onClose}>close-piano-roll</button>
    </div>
  ),
}));

describe('MainContent', () => {
  beforeEach(() => {
    midiTrack.setRegions([midiRegion, anotherMidiRegion]);
    audioTrack.setRegions([audioRegion]);
    storeState.tracks = [midiTrack, audioTrack];
    storeState.globalTracks = createDefaultGlobalTracks();
    storeState.selectedRegionIds = [];
    storeState.activeRegionId = null;
    storeState.showPianoRoll = false;
    storeState.showGlobalTracks = false;
    storeState.playheadPosition = 0;
    storeState.timeSignature = { numerator: 4, denominator: 4 };
    storeState.clearAllSelections.mockClear();
    storeState.setSelectedTrack.mockClear();
    storeState.setShowPianoRoll.mockClear();
    storeState.setActiveRegionId.mockClear();
    storeState.openMidiPianoRoll.mockClear();
    storeState.openAudioWaveformViewer.mockClear();
    storeState.openSpectrogramViewer.mockClear();
    storeState.addTrack.mockClear();
    storeState.addAudioTrack.mockClear();
    storeState.setShowGlobalTracks.mockClear();
    executeCommandMock.mockClear();
  });

  it('updates activeRegionId when selecting a region with piano roll closed', () => {
    render(<MainContent />);

    fireEvent.click(screen.getByRole('button', { name: 'select-midi-region' }));

    expect(storeState.activeRegionId).toBe('region-1');
    expect(storeState.setActiveRegionId).toHaveBeenCalledWith('region-1');
    expect(storeState.showPianoRoll).toBe(false);
    expect(storeState.openMidiPianoRoll).not.toHaveBeenCalled();
  });

  it('keeps piano roll open and preserves activeRegionId when deselecting all regions', () => {
    storeState.showPianoRoll = true;
    storeState.activeRegionId = 'region-1';
    storeState.selectedRegionIds = ['region-1'];

    const { container } = render(<MainContent />);

    fireEvent.click(container.firstChild as HTMLElement);

    expect(storeState.selectedRegionIds).toEqual([]);
    expect(storeState.showPianoRoll).toBe(true);
    expect(storeState.activeRegionId).toBe('region-1');
    expect(storeState.setShowPianoRoll).not.toHaveBeenCalledWith(false);
    expect(storeState.setActiveRegionId).not.toHaveBeenCalledWith(null);
  });

  it('auto-switches the open piano roll when selecting another MIDI region', () => {
    storeState.showPianoRoll = true;
    storeState.activeRegionId = 'region-1';

    render(<MainContent />);

    fireEvent.click(screen.getByRole('button', { name: 'select-second-midi-region' }));

    expect(storeState.activeRegionId).toBe('region-2');
    expect(storeState.openMidiPianoRoll).toHaveBeenCalledWith('region-2');
  });

  it('preserves current cross-type behavior when selecting an audio region with the editor open', () => {
    storeState.showPianoRoll = true;
    storeState.activeRegionId = 'region-1';

    render(<MainContent />);

    fireEvent.click(screen.getByRole('button', { name: 'select-audio-region' }));

    expect(storeState.activeRegionId).toBe('audio-1');
    expect(storeState.openAudioWaveformViewer).toHaveBeenCalledWith('audio-1');
    expect(storeState.openSpectrogramViewer).not.toHaveBeenCalled();
  });

  it('cmd-click adds a second regular region without range fill', () => {
    render(<MainContent />);

    fireEvent.click(screen.getByRole('button', { name: 'select-midi-region' }));
    fireEvent.click(screen.getByRole('button', { name: 'meta-select-second-midi-region' }));

    expect(storeState.selectedRegionIds).toEqual(['region-1', 'region-2']);
    expect(storeState.activeRegionId).toBe('region-2');
  });

  it('cmd-click on an already selected regular region removes it', () => {
    storeState.selectedRegionIds = ['region-1', 'region-2'];

    render(<MainContent />);

    fireEvent.click(screen.getByRole('button', { name: 'meta-select-second-midi-region' }));

    expect(storeState.selectedRegionIds).toEqual(['region-1']);
  });

  it('shift-click on the same track selects the full in-between range and keeps the clicked region primary', () => {
    const middleMidiRegion = new KGMidiRegion('region-1b', '1', 0, 'Region 1B', 4, 4);
    midiTrack.setRegions([midiRegion, middleMidiRegion, anotherMidiRegion]);

    render(<MainContent />);

    fireEvent.click(screen.getByRole('button', { name: 'select-midi-region' }));
    fireEvent.click(screen.getByRole('button', { name: 'shift-select-second-midi-region' }));

    expect(storeState.selectedRegionIds).toEqual(['region-1', 'region-1b', 'region-2']);

    midiTrack.setRegions([midiRegion, anotherMidiRegion]);
  });

  it('shift-click with no same-track anchor falls back to single selection', () => {
    render(<MainContent />);

    fireEvent.click(screen.getByRole('button', { name: 'shift-select-second-midi-region' }));

    expect(storeState.selectedRegionIds).toEqual(['region-2']);
  });

  it('shift-click across tracks adds only the clicked region', () => {
    render(<MainContent />);

    fireEvent.click(screen.getByRole('button', { name: 'select-midi-region' }));
    fireEvent.click(screen.getByRole('button', { name: 'shift-select-audio-region' }));

    expect(storeState.selectedRegionIds).toEqual(['region-1', 'audio-1']);
    expect(storeState.activeRegionId).toBe('audio-1');
  });

  it('shift-click across tracks removes an already selected region', () => {
    storeState.selectedRegionIds = ['audio-1', 'region-1'];

    render(<MainContent />);

    fireEvent.click(screen.getByRole('button', { name: 'shift-select-audio-region' }));

    expect(storeState.selectedRegionIds).toEqual(['region-1']);
  });

  it('uses the primary region as the shift anchor when an older selection shares the target track', () => {
    const middleMidiRegion = new KGMidiRegion('region-1b', '1', 0, 'Region 1B', 4, 4);
    midiTrack.setRegions([midiRegion, middleMidiRegion, anotherMidiRegion]);
    storeState.selectedRegionIds = ['region-1', 'audio-1'];

    render(<MainContent />);

    fireEvent.click(screen.getByRole('button', { name: 'shift-select-second-midi-region' }));

    expect(storeState.selectedRegionIds).toEqual(['region-1', 'audio-1', 'region-2']);

    midiTrack.setRegions([midiRegion, anotherMidiRegion]);
  });

  it('shift-click preserves already selected regions on other regular tracks', () => {
    const middleMidiRegion = new KGMidiRegion('region-1b', '1', 0, 'Region 1B', 4, 4);
    midiTrack.setRegions([midiRegion, middleMidiRegion, anotherMidiRegion]);
    storeState.selectedRegionIds = ['audio-1', 'region-1'];

    render(<MainContent />);

    fireEvent.click(screen.getByRole('button', { name: 'shift-select-second-midi-region' }));

    expect(storeState.selectedRegionIds).toEqual(['audio-1', 'region-1', 'region-1b', 'region-2']);

    midiTrack.setRegions([midiRegion, anotherMidiRegion]);
  });

  it('shift-plus-cmd-click uses additive-toggle behavior instead of range selection', () => {
    const middleMidiRegion = new KGMidiRegion('region-1b', '1', 0, 'Region 1B', 4, 4);
    midiTrack.setRegions([midiRegion, middleMidiRegion, anotherMidiRegion]);

    render(<MainContent />);

    fireEvent.click(screen.getByRole('button', { name: 'select-midi-region' }));
    fireEvent.click(screen.getByRole('button', { name: 'shift-meta-select-second-midi-region' }));

    expect(storeState.selectedRegionIds).toEqual(['region-1', 'region-2']);

    midiTrack.setRegions([midiRegion, anotherMidiRegion]);
  });

  it('explicit close still clears piano roll visibility and active region', () => {
    storeState.showPianoRoll = true;
    storeState.activeRegionId = 'region-1';

    render(<MainContent />);

    fireEvent.click(screen.getByRole('button', { name: 'close-piano-roll' }));

    expect(storeState.showPianoRoll).toBe(false);
    expect(storeState.activeRegionId).toBeNull();
    expect(storeState.setShowPianoRoll).toHaveBeenCalledWith(false);
    expect(storeState.setActiveRegionId).toHaveBeenCalledWith(null);
  });

  it('renders the two-row timeline ruler with track controls and beat markers', () => {
    const { container } = render(<MainContent />);

    expect(screen.getByRole('button', { name: 'Create track' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Show global tracks' })).toBeInTheDocument();

    const barCells = container.querySelectorAll('[data-testid="bar-number-cell"]');
    expect(barCells).toHaveLength(storeState.maxBars);
    expect(barCells[0]).toHaveTextContent('1');
    expect(barCells[storeState.maxBars - 1]).toHaveTextContent(String(storeState.maxBars));

    const beatRows = container.querySelectorAll('[data-testid="bar-beat-markers"]');
    expect(beatRows).toHaveLength(storeState.maxBars);
    expect(beatRows[0].querySelectorAll('.beat-marker')).toHaveLength(storeState.timeSignature.numerator - 1);
    expect(beatRows[0].querySelector('.bar-boundary-marker')).not.toBeNull();
  });

  it('updates lower-row beat ticks when the time signature numerator changes', () => {
    storeState.timeSignature = { numerator: 3, denominator: 4 };

    const { container } = render(<MainContent />);
    const firstBeatRow = container.querySelector('[data-testid="bar-beat-markers"]');

    expect(firstBeatRow?.querySelectorAll('.beat-marker')).toHaveLength(2);
  });

  it('opens the track creation modal with MIDI selected by default', () => {
    render(<MainContent />);

    fireEvent.click(screen.getByRole('button', { name: 'Create track' }));

    expect(screen.getByRole('dialog', { name: 'Create New Track' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'MIDI' }).className).toContain('selected');
    expect(screen.getByRole('button', { name: 'Audio' }).className).not.toContain('selected');
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Create' })).toBeInTheDocument();
  });

  it('creates an audio track when audio is selected in the modal', () => {
    render(<MainContent />);

    fireEvent.click(screen.getByRole('button', { name: 'Create track' }));
    fireEvent.click(screen.getByRole('button', { name: 'Audio' }));
    fireEvent.click(screen.getByRole('button', { name: 'Create' }));
    finishTrackCreateDialogClose();

    expect(storeState.addAudioTrack).toHaveBeenCalledTimes(1);
    expect(storeState.addTrack).not.toHaveBeenCalled();
    expect(screen.queryByRole('dialog', { name: 'Create New Track' })).not.toBeInTheDocument();
  });

  it('creates a MIDI track by default when confirming the modal', () => {
    render(<MainContent />);

    fireEvent.click(screen.getByRole('button', { name: 'Create track' }));
    fireEvent.click(screen.getByRole('button', { name: 'Create' }));
    finishTrackCreateDialogClose();

    expect(storeState.addTrack).toHaveBeenCalledTimes(1);
    expect(storeState.addAudioTrack).not.toHaveBeenCalled();
  });

  it('closes the track creation modal without creating a track when canceled', () => {
    render(<MainContent />);

    fireEvent.click(screen.getByRole('button', { name: 'Create track' }));
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    finishTrackCreateDialogClose();

    expect(storeState.addTrack).not.toHaveBeenCalled();
    expect(storeState.addAudioTrack).not.toHaveBeenCalled();
    expect(screen.queryByRole('dialog', { name: 'Create New Track' })).not.toBeInTheDocument();
  });

  it('toggles the persisted global tracks button active state through the store', () => {
    const { rerender } = render(<MainContent />);

    let globalTracksButton = screen.getByRole('button', { name: 'Show global tracks' });

    expect(globalTracksButton.className).not.toContain('active');

    fireEvent.click(globalTracksButton);
    expect(storeState.setShowGlobalTracks).toHaveBeenCalledWith(true);
    rerender(<MainContent />);
    globalTracksButton = screen.getByRole('button', { name: 'Show global tracks' });
    expect(globalTracksButton.className).toContain('active');

    fireEvent.click(globalTracksButton);
    expect(storeState.setShowGlobalTracks).toHaveBeenCalledWith(false);
    rerender(<MainContent />);
    globalTracksButton = screen.getByRole('button', { name: 'Show global tracks' });
    expect(globalTracksButton.className).not.toContain('active');
  });

  it('renders the four global tracks only when the persisted toggle is on', () => {
    const { rerender } = render(<MainContent />);

    expect(screen.queryByText('Marker')).not.toBeInTheDocument();
    expect(screen.queryByText('Tempo')).not.toBeInTheDocument();
    expect(screen.queryByText('Key Signature')).not.toBeInTheDocument();
    expect(screen.queryByText('Chord')).not.toBeInTheDocument();

    toggleGlobalTracksAndRerender(rerender);

    expect(screen.getByText('Marker')).toBeInTheDocument();
    expect(screen.getByText('Tempo')).toBeInTheDocument();
    expect(screen.getByText('Key Signature')).toBeInTheDocument();
    expect(screen.getByText('Chord')).toBeInTheDocument();

    const globalTracksInfoShell = screen.getByRole('button', { name: 'Add Marker global track item' }).closest('.global-tracks-info-shell') as HTMLElement;

    toggleGlobalTracksAndRerender(rerender);
    fireEvent.transitionEnd(globalTracksInfoShell);

    expect(screen.queryByText('Marker')).not.toBeInTheDocument();
    expect(screen.queryByText('Tempo')).not.toBeInTheDocument();
    expect(screen.queryByText('Key Signature')).not.toBeInTheDocument();
    expect(screen.queryByText('Chord')).not.toBeInTheDocument();
  });

  it('routes the tempo and chord global track add buttons through commands', () => {
    storeState.playheadPosition = 5;
    const { rerender } = render(<MainContent />);

    toggleGlobalTracksAndRerender(rerender);

    fireEvent.click(screen.getByRole('button', { name: 'Add Tempo global track item' }));
    expect(executeCommandMock).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole('button', { name: 'Add Chord global track item' }));

    expect(storeState.addTrack).not.toHaveBeenCalled();
    expect(storeState.addAudioTrack).not.toHaveBeenCalled();
    expect(executeCommandMock).toHaveBeenCalledTimes(2);
    expect((executeCommandMock.mock.calls[1][0] as { startBeat?: number }).startBeat).toBe(5);
  });

  it('selecting a global region clears regular-region selection', () => {
    const globalTracks = createDefaultGlobalTracks();
    const chordTrack = globalTracks.find(track => track.getType() === GlobalTrackType.Chord);
    chordTrack?.setRegions([
      new KGChordRegion('chord-1', chordTrack.getId(), chordTrack.getTrackIndex(), 'Am', 0, 4),
    ]);
    storeState.globalTracks = globalTracks;

    const { rerender } = render(<MainContent />);

    fireEvent.click(screen.getByRole('button', { name: 'select-midi-region' }));
    toggleGlobalTracksAndRerender(rerender);
    fireEvent.click(screen.getByText('Am'));

    expect(storeState.selectedRegionIds).toEqual(['chord-1']);

    storeState.globalTracks = createDefaultGlobalTracks();
  });

  it('shift-click across globals ranges only within the same global lane and keeps the clicked region primary', () => {
    const globalTracks = createDefaultGlobalTracks();
    const chordTrack = globalTracks.find(track => track.getType() === GlobalTrackType.Chord);
    chordTrack?.setRegions([
      new KGChordRegion('chord-1', chordTrack.getId(), chordTrack.getTrackIndex(), 'Am', 0, 4),
      new KGChordRegion('chord-2', chordTrack.getId(), chordTrack.getTrackIndex(), 'F', 4, 4),
      new KGChordRegion('chord-3', chordTrack.getId(), chordTrack.getTrackIndex(), 'G', 8, 4),
    ]);
    storeState.globalTracks = globalTracks;

    const { rerender } = render(<MainContent />);

    toggleGlobalTracksAndRerender(rerender);
    fireEvent.click(screen.getByText('Am'));
    fireEvent.click(screen.getByText('G'), { shiftKey: true });

    expect(storeState.selectedRegionIds).toEqual(['chord-1', 'chord-2', 'chord-3']);

    storeState.globalTracks = createDefaultGlobalTracks();
  });

  it('shift-clicking from the first chord region to the last chord region selects the full chord range', () => {
    const globalTracks = createDefaultGlobalTracks();
    const chordTrack = globalTracks.find(track => track.getType() === GlobalTrackType.Chord);
    chordTrack?.setRegions([
      new KGChordRegion('chord-1', chordTrack.getId(), chordTrack.getTrackIndex(), 'Am', 0, 4),
      new KGChordRegion('chord-2', chordTrack.getId(), chordTrack.getTrackIndex(), 'F', 4, 4),
      new KGChordRegion('chord-3', chordTrack.getId(), chordTrack.getTrackIndex(), 'G', 8, 4),
    ]);
    storeState.globalTracks = globalTracks;

    const { rerender } = render(<MainContent />);

    toggleGlobalTracksAndRerender(rerender);

    const firstChord = screen.getByText('Am');
    const lastChord = screen.getByText('G');

    fireEvent.mouseDown(firstChord, { clientX: 10, clientY: 10, button: 0 });
    fireEvent.mouseUp(window, { clientX: 10, clientY: 10 });
    fireEvent.click(firstChord);

    fireEvent.mouseDown(lastChord, { clientX: 10, clientY: 10, button: 0, shiftKey: true });
    fireEvent.mouseUp(window, { clientX: 10, clientY: 10, shiftKey: true });
    fireEvent.click(lastChord, { shiftKey: true });

    expect(storeState.selectedRegionIds).toEqual(['chord-1', 'chord-2', 'chord-3']);

    storeState.globalTracks = createDefaultGlobalTracks();
  });

  it('cmd-clicking a region in a different global lane clears the previous global selection', () => {
    const globalTracks = createDefaultGlobalTracks();
    const chordTrack = globalTracks.find(track => track.getType() === GlobalTrackType.Chord);
    const tempoTrack = globalTracks.find(track => track.getType() === GlobalTrackType.Tempo);
    chordTrack?.setRegions([
      new KGChordRegion('chord-1', chordTrack.getId(), chordTrack.getTrackIndex(), 'Am', 0, 4),
    ]);
    tempoTrack?.setRegions([
      new KGTempoRegion('tempo-1', tempoTrack.getId(), tempoTrack.getTrackIndex(), 128, 0, 4, 4),
    ]);
    storeState.globalTracks = globalTracks;

    const { rerender } = render(<MainContent />);

    toggleGlobalTracksAndRerender(rerender);
    fireEvent.click(screen.getByText('Am'));
    fireEvent.click(screen.getByText('128 BPM'), { metaKey: true });

    expect(storeState.selectedRegionIds).toEqual(['tempo-1']);

    storeState.globalTracks = createDefaultGlobalTracks();
  });

  it('shift-clicking a region in a different global lane clears the previous global selection', () => {
    const globalTracks = createDefaultGlobalTracks();
    const chordTrack = globalTracks.find(track => track.getType() === GlobalTrackType.Chord);
    const tempoTrack = globalTracks.find(track => track.getType() === GlobalTrackType.Tempo);
    chordTrack?.setRegions([
      new KGChordRegion('chord-1', chordTrack.getId(), chordTrack.getTrackIndex(), 'Am', 0, 4),
    ]);
    tempoTrack?.setRegions([
      new KGTempoRegion('tempo-1', tempoTrack.getId(), tempoTrack.getTrackIndex(), 128, 0, 4, 4),
      new KGTempoRegion('tempo-2', tempoTrack.getId(), tempoTrack.getTrackIndex(), 140, 4, 4, 4),
    ]);
    storeState.globalTracks = globalTracks;

    const { rerender } = render(<MainContent />);

    toggleGlobalTracksAndRerender(rerender);
    fireEvent.click(screen.getByText('Am'));
    fireEvent.click(screen.getByText('140 BPM'), { shiftKey: true });

    expect(storeState.selectedRegionIds).toEqual(['tempo-2']);

    storeState.globalTracks = createDefaultGlobalTracks();
  });

  it('uses split-insert chord command when the playhead is inside an existing chord region', () => {
    const globalTracks = createDefaultGlobalTracks();
    const chordTrack = globalTracks.find(track => track.getType() === GlobalTrackType.Chord);
    chordTrack?.addRegion(new KGChordRegion('chord-1', chordTrack.getId(), chordTrack.getTrackIndex(), 'Am', 0, 8));
    storeState.globalTracks = globalTracks;
    storeState.playheadPosition = 3;

    const { rerender } = render(<MainContent />);

    toggleGlobalTracksAndRerender(rerender);
    fireEvent.click(screen.getByRole('button', { name: 'Add Chord global track item' }));

    expect(executeCommandMock).toHaveBeenCalledTimes(1);
    expect((executeCommandMock.mock.calls[0][0] as { insertBeat?: number }).insertBeat).toBe(3);

    storeState.globalTracks = createDefaultGlobalTracks();
  });

  it('tabs the open chord popup to the next chord region before the next bar', () => {
    const globalTracks = createDefaultGlobalTracks();
    const chordTrack = globalTracks.find(track => track.getType() === GlobalTrackType.Chord);
    chordTrack?.setRegions([
      new KGChordRegion('chord-1', chordTrack.getId(), chordTrack.getTrackIndex(), 'Am', 0, 3),
      new KGChordRegion('chord-2', chordTrack.getId(), chordTrack.getTrackIndex(), 'G', 2, 2),
    ]);
    storeState.globalTracks = globalTracks;

    const { rerender } = render(<MainContent />);

    toggleGlobalTracksAndRerender(rerender);
    fireEvent.doubleClick(screen.getByText('Am'));
    fireEvent.keyDown(screen.getByRole('textbox'), { key: 'Tab' });

    expect(storeState.selectedRegionIds).toEqual(['chord-2']);

    storeState.globalTracks = createDefaultGlobalTracks();
  });

  it('tabs the open chord popup to insert at the next exact bar when no chord starts before it', () => {
    const globalTracks = createDefaultGlobalTracks();
    const chordTrack = globalTracks.find(track => track.getType() === GlobalTrackType.Chord);
    chordTrack?.setRegions([
      new KGChordRegion('chord-1', chordTrack.getId(), chordTrack.getTrackIndex(), 'Am', 0, 8),
    ]);
    storeState.globalTracks = globalTracks;

    const { rerender } = render(<MainContent />);

    toggleGlobalTracksAndRerender(rerender);
    fireEvent.doubleClick(screen.getByText('Am'));
    fireEvent.keyDown(screen.getByRole('textbox'), { key: 'Tab' });

    expect(executeCommandMock).toHaveBeenCalledTimes(1);
    expect((executeCommandMock.mock.calls[0][0] as { insertBeat?: number }).insertBeat).toBe(4);

    storeState.globalTracks = createDefaultGlobalTracks();
  });

  it('shift-tabs the open chord popup to the previous existing chord without creating a new one', () => {
    const globalTracks = createDefaultGlobalTracks();
    const chordTrack = globalTracks.find(track => track.getType() === GlobalTrackType.Chord);
    chordTrack?.setRegions([
      new KGChordRegion('chord-1', chordTrack.getId(), chordTrack.getTrackIndex(), 'Am', 0, 4),
      new KGChordRegion('chord-2', chordTrack.getId(), chordTrack.getTrackIndex(), 'G', 8, 4),
    ]);
    storeState.globalTracks = globalTracks;

    const { rerender } = render(<MainContent />);

    toggleGlobalTracksAndRerender(rerender);
    fireEvent.doubleClick(screen.getByText('G'));
    fireEvent.keyDown(screen.getByRole('textbox'), { key: 'Tab', shiftKey: true });

    expect(storeState.selectedRegionIds).toEqual(['chord-1']);
    expect(executeCommandMock).toHaveBeenCalledTimes(0);

    storeState.globalTracks = createDefaultGlobalTracks();
  });

  it('routes the signature global track add button through a command', () => {
    const { rerender } = render(<MainContent />);

    toggleGlobalTracksAndRerender(rerender);
    fireEvent.click(screen.getByRole('button', { name: 'Add Key Signature global track item' }));

    expect(executeCommandMock).toHaveBeenCalledTimes(1);
  });

  it('creates new marker regions with a one-bar default length', () => {
    const { rerender } = render(<MainContent />);

    toggleGlobalTracksAndRerender(rerender);
    fireEvent.click(screen.getByRole('button', { name: 'Add Marker global track item' }));

    expect(executeCommandMock).toHaveBeenCalledTimes(1);
    expect((executeCommandMock.mock.calls[0][0] as { preferredLength?: number }).preferredLength).toBe(
      storeState.timeSignature.numerator
    );
  });

  it('keeps a double-clicked global region editor visible past the sticky left panel', async () => {
    const globalTracks = createDefaultGlobalTracks();
    const chordTrack = globalTracks.find(track => track.getType() === GlobalTrackType.Chord);
    chordTrack?.setRegions([
      new KGChordRegion('chord-1', chordTrack.getId(), chordTrack.getTrackIndex(), 'Am', 40, 16),
    ]);
    storeState.globalTracks = globalTracks;

    const requestAnimationFrameSpy = vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback: FrameRequestCallback) => {
      callback(0);
      return 1;
    });

    const { container, rerender } = render(<MainContent />);
    const mainContent = container.querySelector('.main-content-wrapper') as HTMLDivElement;
    Object.defineProperty(mainContent, 'scrollWidth', { configurable: true, value: 4000 });
    Object.defineProperty(mainContent, 'clientWidth', { configurable: true, value: 900 });
    mainContent.scrollLeft = 500;

    toggleGlobalTracksAndRerender(rerender);
    fireEvent.doubleClick(screen.getByText('Am'));

    await waitFor(() => {
      expect(mainContent.scrollLeft).toBe(188);
    });

    requestAnimationFrameSpy.mockRestore();
    storeState.globalTracks = createDefaultGlobalTracks();
  });
});
