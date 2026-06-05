import { KGCommand } from '../KGCommand';
import { KGCore } from '../../KGCore';
import { GlobalTrackType } from '../../global-track';
import { KGMarkerRegion } from '../../region/KGMarkerRegion';
import { findGlobalTrackByType } from '../../../util/globalTrackUtil';
import { generateUniqueId } from '../../../util/miscUtil';

export interface WriteMarkerEntry {
  startBeat: number;
  length: number;
  name: string;
}

function cloneMarkerRegion(region: KGMarkerRegion): KGMarkerRegion {
  return new KGMarkerRegion(
    region.getId(),
    region.getTrackId(),
    region.getTrackIndex(),
    region.getName(),
    region.getStartFromBeat(),
    region.getLength(),
  );
}

function cloneMarkerRegions(regions: KGMarkerRegion[]): KGMarkerRegion[] {
  return regions.map(cloneMarkerRegion);
}

export class WriteMarkersCommand extends KGCommand {
  private readonly replacements: WriteMarkerEntry[];
  private originalRegions: KGMarkerRegion[] | null = null;
  private nextRegions: KGMarkerRegion[] | null = null;

  constructor(replacements: WriteMarkerEntry[]) {
    super();
    this.replacements = replacements.map(replacement => ({
      startBeat: replacement.startBeat,
      length: replacement.length,
      name: replacement.name,
    }));
  }

  execute(): void {
    const project = KGCore.instance().getCurrentProject();
    const markerTrack = findGlobalTrackByType(project, GlobalTrackType.Marker);
    if (!markerTrack) {
      throw new Error('Marker global track not found');
    }

    if (this.nextRegions) {
      markerTrack.setRegions(cloneMarkerRegions(this.nextRegions));
      return;
    }

    const currentRegions = markerTrack.getRegions()
      .filter((region): region is KGMarkerRegion => region instanceof KGMarkerRegion)
      .sort((left, right) => left.getStartFromBeat() - right.getStartFromBeat());

    const sortedReplacements = [...this.replacements].sort((left, right) => left.startBeat - right.startBeat);
    this.originalRegions = cloneMarkerRegions(currentRegions);

    const preservedRegions: KGMarkerRegion[] = [];
    for (const region of currentRegions) {
      const regionStart = region.getStartFromBeat();
      const regionEnd = regionStart + region.getLength();
      const overlappingReplacements = sortedReplacements.filter(replacement => (
        replacement.startBeat < regionEnd
        && replacement.startBeat + replacement.length > regionStart
      ));

      if (overlappingReplacements.length === 0) {
        preservedRegions.push(cloneMarkerRegion(region));
        continue;
      }

      let cursor = regionStart;
      let fragmentIndex = 0;
      for (const replacement of overlappingReplacements) {
        const replacementStart = Math.max(regionStart, replacement.startBeat);
        const replacementEnd = Math.min(regionEnd, replacement.startBeat + replacement.length);
        if (replacementStart > cursor) {
          preservedRegions.push(new KGMarkerRegion(
            fragmentIndex === 0 ? region.getId() : generateUniqueId('KGMarkerRegion'),
            region.getTrackId(),
            region.getTrackIndex(),
            region.getName(),
            cursor,
            replacementStart - cursor,
          ));
          fragmentIndex += 1;
        }
        cursor = Math.max(cursor, replacementEnd);
      }

      if (cursor < regionEnd) {
        preservedRegions.push(new KGMarkerRegion(
          fragmentIndex === 0 ? region.getId() : generateUniqueId('KGMarkerRegion'),
          region.getTrackId(),
          region.getTrackIndex(),
          region.getName(),
          cursor,
          regionEnd - cursor,
        ));
      }
    }

    const replacementRegions = sortedReplacements.map(replacement => new KGMarkerRegion(
      generateUniqueId('KGMarkerRegion'),
      markerTrack.getId(),
      markerTrack.getTrackIndex(),
      replacement.name,
      replacement.startBeat,
      replacement.length,
    ));

    this.nextRegions = [...preservedRegions, ...replacementRegions]
      .sort((left, right) => left.getStartFromBeat() - right.getStartFromBeat());

    markerTrack.setRegions(cloneMarkerRegions(this.nextRegions));
  }

  undo(): void {
    if (!this.originalRegions) {
      throw new Error('Cannot undo marker write without original regions');
    }

    const project = KGCore.instance().getCurrentProject();
    const markerTrack = findGlobalTrackByType(project, GlobalTrackType.Marker);
    if (!markerTrack) {
      throw new Error('Marker global track not found during undo');
    }

    markerTrack.setRegions(cloneMarkerRegions(this.originalRegions));
  }

  getDescription(): string {
    return 'Write markers';
  }
}
