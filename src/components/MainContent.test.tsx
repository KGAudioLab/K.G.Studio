import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import MainContent from './MainContent';
import { KGMidiRegion } from '../core/region/KGMidiRegion';
import { KGAudioRegion } from '../core/region/KGAudioRegion';
import { KGAudioTrack } from '../core/track/KGAudioTrack';
import { createDefaultGlobalTracks } from '../core/global-track';
import { createMockMidiTrack } from '../test/utils/mock-data';

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
  activeRegionId: null as string | null,
  setShowPianoRoll: vi.fn((show: boolean) => {
    storeState.showPianoRoll = show;
  }),
  setActiveRegionId: vi.fn((regionId: string | null) => {
    storeState.activeRegionId = regionId;
  }),
  pianoRollMode: 'midi-edit' as const,
  requestedSheetMusicViewEnabled: false,
  pianoRollViewRequestVersion: 0,
  openMidiPianoRoll: vi.fn(),
  openSpectrogramViewer: vi.fn(),
  openHybridMode: vi.fn(),
  hybridAudioRegionId: null as string | null,
  addTrack: vi.fn(),
  addAudioTrack: vi.fn(),
  projectName: 'Test Project',
  savedProjectName: 'Test Project',
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
type RegionClickHandler = (...args: [string, { shiftKey: boolean }]) => void;

const finishTrackCreateDialogClose = () => {
  const overlay = document.querySelector('.dialog-overlay');
  if (overlay) {
    fireEvent.animationEnd(overlay);
  }
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
      executeCommand: vi.fn(),
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
      <button type="button" onClick={() => onRegionClick?.('region-1', { shiftKey: false })}>
        select-midi-region
      </button>
      <button type="button" onClick={() => onRegionClick?.('region-2', { shiftKey: false })}>
        select-second-midi-region
      </button>
      <button type="button" onClick={() => onRegionClick?.('audio-1', { shiftKey: false })}>
        select-audio-region
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
    storeState.selectedRegionIds = [];
    storeState.activeRegionId = null;
    storeState.showPianoRoll = false;
    storeState.timeSignature = { numerator: 4, denominator: 4 };
    storeState.clearAllSelections.mockClear();
    storeState.setSelectedTrack.mockClear();
    storeState.setShowPianoRoll.mockClear();
    storeState.setActiveRegionId.mockClear();
    storeState.openMidiPianoRoll.mockClear();
    storeState.openSpectrogramViewer.mockClear();
    storeState.addTrack.mockClear();
    storeState.addAudioTrack.mockClear();
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
    expect(storeState.openSpectrogramViewer).toHaveBeenCalledWith('audio-1');
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

  it('toggles the mock global tracks button active state locally', () => {
    render(<MainContent />);

    const globalTracksButton = screen.getByRole('button', { name: 'Show global tracks' });

    expect(globalTracksButton.className).not.toContain('active');

    fireEvent.click(globalTracksButton);
    expect(globalTracksButton.className).toContain('active');

    fireEvent.click(globalTracksButton);
    expect(globalTracksButton.className).not.toContain('active');
  });

  it('renders the four mock global tracks only when toggled on', () => {
    render(<MainContent />);

    expect(screen.queryByText('Marker')).not.toBeInTheDocument();
    expect(screen.queryByText('Tempo')).not.toBeInTheDocument();
    expect(screen.queryByText('Signature')).not.toBeInTheDocument();
    expect(screen.queryByText('Chord')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Show global tracks' }));

    expect(screen.getByText('Marker')).toBeInTheDocument();
    expect(screen.getByText('Tempo')).toBeInTheDocument();
    expect(screen.getByText('Signature')).toBeInTheDocument();
    expect(screen.getByText('Chord')).toBeInTheDocument();

    const globalTracksInfoShell = screen.getByRole('button', { name: 'Add Marker global track item' }).closest('.global-tracks-info-shell') as HTMLElement;

    fireEvent.click(screen.getByRole('button', { name: 'Show global tracks' }));
    fireEvent.transitionEnd(globalTracksInfoShell);

    expect(screen.queryByText('Marker')).not.toBeInTheDocument();
    expect(screen.queryByText('Tempo')).not.toBeInTheDocument();
    expect(screen.queryByText('Signature')).not.toBeInTheDocument();
    expect(screen.queryByText('Chord')).not.toBeInTheDocument();
  });

  it('keeps the non-marker global track add buttons as visual-only controls', () => {
    render(<MainContent />);

    fireEvent.click(screen.getByRole('button', { name: 'Show global tracks' }));

    const addButtons = [
      screen.getByRole('button', { name: 'Add Tempo global track item' }),
      screen.getByRole('button', { name: 'Add Signature global track item' }),
      screen.getByRole('button', { name: 'Add Chord global track item' }),
    ];

    expect(addButtons).toHaveLength(3);

    addButtons.forEach(button => {
      fireEvent.click(button);
    });

    expect(storeState.addTrack).not.toHaveBeenCalled();
    expect(storeState.addAudioTrack).not.toHaveBeenCalled();
  });
});
