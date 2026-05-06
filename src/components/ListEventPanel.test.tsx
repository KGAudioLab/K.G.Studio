import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import ListEventPanel from './ListEventPanel';
import { createMockMidiNote, createMockMidiPitchBend, createMockMidiRegion, createMockMidiTrack } from '../test/utils/mock-data';

const region = createMockMidiRegion({
  id: 'region-1',
  trackId: '1',
  trackIndex: 0,
  startFromBeat: 4,
  notes: [createMockMidiNote({ id: 'note-1', pitch: 60, startBeat: 1, endBeat: 2, velocity: 96 })],
  pitchBends: [createMockMidiPitchBend({ id: 'bend-1', beat: 0.5, value: 12288 })],
});
const track = createMockMidiTrack({ id: 1, regions: [region] });

vi.mock('../stores/projectStore', () => ({
  useProjectStore: () => ({
    tracks: [track],
    activeRegionId: 'region-1',
    selectedRegionIds: ['region-1'],
    timeSignature: { numerator: 4, denominator: 4 },
    selectedNoteIds: [],
    selectedPitchBendIds: [],
    playheadPosition: 4,
    updateTrack: vi.fn().mockResolvedValue(undefined),
    refreshProjectState: vi.fn(),
  }),
}));

describe('ListEventPanel', () => {
  it('renders note and pitch bend rows and toggles them independently', () => {
    render(<ListEventPanel isVisible={true} />);

    expect(screen.getByText('Pitch Bend')).toBeInTheDocument();
    expect(screen.getByText('Note')).toBeInTheDocument();
    expect(screen.getByText('Raw 12288 | 0.500 | 1.00 st')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Pitch Bends' }));
    expect(screen.queryByText('Pitch Bend')).not.toBeInTheDocument();
    expect(screen.getByText('Note')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Notes' }));
    expect(screen.queryByText('Note')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Pitch Bends' }));
    expect(screen.getByText('Pitch Bend')).toBeInTheDocument();
  });
});
