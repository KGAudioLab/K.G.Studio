import { describe, expect, it } from 'vitest';
import { findNoteIdsByRank, getNoteRankSelectionInterval } from './noteRankSelection';

const chord = [
  { id: 'c', pitch: 60, startBeat: 0, endBeat: 1 },
  { id: 'e', pitch: 64, startBeat: 0, endBeat: 1 },
  { id: 'g', pitch: 67, startBeat: 0, endBeat: 1 },
];

describe('findNoteIdsByRank', () => {
  it('uses the same beat intervals as quantize length', () => {
    expect(getNoteRankSelectionInterval('1/16')).toBe(0.25);
    expect(getNoteRankSelectionInterval('1/1')).toBe(4);
  });

  it('selects the requested bottom-to-top distinct pitch rank', () => {
    expect(findNoteIdsByRank(chord, 1, { direction: 'bottom-to-top', rank: 3, interval: '1/16', range: 'selected-only' }))
      .toEqual(new Set(['g']));
  });

  it('selects the requested top-to-bottom rank', () => {
    expect(findNoteIdsByRank(chord, 1, { direction: 'top-to-bottom', rank: 1, interval: '1/16', range: 'selected-only' }))
      .toEqual(new Set(['g']));
  });

  it('selects all unison notes at the selected distinct pitch', () => {
    const notes = [...chord, { id: 'c-unison', pitch: 60, startBeat: 0, endBeat: 1 }];
    expect(findNoteIdsByRank(notes, 1, { direction: 'bottom-to-top', rank: 1, interval: '1/16', range: 'selected-only' }))
      .toEqual(new Set(['c', 'c-unison']));
  });

  it('skips undersized sampled groups and respects note end and region end boundaries', () => {
    const notes = [
      { id: 'c', pitch: 60, startBeat: 0, endBeat: 0.5 },
      { id: 'e', pitch: 64, startBeat: 0, endBeat: 0.5 },
      { id: 'end-only', pitch: 72, startBeat: 1, endBeat: 2 },
    ];
    expect(findNoteIdsByRank(notes, 1, { direction: 'bottom-to-top', rank: 2, interval: '1/4', range: 'selected-only' }))
      .toEqual(new Set(['e']));
  });

  it('detects independently at each sampling position', () => {
    const notes = [
      { id: 'c', pitch: 60, startBeat: 0, endBeat: 0.5 },
      { id: 'e', pitch: 64, startBeat: 0, endBeat: 0.5 },
      { id: 'd', pitch: 62, startBeat: 0.5, endBeat: 1 },
      { id: 'f', pitch: 65, startBeat: 0.5, endBeat: 1 },
    ];
    expect(findNoteIdsByRank(notes, 1, { direction: 'bottom-to-top', rank: 2, interval: '1/8', range: 'selected-only' }))
      .toEqual(new Set(['e', 'f']));
  });

  it('selects the selected rank and all physically higher pitches', () => {
    expect(findNoteIdsByRank(chord, 1, {
      direction: 'bottom-to-top', rank: 2, interval: '1/16', range: 'selected-and-above',
    })).toEqual(new Set(['e', 'g']));
  });

  it('selects the selected rank and all physically lower pitches', () => {
    expect(findNoteIdsByRank(chord, 1, {
      direction: 'bottom-to-top', rank: 2, interval: '1/16', range: 'selected-and-below',
    })).toEqual(new Set(['c', 'e']));
  });

  it('uses physical pitch range independently of top-to-bottom ranking', () => {
    expect(findNoteIdsByRank(chord, 1, {
      direction: 'top-to-bottom', rank: 2, interval: '1/16', range: 'selected-and-above',
    })).toEqual(new Set(['e', 'g']));
    expect(findNoteIdsByRank(chord, 1, {
      direction: 'top-to-bottom', rank: 2, interval: '1/16', range: 'selected-and-below',
    })).toEqual(new Set(['c', 'e']));
  });
});
