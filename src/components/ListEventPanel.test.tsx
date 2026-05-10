import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import ListEventPanel from './ListEventPanel';
import { KGMidiControllerEvent } from '../core/midi/KGMidiControllerEvent';
import { KGMidiNote } from '../core/midi/KGMidiNote';
import { KGMidiPitchBend } from '../core/midi/KGMidiPitchBend';
import { KGRegion } from '../core/region/KGRegion';
import { KGAudioRegion } from '../core/region/KGAudioRegion';
import { KGAudioTrack } from '../core/track/KGAudioTrack';
import { KGTrackAutomationPoint } from '../core/track/KGTrackAutomationPoint';
import {
  createMockMidiControllerEvent,
  createMockMidiNote,
  createMockMidiPitchBend,
  createMockMidiRegion,
  createMockMidiTrack,
} from '../test/utils/mock-data';

const clickDropdownOption = (label: string) => {
  const option = Array.from(document.querySelectorAll('.quant-option'))
    .find(element => element.textContent?.trim() === label);
  expect(option).toBeTruthy();
  fireEvent.click(option!);
};

const midiRegion = createMockMidiRegion({
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
const secondMidiRegion = createMockMidiRegion({
  id: 'region-2',
  trackId: '1',
  trackIndex: 0,
  name: 'Second Region',
  startFromBeat: 12,
  length: 8,
});
const midiTrack = createMockMidiTrack({ id: 1, volume: -6, regions: [midiRegion, secondMidiRegion] });
midiTrack.setTrackIndex(0);
midiTrack.setVolumeAutomation([
  new KGTrackAutomationPoint('vol-1', 2, -6),
]);
midiTrack.setPanAutomation([
  new KGTrackAutomationPoint('pan-1', 1, -0.5),
  new KGTrackAutomationPoint('pan-2', 6, 0.25),
]);

const audioRegion = new KGAudioRegion('audio-region-1', '2', 1, 'Audio Clip', 8, 4);
const audioTrack = new KGAudioTrack('Audio Track', 2, -3);
audioTrack.setTrackIndex(1);
audioTrack.setRegions([audioRegion]);

type MockStoreState = {
  tracks: Array<typeof midiTrack | typeof audioTrack>;
  activeRegionId: string | null;
  selectedRegionIds: string[];
  selectedTrackId: string | null;
  timeSignature: { numerator: number; denominator: number };
  selectedNoteIds: string[];
  selectedPitchBendIds: string[];
  selectedControllerEventIds: string[];
  selectedTrackAutomationPointIds: string[];
  playheadPosition: number;
  updateTrack: ReturnType<typeof vi.fn>;
  refreshProjectState: ReturnType<typeof vi.fn>;
  bumpAutomationRedrawVersion: ReturnType<typeof vi.fn>;
  bumpTrackAutomationRedrawVersion: ReturnType<typeof vi.fn>;
};

const storeState: MockStoreState = {
  tracks: [midiTrack, audioTrack],
  activeRegionId: 'region-1',
  selectedRegionIds: ['region-1'],
  selectedTrackId: '1',
  timeSignature: { numerator: 4, denominator: 4 },
  selectedNoteIds: [],
  selectedPitchBendIds: [],
  selectedControllerEventIds: [],
  selectedTrackAutomationPointIds: [],
  playheadPosition: 4,
  updateTrack: vi.fn().mockResolvedValue(undefined),
  refreshProjectState: vi.fn(),
  bumpAutomationRedrawVersion: vi.fn(),
  bumpTrackAutomationRedrawVersion: vi.fn(),
};

let selectedItems: Array<KGRegion | KGMidiNote | KGMidiPitchBend | KGMidiControllerEvent | KGTrackAutomationPoint> = [];

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
  storeState.selectedTrackAutomationPointIds = selectedItems
    .filter(item => item instanceof KGTrackAutomationPoint)
    .map(item => item.getId());
};

vi.mock('../stores/projectStore', () => ({
  useProjectStore: () => storeState,
}));

vi.mock('../util/dialogUtil', () => ({
  showAlert: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../core/KGCore', () => ({
  KGCore: {
    instance: vi.fn(() => ({
      getSelectedItems: () => selectedItems,
      addSelectedItem: (item: typeof selectedItems[number]) => {
        selectedItems = selectedItems.filter(candidate => candidate.getId() !== item.getId());
        selectedItems.push(item);
        syncStoreSelectionFromCore();
      },
      addSelectedItems: (items: typeof selectedItems) => {
        const nextIds = new Set(items.map(item => item.getId()));
        selectedItems = [...selectedItems.filter(item => !nextIds.has(item.getId())), ...items];
        syncStoreSelectionFromCore();
      },
      removeSelectedItem: (item: typeof selectedItems[number]) => {
        selectedItems = selectedItems.filter(candidate => candidate.getId() !== item.getId());
        syncStoreSelectionFromCore();
      },
      removeSelectedItems: (items: typeof selectedItems) => {
        const removedIds = new Set(items.map(item => item.getId()));
        selectedItems = selectedItems.filter(item => !removedIds.has(item.getId()));
        syncStoreSelectionFromCore();
      },
      clearSelectedItems: () => {
        selectedItems = [];
        syncStoreSelectionFromCore();
      },
      executeCommand: (command: { execute: () => void }) => {
        command.execute();
        syncStoreSelectionFromCore();
      },
      getCurrentProject: () => ({
        getTracks: () => storeState.tracks,
      }),
    })),
  },
}));

describe('ListEventPanel', () => {
  beforeEach(() => {
    selectedItems = [midiRegion];
    midiRegion.select();
    secondMidiRegion.deselect();
    audioRegion.deselect();

    midiRegion.setStartFromBeat(4);
    midiRegion.setLength(4);
    secondMidiRegion.setStartFromBeat(12);
    secondMidiRegion.setLength(8);
    midiTrack.setRegions([midiRegion, secondMidiRegion]);

    midiTrack.setVolumeAutomation([new KGTrackAutomationPoint('vol-1', 2, -6)]);
    midiTrack.setPanAutomation([
      new KGTrackAutomationPoint('pan-1', 1, -0.5),
      new KGTrackAutomationPoint('pan-2', 6, 0.25),
    ]);

    midiRegion.getNotes().forEach(note => note.deselect());
    midiRegion.getPitchBends().forEach(pitchBend => pitchBend.deselect());
    midiRegion.getControllerEventsByType().forEach(events => events.forEach(controllerEvent => controllerEvent.deselect()));
    midiTrack.getVolumeAutomation().forEach(point => point.deselect());
    midiTrack.getPanAutomation().forEach(point => point.deselect());

    storeState.activeRegionId = 'region-1';
    storeState.selectedRegionIds = ['region-1'];
    storeState.selectedTrackId = '1';
    storeState.selectedNoteIds = [];
    storeState.selectedPitchBendIds = [];
    storeState.selectedControllerEventIds = [];
    storeState.selectedTrackAutomationPointIds = [];
    storeState.playheadPosition = 4;
    storeState.updateTrack.mockClear();
    storeState.refreshProjectState.mockClear();
    storeState.bumpAutomationRedrawVersion.mockClear();
    storeState.bumpTrackAutomationRedrawVersion.mockClear();
  });

  it('defaults to Region tab and preserves existing event rows', () => {
    render(<ListEventPanel isVisible={true} />);

    expect(screen.getByRole('button', { name: 'Region' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Track' })).toBeInTheDocument();
    expect(screen.getByText('Pitch Bend')).toBeInTheDocument();
    expect(screen.getByText('Raw 12288 | 0.500 | 1.00 st')).toBeInTheDocument();
  });

  it('switches to Track tab and lists selected track regions', () => {
    render(<ListEventPanel isVisible={true} />);

    fireEvent.click(screen.getByRole('button', { name: 'Track' }));

    expect(screen.getByRole('button', { name: 'Regions' })).toBeInTheDocument();
    expect(screen.getByText('Second Region')).toBeInTheDocument();
    expect(screen.getAllByText('MIDI')).toHaveLength(2);
    expect(screen.getByText('-6.0dB')).toBeInTheDocument();
    expect(screen.getByText('-32')).toBeInTheDocument();
  });

  it('toggles track filters independently', () => {
    render(<ListEventPanel isVisible={true} />);

    fireEvent.click(screen.getByRole('button', { name: 'Track' }));
    fireEvent.click(screen.getByRole('button', { name: 'Regions' }));

    expect(screen.queryByText('Second Region')).not.toBeInTheDocument();
    expect(screen.getByText('-6.0dB')).toBeInTheDocument();
    expect(screen.getByText('-32')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Volume' }));

    expect(screen.queryByText('-6.0dB')).not.toBeInTheDocument();
    expect(screen.getByText('-32')).toBeInTheDocument();
  });

  it('shows track empty state when no track is selected', () => {
    storeState.selectedTrackId = null;

    render(<ListEventPanel isVisible={true} />);
    fireEvent.click(screen.getByRole('button', { name: 'Track' }));

    expect(screen.getByText('Please select a track to view regions and track automation.')).toBeInTheDocument();
  });

  it('syncs Track Regions row selection to selectedRegionIds', () => {
    const { rerender } = render(<ListEventPanel isVisible={true} />);

    fireEvent.click(screen.getByRole('button', { name: 'Track' }));
    fireEvent.click(screen.getByText('Second Region').closest('tr')!);
    rerender(<ListEventPanel isVisible={true} />);

    expect(storeState.selectedRegionIds).toEqual(['region-2']);
    expect(screen.getByText('Second Region').closest('tr')).toHaveClass('selected');
  });

  it('syncs Track Volume row selection to selectedTrackAutomationPointIds', () => {
    const { rerender } = render(<ListEventPanel isVisible={true} />);

    fireEvent.click(screen.getByRole('button', { name: 'Track' }));
    fireEvent.click(screen.getByText('-6.0dB').closest('tr')!);
    rerender(<ListEventPanel isVisible={true} />);

    expect(storeState.selectedTrackAutomationPointIds).toEqual(['vol-1']);
    expect(screen.getByText('-6.0dB').closest('tr')).toHaveClass('selected');
  });

  it('syncs Track Pan row selection to selectedTrackAutomationPointIds', () => {
    const { rerender } = render(<ListEventPanel isVisible={true} />);

    fireEvent.click(screen.getByRole('button', { name: 'Track' }));
    fireEvent.click(screen.getByText('-32').closest('tr')!);
    rerender(<ListEventPanel isVisible={true} />);

    expect(storeState.selectedTrackAutomationPointIds).toEqual(['pan-1']);
  });

  it('hides MIDI Region add option for audio tracks', () => {
    storeState.selectedTrackId = '2';

    render(<ListEventPanel isVisible={true} />);
    fireEvent.click(screen.getByRole('button', { name: 'Track' }));
    fireEvent.click(screen.getAllByRole('button', { name: 'Volume' })[1]);

    expect(screen.queryByText('MIDI Region')).not.toBeInTheDocument();
    expect(
      Array.from(document.querySelectorAll('.quant-option')).some(element => element.textContent?.trim() === 'Pan')
    ).toBe(true);
  });

  it('creates a 1-bar MIDI region at the playhead from the Track tab', async () => {
    render(<ListEventPanel isVisible={true} />);
    fireEvent.click(screen.getByRole('button', { name: 'Track' }));
    fireEvent.click(screen.getByTitle('Add MIDI region at playhead'));

    await waitFor(() => expect(midiTrack.getRegions()).toHaveLength(3));

    const createdRegion = midiTrack.getRegions()[2];
    expect(createdRegion.getStartFromBeat()).toBe(4);
    expect(createdRegion.getLength()).toBe(4);
  });

  it('creates a volume automation point using the track base volume', async () => {
    render(<ListEventPanel isVisible={true} />);
    fireEvent.click(screen.getByRole('button', { name: 'Track' }));
    fireEvent.click(screen.getByTitle('Add MIDI region at playhead'));
    fireEvent.click(screen.getByRole('button', { name: 'MIDI Region' }));
    clickDropdownOption('Volume');
    fireEvent.click(screen.getByTitle('Add volume automation point at playhead'));

    await waitFor(() => expect(midiTrack.getVolumeAutomation()).toHaveLength(2));

    const createdPoint = midiTrack.getVolumeAutomation().find(point => point.getBeat() === 4);
    expect(createdPoint?.getValue()).toBe(-6);
  });

  it('creates a pan automation point using the nearest earlier pan value or zero', async () => {
    render(<ListEventPanel isVisible={true} />);
    fireEvent.click(screen.getByRole('button', { name: 'Track' }));
    fireEvent.click(screen.getByTitle('Add MIDI region at playhead'));
    fireEvent.click(screen.getByRole('button', { name: 'MIDI Region' }));
    clickDropdownOption('Pan');
    fireEvent.click(screen.getByTitle('Add pan automation point at playhead'));

    await waitFor(() => expect(midiTrack.getPanAutomation()).toHaveLength(3));

    const createdPoint = midiTrack.getPanAutomation().find(point => point.getBeat() === 4);
    expect(createdPoint?.getValue()).toBe(-0.5);
  });

  it('deletes selected track automation points from the Track tab', async () => {
    const { rerender } = render(<ListEventPanel isVisible={true} />);

    fireEvent.click(screen.getByRole('button', { name: 'Track' }));
    fireEvent.click(screen.getByText('-6.0dB').closest('tr')!);
    rerender(<ListEventPanel isVisible={true} />);
    fireEvent.click(screen.getByTitle('Delete visible selected rows'));

    await waitFor(() => expect(midiTrack.getVolumeAutomation()).toHaveLength(0));
  });

  it('edits track region position and length inline', async () => {
    render(<ListEventPanel isVisible={true} />);

    fireEvent.click(screen.getByRole('button', { name: 'Track' }));
    fireEvent.doubleClick(screen.getByText('4 1 0'));
    const positionInput = screen.getByDisplayValue('4 1 0');
    fireEvent.change(positionInput, { target: { value: '3 1 0' } });
    fireEvent.keyDown(positionInput, { key: 'Enter' });

    await waitFor(() => expect(secondMidiRegion.getStartFromBeat()).toBe(8));

    fireEvent.doubleClick(screen.getByText('8 0'));
    const lengthInput = screen.getByDisplayValue('8 0');
    fireEvent.change(lengthInput, { target: { value: '4 0' } });
    fireEvent.keyDown(lengthInput, { key: 'Enter' });

    await waitFor(() => expect(secondMidiRegion.getLength()).toBe(4));
  });

  it('edits track automation position and value inline', async () => {
    render(<ListEventPanel isVisible={true} />);

    fireEvent.click(screen.getByRole('button', { name: 'Track' }));
    fireEvent.doubleClick(screen.getByText('1 3 0'));
    const positionInput = screen.getByDisplayValue('1 3 0');
    fireEvent.change(positionInput, { target: { value: '2 1 0' } });
    fireEvent.keyDown(positionInput, { key: 'Enter' });

    await waitFor(() => expect(midiTrack.getVolumeAutomation()[0].getBeat()).toBe(4));

    fireEvent.doubleClick(screen.getByText('-6.0dB'));
    const valueInput = screen.getByDisplayValue('-6.0dB');
    fireEvent.change(valueInput, { target: { value: '-3' } });
    fireEvent.keyDown(valueInput, { key: 'Enter' });

    await waitFor(() => expect(midiTrack.getVolumeAutomation()[0].getValue()).toBe(-3));
  });
});
