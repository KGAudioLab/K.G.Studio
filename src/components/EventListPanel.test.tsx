import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import EventListPanel from './EventListPanel';
import { KGMidiControllerEvent } from '../core/midi/KGMidiControllerEvent';
import { KGMidiNote } from '../core/midi/KGMidiNote';
import { KGMidiPitchBend } from '../core/midi/KGMidiPitchBend';
import { KGProject } from '../core/KGProject';
import { KGChordRegion } from '../core/region/KGChordRegion';
import { KGKeySignatureRegion } from '../core/region/KGKeySignatureRegion';
import { KGMarkerRegion } from '../core/region/KGMarkerRegion';
import { KGRegion } from '../core/region/KGRegion';
import { KGTempoRegion } from '../core/region/KGTempoRegion';
import { KGChordTrack } from '../core/global-track/KGChordTrack';
import { KGMarkerTrack } from '../core/global-track/KGMarkerTrack';
import { KGSignatureTrack } from '../core/global-track/KGSignatureTrack';
import { KGTempoTrack } from '../core/global-track/KGTempoTrack';
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
import { showAlert } from '../util/dialogUtil';
import { I18nContext } from '../i18n/I18nProvider';
import { translate } from '../i18n/translate';

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

const markerTrack = new KGMarkerTrack();
const tempoTrack = new KGTempoTrack();
const signatureTrack = new KGSignatureTrack();
const chordTrack = new KGChordTrack();

const markerRegion = new KGMarkerRegion('marker-1', markerTrack.getId(), markerTrack.getTrackIndex(), 'Intro', 0, 4);
const tempoRegionA = new KGTempoRegion('tempo-1', tempoTrack.getId(), tempoTrack.getTrackIndex(), 120, 0, 4, 4);
const tempoRegionB = new KGTempoRegion('tempo-2', tempoTrack.getId(), tempoTrack.getTrackIndex(), 140, 4, 28, 4);
const keySignatureRegionA = new KGKeySignatureRegion('signature-1', signatureTrack.getId(), signatureTrack.getTrackIndex(), 'C major', 0, 4, 4);
const keySignatureRegionB = new KGKeySignatureRegion('signature-2', signatureTrack.getId(), signatureTrack.getTrackIndex(), 'G major', 4, 28, 4);
const chordRegion = new KGChordRegion('chord-1', chordTrack.getId(), chordTrack.getTrackIndex(), 'Bm7b5', 4, 4);

let project = new KGProject();

type MockStoreState = {
  tracks: Array<typeof midiTrack | typeof audioTrack>;
  globalTracks: Array<typeof markerTrack | typeof tempoTrack | typeof signatureTrack | typeof chordTrack>;
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
  globalTracks: [markerTrack, tempoTrack, signatureTrack, chordTrack],
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

let selectedItems: Array<
  KGRegion | KGMidiNote | KGMidiPitchBend | KGMidiControllerEvent | KGTrackAutomationPoint
> = [];

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
      getCurrentProject: () => project,
    })),
  },
}));

