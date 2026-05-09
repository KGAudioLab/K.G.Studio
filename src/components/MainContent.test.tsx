import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import MainContent from './MainContent';
import { KGMidiRegion } from '../core/region/KGMidiRegion';
import { createMockMidiTrack } from '../test/utils/mock-data';

const midiRegion = new KGMidiRegion('region-1', '1', 0, 'Region 1', 0, 4);
const track = createMockMidiTrack({ id: 1, regions: [midiRegion] });

const storeState = {
  tracks: [track],
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

vi.mock('../stores/projectStore', () => ({
  useProjectStore: (selector?: StoreSelector) => (
    selector ? selector(storeState) : storeState
  ),
}));

vi.mock('../core/KGCore', () => ({
  KGCore: {
    instance: () => ({
      addSelectedItems: (items: KGMidiRegion[]) => {
        storeState.selectedRegionIds = items.map(item => item.getId());
      },
      clearSelectedItems: () => {
        storeState.selectedRegionIds = [];
      },
      executeCommand: vi.fn(),
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
    <button type="button" onClick={() => onRegionClick?.('region-1', { shiftKey: false })}>
      select-region
    </button>
  ),
}));

vi.mock('./piano-roll/PianoRoll', () => ({
  default: () => <div data-testid="piano-roll" />,
}));

describe('MainContent', () => {
  beforeEach(() => {
    storeState.selectedRegionIds = [];
    storeState.activeRegionId = null;
    storeState.showPianoRoll = false;
    storeState.clearAllSelections.mockClear();
    storeState.setSelectedTrack.mockClear();
    storeState.setShowPianoRoll.mockClear();
    storeState.setActiveRegionId.mockClear();
    storeState.openMidiPianoRoll.mockClear();
    storeState.openSpectrogramViewer.mockClear();
  });

  it('updates activeRegionId when selecting a region with piano roll closed', () => {
    render(<MainContent />);

    fireEvent.click(screen.getByRole('button', { name: 'select-region' }));

    expect(storeState.activeRegionId).toBe('region-1');
    expect(storeState.setActiveRegionId).toHaveBeenCalledWith('region-1');
    expect(storeState.showPianoRoll).toBe(false);
    expect(storeState.openMidiPianoRoll).not.toHaveBeenCalled();
  });
});
