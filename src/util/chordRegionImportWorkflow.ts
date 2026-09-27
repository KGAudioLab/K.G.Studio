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
  startTick: number,
  lengthTicks: number,
): KGMidiRegion | null {
  const endTick = startTick + lengthTicks;
  let bestRegion: KGMidiRegion | null = null;
  let bestOverlap = 0;
  let bestStart = Number.POSITIVE_INFINITY;

  track.getRegions().forEach(region => {
    if (!(region instanceof KGMidiRegion)) return;

    const regionStart = region.getStartTick();
    const regionEnd = regionStart + region.getLengthTicks();
    const overlap = Math.min(regionEnd, endTick) - Math.max(regionStart, startTick);
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
  const overlappingRegion = findBestOverlappingMidiRegion(track, plan.startTick, plan.lengthTicks);
  const action = overlappingRegion
    ? await showChordToMidiImportOptions(CHORD_TO_MIDI_OVERLAP_MESSAGE)
    : 'create';

  if (!action) return null;

  const command = new ImportChordRegionsCommand(
    track.getId().toString(),
    trackIndex,
    plan.startTick,
    plan.lengthTicks,
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
