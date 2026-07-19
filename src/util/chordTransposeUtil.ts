import type { KGProject, KeySignature } from '../core/KGProject';
import { KEY_SIGNATURE_MAP } from '../constants/coreConstants';
import { GlobalTrackType, type KGGlobalTrack } from '../core/global-track';
import { KGChordRegion } from '../core/region/KGChordRegion';
import { buildChordSymbol, parseChordSymbol } from './chordUtil';
import { findGlobalTrackByType } from './globalTrackUtil';
import { generateUniqueId } from './miscUtil';
import { noteNameToPitchClass } from './scaleUtil';

const SHARP_ROOTS = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const FLAT_ROOTS = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];

function cloneChordRegion(region: KGChordRegion): KGChordRegion {
  return new KGChordRegion(
    region.getId(),
    region.getTrackId(),
    region.getTrackIndex(),
    region.getSymbol(),
    region.getStartFromBeat(),
    region.getLength(),
  );
}

function cloneChordRegions(regions: KGChordRegion[]): KGChordRegion[] {
  return regions.map(cloneChordRegion);
}

function prefersFlats(keySignature: KeySignature): boolean {
  return KEY_SIGNATURE_MAP[keySignature].flats > 0;
}

export function transposeChordSymbol(symbol: string, semitones: number, targetKey: KeySignature): string {
  const descriptor = parseChordSymbol(symbol);
  if (!descriptor) throw new Error(`Cannot transpose invalid chord symbol "${symbol}".`);
  const pitchClass = (noteNameToPitchClass(descriptor.root) + semitones + 120) % 12;
  const root = (prefersFlats(targetKey) ? FLAT_ROOTS : SHARP_ROOTS)[pitchClass];
  const transposed = buildChordSymbol({ ...descriptor, root });
  if (!transposed) throw new Error(`Cannot transpose chord symbol "${symbol}".`);
  return transposed;
}

export function hasChordRegionsInTracks(
  globalTracks: KGGlobalTrack[],
  scope?: { startBeat: number; endBeat: number },
): boolean {
  const chordTrack = globalTracks.find(track => track.getType() === GlobalTrackType.Chord);
  if (!chordTrack) return false;
  return chordTrack.getRegions().some(region => {
    if (!(region instanceof KGChordRegion)) return false;
    if (!scope) return true;
    const start = region.getStartFromBeat();
    const end = start + region.getLength();
    return start < scope.endBeat && end > scope.startBeat;
  });
}

export function hasChordRegionsInRange(project: KGProject, scope?: { startBeat: number; endBeat: number }): boolean {
  return hasChordRegionsInTracks(project.getGlobalTracks(), scope);
}

export interface ChordTransposePlan {
  apply: () => void;
  undo: () => void;
}

export function buildChordTransposePlan(
  project: KGProject,
  semitones: number,
  targetKey: KeySignature,
  scope?: { startBeat: number; endBeat: number },
): ChordTransposePlan {
  const chordTrack = findGlobalTrackByType(project, GlobalTrackType.Chord);
  if (!chordTrack) throw new Error('Chord global track not found.');
  const original = chordTrack.getRegions()
    .filter((region): region is KGChordRegion => region instanceof KGChordRegion)
    .map(cloneChordRegion);
  if (semitones === 0) {
    return { apply: () => undefined, undo: () => undefined };
  }
  const next: KGChordRegion[] = [];

  for (const region of original) {
    const start = region.getStartFromBeat();
    const end = start + region.getLength();
    const overlapStart = scope ? Math.max(start, scope.startBeat) : start;
    const overlapEnd = scope ? Math.min(end, scope.endBeat) : end;
    if (overlapStart >= overlapEnd) {
      next.push(cloneChordRegion(region));
      continue;
    }

    const transposedSymbol = transposeChordSymbol(region.getSymbol(), semitones, targetKey);
    if (start < overlapStart) {
      next.push(new KGChordRegion(region.getId(), region.getTrackId(), region.getTrackIndex(), region.getSymbol(), start, overlapStart - start));
    }
    next.push(new KGChordRegion(
      start < overlapStart ? generateUniqueId('KGChordRegion') : region.getId(),
      region.getTrackId(),
      region.getTrackIndex(),
      transposedSymbol,
      overlapStart,
      overlapEnd - overlapStart,
    ));
    if (overlapEnd < end) {
      next.push(new KGChordRegion(
        generateUniqueId('KGChordRegion'),
        region.getTrackId(),
        region.getTrackIndex(),
        region.getSymbol(),
        overlapEnd,
        end - overlapEnd,
      ));
    }
  }

  const sortedNext = next.sort((left, right) => left.getStartFromBeat() - right.getStartFromBeat());
  return {
    apply: () => chordTrack.setRegions(cloneChordRegions(sortedNext)),
    undo: () => chordTrack.setRegions(cloneChordRegions(original)),
  };
}
