import React from 'react';
import { act, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import StatusBar, { formatChordGuideCandidateStatus } from './StatusBar';
import { KGPianoRollState } from '../core/state/KGPianoRollState';
import { KGCore } from '../core/KGCore';
import type { ChordGuideData } from '../core/ChordGuideTypes';
import { resolveChordGuideItems } from '../util/chordGuideDataUtil';
import type { ResolvedChordGuideItem } from '../core/ChordGuideTypes';
import chordGuideDataJson from '../../public/resources/modes/chord_guide.json';

const chordGuideData = chordGuideDataJson as ChordGuideData;

const storeState = {
  currentStatus: 'Ready',
};

type StoreState = typeof storeState;
type StoreSelector = (state: StoreState) => unknown;

vi.mock('../stores/projectStore', () => ({
  useProjectStore: Object.assign(
    (selector?: StoreSelector) => (selector ? selector(storeState) : storeState),
    { getState: () => storeState }
  ),
}));

describe('StatusBar', () => {
  beforeEach(() => {
    vi.stubGlobal('__APP_VERSION__', 'test-version');
    storeState.currentStatus = 'Ready';
    KGCore.CHORD_GUIDE_DATA = structuredClone(chordGuideData);
    KGPianoRollState.instance().setCurrentHoveredChordGuideCandidate(null);
  });

  it('shows the normal status when no chord-guide candidate is hovered', () => {
    render(<StatusBar />);

    expect(screen.getByText('Ready')).toBeTruthy();
  });

  it('shows hovered chord-guide candidate text and restores the prior status when cleared', () => {
    render(<StatusBar />);

    const hoveredCandidate: ResolvedChordGuideItem = {
      name: 'Dm7',
      roman: 'ii7',
      notes: ['D', 'F', 'A', 'C'],
      source: 'Diatonic',
      note: 'Core ii-V-I predominant sonority.',
      resolvedNotes: ['D', 'F', 'A', 'C'],
      pitchClasses: [2, 5, 9, 12],
    };

    act(() => {
      KGPianoRollState.instance().setCurrentHoveredChordGuideCandidate(hoveredCandidate);
    });

    expect(screen.getByText(formatChordGuideCandidateStatus(hoveredCandidate))).toBeTruthy();

    act(() => {
      KGPianoRollState.instance().setCurrentHoveredChordGuideCandidate(null);
    });

    expect(screen.getByText('Ready')).toBeTruthy();
  });

  it('uses resolved notes from the current key signature in the status text', () => {
    const transposedCandidate = resolveChordGuideItems('D major', 'ionian', 'T')[0];

    render(<StatusBar />);

    act(() => {
      KGPianoRollState.instance().setCurrentHoveredChordGuideCandidate(transposedCandidate);
    });

    expect(screen.getByText(formatChordGuideCandidateStatus(transposedCandidate))).toBeTruthy();
  });
});
