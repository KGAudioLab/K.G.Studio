import React from 'react';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createEvent, fireEvent, render } from '@testing-library/react';
import TrackGridPanel from './TrackGridPanel';
import { createMockMidiRegion, createMockMidiTrack } from '../../test/utils/mock-data';
import { KGAudioTrack } from '../../core/track/KGAudioTrack';
import { CHORD_REGION_IMPORT_MIME_TYPE } from '../../util/chordRegionImportUtil';
import { KGChordRegion } from '../../core/region/KGChordRegion';
import { KGMidiNote } from '../../core/midi/KGMidiNote';
import { KGMainContentState } from '../../core/state/KGMainContentState';
import { convertProjectToMidi } from '../../util/midiUtil';
import { KGProject } from '../../core/KGProject';
import { KGMidiTrack } from '../../core/track/KGMidiTrack';
import { KGMidiRegion } from '../../core/region/KGMidiRegion';

const executeCommandMock = vi.fn();
const getCreatedRegionMock = vi.fn();
const showAlertMock = vi.fn();
let fileImportModalProps: Record<string, unknown> | null = null;
const storeAudioFileMock = vi.fn<(projectName: string, fileId: string, file: File) => Promise<void>>(async () => undefined);
const loadAudioBufferForTrackMock = vi.fn<(trackId: string, fileId: string, toneBuffer: unknown) => void>();
const createTrackSynthMock = vi.fn<(trackId: string, instrument: string) => void>();
const decodeAudioDataMock = vi.fn<(arrayBuffer: ArrayBuffer, onSuccess: (decoded: { duration?: number }) => void, onError: (error: unknown) => void) => void>();
const globalChordRegions = [
  new KGChordRegion('chord-1', 'global-chord', 3, 'C', 0, 4),
  new KGChordRegion('chord-2', 'global-chord', 3, 'F', 4, 4),
];
let currentTracks: Array<ReturnType<typeof createMockMidiTrack> | KGAudioTrack> = [];
let currentMaxBars = 8;

vi.mock('../../stores/projectStore', () => ({
  useProjectStore: (selector?: (state: {
    selectedRegionIds: string[],
    refreshProjectState: () => void,
    timeSignature: { numerator: number; denominator: number },
    bpm: number,
  }) => unknown) => {
    const state = {
      selectedRegionIds: [],
      refreshProjectState: vi.fn(),
      timeSignature: { numerator: 4, denominator: 4 },
      bpm: 120,
    };
    return selector ? selector(state) : state;
  },
}));

vi.mock('../common', () => ({
  Playhead: () => null,
  FileImportModal: (props: Record<string, unknown>) => {
    fileImportModalProps = props;
    return null;
  },
}));

vi.mock('../../core/KGCore', () => ({
  KGCore: {
    instance: () => ({
      executeCommand: (command: { execute?: () => void }) => {
        command.execute?.();
        executeCommandMock(command);
      },
      getCurrentProject: () => ({
        getTracks: () => currentTracks,
        setTracks: (tracks: typeof currentTracks) => {
          currentTracks = tracks;
        },
        getGlobalTracks: () => [{
          getRegions: () => globalChordRegions,
        }],
        getBpm: () => 120,
        getMaxBars: () => currentMaxBars,
        setMaxBars: (maxBars: number) => {
          currentMaxBars = maxBars;
        },
      }),
    }),
  },
}));

vi.mock('../../core/io/KGAudioFileStorage', () => ({
  KGAudioFileStorage: {
    generateAudioFileId: vi.fn((fileName: string) => `audio-file-id-${fileName}`),
    storeAudioFile: (projectName: string, fileId: string, file: File) => storeAudioFileMock(projectName, fileId, file),
  },
}));

vi.mock('../../core/audio-interface/KGAudioInterface', () => ({
  KGAudioInterface: {
    instance: () => ({
      loadAudioBufferForTrack: (trackId: string, fileId: string, toneBuffer: unknown) => loadAudioBufferForTrackMock(trackId, fileId, toneBuffer),
      createTrackSynth: (trackId: string, instrument: string) => createTrackSynthMock(trackId, instrument),
      removeTrackSynth: vi.fn(),
    }),
  },
}));

vi.mock('tone', () => ({
  ToneAudioBuffer: class {
    duration = 0;

    set(decoded: { duration?: number }) {
      this.duration = decoded.duration ?? 0;
    }
  },
  getContext: () => ({
    rawContext: {
      decodeAudioData: (
        arrayBuffer: ArrayBuffer,
        onSuccess: (decoded: { duration?: number }) => void,
        onError: (error: unknown) => void
      ) => decodeAudioDataMock(arrayBuffer, onSuccess, onError),
    },
  }),
}));

vi.mock('../../util/dialogUtil', () => ({
  showAlert: (...args: unknown[]) => showAlertMock(...args),
}));

