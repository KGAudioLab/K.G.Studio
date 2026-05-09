import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import ListEventPanel from './ListEventPanel';
import { KGMidiControllerEvent } from '../core/midi/KGMidiControllerEvent';
import { KGMidiNote } from '../core/midi/KGMidiNote';
import { KGMidiPitchBend } from '../core/midi/KGMidiPitchBend';
import { KGRegion } from '../core/region/KGRegion';
import {
  createMockMidiControllerEvent,
  createMockMidiNote,
  createMockMidiPitchBend,
  createMockMidiRegion,
  createMockMidiTrack,
} from '../test/utils/mock-data';

const region = createMockMidiRegion({
  id: 'region-1',
  trackId: '1',
  trackIndex: 0,
  startFromBeat: 4,
  notes: [createMockMidiNote({ id: 'note-1', pitch: 60, startBeat: 1, endBeat: 2, velocity: 96 })],
  pitchBends: [createMockMidiPitchBend({ id: 'bend-1', beat: 0.5, value: 12288 })],
  controllerEventsByType: Array.from({ length: 128 }, (_, index) => (
    index === 11 ? [createMockMidiControllerEvent({ id: 'cc11-1', beat: 0.75, value: 100 })] : []
  )),
});
const track = createMockMidiTrack({ id: 1, regions: [region] });

type MockStoreState = {
  tracks: typeof track[];
  activeRegionId: string | null;
  selectedRegionIds: string[];
  timeSignature: { numerator: number; denominator: number };
  selectedNoteIds: string[];
  selectedPitchBendIds: string[];
  selectedControllerEventIds: string[];
  playheadPosition: number;
  updateTrack: ReturnType<typeof vi.fn>;
  refreshProjectState: ReturnType<typeof vi.fn>;
  bumpAutomationRedrawVersion: ReturnType<typeof vi.fn>;
};

const storeState: MockStoreState = {
  tracks: [track],
  activeRegionId: 'region-1',
  selectedRegionIds: ['region-1'],
  timeSignature: { numerator: 4, denominator: 4 },
  selectedNoteIds: [],
  selectedPitchBendIds: [],
  selectedControllerEventIds: [],
  playheadPosition: 4,
  updateTrack: vi.fn().mockResolvedValue(undefined),
  refreshProjectState: vi.fn(),
  bumpAutomationRedrawVersion: vi.fn(),
};

let selectedItems: Array<KGRegion | KGMidiNote | KGMidiPitchBend | KGMidiControllerEvent> = [];

const syncStoreSelectionFromCore = () => {
  storeState.selectedRegionIds = selectedItems
    .filter(item => item instanceof KGRegion)
    .map(item => item.getId());
  storeState.selectedNoteIds = selectedItems
    .filter(item => item instanceof KGMidiNote)
    .map(item => item.getId());
  storeState.selectedPitchBendIds = selectedItems
    .filter(item => item instanceof KGMidiPitchBend)
    .map(item => item.getId());
  storeState.selectedControllerEventIds = selectedItems
    .filter(item => item instanceof KGMidiControllerEvent)
    .map(item => item.getId());
};

vi.mock('../stores/projectStore', () => ({
  useProjectStore: () => storeState,
}));

vi.mock('../core/KGCore', () => ({
  KGCore: {
    instance: vi.fn(() => ({
      getSelectedItems: () => selectedItems,
      addSelectedItems: (items: typeof selectedItems) => {
        const nextIds = new Set(items.map(item => item.getId()));
        selectedItems = [...selectedItems.filter(item => !nextIds.has(item.getId())), ...items];
        syncStoreSelectionFromCore();
      },
      removeSelectedItems: (items: typeof selectedItems) => {
        const removedIds = new Set(items.map(item => item.getId()));
        selectedItems = selectedItems.filter(item => !removedIds.has(item.getId()));
        syncStoreSelectionFromCore();
      },
    })),
  },
}));

describe('ListEventPanel', () => {
  beforeEach(() => {
    selectedItems = [region];
    region.select();
    region.getNotes().forEach(note => note.deselect());
    region.getPitchBends().forEach(pitchBend => pitchBend.deselect());
    region.getControllerEventsByType().forEach(events => events.forEach(controllerEvent => controllerEvent.deselect()));
    storeState.activeRegionId = 'region-1';
    storeState.selectedRegionIds = ['region-1'];
    storeState.selectedNoteIds = [];
    storeState.selectedPitchBendIds = [];
    storeState.selectedControllerEventIds = [];
    storeState.updateTrack.mockClear();
    storeState.refreshProjectState.mockClear();
    storeState.bumpAutomationRedrawVersion.mockClear();
  });

  it('renders note and pitch bend rows and toggles them independently', () => {
    render(<ListEventPanel isVisible={true} />);

    expect(screen.getByRole('button', { name: 'Note' })).toBeInTheDocument();
    expect(screen.getByTitle('Delete visible selected rows')).toBeDisabled();
    expect(screen.getByText('Pitch Bend')).toBeInTheDocument();
    expect(screen.getAllByText('Note').length).toBeGreaterThan(0);
    expect(screen.getByText('Raw 12288 | 0.500 | 1.00 st')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Pitch Bends' }));
    expect(screen.queryByText('Pitch Bend')).not.toBeInTheDocument();
    expect(screen.getByText('C4')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Notes' }));
    expect(screen.queryByText('C4')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Pitch Bends' }));
    expect(screen.getByText('Pitch Bend')).toBeInTheDocument();
  });

  it('keeps the region selected while selecting rows', () => {
    const { rerender } = render(<ListEventPanel isVisible={true} />);

    fireEvent.click(screen.getByText('C4').closest('tr')!);
    rerender(<ListEventPanel isVisible={true} />);

    expect(storeState.selectedRegionIds).toEqual(['region-1']);
    expect(storeState.selectedNoteIds).toEqual(['note-1']);
    expect(screen.queryByText('Please select a MIDI region, or open one in the Piano Roll, to view its event list.')).not.toBeInTheDocument();
    expect(screen.getByText('C4').closest('tr')).toHaveClass('selected');
  });

  it('supports additive row selection without dropping the owning region', () => {
    const { rerender } = render(<ListEventPanel isVisible={true} />);

    fireEvent.click(screen.getByText('C4').closest('tr')!);
    rerender(<ListEventPanel isVisible={true} />);
    fireEvent.click(screen.getByText('Pitch Bend').closest('tr')!, { shiftKey: true });
    rerender(<ListEventPanel isVisible={true} />);

    expect(storeState.selectedRegionIds).toEqual(['region-1']);
    expect(storeState.selectedNoteIds).toEqual(['note-1']);
    expect(storeState.selectedPitchBendIds).toEqual(['bend-1']);
    expect(screen.getByText('C4').closest('tr')).toHaveClass('selected');
    expect(screen.getByText('Raw 12288 | 0.500 | 1.00 st').closest('tr')).toHaveClass('selected');
  });
});
