import React, { useEffect, useMemo, useRef, useState } from 'react';
import { KGMidiRegion } from '../../core/region/KGMidiRegion';
import {
  MIDI_PITCH_BEND_MAX,
  MIDI_PITCH_BEND_MIN,
  midiPitchBendToSignedValue,
} from '../../util/midiUtil';
import {
  getAutomationInterpolationMode,
  getControllerNumberForAutomationType,
  PIANO_ROLL_AUTOMATION_OPTIONS,
  type PianoRollAutomationType,
} from './pianoRollAutomation';

interface AutomationPoint {
  id: string;
  absoluteBeat: number;
  value: number;
  label: string;
}

interface PianoRollAutomationLaneProps {
  activeRegion: KGMidiRegion | null;
  automationType: PianoRollAutomationType;
  maxBars: number;
  timeSignature: { numerator: number; denominator: number };
  bpm?: number;
  redrawVersion?: number;
}

const AUTOMATION_COLOR = '#87CEFA';
const LANE_PADDING_Y = 16;
const MIN_LANE_HEIGHT = 160;

const PianoRollAutomationLane: React.FC<PianoRollAutomationLaneProps> = ({
  activeRegion,
  automationType,
  maxBars,
  timeSignature,
  redrawVersion = 0,
}) => {
  const laneRef = useRef<HTMLDivElement | null>(null);
  const [laneHeight, setLaneHeight] = useState(MIN_LANE_HEIGHT);
  const beatWidth = parseInt(getComputedStyle(document.documentElement).getPropertyValue('--region-grid-beat-width')) || 40;
  const keyWidth = parseInt(getComputedStyle(document.documentElement).getPropertyValue('--region-piano-key-width')) || 60;

  useEffect(() => {
    const element = laneRef.current;
    if (!element) {
      return;
    }

    const updateHeight = () => {
      setLaneHeight(Math.max(Math.round(element.clientHeight), MIN_LANE_HEIGHT));
    };

    updateHeight();

    const observer = new ResizeObserver(() => {
      updateHeight();
    });
    observer.observe(element);

    return () => {
      observer.disconnect();
    };
  }, []);

  const points = useMemo<AutomationPoint[]>(() => {
    if (!activeRegion) {
      return [];
    }

    const regionStartBeat = activeRegion.getStartFromBeat();
    if (automationType === 'pitch-bend') {
      return activeRegion.getPitchBends().map((pitchBend) => ({
        id: pitchBend.getId(),
        absoluteBeat: regionStartBeat + pitchBend.getBeat(),
        value: pitchBend.getValue(),
        label: `${midiPitchBendToSignedValue(pitchBend.getValue())}`,
      }));
    }

    const controller = getControllerNumberForAutomationType(automationType);
    if (controller === null) {
      return [];
    }

    return activeRegion.getControllerEvents(controller).map((event) => ({
      id: event.getId(),
      absoluteBeat: regionStartBeat + event.getBeat(),
      value: event.getValue(),
      label: `${event.getValue()}`,
    }));
  }, [activeRegion, automationType, redrawVersion]);

  const selectedOption = PIANO_ROLL_AUTOMATION_OPTIONS.find(option => option.value === automationType);
  const laneLabel = selectedOption?.label ?? automationType;
  const interpolationMode = getAutomationInterpolationMode(automationType);
  const totalBeats = maxBars * timeSignature.numerator;
  const totalWidth = 'calc(var(--max-number-of-bars) * var(--region-grid-bar-width) + var(--region-piano-key-width))';

  const toY = (value: number): number => {
    const minValue = automationType === 'pitch-bend' ? MIDI_PITCH_BEND_MIN : 0;
    const maxValue = automationType === 'pitch-bend' ? MIDI_PITCH_BEND_MAX : 127;
    const usableHeight = laneHeight - LANE_PADDING_Y * 2;
    const normalized = (value - minValue) / (maxValue - minValue);
    return laneHeight - LANE_PADDING_Y - normalized * usableHeight;
  };

  const svgPoints = points.map(point => {
    return {
      ...point,
      x: point.absoluteBeat * beatWidth + keyWidth,
      y: toY(point.value),
    };
  });

  const polylinePoints = (() => {
    if (interpolationMode === 'step') {
      return '';
    }

    if (svgPoints.length === 0) {
      return '';
    }

    const renderedPoints = [...svgPoints];
    const lastPoint = renderedPoints[renderedPoints.length - 1];
    renderedPoints.push({
      ...lastPoint,
      id: `${lastPoint.id}-tail`,
      x: beatWidth * totalBeats + keyWidth,
    });

    return renderedPoints
      .map(point => `${point.x},${point.y}`)
      .join(' ');
  })();

  const stepSegments = (() => {
    if (interpolationMode !== 'step' || svgPoints.length === 0) {
      return [];
    }

    return svgPoints.map((point, index) => ({
      id: `${point.id}-step`,
      x1: point.x,
      y1: point.y,
      x2: index < svgPoints.length - 1 ? svgPoints[index + 1].x : beatWidth * totalBeats + keyWidth,
    }));
  })();

  return (
    <div
      className="piano-roll-automation-lane"
      data-testid="piano-roll-automation-lane"
      aria-label={`${laneLabel} automation lane`}
      ref={laneRef}
    >
      <div className="piano-roll-automation-track" style={{ width: totalWidth }}>
        <div className="piano-roll-automation-gutter" />
        <div className="piano-roll-automation-grid" />
        <div className="piano-roll-automation-lane-label">{laneLabel}</div>
        <svg
          className="piano-roll-automation-svg"
          width="100%"
          height={laneHeight}
          viewBox={`0 0 ${beatWidth * totalBeats + keyWidth} ${laneHeight}`}
          preserveAspectRatio="none"
        >
          {interpolationMode === 'linear' && points.length > 0 && (
            <polyline
              className="piano-roll-automation-line"
              fill="none"
              stroke={AUTOMATION_COLOR}
              strokeWidth="2"
              points={polylinePoints}
            />
          )}
          {interpolationMode === 'step' && stepSegments.map(segment => (
            <line
              key={segment.id}
              className="piano-roll-automation-line"
              x1={segment.x1}
              y1={segment.y1}
              x2={segment.x2}
              y2={segment.y1}
              stroke={AUTOMATION_COLOR}
              strokeWidth="2"
            />
          ))}
          {svgPoints.map(point => {
            const labelY = Math.max(14, Math.min(laneHeight - 6, point.y - 10));

            return (
              <g key={point.id}>
                <circle
                  className="piano-roll-automation-point"
                  cx={point.x}
                  cy={point.y}
                  r="5"
                  fill={AUTOMATION_COLOR}
                  stroke="#1d2428"
                  strokeWidth="2"
                />
                <text
                  className="piano-roll-automation-value"
                  x={point.x + 6}
                  y={labelY}
                  fill={AUTOMATION_COLOR}
                >
                  {point.label}
                </text>
              </g>
            );
          })}
        </svg>
        {points.length === 0 && (
          <div className="piano-roll-automation-empty-state">
            No {laneLabel} events in this region
          </div>
        )}
      </div>
    </div>
  );
};

export default PianoRollAutomationLane;
