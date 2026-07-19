import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { KGCore } from '../../core/KGCore';
import type { ChordGuideData } from '../../core/ChordGuideTypes';
import { KGPianoRollState } from '../../core/state/KGPianoRollState';
import { getMatchingChordGuideCandidatesForPitch } from '../../util/chordGuideDataUtil';
import chordGuideDataJson from '../../../public/resources/modes/chord_guide.json';

const chordGuideData = chordGuideDataJson as ChordGuideData;

vi.mock('../common', () => ({
  Playhead: ({ horizontalOffset }: { horizontalOffset?: number }) => (
    <div data-testid="piano-grid-playhead" data-horizontal-offset={horizontalOffset} />
  ),
}));

import PianoGrid from './PianoGrid';

describe('PianoGrid chord-guide hover candidate state', () => {
  beforeEach(() => {
    document.documentElement.style.setProperty('--region-grid-beat-width', '40');
    document.documentElement.style.setProperty('--region-piano-key-height', '20');
    KGCore.CHORD_GUIDE_DATA = structuredClone(chordGuideData);
    KGCore.FUNCTIONAL_CHORDS_DATA = {
      ionian: { steps: [2, 2, 1, 2, 2, 2, 1] },
      aeolian: { steps: [2, 1, 2, 2, 1, 2, 2] },
    } as unknown as typeof KGCore.FUNCTIONAL_CHORDS_DATA;
    KGPianoRollState.instance().setCurrentHoveredChordGuideCandidate(null);
    KGPianoRollState.instance().setCurrentMatchingChords([]);
    KGPianoRollState.instance().setCurrentSelectedChordIndex(0);
    KGPianoRollState.instance().setCurrentChordCursorPitch(null);
  });

  it('tracks the hovered candidate, updates on candidate cycling, and clears on mouse leave', async () => {
    const gridRef = { current: null as HTMLDivElement | null };
    const { container, getByTestId } = render(
      <PianoGrid
        gridRef={gridRef}
        onDoubleClick={() => {}}
        onClick={() => {}}
        onMouseDown={() => {}}
        isBoxSelecting={false}
        selectionBox={{ startX: 0, startY: 0, endX: 0, endY: 0 }}
        selectedMode="ionian"
        keySignature="C major"
        chordGuide="T"
        chordGuideKeySignature="C major"
        chordGuideMode="ionian"
      >
        {null}
      </PianoGrid>
    );

    expect(getByTestId('piano-grid-playhead')).toHaveAttribute('data-horizontal-offset', '-1');

    const pianoGrid = container.querySelector('.piano-grid') as HTMLDivElement;
    pianoGrid.getBoundingClientRect = () => ({
      left: 0,
      top: 0,
      width: 800,
      height: 1200,
      right: 800,
      bottom: 1200,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    });

    fireEvent.mouseMove(pianoGrid, { clientX: 10, clientY: 941 });

    const expectedCandidates = getMatchingChordGuideCandidatesForPitch(60, 'C major', 'ionian', 'T');
    expect(expectedCandidates.length).toBeGreaterThan(1);

    await waitFor(() => {
      expect(KGPianoRollState.instance().getCurrentHoveredChordGuideCandidate()).toMatchObject({
        name: expectedCandidates[0].item.name,
        resolvedNotes: expectedCandidates[0].item.resolvedNotes,
        note: expectedCandidates[0].item.note,
      });
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (window as any).__pianoGridSwitchChord(1);

    await waitFor(() => {
      expect(KGPianoRollState.instance().getCurrentHoveredChordGuideCandidate()).toMatchObject({
        name: expectedCandidates[1].item.name,
        resolvedNotes: expectedCandidates[1].item.resolvedNotes,
        note: expectedCandidates[1].item.note,
      });
    });

    fireEvent.mouseLeave(pianoGrid);

    await waitFor(() => {
      expect(KGPianoRollState.instance().getCurrentHoveredChordGuideCandidate()).toBeNull();
    });
  });

  it('does not offset the grid playhead when the piano-key gutter is absent', () => {
    const gridRef = { current: null as HTMLDivElement | null };
    const { getByTestId } = render(
      <PianoGrid
        gridRef={gridRef}
        onDoubleClick={() => {}}
        onClick={() => {}}
        onMouseDown={() => {}}
        isBoxSelecting={false}
        selectionBox={{ startX: 0, startY: 0, endX: 0, endY: 0 }}
        selectedMode="ionian"
        keySignature="C major"
        chordGuide="T"
        chordGuideKeySignature="C major"
        chordGuideMode="ionian"
        mode="audio-waveform"
      >
        {null}
      </PianoGrid>
    );

    expect(getByTestId('piano-grid-playhead')).toHaveAttribute('data-horizontal-offset', '0');
  });
});
