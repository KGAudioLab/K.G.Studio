import React, { memo, useEffect, useMemo, useRef, useState } from 'react';
import { Accidental, BarlineType, Beam, Dot, Formatter, Renderer, Stave, StaveNote, Voice } from 'vexflow';
import { Playhead } from '../common';
import { useProjectStore } from '../../stores/projectStore';
import type { KeySignature } from '../../core/KGProject';
import type { KGMidiRegion } from '../../core/region/KGMidiRegion';
import type { InstrumentType } from '../../core/track/KGMidiTrack';
import type { SheetMeasureMetric, SheetMeasureModel, SheetQuantization } from './sheetNotationTypes';
import {
  buildSheetMeasureMetrics,
  getSheetBeatAtPixel,
  buildSheetMeasureModels,
  getSheetPlayheadPixel,
  projectKeySignatureToVexFlow,
  resolveDurationSpec,
  resolveSheetClef,
  type SheetClef,
} from './sheetNotation';

interface SheetMusicViewProps {
  activeRegion: KGMidiRegion | null;
  midiRegions: KGMidiRegion[];
  maxBars: number;
  sheetMusicTrackScopeEnabled: boolean;
  timeSignature: { numerator: number; denominator: number };
  keySignature: KeySignature;
  instrument: InstrumentType;
  quantization: SheetQuantization;
  onMetricsChange: (metrics: SheetMeasureMetric[]) => void;
}

interface RenderedSheetEvent {
  barIndex: number;
  eventIndex: number;
  startBeat: number;
  endBeat: number;
  keys: string[];
  tieStart: boolean;
  tieEnd: boolean;
  tieLeftX: number;
  tieRightX: number;
  y: number;
}

interface SheetTiePath {
  id: string;
  d: string;
}

