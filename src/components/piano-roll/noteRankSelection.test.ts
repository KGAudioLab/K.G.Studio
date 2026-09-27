import { describe, expect, it } from 'vitest';
import { findNoteIdsByRank, getNoteRankSelectionInterval } from './noteRankSelection';
import { quarterNotesToTicks } from '../../core/timing';

const q = quarterNotesToTicks;
const note = (id: string, pitch: number, start: number, end: number) => ({
  id,
  pitch,
  startTick: q(start),
  endTick: q(end),
});

const chord = [
  note('c', 60, 0, 1),
  note('e', 64, 0, 1),
  note('g', 67, 0, 1),
];

describe('findNoteIdsByRank', () => {
  it('uses the same beat intervals as quantize length', () => {
    expect(getNoteRankSelectionInterval('1/16')).toBe(q(0.25));
    expect(getNoteRankSelectionInterval('1/1')).toBe(q(4));
  });

  it('selects the requested bottom-to-top distinct pitch rank', () => {
    expect(findNoteIdsByRank(chord, q(1), { direction: 'bottom-to-top', rank: 3, interval: '1/16', range: 'selected-only' }))
      .toEqual(new Set(['g']));
  });

  it('selects the requested top-to-bottom rank', () => {
    expect(findNoteIdsByRank(chord, q(1), { direction: 'top-to-bottom', rank: 1, interval: '1/16', range: 'selected-only' }))
      .toEqual(new Set(['g']));
  });

  it('selects all unison notes at the selected distinct pitch', () => {
    const notes = [...chord, note('c-unison', 60, 0, 1)];
    expect(findNoteIdsByRank(notes, q(1), { direction: 'bottom-to-top', rank: 1, interval: '1/16', range: 'selected-only' }))
      .toEqual(new Set(['c', 'c-unison']));
  });

  it('skips undersized sampled groups and respects note end and region end boundaries', () => {
    const notes = [
      note('c', 60, 0, 0.5),
      note('e', 64, 0, 0.5),
      note('end-only', 72, 1, 2),
    ];
    expect(findNoteIdsByRank(notes, q(1), { direction: 'bottom-to-top', rank: 2, interval: '1/4', range: 'selected-only' }))
      .toEqual(new Set(['e']));
  });

  it('detects independently at each sampling position', () => {
    const notes = [
      note('c', 60, 0, 0.5),
      note('e', 64, 0, 0.5),
      note('d', 62, 0.5, 1),
      note('f', 65, 0.5, 1),
    ];
    expect(findNoteIdsByRank(notes, q(1), { direction: 'bottom-to-top', rank: 2, interval: '1/8', range: 'selected-only' }))
      .toEqual(new Set(['e', 'f']));
  });

  it('selects the selected rank and all physically higher pitches', () => {
    expect(findNoteIdsByRank(chord, q(1), {
      direction: 'bottom-to-top', rank: 2, interval: '1/16', range: 'selected-and-above',
    })).toEqual(new Set(['e', 'g']));
  });

  it('selects the selected rank and all physically lower pitches', () => {
    expect(findNoteIdsByRank(chord, q(1), {
      direction: 'bottom-to-top', rank: 2, interval: '1/16', range: 'selected-and-below',
    })).toEqual(new Set(['c', 'e']));
  });

  it('uses physical pitch range independently of top-to-bottom ranking', () => {
    expect(findNoteIdsByRank(chord, q(1), {
      direction: 'top-to-bottom', rank: 2, interval: '1/16', range: 'selected-and-above',
    })).toEqual(new Set(['e', 'g']));
    expect(findNoteIdsByRank(chord, q(1), {
      direction: 'top-to-bottom', rank: 2, interval: '1/16', range: 'selected-and-below',
    })).toEqual(new Set(['c', 'e']));
  });
});
