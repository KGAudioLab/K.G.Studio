import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import SheetMusicView from './SheetMusicView';
import { getSheetPlayheadPixel, parseSheetQuantization } from './sheetNotation';
import type { SheetMeasureMetric } from './sheetNotationTypes';
import { createMockMidiNote, createMockMidiRegion } from '../../test/utils/mock-data';

const setPlayheadPosition = vi.fn();
const requestMainContentScroll = vi.fn();

vi.mock('../../stores/projectStore', () => ({
  useProjectStore: (selector: (state: {
    playheadPosition: number;
    setPlayheadPosition: typeof setPlayheadPosition;
    requestMainContentScroll: typeof requestMainContentScroll;
  }) => unknown) => selector({
    playheadPosition: 0,
    setPlayheadPosition,
    requestMainContentScroll,
  }),
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

    addKeySignature() {
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
    constructor(_options: unknown) {}

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
    Accidental: { applyAccidentals: vi.fn() },
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
});
