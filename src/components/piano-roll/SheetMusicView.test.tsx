import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import SheetMusicView from './SheetMusicView';
import { getSheetPlayheadPixel, parseSheetQuantization } from './sheetNotation';
import type { SheetMeasureMetric } from './sheetNotationTypes';
import { createMockMidiNote, createMockMidiRegion } from '../../test/utils/mock-data';
import { createDefaultGlobalTracks } from '../../core/global-track';
import { KGKeySignatureRegion } from '../../core/region/KGKeySignatureRegion';

const setPlayheadPosition = vi.fn();
const requestMainContentScroll = vi.fn();
const vexflowMocks = vi.hoisted(() => ({
  addKeySignatureMock: vi.fn(),
  applyAccidentalsMock: vi.fn(),
  staveNoteMock: vi.fn(),
}));
const storeState = {
  playheadPosition: 0,
  setPlayheadPosition,
  requestMainContentScroll,
  globalTracks: createDefaultGlobalTracks(),
};

vi.mock('../../stores/projectStore', () => ({
  useProjectStore: (selector: (state: {
    playheadPosition: number;
    setPlayheadPosition: typeof setPlayheadPosition;
    requestMainContentScroll: typeof requestMainContentScroll;
    globalTracks: typeof storeState.globalTracks;
  }) => unknown) => selector(storeState),
}));

vi.mock('../common', () => ({
  Playhead: ({ pixelPositionOverride }: { pixelPositionOverride?: number }) => (
    <div data-testid="playhead" data-pixel={pixelPositionOverride ?? 0} />
  ),
}));

vi.mock('vexflow', () => {
  class MockRenderer {
    static Backends = { SVG: 'svg' };

    private readonly host: HTMLElement;

    constructor(host: HTMLElement) {
      this.host = host;
    }

    resize() {}

    getContext() {
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      this.host.appendChild(svg);
      return {};
    }
  }

  class MockStave {
    constructor(
      _x: number,
      _y: number,
      _width: number
    ) {}

    setBegBarType() {
      return this;
    }

    setEndBarType() {
      return this;
    }

    addClef() {
      return this;
    }

    addKeySignature(...args: unknown[]) {
      vexflowMocks.addKeySignatureMock(...args);
      return this;
    }

    addTimeSignature() {
      return this;
    }

    setContext() {
      return this;
    }

    draw() {
      return this;
    }
  }

  class MockStaveNote {
    constructor(options: unknown) {
      vexflowMocks.staveNoteMock(options);
    }

    isRest() {
      return false;
    }

    getTieLeftX() {
      return 0;
    }

    getTieRightX() {
      return 0;
    }

    getYs() {
      return [0];
    }
  }

  class MockVoice {
    constructor(_options: unknown) {}

    setStrict() {
      return this;
    }

    addTickables() {
      return this;
    }

    draw() {
      return this;
    }
  }

  class MockFormatter {
    joinVoices() {
      return this;
    }

    formatToStave() {
      return this;
    }
  }

  class MockBeam {
    static generateBeams() {
      return [];
    }

    setContext() {
      return this;
    }

    draw() {
      return this;
    }
  }

  return {
    Accidental: { applyAccidentals: vexflowMocks.applyAccidentalsMock },
    BarlineType: { SINGLE: 1, NONE: 0 },
    Beam: MockBeam,
    Dot: { buildAndAttach: vi.fn() },
    Formatter: MockFormatter,
    Renderer: MockRenderer,
    Stave: MockStave,
    StaveNote: MockStaveNote,
    Voice: MockVoice,
  };
});