describe('EventListPanel', () => {
  const renderWithLocale = (locale: 'en_us' | 'zh_cn' = 'en_us') => render(
    <I18nContext.Provider
      value={{
        languageSetting: locale,
        resolvedLocale: locale,
        setLanguageSetting: async () => undefined,
        t: (key, params) => translate(key, params, locale),
      }}
    >
      <EventListPanel isVisible={true} />
    </I18nContext.Provider>
  );

  beforeEach(() => {
    project = new KGProject(
      'Test Project',
      32,
      0,
      120,
      { numerator: 4, denominator: 4 },
      'C major',
      'ionian',
      false,
      [0, 0],
      1,
      [midiTrack, audioTrack],
    );

    selectedItems = [midiRegion];
    midiRegion.select();
    secondMidiRegion.deselect();
    audioRegion.deselect();
    markerRegion.deselect();
    tempoRegionA.deselect();
    tempoRegionB.deselect();
    keySignatureRegionA.deselect();
    keySignatureRegionB.deselect();
    chordRegion.deselect();

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

    markerRegion.setName('Intro');
    markerRegion.setStartFromBeat(0);
    markerRegion.setLength(4);
    markerTrack.setRegions([markerRegion]);

    tempoRegionA.setBpm(120);
    tempoRegionA.setBarRange(0, 4, 4);
    tempoRegionB.setBpm(140);
    tempoRegionB.setBarRange(4, 28, 4);
    tempoTrack.setRegions([tempoRegionA, tempoRegionB]);

    keySignatureRegionA.setKeySignature('C major');
    keySignatureRegionA.setBarRange(0, 4, 4);
    keySignatureRegionB.setKeySignature('G major');
    keySignatureRegionB.setBarRange(4, 28, 4);
    signatureTrack.setRegions([keySignatureRegionA, keySignatureRegionB]);

    chordRegion.setSymbol('Bm7b5');
    chordRegion.setStartFromBeat(4);
    chordRegion.setLength(4);
    chordTrack.setRegions([chordRegion]);

    project.setGlobalTracks([markerTrack, tempoTrack, signatureTrack, chordTrack]);

    storeState.activeRegionId = 'region-1';
    storeState.selectedRegionIds = ['region-1'];
    storeState.selectedTrackId = '1';
    storeState.globalTracks = [markerTrack, tempoTrack, signatureTrack, chordTrack];
    storeState.selectedNoteIds = [];
    storeState.selectedPitchBendIds = [];
    storeState.selectedControllerEventIds = [];
    storeState.selectedTrackAutomationPointIds = [];
    storeState.playheadPosition = 4;
    storeState.updateTrack.mockClear();
    storeState.refreshProjectState.mockClear();
    storeState.bumpAutomationRedrawVersion.mockClear();
    storeState.bumpTrackAutomationRedrawVersion.mockClear();
    vi.mocked(showAlert).mockClear();
  });

  it('defaults to Region tab and preserves existing event rows', () => {
    render(<EventListPanel isVisible={true} />);

    expect(screen.getByRole('button', { name: 'Region' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Track' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Global' })).toBeInTheDocument();
    expect(screen.getByText('Pitch Bend')).toBeInTheDocument();
    expect(screen.getByText('Raw 12288 | 0.500 | 1.00 st')).toBeInTheDocument();
  });

  it('switches to Track tab and lists selected track regions', () => {
    render(<EventListPanel isVisible={true} />);

    fireEvent.click(screen.getByRole('button', { name: 'Track' }));

    expect(screen.getByRole('button', { name: 'Regions' })).toBeInTheDocument();
    expect(screen.getByText('Second Region')).toBeInTheDocument();
    expect(screen.getAllByText('MIDI')).toHaveLength(2);
    expect(screen.getByText('-6.0dB')).toBeInTheDocument();
    expect(screen.getByText('-32')).toBeInTheDocument();
  });

  it('toggles track filters independently', () => {
    render(<EventListPanel isVisible={true} />);

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

    render(<EventListPanel isVisible={true} />);
    fireEvent.click(screen.getByRole('button', { name: 'Track' }));

    expect(screen.getByText('Please select a track to view regions and track automation.')).toBeInTheDocument();
  });

  it('syncs Track Regions row selection to selectedRegionIds', () => {
    const { rerender } = render(<EventListPanel isVisible={true} />);

    fireEvent.click(screen.getByRole('button', { name: 'Track' }));
    fireEvent.click(screen.getByText('Second Region').closest('tr')!);
    rerender(<EventListPanel isVisible={true} />);

    expect(storeState.selectedRegionIds).toEqual(['region-2']);
    expect(screen.getByText('Second Region').closest('tr')).toHaveClass('selected');
  });

  it('syncs Track Volume row selection to selectedTrackAutomationPointIds', () => {
    const { rerender } = render(<EventListPanel isVisible={true} />);

    fireEvent.click(screen.getByRole('button', { name: 'Track' }));
    fireEvent.click(screen.getByText('-6.0dB').closest('tr')!);
    rerender(<EventListPanel isVisible={true} />);

    expect(storeState.selectedTrackAutomationPointIds).toEqual(['vol-1']);
    expect(screen.getByText('-6.0dB').closest('tr')).toHaveClass('selected');
  });

  it('syncs Track Pan row selection to selectedTrackAutomationPointIds', () => {
    const { rerender } = render(<EventListPanel isVisible={true} />);

    fireEvent.click(screen.getByRole('button', { name: 'Track' }));
    fireEvent.click(screen.getByText('-32').closest('tr')!);
    rerender(<EventListPanel isVisible={true} />);

    expect(storeState.selectedTrackAutomationPointIds).toEqual(['pan-1']);
  });

  it('hides MIDI Region add option for audio tracks', () => {
    storeState.selectedTrackId = '2';

    render(<EventListPanel isVisible={true} />);
    fireEvent.click(screen.getByRole('button', { name: 'Track' }));
    fireEvent.click(screen.getAllByRole('button', { name: 'Volume' })[1]);

    expect(screen.queryByText('MIDI Region')).not.toBeInTheDocument();
    expect(
      Array.from(document.querySelectorAll('.quant-option')).some(element => element.textContent?.trim() === 'Pan')
    ).toBe(true);
  });

  it('creates a 1-bar MIDI region at the playhead from the Track tab', async () => {
    render(<EventListPanel isVisible={true} />);
    fireEvent.click(screen.getByRole('button', { name: 'Track' }));
    fireEvent.click(screen.getByTitle('Add MIDI region at playhead'));

    await waitFor(() => expect(midiTrack.getRegions()).toHaveLength(3));

    const createdRegion = midiTrack.getRegions()[2];
    expect(createdRegion.getStartFromBeat()).toBe(4);
    expect(createdRegion.getLength()).toBe(4);
  });

  it('creates a volume automation point using the track base volume', async () => {
    render(<EventListPanel isVisible={true} />);
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
    render(<EventListPanel isVisible={true} />);
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
    const { rerender } = render(<EventListPanel isVisible={true} />);

    fireEvent.click(screen.getByRole('button', { name: 'Track' }));
    fireEvent.click(screen.getByText('-6.0dB').closest('tr')!);
    rerender(<EventListPanel isVisible={true} />);
    fireEvent.click(screen.getByTitle('Delete visible selected rows'));

    await waitFor(() => expect(midiTrack.getVolumeAutomation()).toHaveLength(0));
  });

  it('edits track region position and length inline', async () => {
    render(<EventListPanel isVisible={true} />);

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
    render(<EventListPanel isVisible={true} />);

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

  it('switches to Global tab and lists global track rows without requiring selection', () => {
    storeState.selectedTrackId = null;
    storeState.activeRegionId = null;
    storeState.selectedRegionIds = [];

    render(<EventListPanel isVisible={true} />);
    fireEvent.click(screen.getByRole('button', { name: 'Global' }));

    expect(screen.getAllByRole('button', { name: 'Marker' })[0]).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Tempo' })[0]).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Key Sig.' })[0]).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Chord' })[0]).toBeInTheDocument();
    expect(screen.getByText('Intro')).toBeInTheDocument();
    expect(screen.getByText('120')).toBeInTheDocument();
    expect(screen.getByText('G major')).toBeInTheDocument();
    expect(screen.getByText('Bm7b5')).toBeInTheDocument();
    expect(screen.queryByText('Qua. Pos.')).not.toBeInTheDocument();
    expect(screen.queryByText('Qua. Len.')).not.toBeInTheDocument();
  });

  it('toggles global filters independently', () => {
    render(<EventListPanel isVisible={true} />);
    fireEvent.click(screen.getByRole('button', { name: 'Global' }));
    fireEvent.click(screen.getAllByRole('button', { name: 'Marker' })[0]);

    expect(screen.queryByText('Intro')).not.toBeInTheDocument();
    expect(screen.getByText('120')).toBeInTheDocument();
    expect(screen.getByText('Bm7b5')).toBeInTheDocument();
  });

  it('creates marker and tempo rows from the Global tab with type-specific snapping', async () => {
    const { rerender } = render(<EventListPanel isVisible={true} />);
    fireEvent.click(screen.getByRole('button', { name: 'Global' }));

    storeState.playheadPosition = 5.6;
    rerender(<EventListPanel isVisible={true} />);
    fireEvent.click(screen.getByTitle('Add marker region at playhead'));
    await waitFor(() => expect(markerTrack.getRegions()).toHaveLength(2));
    const createdMarker = markerTrack.getRegions().find(region => region.getId() !== 'marker-1');
    expect(createdMarker?.getStartFromBeat()).toBe(6);

    fireEvent.click(screen.getAllByRole('button', { name: 'Marker' })[1]);
    clickDropdownOption('Tempo');
    storeState.playheadPosition = 6.2;
    rerender(<EventListPanel isVisible={true} />);
    fireEvent.click(screen.getByTitle('Add tempo region at playhead'));

    await waitFor(() => expect(tempoTrack.getRegions()).toHaveLength(3));
    const createdTempo = tempoTrack.getRegions().find(region => region.getId() !== 'tempo-1' && region.getId() !== 'tempo-2') as KGTempoRegion | undefined;
    expect(createdTempo?.getStartBar()).toBe(2);
  });

  it('edits global values inline and shows validation dialogs for invalid input', async () => {
    render(<EventListPanel isVisible={true} />);
    fireEvent.click(screen.getByRole('button', { name: 'Global' }));

    fireEvent.doubleClick(screen.getByText('Intro'));
    const markerInput = screen.getByDisplayValue('Intro');
    fireEvent.change(markerInput, { target: { value: 'Verse A' } });
    fireEvent.keyDown(markerInput, { key: 'Enter' });
    await waitFor(() => expect(markerRegion.getName()).toBe('Verse A'));

    fireEvent.doubleClick(screen.getByText('140'));
    const tempoInput = screen.getByDisplayValue('140');
    fireEvent.change(tempoInput, { target: { value: 'fast' } });
    fireEvent.keyDown(tempoInput, { key: 'Enter' });
    await waitFor(() => expect(vi.mocked(showAlert)).toHaveBeenCalledWith(expect.stringContaining('Example: 128')));
    expect(tempoRegionB.getBpm()).toBe(140);
  });

  it('edits global position and length inline', async () => {
    render(<EventListPanel isVisible={true} />);
    fireEvent.click(screen.getByRole('button', { name: 'Global' }));

    fireEvent.doubleClick(screen.getByText('2 1 0'));
    const positionInput = screen.getByDisplayValue('2 1 0');
    fireEvent.change(positionInput, { target: { value: '3 1 0' } });
    fireEvent.keyDown(positionInput, { key: 'Enter' });
    await waitFor(() => expect(chordRegion.getStartFromBeat()).toBe(8));

    fireEvent.doubleClick(screen.getAllByText('4 0')[0]);
    const lengthInput = screen.getByDisplayValue('4 0');
    fireEvent.change(lengthInput, { target: { value: '8 0' } });
    fireEvent.keyDown(lengthInput, { key: 'Enter' });
    await waitFor(() => expect(markerRegion.getLength()).toBe(8));
  });

  it('deletes mixed global selections with type-aware commands', async () => {
    const { rerender } = render(<EventListPanel isVisible={true} />);
    fireEvent.click(screen.getByRole('button', { name: 'Global' }));

    fireEvent.click(screen.getByText('Intro').closest('tr')!);
    rerender(<EventListPanel isVisible={true} />);
    fireEvent.click(screen.getByText('120').closest('tr')!, { ctrlKey: true });
    rerender(<EventListPanel isVisible={true} />);
    fireEvent.click(screen.getByTitle('Delete visible selected rows'));

    await waitFor(() => {
      expect(markerTrack.getRegions()).toHaveLength(0);
      expect(tempoTrack.getRegions()).toHaveLength(1);
      expect(tempoTrack.getRegions()[0].getId()).toBe('tempo-2');
      expect((tempoTrack.getRegions()[0] as KGTempoRegion).getStartBar()).toBe(0);
    });
  });

  it('renders translated event-list controls in zh-CN', () => {
    renderWithLocale('zh_cn');

    expect(screen.getAllByRole('button', { name: '音符' }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole('button', { name: '弯音' }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole('button', { name: '控制器' }).length).toBeGreaterThan(0);

    fireEvent.click(screen.getByRole('button', { name: '音轨' }));
    expect(screen.getAllByRole('button', { name: '区域' }).length).toBeGreaterThan(0);
    expect(screen.getByRole('button', { name: '音量' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '声像' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '全局' }));
    expect(screen.getAllByRole('button', { name: '标记' }).length).toBeGreaterThan(0);
    expect(screen.getByRole('button', { name: '速度' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '调号' })).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: '和弦' }).length).toBeGreaterThan(0);
    expect(screen.getByRole('columnheader', { name: '位置' })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: '状态' })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: '数值' })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: '长度/信息' })).toBeInTheDocument();
  });
});
