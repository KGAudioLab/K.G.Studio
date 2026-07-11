export type NoteRankSelectionDirection = 'bottom-to-top' | 'top-to-bottom';

export interface NoteRankSelectionOptions {
  direction: NoteRankSelectionDirection;
  rank: number;
  interval: string;
}

export interface NoteRankSelectable {
  id: string;
  pitch: number;
  startBeat: number;
  endBeat: number;
}

export function getNoteRankSelectionInterval(interval: string): number | null {
  const denominator = Number(interval.split('/')[1]);
  return Number.isInteger(denominator) && denominator > 0 ? 4 / denominator : null;
}

/** Returns note IDs at the requested distinct pitch rank for every sampled region position. */
export function findNoteIdsByRank(
  notes: NoteRankSelectable[],
  regionLength: number,
  options: NoteRankSelectionOptions,
): Set<string> {
  const step = getNoteRankSelectionInterval(options.interval);
  if (step === null || !Number.isInteger(options.rank) || options.rank < 1 || regionLength <= 0) {
    return new Set();
  }

  const selectedIds = new Set<string>();
  const epsilon = step * 1e-9;
  for (let sampleBeat = 0; sampleBeat < regionLength - epsilon; sampleBeat += step) {
    const soundingNotes = notes.filter(note => note.startBeat <= sampleBeat + epsilon && note.endBeat > sampleBeat + epsilon);
    const pitches = [...new Set(soundingNotes.map(note => note.pitch))].sort((a, b) => (
      options.direction === 'bottom-to-top' ? a - b : b - a
    ));
    const selectedPitch = pitches[options.rank - 1];
    if (selectedPitch === undefined) continue;

    soundingNotes
      .filter(note => note.pitch === selectedPitch)
      .forEach(note => selectedIds.add(note.id));
  }

  return selectedIds;
}