vi.mock('../../util/miscUtil', async () => {
  const actual = await vi.importActual<typeof import('../../util/miscUtil')>('../../util/miscUtil');
  return {
    ...actual,
    generateNewRegionName: () => 'New Region',
  };
});

vi.mock('../../core/commands', async () => {
  const actual = await vi.importActual<typeof import('../../core/commands')>('../../core/commands');
  return {
    ...actual,
    CreateRegionCommand: {
      fromBarCoordinates: vi.fn((trackId: string, trackIndex: number, barNumber: number) => ({
        getCreatedRegion: () => getCreatedRegionMock() ?? createMockMidiRegion({
          id: 'created-region',
          trackId,
          trackIndex,
          startFromBeat: (barNumber - 1) * 4,
          length: 4,
        }),
      })),
    },
  };
});

describe('TrackGridPanel lasso selection', () => {
  beforeAll(() => {
    Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', {
      value: vi.fn(() => ({
        clearRect: vi.fn(),
        fillRect: vi.fn(),
        beginPath: vi.fn(),
        moveTo: vi.fn(),
        lineTo: vi.fn(),
        stroke: vi.fn(),
      })),
    });

    class ResizeObserverMock {
      observe() {}
      unobserve() {}
      disconnect() {}
    }

    vi.stubGlobal('ResizeObserver', ResizeObserverMock);
  });

  const renderPanel = () => {
    const regionA = createMockMidiRegion({ id: 'region-a', trackId: '1', trackIndex: 0, startFromBeat: 0, length: 4 });
    const regionB = createMockMidiRegion({ id: 'region-b', trackId: '2', trackIndex: 1, startFromBeat: 8, length: 4 });
    const trackA = createMockMidiTrack({ id: 1, regions: [regionA] });
    const trackB = createMockMidiTrack({ id: 2, regions: [regionB] });
    trackA.setTrackIndex(0);
    trackB.setTrackIndex(1);
    currentTracks = [trackA, trackB];

    const onRegionLassoSelection = vi.fn();
    const onRegionCreated = vi.fn();

    const view = render(
      <TrackGridPanel
        tracks={[trackA, trackB]}
        regions={[
          { id: 'region-a', trackId: '1', trackIndex: 0, barNumber: 1, length: 1, name: 'Region A' },
          { id: 'region-b', trackId: '2', trackIndex: 1, barNumber: 3, length: 1, name: 'Region B' },
        ]}
        maxBars={8}
        timeSignature={{ numerator: 4, denominator: 4 }}
        draggedTrackIndex={null}
        dragOverTrackIndex={null}
        selectedRegionId={null}
        projectName="Test"
        onRegionCreated={onRegionCreated}
        onRegionLassoSelection={onRegionLassoSelection}
      />
    );

    configureGridContainer(view.container);

    return { ...view, onRegionLassoSelection, onRegionCreated };
  };

  const mockDroppedFileList = (files: File[]) => {
    const fileList = {
      length: files.length,
      item: (index: number) => files[index] ?? null,
      [Symbol.iterator]: function* iterator() {
        yield* files;
      },
    } as FileList & Iterable<File>;

    files.forEach((file, index) => {
      Object.defineProperty(fileList, index, {
        configurable: true,
        enumerable: true,
        value: file,
      });
    });

    return fileList;
  };

  const createAudioFile = (name: string) => {
    const file = new File([new Uint8Array([1, 2, 3])], name, { type: name.endsWith('.m4a') ? 'audio/mp4' : 'audio/wav' });
    Object.defineProperty(file, 'arrayBuffer', {
      configurable: true,
      value: vi.fn(async () => new Uint8Array([1, 2, 3]).buffer),
    });
    return file;
  };

  const createMidiFile = (name: string, configureProject: (project: KGProject) => void) => {
    const project = new KGProject('Dropped MIDI', 8, 0, 120, { numerator: 4, denominator: 4 }, 'C major');
    configureProject(project);
    const midiData = convertProjectToMidi(project);
    const file = new File([midiData], name, { type: 'audio/midi' });
    Object.defineProperty(file, 'arrayBuffer', {
      configurable: true,
      value: vi.fn(async () => midiData.buffer.slice(0)),
    });
    return file;
  };

  const configureGridContainer = (container: HTMLElement) => {
    const gridContainer = container.querySelector('.grid-container') as HTMLDivElement;
    Object.defineProperty(gridContainer, 'clientWidth', { configurable: true, value: 320 });
    vi.spyOn(gridContainer, 'getBoundingClientRect').mockReturnValue({
      x: 0,
      y: 0,
      left: 0,
      top: 0,
      right: 320,
      bottom: 240,
      width: 320,
      height: 240,
      toJSON: () => ({}),
    });
  };

  const dispatchFileDrop = (target: HTMLElement, files: File[], clientX: number) => {
    const dropEvent = createEvent.drop(target);
    Object.defineProperty(dropEvent, 'clientX', { configurable: true, value: clientX });
    Object.defineProperty(dropEvent, 'dataTransfer', {
      value: {
        files: mockDroppedFileList(files),
        types: ['Files'],
      },
    });
    fireEvent(target, dropEvent);
  };

  beforeEach(() => {
    vi.restoreAllMocks();
    executeCommandMock.mockReset();
    getCreatedRegionMock.mockReset();
    showAlertMock.mockReset();
    fileImportModalProps = null;
    storeAudioFileMock.mockReset();
    loadAudioBufferForTrackMock.mockReset();
    createTrackSynthMock.mockReset();
    decodeAudioDataMock.mockReset();
    decodeAudioDataMock.mockImplementation((_arrayBuffer, onSuccess) => {
      onSuccess({ duration: 2 });
    });
    globalChordRegions[0].setSymbol('C');
    currentTracks = [];
    currentMaxBars = 8;
    KGMainContentState.instance().setSnapping(true);
  });

  it('selects intersecting regions across multiple track rows', () => {
    const { container, onRegionLassoSelection } = renderPanel();
    const firstTrackGrid = container.querySelector('[data-test-id="track-grid-1"]') as HTMLDivElement;

    fireEvent.mouseDown(firstTrackGrid, { clientX: 10, clientY: 10, button: 0 });
    fireEvent.mouseMove(document, { clientX: 130, clientY: 200 });
    fireEvent.mouseUp(document, { clientX: 130, clientY: 200 });

    expect(onRegionLassoSelection).toHaveBeenCalledWith(['region-a', 'region-b'], { shiftKey: false, metaKey: false, ctrlKey: false });
  });

  it('moves the release-point region to the end of the lasso selection order', () => {
    const { container, onRegionLassoSelection } = renderPanel();
    const firstTrackGrid = container.querySelector('[data-test-id="track-grid-1"]') as HTMLDivElement;

    fireEvent.mouseDown(firstTrackGrid, { clientX: 130, clientY: 200, button: 0 });
    fireEvent.mouseMove(document, { clientX: 20, clientY: 20 });
    fireEvent.mouseUp(document, { clientX: 20, clientY: 20 });

    expect(onRegionLassoSelection).toHaveBeenCalledWith(['region-b', 'region-a'], { shiftKey: false, metaKey: false, ctrlKey: false });
  });

  it('uses the closest intersected region as primary when release is outside all regions', () => {
    const { container, onRegionLassoSelection } = renderPanel();
    const firstTrackGrid = container.querySelector('[data-test-id="track-grid-1"]') as HTMLDivElement;

    fireEvent.mouseDown(firstTrackGrid, { clientX: 10, clientY: 10, button: 0 });
    fireEvent.mouseMove(document, { clientX: 150, clientY: 170 });
    fireEvent.mouseUp(document, { clientX: 150, clientY: 170 });

    expect(onRegionLassoSelection).toHaveBeenCalledWith(['region-a', 'region-b'], { shiftKey: false, metaKey: false, ctrlKey: false });
  });

  it('clears selection on a plain empty-space click', () => {
    const { container, onRegionLassoSelection } = renderPanel();
    const firstTrackGrid = container.querySelector('[data-test-id="track-grid-1"]') as HTMLDivElement;

    fireEvent.mouseDown(firstTrackGrid, { clientX: 10, clientY: 10, button: 0 });
    fireEvent.mouseUp(document, { clientX: 11, clientY: 11 });

    expect(onRegionLassoSelection).toHaveBeenCalledWith([], { shiftKey: false, metaKey: false, ctrlKey: false });
  });

  it('does not create a region when ctrl-clicking an existing region', () => {
    const { container, onRegionCreated } = renderPanel();
    const region = container.querySelector('[data-region-id="region-a"]') as HTMLDivElement;

    fireEvent.mouseDown(region, { clientX: 20, clientY: 20, button: 0, ctrlKey: true });
    fireEvent.mouseUp(document, { clientX: 20, clientY: 20, ctrlKey: true });
    fireEvent.click(region, { ctrlKey: true });

    expect(onRegionCreated).not.toHaveBeenCalled();
  });

  it('creates a region when ctrl-clicking empty track space', async () => {
    const { container, onRegionCreated } = renderPanel();
    const firstTrackGrid = container.querySelector('[data-test-id="track-grid-1"]') as HTMLDivElement;
    getCreatedRegionMock.mockReturnValue(createMockMidiRegion({
      id: 'created-region',
      trackId: '1',
      trackIndex: 0,
      startFromBeat: 12,
      length: 4,
      name: 'New Region',
    }));

    fireEvent.click(firstTrackGrid, { clientX: 140, clientY: 20, ctrlKey: true });

    await vi.waitFor(() => {
      expect(onRegionCreated).toHaveBeenCalledTimes(1);
    });
  });

  it('imports chord regions into a MIDI track on drop', async () => {
    const regionA = createMockMidiRegion({ id: 'region-a', trackId: '1', trackIndex: 0, startFromBeat: 0, length: 4 });
    const trackA = createMockMidiTrack({ id: 1, regions: [regionA] });
    trackA.setTrackIndex(0);
    currentTracks = [trackA];
    const onExternalDropComplete = vi.fn();

    const view = render(
      <TrackGridPanel
        tracks={[trackA]}
        regions={[{ id: 'region-a', trackId: '1', trackIndex: 0, barNumber: 1, length: 1, name: 'Region A' }]}
        maxBars={8}
        timeSignature={{ numerator: 4, denominator: 4 }}
        draggedTrackIndex={null}
        dragOverTrackIndex={null}
        selectedRegionId={null}
        projectName="Test"
        onRegionCreated={vi.fn()}
        onExternalDropComplete={onExternalDropComplete}
      />
    );

    const targetGrid = view.container.querySelector('[data-test-id="track-grid-1"]') as HTMLDivElement;
    fireEvent.drop(targetGrid, {
      dataTransfer: {
        types: [CHORD_REGION_IMPORT_MIME_TYPE],
        getData: () => JSON.stringify({ draggedRegionId: 'chord-1', selectedRegionIds: ['chord-1', 'chord-2'] }),
      },
    });

    await vi.waitFor(() => {
      expect(onExternalDropComplete).toHaveBeenCalledTimes(1);
    });

    const command = executeCommandMock.mock.calls.at(-1)?.[0];
    expect(command.getDescription()).toContain('Import chord progression');
    const createdRegion = command.getCreatedRegion();
    expect(createdRegion?.getStartFromBeat()).toBe(0);
    expect(createdRegion?.getLength()).toBe(8);
    expect(createdRegion?.getNotes().map((note: KGMidiNote) => note.getPitch())).toEqual([48, 60, 64, 67, 41, 53, 57, 60]);
  });

  it('shows a polite dialog when dropping chord regions onto an audio track', async () => {
    const audioTrack = new KGAudioTrack('Audio Track', 2);
    audioTrack.setTrackIndex(0);
    currentTracks = [audioTrack];

    const view = render(
      <TrackGridPanel
        tracks={[audioTrack]}
        regions={[]}
        maxBars={8}
        timeSignature={{ numerator: 4, denominator: 4 }}
        draggedTrackIndex={null}
        dragOverTrackIndex={null}
        selectedRegionId={null}
        projectName="Test"
        onRegionCreated={vi.fn()}
      />
    );

    const targetGrid = view.container.querySelector('[data-test-id="track-grid-2"]') as HTMLDivElement;
    fireEvent.drop(targetGrid, {
      dataTransfer: {
        types: [CHORD_REGION_IMPORT_MIME_TYPE],
        getData: () => JSON.stringify({ draggedRegionId: 'chord-1', selectedRegionIds: ['chord-1'] }),
      },
    });

    await vi.waitFor(() => {
      expect(showAlertMock).toHaveBeenCalledWith('Chord regions can only be converted into MIDI tracks. Please drop them onto a MIDI track.');
    });
  });

  it('shows a polite dialog when chord parsing fails', async () => {
    const trackA = createMockMidiTrack({ id: 1, regions: [] });
    trackA.setTrackIndex(0);
    currentTracks = [trackA];
    globalChordRegions[0].setSymbol('not-a-chord');

    const view = render(
      <TrackGridPanel
        tracks={[trackA]}
        regions={[]}
        maxBars={8}
        timeSignature={{ numerator: 4, denominator: 4 }}
        draggedTrackIndex={null}
        dragOverTrackIndex={null}
        selectedRegionId={null}
        projectName="Test"
        onRegionCreated={vi.fn()}
      />
    );

    const targetGrid = view.container.querySelector('[data-test-id="track-grid-1"]') as HTMLDivElement;
    fireEvent.drop(targetGrid, {
      dataTransfer: {
        types: [CHORD_REGION_IMPORT_MIME_TYPE],
        getData: () => JSON.stringify({ draggedRegionId: 'chord-1', selectedRegionIds: ['chord-1'] }),
      },
    });

    await vi.waitFor(() => {
      expect(showAlertMock).toHaveBeenCalledWith('Unable to import chord "not-a-chord". Please update the chord symbol and try again.');
    });
  });

  it('imports a dropped audio file into an audio track and notifies completion', async () => {
    const audioTrack = new KGAudioTrack('Audio Track', 2);
    audioTrack.setTrackIndex(0);
    currentTracks = [audioTrack];
    const onExternalDropComplete = vi.fn();

    const view = render(
      <TrackGridPanel
        tracks={[audioTrack]}
        regions={[]}
        maxBars={8}
        timeSignature={{ numerator: 4, denominator: 4 }}
        draggedTrackIndex={null}
        dragOverTrackIndex={null}
        selectedRegionId={null}
        projectName="Test"
        onRegionCreated={vi.fn()}
        onExternalDropComplete={onExternalDropComplete}
      />
    );
    configureGridContainer(view.container);

    const targetGrid = view.container.querySelector('[data-test-id="track-grid-2"]') as HTMLDivElement;
    const audioFile = createAudioFile('dropped.wav');

    dispatchFileDrop(targetGrid, [audioFile], 80);

    await vi.waitFor(() => {
      expect(onExternalDropComplete).toHaveBeenCalledTimes(1);
    });

    expect(storeAudioFileMock).toHaveBeenCalledWith('Test', 'audio-file-id-dropped.wav', audioFile);
    expect(loadAudioBufferForTrackMock).toHaveBeenCalled();

    const command = executeCommandMock.mock.calls.at(-1)?.[0];
    const createdRegion = command.getCreatedRegion();
    expect(createdRegion?.getName()).toBe('dropped.wav');
    expect(createdRegion?.getStartFromBeat()).toBe(8);
    expect(createdRegion?.getLength()).toBeCloseTo(4);
    expect(onExternalDropComplete).toHaveBeenCalledWith(0, expect.objectContaining({
      name: 'dropped.wav',
      barNumber: 3,
    }));
  });

  it('advertises m4a support in the timeline audio import modal', () => {
    const audioTrack = new KGAudioTrack('Audio Track', 2);
    audioTrack.setTrackIndex(0);
    currentTracks = [audioTrack];

    const view = render(
      <TrackGridPanel
        tracks={[audioTrack]}
        regions={[]}
        maxBars={8}
        timeSignature={{ numerator: 4, denominator: 4 }}
        draggedTrackIndex={null}
        dragOverTrackIndex={null}
        selectedRegionId={null}
        projectName="Test"
        onRegionCreated={vi.fn()}
      />
    );
    configureGridContainer(view.container);

    expect(fileImportModalProps?.acceptedTypes).toEqual(['.wav', '.mp3', '.ogg', '.flac', '.aac', '.m4a']);
  });

  it('accepts dropped m4a files on audio tracks', async () => {
    const audioTrack = new KGAudioTrack('Audio Track', 2);
    audioTrack.setTrackIndex(0);
    currentTracks = [audioTrack];

    const view = render(
      <TrackGridPanel
        tracks={[audioTrack]}
        regions={[]}
        maxBars={8}
        timeSignature={{ numerator: 4, denominator: 4 }}
        draggedTrackIndex={null}
        dragOverTrackIndex={null}
        selectedRegionId={null}
        projectName="Test"
        onRegionCreated={vi.fn()}
      />
    );
    configureGridContainer(view.container);

    const targetGrid = view.container.querySelector('[data-test-id="track-grid-2"]') as HTMLDivElement;
    dispatchFileDrop(targetGrid, [createAudioFile('clip.m4a')], 80);

    await vi.waitFor(() => {
      expect(executeCommandMock).toHaveBeenCalled();
    });

    const command = executeCommandMock.mock.calls.at(-1)?.[0];
    expect(command.getCreatedRegion()?.getName()).toBe('clip.m4a');
  });

  it('shows a polite dialog when dropping an audio file onto a MIDI track', async () => {
    const midiTrack = createMockMidiTrack({ id: 1, regions: [] });
    midiTrack.setTrackIndex(0);
    currentTracks = [midiTrack];

    const view = render(
      <TrackGridPanel
        tracks={[midiTrack]}
        regions={[]}
        maxBars={8}
        timeSignature={{ numerator: 4, denominator: 4 }}
        draggedTrackIndex={null}
        dragOverTrackIndex={null}
        selectedRegionId={null}
        projectName="Test"
        onRegionCreated={vi.fn()}
      />
    );
    configureGridContainer(view.container);

    const targetGrid = view.container.querySelector('[data-test-id="track-grid-1"]') as HTMLDivElement;
    dispatchFileDrop(targetGrid, [createAudioFile('dropped.wav')], 80);

    await vi.waitFor(() => {
      expect(showAlertMock).toHaveBeenCalledWith('Audio files can only be imported into audio tracks. Please drop them onto an audio track.');
    });
    expect(executeCommandMock).not.toHaveBeenCalled();
  });

  it('imports a dropped MIDI file into a MIDI track without changing its instrument', async () => {
    const midiTrack = createMockMidiTrack({ id: 1, regions: [] });
    midiTrack.setTrackIndex(0);
    midiTrack.setInstrument('violin');
    currentTracks = [midiTrack];
    const onExternalDropComplete = vi.fn();

    const view = render(
      <TrackGridPanel
        tracks={[midiTrack]}
        regions={[]}
        maxBars={8}
        timeSignature={{ numerator: 4, denominator: 4 }}
        draggedTrackIndex={null}
        dragOverTrackIndex={null}
        selectedRegionId={null}
        projectName="Test"
        onRegionCreated={vi.fn()}
        onExternalDropComplete={onExternalDropComplete}
      />
    );
    configureGridContainer(view.container);

    const midiFile = createMidiFile('phrase.mid', project => {
      const sourceTrack = new KGMidiTrack('Lead Source', 11, 'flute');
      sourceTrack.setTrackIndex(0);
      const region = new KGMidiRegion('source-region', '11', 0, 'Lead Source', 4, 6);
      region.addNote(new KGMidiNote('source-note-1', 0, 1, 60, 100));
      region.addNote(new KGMidiNote('source-note-2', 4, 6, 64, 90));
      sourceTrack.addRegion(region);
      project.getTracks().push(sourceTrack);
    });

    const targetGrid = view.container.querySelector('[data-test-id="track-grid-1"]') as HTMLDivElement;
    dispatchFileDrop(targetGrid, [midiFile], 80);

    await vi.waitFor(() => {
      expect(onExternalDropComplete).toHaveBeenCalledTimes(1);
    });

    expect(currentTracks).toHaveLength(1);
    expect((currentTracks[0] as KGMidiTrack).getInstrument()).toBe('violin');
    const importedRegion = (currentTracks[0] as KGMidiTrack).getRegions()[0] as KGMidiRegion;
    expect(importedRegion.getName()).toBe('phrase.mid');
    expect(importedRegion.getStartFromBeat()).toBe(8);
    expect(importedRegion.getLength()).toBe(6);
    expect(importedRegion.getNotes().map(note => note.getStartBeat())).toEqual([0, 4]);
  });

  it('imports a dropped multi-track MIDI file into the target track and inserts extra tracks below it', async () => {
    const topTrack = createMockMidiTrack({ id: 1, regions: [] });
    const targetTrack = createMockMidiTrack({ id: 2, regions: [] });
    const bottomTrack = createMockMidiTrack({ id: 3, regions: [] });
    topTrack.setTrackIndex(0);
    targetTrack.setTrackIndex(1);
    bottomTrack.setTrackIndex(2);
    targetTrack.setInstrument('violin');
    currentTracks = [topTrack, targetTrack, bottomTrack];

    const view = render(
      <TrackGridPanel
        tracks={[topTrack, targetTrack, bottomTrack]}
        regions={[]}
        maxBars={8}
        timeSignature={{ numerator: 4, denominator: 4 }}
        draggedTrackIndex={null}
        dragOverTrackIndex={null}
        selectedRegionId={null}
        projectName="Test"
        onRegionCreated={vi.fn()}
      />
    );
    configureGridContainer(view.container);

    const midiFile = createMidiFile('ensemble.mid', project => {
      const leadTrack = new KGMidiTrack('Lead', 21, 'acoustic_grand_piano');
      leadTrack.setTrackIndex(0);
      const leadRegion = new KGMidiRegion('lead-region', '21', 0, 'Lead Source', 4, 4);
      leadRegion.addNote(new KGMidiNote('lead-note', 0, 1, 72, 100));
      leadTrack.addRegion(leadRegion);

      const bassTrack = new KGMidiTrack('Bass', 22, 'electric_bass_finger');
      bassTrack.setTrackIndex(1);
      const bassRegion = new KGMidiRegion('bass-region', '22', 1, 'Bass Source', 6, 2);
      bassRegion.addNote(new KGMidiNote('bass-note', 0, 2, 43, 95));
      bassTrack.addRegion(bassRegion);

      project.getTracks().push(leadTrack, bassTrack);
    });

    const targetGrid = view.container.querySelector('[data-test-id="track-grid-2"]') as HTMLDivElement;
    dispatchFileDrop(targetGrid, [midiFile], 80);

    await vi.waitFor(() => {
      expect(currentTracks).toHaveLength(4);
    });

    expect(currentTracks.map(track => track.getName())).toEqual([
      topTrack.getName(),
      targetTrack.getName(),
      'Bass',
      bottomTrack.getName(),
    ]);
    expect(currentTracks[1].getTrackIndex()).toBe(1);
    expect(currentTracks[2].getTrackIndex()).toBe(2);
    expect((currentTracks[1] as KGMidiTrack).getInstrument()).toBe('violin');
    expect((currentTracks[2] as KGMidiTrack).getInstrument()).toBe('electric_bass_finger');
    expect(createTrackSynthMock).toHaveBeenCalledWith(expect.any(String), 'electric_bass_finger');

    const targetImportedRegion = (currentTracks[1] as KGMidiTrack).getRegions()[0] as KGMidiRegion;
    const insertedImportedRegion = (currentTracks[2] as KGMidiTrack).getRegions()[0] as KGMidiRegion;
    expect(targetImportedRegion.getStartFromBeat()).toBe(8);
    expect(insertedImportedRegion.getStartFromBeat()).toBe(10);
    expect(insertedImportedRegion.getNotes()[0].getStartBeat()).toBe(0);
  });

  it('shows a polite dialog when dropping a MIDI file onto an audio track', async () => {
    const audioTrack = new KGAudioTrack('Audio Track', 2);
    audioTrack.setTrackIndex(0);
    currentTracks = [audioTrack];

    const view = render(
      <TrackGridPanel
        tracks={[audioTrack]}
        regions={[]}
        maxBars={8}
        timeSignature={{ numerator: 4, denominator: 4 }}
        draggedTrackIndex={null}
        dragOverTrackIndex={null}
        selectedRegionId={null}
        projectName="Test"
        onRegionCreated={vi.fn()}
      />
    );
    configureGridContainer(view.container);

    const midiFile = createMidiFile('phrase.mid', project => {
      const sourceTrack = new KGMidiTrack('Lead Source', 11, 'flute');
      sourceTrack.setTrackIndex(0);
      const region = new KGMidiRegion('source-region', '11', 0, 'Lead Source', 0, 1);
      region.addNote(new KGMidiNote('source-note-1', 0, 1, 60, 100));
      sourceTrack.addRegion(region);
      project.getTracks().push(sourceTrack);
    });

    const targetGrid = view.container.querySelector('[data-test-id="track-grid-2"]') as HTMLDivElement;
    dispatchFileDrop(targetGrid, [midiFile], 80);

    await vi.waitFor(() => {
      expect(showAlertMock).toHaveBeenCalledWith('MIDI files can only be imported into MIDI tracks. Please drop them onto a MIDI track.');
    });
    expect(executeCommandMock).not.toHaveBeenCalled();
  });

  it('shows a validation dialog when dropping an unsupported local file', async () => {
    const audioTrack = new KGAudioTrack('Audio Track', 2);
    audioTrack.setTrackIndex(0);
    currentTracks = [audioTrack];

    const view = render(
      <TrackGridPanel
        tracks={[audioTrack]}
        regions={[]}
        maxBars={8}
        timeSignature={{ numerator: 4, denominator: 4 }}
        draggedTrackIndex={null}
        dragOverTrackIndex={null}
        selectedRegionId={null}
        projectName="Test"
        onRegionCreated={vi.fn()}
      />
    );
    configureGridContainer(view.container);

    const targetGrid = view.container.querySelector('[data-test-id="track-grid-2"]') as HTMLDivElement;
    dispatchFileDrop(targetGrid, [new File(['{}'], 'notes.txt', { type: 'text/plain' })], 80);

    await vi.waitFor(() => {
      expect(showAlertMock).toHaveBeenCalledWith('Invalid file type. Please select a file with one of these extensions: .wav, .mp3, .ogg, .flac, .aac, .m4a, .mid, .midi');
    });
    expect(executeCommandMock).not.toHaveBeenCalled();
  });

  it('shows a clear decode failure dialog for m4a imports when the browser rejects the codec', async () => {
    const audioTrack = new KGAudioTrack('Audio Track', 2);
    audioTrack.setTrackIndex(0);
    currentTracks = [audioTrack];
    decodeAudioDataMock.mockImplementationOnce((_arrayBuffer, _onSuccess, onError) => {
      onError(new Error('decode failed'));
    });

    const view = render(
      <TrackGridPanel
        tracks={[audioTrack]}
        regions={[]}
        maxBars={8}
        timeSignature={{ numerator: 4, denominator: 4 }}
        draggedTrackIndex={null}
        dragOverTrackIndex={null}
        selectedRegionId={null}
        projectName="Test"
        onRegionCreated={vi.fn()}
      />
    );
    configureGridContainer(view.container);

    const targetGrid = view.container.querySelector('[data-test-id="track-grid-2"]') as HTMLDivElement;
    dispatchFileDrop(targetGrid, [createAudioFile('unsupported.m4a')], 80);

    await vi.waitFor(() => {
      expect(showAlertMock).toHaveBeenCalledWith('Unable to import "unsupported.m4a". This browser could not decode the file\'s audio codec. M4A import depends on browser support.');
    });
    expect(storeAudioFileMock).not.toHaveBeenCalled();
    expect(executeCommandMock).not.toHaveBeenCalled();
  });

  it('uses the same snapped bar placement for dropped audio files as click import', async () => {
    const audioTrack = new KGAudioTrack('Audio Track', 2);
    audioTrack.setTrackIndex(0);
    currentTracks = [audioTrack];
    KGMainContentState.instance().setSnapping(true);

    const view = render(
      <TrackGridPanel
        tracks={[audioTrack]}
        regions={[]}
        maxBars={8}
        timeSignature={{ numerator: 4, denominator: 4 }}
        draggedTrackIndex={null}
        dragOverTrackIndex={null}
        selectedRegionId={null}
        projectName="Test"
        onRegionCreated={vi.fn()}
      />
    );
    configureGridContainer(view.container);

    const targetGrid = view.container.querySelector('[data-test-id="track-grid-2"]') as HTMLDivElement;
    dispatchFileDrop(targetGrid, [createAudioFile('snapped.wav')], 100);

    await vi.waitFor(() => {
      expect(executeCommandMock).toHaveBeenCalled();
    });

    const command = executeCommandMock.mock.calls.at(-1)?.[0];
    expect(command.getCreatedRegion()?.getStartFromBeat()).toBe(12);
  });

  it('preserves fractional bar placement when snapping is disabled for dropped audio files', async () => {
    const audioTrack = new KGAudioTrack('Audio Track', 2);
    audioTrack.setTrackIndex(0);
    currentTracks = [audioTrack];
    KGMainContentState.instance().setSnapping(false);

    const view = render(
      <TrackGridPanel
        tracks={[audioTrack]}
        regions={[]}
        maxBars={8}
        timeSignature={{ numerator: 4, denominator: 4 }}
        draggedTrackIndex={null}
        dragOverTrackIndex={null}
        selectedRegionId={null}
        projectName="Test"
        onRegionCreated={vi.fn()}
      />
    );
    configureGridContainer(view.container);

    const targetGrid = view.container.querySelector('[data-test-id="track-grid-2"]') as HTMLDivElement;
    dispatchFileDrop(targetGrid, [createAudioFile('unsnapped.wav')], 100);

    await vi.waitFor(() => {
      expect(executeCommandMock).toHaveBeenCalled();
    });

    const command = executeCommandMock.mock.calls.at(-1)?.[0];
    expect(command.getCreatedRegion()?.getStartFromBeat()).toBeCloseTo(10);
  });

  it('advertises local file drops only on compatible rows during drag over', () => {
    const audioTrack = new KGAudioTrack('Audio Track', 2);
    audioTrack.setTrackIndex(0);
    const midiTrack = createMockMidiTrack({ id: 1, regions: [] });
    midiTrack.setTrackIndex(1);
    currentTracks = [audioTrack, midiTrack];

    const view = render(
      <TrackGridPanel
        tracks={[audioTrack, midiTrack]}
        regions={[]}
        maxBars={8}
        timeSignature={{ numerator: 4, denominator: 4 }}
        draggedTrackIndex={null}
        dragOverTrackIndex={null}
        selectedRegionId={null}
        projectName="Test"
        onRegionCreated={vi.fn()}
      />
    );
    configureGridContainer(view.container);

    const audioGrid = view.container.querySelector('[data-test-id="track-grid-2"]') as HTMLDivElement;
    const midiGrid = view.container.querySelector('[data-test-id="track-grid-1"]') as HTMLDivElement;

    const audioEvent = createEvent.dragOver(audioGrid);
    Object.defineProperty(audioEvent, 'dataTransfer', {
      value: { files: mockDroppedFileList([createAudioFile('drag.wav')]), types: ['Files'], dropEffect: 'move' },
    });
    fireEvent(audioGrid, audioEvent);

    const midiAudioEvent = createEvent.dragOver(midiGrid);
    Object.defineProperty(midiAudioEvent, 'dataTransfer', {
      value: { files: mockDroppedFileList([createAudioFile('drag.wav')]), types: ['Files'], dropEffect: 'move' },
    });
    fireEvent(midiGrid, midiAudioEvent);

    const midiFileEvent = createEvent.dragOver(midiGrid);
    Object.defineProperty(midiFileEvent, 'dataTransfer', {
      value: {
        files: mockDroppedFileList([createMidiFile('drag.mid', project => {
          const sourceTrack = new KGMidiTrack('Drag Source', 99, 'flute');
          sourceTrack.setTrackIndex(0);
          const region = new KGMidiRegion('drag-region', '99', 0, 'Drag Region', 0, 1);
          region.addNote(new KGMidiNote('drag-note', 0, 1, 60, 90));
          sourceTrack.addRegion(region);
          project.getTracks().push(sourceTrack);
        })]),
        types: ['Files'],
        dropEffect: 'move',
      },
    });
    fireEvent(midiGrid, midiFileEvent);

    const unknownFileEvent = createEvent.dragOver(midiGrid);
    Object.defineProperty(unknownFileEvent, 'dataTransfer', {
      value: {
        files: mockDroppedFileList([]),
        types: ['Files'],
        dropEffect: 'move',
      },
    });
    fireEvent(midiGrid, unknownFileEvent);

    expect(audioEvent.defaultPrevented).toBe(true);
    expect((audioEvent as unknown as { dataTransfer: { dropEffect: string } }).dataTransfer.dropEffect).toBe('copy');
    expect(midiAudioEvent.defaultPrevented).toBe(true);
    expect((midiAudioEvent as unknown as { dataTransfer: { dropEffect: string } }).dataTransfer.dropEffect).toBe('none');
    expect(midiFileEvent.defaultPrevented).toBe(true);
    expect((midiFileEvent as unknown as { dataTransfer: { dropEffect: string } }).dataTransfer.dropEffect).toBe('copy');
    expect(unknownFileEvent.defaultPrevented).toBe(true);
    expect((unknownFileEvent as unknown as { dataTransfer: { dropEffect: string } }).dataTransfer.dropEffect).toBe('copy');
  });
});
