import React from 'react';
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import PianoRollAutomationLane from './PianoRollAutomationLane';
import { KGMidiControllerEvent } from '../../core/midi/KGMidiControllerEvent';
import {
  createMockMidiControllerEvent,
  createMockMidiPitchBend,
  createMockMidiRegion,
} from '../../test/utils/mock-data';

describe('PianoRollAutomationLane', () => {
  it('renders pitch bend points with signed labels', () => {
    const region = createMockMidiRegion({
      startFromBeat: 4,
      pitchBends: [
        createMockMidiPitchBend({ id: 'bend-1', beat: 0.5, value: 8192 }),
        createMockMidiPitchBend({ id: 'bend-2', beat: 1.5, value: 12288 }),
      ],
    });

    render(
      <PianoRollAutomationLane
        activeRegion={region}
        automationType="pitch-bend"
        maxBars={8}
        timeSignature={{ numerator: 4, denominator: 4 }}
      />
    );

    expect(screen.getByLabelText('Pitch Bend automation lane')).toBeInTheDocument();
    expect(screen.getByText('0')).toBeInTheDocument();
    expect(screen.getByText('4096')).toBeInTheDocument();
    expect(document.querySelector('.piano-roll-automation-line')).not.toBeNull();
  });

  it('renders controller values for the selected CC bucket', () => {
    const controllerEventsByType: KGMidiControllerEvent[][] = Array.from({ length: 128 }, () => []);
    controllerEventsByType[7] = [
      createMockMidiControllerEvent({ id: 'cc7-1', beat: 0.25, value: 57 }),
      createMockMidiControllerEvent({ id: 'cc7-2', beat: 2, value: 82 }),
    ];

    const region = createMockMidiRegion({
      startFromBeat: 0,
      controllerEventsByType,
    });

    render(
      <PianoRollAutomationLane
        activeRegion={region}
        automationType="cc-7"
        maxBars={8}
        timeSignature={{ numerator: 4, denominator: 4 }}
      />
    );

    expect(screen.getByLabelText('CC7 automation lane')).toBeInTheDocument();
    expect(screen.getByText('57')).toBeInTheDocument();
    expect(screen.getByText('82')).toBeInTheDocument();
  });

  it('shows an empty lane shell when the selected automation type has no events', () => {
    const region = createMockMidiRegion();

    render(
      <PianoRollAutomationLane
        activeRegion={region}
        automationType="cc-64"
        maxBars={8}
        timeSignature={{ numerator: 4, denominator: 4 }}
      />
    );

    expect(screen.getByText('No CC64 events in this region')).toBeInTheDocument();
  });

  it('renders step-style hold segments for non-interpolatable automation', () => {
    const controllerEventsByType: KGMidiControllerEvent[][] = Array.from({ length: 128 }, () => []);
    controllerEventsByType[64] = [
      createMockMidiControllerEvent({ id: 'cc64-1', beat: 0.5, value: 127 }),
      createMockMidiControllerEvent({ id: 'cc64-2', beat: 2, value: 0 }),
    ];

    const region = createMockMidiRegion({
      startFromBeat: 0,
      controllerEventsByType,
    });

    const { container } = render(
      <PianoRollAutomationLane
        activeRegion={region}
        automationType="cc-64"
        maxBars={8}
        timeSignature={{ numerator: 4, denominator: 4 }}
      />
    );

    expect(container.querySelector('.piano-roll-automation-line')).not.toBeNull();
    expect(container.querySelector('polyline.piano-roll-automation-line')).toBeNull();
    expect(container.querySelectorAll('line.piano-roll-automation-line')).toHaveLength(2);
  });
});