const MIN_MEASURE_WIDTH = 200;
const EVENT_WIDTH = 28;
const STAFF_HEIGHT = 132;
const FIRST_MEASURE_MODIFIER_WIDTH = 72;
const SheetMusicView: React.FC<SheetMusicViewProps> = ({
  activeRegion,
  midiRegions,
  maxBars,
  sheetMusicTrackScopeEnabled,
  timeSignature,
  keySignature,
  instrument,
  quantization,
  onMetricsChange,
}) => {
  const setPlayheadPosition = useProjectStore(state => state.setPlayheadPosition);
  const requestMainContentScroll = useProjectStore(state => state.requestMainContentScroll);
  const [metrics, setMetrics] = useState<SheetMeasureMetric[]>([]);
  const [tiePaths, setTiePaths] = useState<SheetTiePath[]>([]);
  const headerRef = useRef<HTMLDivElement | null>(null);
  const measureHostRefs = useRef<Array<HTMLDivElement | null>>([]);
  const lastDrawSignatureRef = useRef<string | null>(null);
  const vexKeySignature = useMemo(() => projectKeySignatureToVexFlow(keySignature), [keySignature]);
  const startingBarNumber = useMemo(() => (
    sheetMusicTrackScopeEnabled
      ? 1
      : (activeRegion ? Math.floor(activeRegion.getStartFromBeat() / timeSignature.numerator) + 1 : 1)
  ), [activeRegion, sheetMusicTrackScopeEnabled, timeSignature.numerator]);

  const measureModels = useMemo<SheetMeasureModel[]>(() => {
    if (!activeRegion) {
      return [];
    }

    return buildSheetMeasureModels({
      scope: sheetMusicTrackScopeEnabled ? 'track' : 'region',
      region: activeRegion,
      regions: midiRegions,
      projectMaxBars: maxBars,
      timeSignature,
      quantization,
    });
  }, [activeRegion, maxBars, midiRegions, quantization, sheetMusicTrackScopeEnabled, timeSignature]);
  const measureWidths = useMemo(
    () => measureModels.map((measure, index) => (
      Math.max(
        MIN_MEASURE_WIDTH,
        140 + measure.events.length * EVENT_WIDTH + (index === 0 ? FIRST_MEASURE_MODIFIER_WIDTH : 0)
      )
    )),
    [measureModels]
  );

  const clef = useMemo<SheetClef>(() => {
    if (!activeRegion) {
      return 'treble';
    }

    const notes = sheetMusicTrackScopeEnabled
      ? midiRegions.flatMap(region => region.getNotes())
      : activeRegion.getNotes();
    return resolveSheetClef(notes, instrument, true);
  }, [activeRegion, instrument, midiRegions, sheetMusicTrackScopeEnabled]);
  const drawSignature = useMemo(() => JSON.stringify({
    regionId: activeRegion?.getId() ?? null,
    regionIds: midiRegions.map(region => region.getId()),
    scope: sheetMusicTrackScopeEnabled ? 'track' : 'region',
    maxBars,
    bars: measureModels.length,
    clef,
    instrument,
    keySignature,
    quantization: quantization.raw,
    numerator: timeSignature.numerator,
    denominator: timeSignature.denominator,
    measureWidths,
    eventCounts: measureModels.map((measure) => measure.events.length),
  }), [activeRegion, clef, instrument, keySignature, maxBars, measureModels, measureWidths, midiRegions, quantization.raw, sheetMusicTrackScopeEnabled, timeSignature]);

  useEffect(() => {
    if (!activeRegion) {
      lastDrawSignatureRef.current = null;
      setMetrics((current) => (current.length === 0 ? current : []));
      setTiePaths((current) => (current.length === 0 ? current : []));
      onMetricsChange([]);
      return;
    }

    if (lastDrawSignatureRef.current === drawSignature) {
      return;
    }

    const nextMetrics = buildSheetMeasureMetrics(measureModels, measureWidths);
    const renderedEvents: RenderedSheetEvent[] = [];

    measureModels.forEach((measure, index) => {
      const host = measureHostRefs.current[index];
      if (!host) {
        return;
      }

      host.replaceChildren();
      host.style.width = `${measureWidths[index]}px`;
      host.style.height = `${STAFF_HEIGHT}px`;

      const width = measureWidths[index];
      const renderer = new Renderer(host, Renderer.Backends.SVG);
      renderer.resize(width, STAFF_HEIGHT);
      const context = renderer.getContext();
      const showLeadingModifiers = index === 0;
      const staveX = showLeadingModifiers ? 8 : 0;
      const staveWidth = Math.max(0, width - staveX);
      const stave = new Stave(staveX, 10, staveWidth);
      stave.setBegBarType(showLeadingModifiers ? BarlineType.SINGLE : BarlineType.NONE);
      stave.setEndBarType(BarlineType.SINGLE);
      if (showLeadingModifiers) {
        stave.addClef(clef);
        stave.addKeySignature(vexKeySignature);
        stave.addTimeSignature(`${timeSignature.numerator}/${timeSignature.denominator}`);
      }
      stave.setContext(context).draw();

      const notes = measure.events.map(event => createStaveNote(event, clef));
      const voice = new Voice({
        numBeats: timeSignature.numerator,
        beatValue: timeSignature.denominator,
      });
      voice.setStrict(false);
      voice.addTickables(notes);
      Accidental.applyAccidentals([voice], vexKeySignature);
      const beams = Beam.generateBeams(notes.filter(note => !note.isRest()));
      new Formatter().joinVoices([voice]).formatToStave([voice], stave, { stave });
      voice.draw(context, stave);
      beams.forEach((beam) => beam.setContext(context).draw());

      measure.events.forEach((event, eventIndex) => {
        const note = notes[eventIndex];
        if (event.isRest || !note) {
          return;
        }

        renderedEvents.push({
          barIndex: measure.barIndex,
          eventIndex,
          startBeat: event.startBeat,
          endBeat: event.endBeat,
          keys: [...event.keys],
          tieStart: event.tieStart,
          tieEnd: event.tieEnd,
          tieLeftX: note.getTieLeftX() + nextMetrics[index].leftPx,
          tieRightX: note.getTieRightX() + nextMetrics[index].leftPx,
          y: note.getYs()[0] ?? 0,
        });
      });

      const svg = host.querySelector('svg');
      if (svg instanceof SVGElement) {
        svg.style.display = 'block';
        svg.style.width = `${width}px`;
        svg.style.height = `${STAFF_HEIGHT}px`;
      }
    });

    const nextTiePaths = buildTiePaths(renderedEvents, nextMetrics);
    lastDrawSignatureRef.current = drawSignature;
    setMetrics((current) => {
      if (
        current.length === nextMetrics.length &&
        current.every((metric, index) => (
          metric.barIndex === nextMetrics[index].barIndex &&
          metric.startBeat === nextMetrics[index].startBeat &&
          metric.endBeat === nextMetrics[index].endBeat &&
          metric.leftPx === nextMetrics[index].leftPx &&
          metric.widthPx === nextMetrics[index].widthPx
        ))
      ) {
        return current;
      }

      return nextMetrics;
    });
    setTiePaths((current) => (
      current.length === nextTiePaths.length &&
        current.every((path, index) => path.id === nextTiePaths[index].id && path.d === nextTiePaths[index].d)
        ? current
        : nextTiePaths
    ));
    onMetricsChange(nextMetrics);
  }, [activeRegion, clef, drawSignature, instrument, measureModels, measureWidths, onMetricsChange, quantization.raw, timeSignature]);

  const handleHeaderClick = (event: React.MouseEvent<HTMLDivElement>) => {
    if (!activeRegion || !headerRef.current || metrics.length === 0) {
      return;
    }

    const rect = headerRef.current.getBoundingClientRect();
    const relativeX = event.clientX - rect.left;
    const metric = metrics.find(candidate => (
      relativeX >= candidate.leftPx && relativeX <= candidate.leftPx + candidate.widthPx
    ));

    if (!metric) {
      return;
    }

    const targetBeat = getSheetBeatAtPixel(relativeX, metrics);
    const absoluteBeat = sheetMusicTrackScopeEnabled
      ? targetBeat
      : activeRegion.getStartFromBeat() + targetBeat;

    setPlayheadPosition(absoluteBeat);
    requestMainContentScroll(absoluteBeat);
  };

  return (
    <div className="sheet-music-view" data-testid="sheet-music-view">
      <div className="sheet-music-header" ref={headerRef} onClick={handleHeaderClick}>
        {measureModels.map((measure, index) => (
          <div
            key={`sheet-header-${measure.barIndex}`}
            className="sheet-music-bar-number"
            style={{ width: metrics[index]?.widthPx ?? measureWidths[index] ?? MIN_MEASURE_WIDTH }}
          >
            {startingBarNumber + measure.barIndex}
          </div>
        ))}
      </div>
      <div className="sheet-music-strip">
        {/* <div className="sheet-music-notice">
          Sheet music view is under development and may not fully reflect the exact musical notation.
        </div> */}
        <div className="sheet-music-measures">
          <svg
            className="sheet-music-ties"
            width={measureWidths.reduce((sum, width) => sum + width, 0)}
            height={STAFF_HEIGHT}
            viewBox={`0 0 ${measureWidths.reduce((sum, width) => sum + width, 0)} ${STAFF_HEIGHT}`}
            aria-hidden="true"
          >
            {tiePaths.map((tiePath) => (
              <path key={tiePath.id} d={tiePath.d} className="sheet-music-tie-path" />
            ))}
          </svg>
          <SheetMusicPlayhead
            activeRegion={activeRegion}
            metrics={metrics}
            sheetMusicTrackScopeEnabled={sheetMusicTrackScopeEnabled}
          />
          {measureModels.map((measure, index) => (
            <div
              key={`sheet-measure-${measure.barIndex}`}
              className="sheet-music-measure"
              style={{
                width: measureWidths[index],
                height: STAFF_HEIGHT,
                position: 'relative',
              }}
            >
              <div
                className="sheet-music-measure-host"
                ref={(element) => {
                  measureHostRefs.current[index] = element;
                }}
              />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

interface SheetMusicPlayheadProps {
  activeRegion: KGMidiRegion | null;
  metrics: SheetMeasureMetric[];
  sheetMusicTrackScopeEnabled: boolean;
}

const SheetMusicPlayhead: React.FC<SheetMusicPlayheadProps> = memo(({
  activeRegion,
  metrics,
  sheetMusicTrackScopeEnabled,
}) => {
  const playheadPosition = useProjectStore(state => state.playheadPosition);

  const playheadPixel = useMemo(() => {
    if (!activeRegion) {
      return 0;
    }

    return getSheetPlayheadPixel(
      sheetMusicTrackScopeEnabled
        ? Math.max(0, playheadPosition)
        : Math.max(0, playheadPosition - activeRegion.getStartFromBeat()),
      metrics
    );
  }, [activeRegion, metrics, playheadPosition, sheetMusicTrackScopeEnabled]);

  return <Playhead context="piano-roll" pixelPositionOverride={playheadPixel} />;
});

const arePropsEqual = (previous: SheetMusicViewProps, next: SheetMusicViewProps) => {
  return (
    previous.activeRegion?.getId() === next.activeRegion?.getId() &&
    previous.activeRegion?.getName() === next.activeRegion?.getName() &&
    previous.activeRegion?.getLength() === next.activeRegion?.getLength() &&
    previous.activeRegion?.getStartFromBeat() === next.activeRegion?.getStartFromBeat() &&
    previous.midiRegions.length === next.midiRegions.length &&
    previous.midiRegions.every((region, index) => region.getId() === next.midiRegions[index]?.getId()) &&
    previous.maxBars === next.maxBars &&
    previous.sheetMusicTrackScopeEnabled === next.sheetMusicTrackScopeEnabled &&
    previous.instrument === next.instrument &&
    previous.keySignature === next.keySignature &&
    previous.quantization.raw === next.quantization.raw &&
    previous.timeSignature.numerator === next.timeSignature.numerator &&
    previous.timeSignature.denominator === next.timeSignature.denominator &&
    previous.onMetricsChange === next.onMetricsChange
  );
};

function createStaveNote(
  event: SheetMeasureModel['events'][number],
  clef: SheetClef
): StaveNote {
  const durationSpec = resolveDurationSpec(event.endBeat - event.startBeat, event.isRest);
  const note = new StaveNote({
    clef,
    keys: event.keys,
    duration: durationSpec.duration,
  });

  for (let dotIndex = 0; dotIndex < durationSpec.dots; dotIndex += 1) {
    Dot.buildAndAttach([note], { all: true });
  }

  return note;
}

export default memo(SheetMusicView, arePropsEqual);

function buildTiePaths(events: RenderedSheetEvent[], metrics: SheetMeasureMetric[]): SheetTiePath[] {
  const byStartBeat = new Map<number, RenderedSheetEvent[]>();

  events.forEach((event) => {
    const existing = byStartBeat.get(event.startBeat) ?? [];
    existing.push(event);
    byStartBeat.set(event.startBeat, existing);
  });

  return events
    .filter((event) => event.tieEnd)
    .map((event) => {
      const nextCandidates = byStartBeat.get(event.endBeat) ?? [];
      const nextEvent = nextCandidates.find((candidate) => (
        candidate.tieStart &&
        candidate.barIndex === event.barIndex + 1 &&
        candidate.keys.join(',') === event.keys.join(',')
      ));

      if (!nextEvent) {
        return null;
      }

      const currentMetric = metrics[event.barIndex];
      const nextMetric = metrics[nextEvent.barIndex];
      if (!currentMetric || !nextMetric) {
        return null;
      }

      const startX = Math.min(event.tieRightX, currentMetric.leftPx + currentMetric.widthPx - 4);
      const endX = Math.max(nextEvent.tieLeftX, nextMetric.leftPx + 4);
      const y = Math.max(event.y, nextEvent.y) + 10;
      const span = Math.max(endX - startX, 16);
      const controlY = y + Math.min(12, span * 0.18);
      const innerY = y + Math.min(8, span * 0.12);
      const d = [
        `M ${startX} ${y}`,
        `C ${startX + span * 0.25} ${controlY} ${endX - span * 0.25} ${controlY} ${endX} ${y}`,
        `C ${endX - span * 0.25} ${innerY} ${startX + span * 0.25} ${innerY} ${startX} ${y}`,
        'Z',
      ].join(' ');

      return {
        id: `${event.barIndex}-${event.eventIndex}-${nextEvent.barIndex}-${nextEvent.eventIndex}`,
        d,
      };
    })
    .filter((path): path is SheetTiePath => Boolean(path));
}
