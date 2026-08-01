import { KGCore } from '../core/KGCore';
import { ImportChordRegionsCommand } from '../core/commands/region/ImportChordRegionsCommand';
import { KGMidiRegion } from '../core/region/KGMidiRegion';
import type { KGTrack } from '../core/track/KGTrack';
import { showChordToMidiImportOptions } from './dialogUtil';
import {
  CHORD_REGION_IMPORT_REGION_NAME,
  type ChordRegionImportPlan,
} from './chordRegionImportUtil';

export const CHORD_TO_MIDI_OVERLAP_MESSAGE =
  'A MIDI region already overlaps the selected chord range. How would you like to convert these chords?';

export interface ChordRegionImportExecutionResult {
  command: ImportChordRegionsCommand;
  affectedRegion: KGMidiRegion;
}

export function findBestOverlappingMidiRegion(
  track: KGTrack,
  startBeat: number,
  lengthInBeats: number,
): KGMidiRegion | null {
  const endBeat = startBeat + lengthInBeats;
  let bestRegion: KGMidiRegion | null = null;
  let bestOverlap = 0;
  let bestStart = Number.POSITIVE_INFINITY;

  track.getRegions().forEach(region => {
    if (!(region instanceof KGMidiRegion)) return;

    const regionStart = region.getStartFromBeat();
    const regionEnd = regionStart + region.getLength();
    const overlap = Math.min(regionEnd, endBeat) - Math.max(regionStart, startBeat);
    if (overlap <= 0) return;

    if (overlap > bestOverlap || (overlap === bestOverlap && regionStart < bestStart)) {
      bestRegion = region;
      bestOverlap = overlap;
      bestStart = regionStart;
    }
  });

  return bestRegion;
}

export async function runChordRegionImport(
  track: KGTrack,
  trackIndex: number,
  plan: ChordRegionImportPlan,
): Promise<ChordRegionImportExecutionResult | null> {
  const overlappingRegion = findBestOverlappingMidiRegion(track, plan.startBeat, plan.lengthInBeats);
  const action = overlappingRegion
    ? await showChordToMidiImportOptions(CHORD_TO_MIDI_OVERLAP_MESSAGE)
    : 'create';

  if (!action) return null;

  const command = new ImportChordRegionsCommand(
    track.getId().toString(),
    trackIndex,
    plan.startBeat,
    plan.lengthInBeats,
    plan.notes,
    action === 'create' ? CHORD_REGION_IMPORT_REGION_NAME : overlappingRegion?.getName() ?? CHORD_REGION_IMPORT_REGION_NAME,
    undefined,
    action,
    action === 'create' ? undefined : overlappingRegion?.getId(),
  );
  KGCore.instance().executeCommand(command, { rethrow: true });

  const affectedRegion = command.getAffectedRegion();
  if (!affectedRegion) {
    throw new Error('Chord import completed without an affected MIDI region.');
  }

  return { command, affectedRegion };
}