describe('SheetMusicView', () => {
  const quantization = parseSheetQuantization('16,48');
  const onMetricsChange = vi.fn();

  const getLatestMetrics = (): SheetMeasureMetric[] => {
    const latestCall = onMetricsChange.mock.calls.at(-1);
    expect(latestCall).toBeDefined();
    return latestCall?.[0] as SheetMeasureMetric[];
  };

  beforeEach(() => {
    setPlayheadPosition.mockClear();
    requestMainContentScroll.mockClear();
    onMetricsChange.mockClear();
    vexflowMocks.addKeySignatureMock.mockClear();
    vexflowMocks.applyAccidentalsMock.mockClear();
    vexflowMocks.staveNoteMock.mockClear();
    storeState.globalTracks = createDefaultGlobalTracks();
  });

  it('maps header clicks in region scope without adding scroll offset', () => {
    const activeRegion = createMockMidiRegion({
      startFromBeat: 16,
      length: 8,
      notes: [],
    });

    render(
      <SheetMusicView
        activeRegion={activeRegion}
        midiRegions={[activeRegion]}
        maxBars={8}
        sheetMusicTrackScopeEnabled={false}
        timeSignature={{ numerator: 4, denominator: 4 }}
        keySignature="C major"
        instrument="acoustic_grand_piano"
        quantization={quantization}
        onMetricsChange={onMetricsChange}
      />
    );

    const header = document.querySelector('.sheet-music-header') as HTMLDivElement;
    expect(header).not.toBeNull();
    const metrics = getLatestMetrics();
    const expectedLocalBeat = 6;
    const headerPixel = getSheetPlayheadPixel(expectedLocalBeat, metrics);

    Object.defineProperty(header, 'getBoundingClientRect', {
      value: () => ({
        left: 100,
        top: 0,
        right: 540,
        bottom: 20,
        width: 440,
        height: 20,
        x: 100,
        y: 0,
        toJSON: () => ({}),
      }),
    });

    fireEvent.click(header, { clientX: 100 + headerPixel });

    expect(setPlayheadPosition).toHaveBeenCalledTimes(1);
    expect(requestMainContentScroll).toHaveBeenCalledTimes(1);
    expect(setPlayheadPosition).toHaveBeenCalledWith(22);
    expect(requestMainContentScroll).toHaveBeenCalledWith(22);
  });

  it('maps header clicks in track scope to absolute beats', () => {
    const activeRegion = createMockMidiRegion({
      startFromBeat: 16,
      length: 8,
      notes: [
        createMockMidiNote({ id: 'note-1', startBeat: 0, endBeat: 1, pitch: 60 }),
      ],
    });

    const anotherRegion = createMockMidiRegion({
      id: 'region-2',
      startFromBeat: 24,
      length: 4,
      notes: [
        createMockMidiNote({ id: 'note-2', startBeat: 0, endBeat: 1, pitch: 67 }),
      ],
    });

    render(
      <SheetMusicView
        activeRegion={activeRegion}
        midiRegions={[activeRegion, anotherRegion]}
        maxBars={8}
        sheetMusicTrackScopeEnabled={true}
        timeSignature={{ numerator: 4, denominator: 4 }}
        keySignature="C major"
        instrument="acoustic_grand_piano"
        quantization={quantization}
        onMetricsChange={onMetricsChange}
      />
    );

    const header = document.querySelector('.sheet-music-header') as HTMLDivElement;
    expect(header).not.toBeNull();
    const metrics = getLatestMetrics();
    const expectedBeat = 3;
    const headerPixel = getSheetPlayheadPixel(expectedBeat, metrics);

    Object.defineProperty(header, 'getBoundingClientRect', {
      value: () => ({
        left: 100,
        top: 0,
        right: 300,
        bottom: 20,
        width: 200,
        height: 20,
        x: 100,
        y: 0,
        toJSON: () => ({}),
      }),
    });

    fireEvent.click(header, { clientX: 100 + headerPixel });

    expect(setPlayheadPosition).toHaveBeenCalledTimes(1);
    expect(requestMainContentScroll).toHaveBeenCalledTimes(1);
    expect(setPlayheadPosition).toHaveBeenCalledWith(3);
    expect(requestMainContentScroll).toHaveBeenCalledWith(3);
  });

  it('renders the playhead container', () => {
    const activeRegion = createMockMidiRegion();

    render(
      <SheetMusicView
        activeRegion={activeRegion}
        midiRegions={[activeRegion]}
        maxBars={4}
        sheetMusicTrackScopeEnabled={false}
        timeSignature={{ numerator: 4, denominator: 4 }}
        keySignature="C major"
        instrument="acoustic_grand_piano"
        quantization={quantization}
        onMetricsChange={onMetricsChange}
      />
    );

    expect(screen.getByTestId('playhead')).toBeInTheDocument();
  });

  it('renders sheet measures using effective key signatures from the global signature track', () => {
    const activeRegion = createMockMidiRegion({
      startFromBeat: 0,
      length: 12,
      notes: [createMockMidiNote({ startBeat: 0, endBeat: 1, pitch: 60 })],
    });
    const signatureTrack = storeState.globalTracks.find(track => track.getType() === 'signature');
    signatureTrack?.setRegions([
      new KGKeySignatureRegion('sig-1', signatureTrack.getId(), signatureTrack.getTrackIndex(), 'G major', 1, 2, 4),
    ]);

    render(
      <SheetMusicView
        activeRegion={activeRegion}
        midiRegions={[activeRegion]}
        maxBars={8}
        sheetMusicTrackScopeEnabled={false}
        timeSignature={{ numerator: 4, denominator: 4 }}
        keySignature="C major"
        instrument="acoustic_grand_piano"
        quantization={quantization}
        onMetricsChange={onMetricsChange}
      />
    );

    expect(vexflowMocks.addKeySignatureMock).toHaveBeenCalledWith('C');
    expect(vexflowMocks.addKeySignatureMock).toHaveBeenCalledWith('G', 'C');
    expect(vexflowMocks.applyAccidentalsMock).toHaveBeenCalledWith(expect.any(Array), 'C');
    expect(vexflowMocks.applyAccidentalsMock).toHaveBeenCalledWith(expect.any(Array), 'G');
  });

  it('keeps ties connected when a key change respells the same MIDI pitch', () => {
    const activeRegion = createMockMidiRegion({
      startFromBeat: 0,
      length: 8,
      notes: [createMockMidiNote({ startBeat: 0, endBeat: 5, pitch: 68 })],
    });
    const signatureTrack = storeState.globalTracks.find(track => track.getType() === 'signature');
    signatureTrack?.setRegions([
      new KGKeySignatureRegion('sig-1', signatureTrack.getId(), signatureTrack.getTrackIndex(), 'F minor', 1, 1, 4),
    ]);

    render(
      <SheetMusicView
        activeRegion={activeRegion}
        midiRegions={[activeRegion]}
        maxBars={2}
        sheetMusicTrackScopeEnabled={false}
        timeSignature={{ numerator: 4, denominator: 4 }}
        keySignature="C# minor"
        instrument="acoustic_grand_piano"
        quantization={quantization}
        onMetricsChange={onMetricsChange}
      />
    );

    const renderedKeys = vexflowMocks.staveNoteMock.mock.calls
      .map(([options]) => (options as { keys: string[] }).keys);
    expect(renderedKeys).toContainEqual(['g#/4']);
    expect(renderedKeys).toContainEqual(['ab/4']);
    expect(document.querySelector('.sheet-music-tie-path')).not.toBeNull();
  });

  it('widens a measure when a key change header is inserted', () => {
    const activeRegion = createMockMidiRegion({
      startFromBeat: 0,
      length: 12,
      notes: [],
    });
    const signatureTrack = storeState.globalTracks.find(track => track.getType() === 'signature');
    signatureTrack?.setRegions([
      new KGKeySignatureRegion('sig-1', signatureTrack.getId(), signatureTrack.getTrackIndex(), 'G major', 1, 2, 4),
    ]);

    render(
      <SheetMusicView
        activeRegion={activeRegion}
        midiRegions={[activeRegion]}
        maxBars={8}
        sheetMusicTrackScopeEnabled={false}
        timeSignature={{ numerator: 4, denominator: 4 }}
        keySignature="C major"
        instrument="acoustic_grand_piano"
        quantization={quantization}
        onMetricsChange={onMetricsChange}
      />
    );

    const metrics = getLatestMetrics();
    expect(metrics[1].widthPx).toBeGreaterThan(metrics[2].widthPx);
  });

  it('anchors quarter and whole rests on the middle line in bass clef', () => {
    const activeRegion = createMockMidiRegion({
      startFromBeat: 0,
      length: 12,
      notes: [
        createMockMidiNote({ id: 'bass-note-1', startBeat: 0, endBeat: 1, pitch: 40 }),
        createMockMidiNote({ id: 'bass-note-2', startBeat: 2, endBeat: 3, pitch: 40 }),
        createMockMidiNote({ id: 'bass-note-3', startBeat: 8, endBeat: 9, pitch: 40 }),
      ],
    });

    render(
      <SheetMusicView
        activeRegion={activeRegion}
        midiRegions={[activeRegion]}
        maxBars={4}
        sheetMusicTrackScopeEnabled={false}
        timeSignature={{ numerator: 4, denominator: 4 }}
        keySignature="C major"
        instrument="acoustic_grand_piano"
        quantization={quantization}
        onMetricsChange={onMetricsChange}
      />
    );

    const restOptions = vexflowMocks.staveNoteMock.mock.calls
      .map(([options]) => options as { keys: string[]; duration: string })
      .filter(({ duration }) => duration.endsWith('r'));

    expect(restOptions.some(({ duration }) => duration === 'qr')).toBe(true);
    expect(restOptions.some(({ duration }) => duration === 'wr')).toBe(true);
    expect(restOptions).toEqual(expect.arrayContaining([
      expect.objectContaining({ keys: ['d/3'] }),
    ]));
    expect(restOptions.every(({ keys }) => keys[0] === 'd/3')).toBe(true);
  });

  it('keeps treble-clef rests anchored with b/4', () => {
    const activeRegion = createMockMidiRegion({
      startFromBeat: 0,
      length: 4,
      notes: [
        createMockMidiNote({ id: 'treble-note-1', startBeat: 0, endBeat: 1, pitch: 76 }),
        createMockMidiNote({ id: 'treble-note-2', startBeat: 2, endBeat: 3, pitch: 76 }),
      ],
    });

    render(
      <SheetMusicView
        activeRegion={activeRegion}
        midiRegions={[activeRegion]}
        maxBars={4}
        sheetMusicTrackScopeEnabled={false}
        timeSignature={{ numerator: 4, denominator: 4 }}
        keySignature="C major"
        instrument="acoustic_grand_piano"
        quantization={quantization}
        onMetricsChange={onMetricsChange}
      />
    );

    const restOptions = vexflowMocks.staveNoteMock.mock.calls
      .map(([options]) => options as { keys: string[]; duration: string })
      .filter(({ duration }) => duration.endsWith('r'));

    expect(restOptions).not.toHaveLength(0);
    expect(restOptions.every(({ keys }) => keys[0] === 'b/4')).toBe(true);
  });
});
