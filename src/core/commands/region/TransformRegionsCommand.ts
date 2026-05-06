import { KGCommand } from '../KGCommand';
import { KGCore } from '../../KGCore';
import { KGRegion } from '../../region/KGRegion';
import { KGMidiRegion } from '../../region/KGMidiRegion';
import { KGAudioRegion } from '../../region/KGAudioRegion';
import { KGTrack } from '../../track/KGTrack';
import { REGION_CONSTANTS } from '../../../constants';

interface RegionSnapshot {
  regionId: string;
  trackId: string;
  trackIndex: number;
  startBeat: number;
  length: number;
  clipStartOffsetSeconds?: number;
}

interface ProjectedRegionState extends RegionSnapshot {
  region: KGRegion;
}

interface NoteAdjustment {
  noteId: string;
  originalStartBeat: number;
  originalEndBeat: number;
}

interface PitchBendAdjustment {
  pitchBendId: string;
  originalBeat: number;
}

const EPSILON = 1e-9;

function getRegionById(tracks: KGTrack[], regionId: string): { region: KGRegion; track: KGTrack } | null {
  for (const track of tracks) {
    const region = track.getRegions().find(candidate => candidate.getId() === regionId);
    if (region) {
      return { region, track };
    }
  }
  return null;
}

function rangesOverlap(aStart: number, aLength: number, bStart: number, bLength: number): boolean {
  const aEnd = aStart + aLength;
  const bEnd = bStart + bLength;
  return aStart < bEnd - EPSILON && aEnd > bStart + EPSILON;
}

function validateNoProjectedOverlaps(projectedStates: ProjectedRegionState[], allTracks: KGTrack[]): void {
  const projectedById = new Map(projectedStates.map(state => [state.regionId, state]));

  for (const projectedState of projectedStates) {
    const targetTrack = allTracks.find(track => track.getId().toString() === projectedState.trackId);
    if (!targetTrack) {
      throw new Error('Unable to validate region movement because the target track was not found.');
    }

    for (const region of targetTrack.getRegions()) {
      const comparisonState = projectedById.get(region.getId()) ?? {
        regionId: region.getId(),
        trackId: region.getTrackId(),
        trackIndex: region.getTrackIndex(),
        startBeat: region.getStartFromBeat(),
        length: region.getLength(),
        clipStartOffsetSeconds: region instanceof KGAudioRegion ? region.getClipStartOffsetSeconds() : undefined,
        region,
      };

      if (comparisonState.regionId === projectedState.regionId) {
        continue;
      }

      if (rangesOverlap(projectedState.startBeat, projectedState.length, comparisonState.startBeat, comparisonState.length)) {
        throw new Error(`Cannot complete this edit because "${projectedState.region.getName()}" would overlap another region on its track.`);
      }
    }
  }
}

export class MoveMultipleRegionsCommand extends KGCommand {
  private readonly primaryRegionId: string;
  private readonly startBeatDelta: number;
  private readonly regionIdsToMove: string[];
  private originalStates: RegionSnapshot[] = [];
  private targetRegions: KGRegion[] = [];

  constructor(primaryRegionId: string, startBeatDelta: number, regionIdsToMove: string[]) {
    super();
    this.primaryRegionId = primaryRegionId;
    this.startBeatDelta = startBeatDelta;
    this.regionIdsToMove = [...regionIdsToMove];
  }

  execute(): void {
    const tracks = KGCore.instance().getCurrentProject().getTracks();
    const resolvedRegions = this.regionIdsToMove.map(regionId => {
      const resolved = getRegionById(tracks, regionId);
      if (!resolved) {
        throw new Error(`Region with ID ${regionId} not found.`);
      }
      return resolved;
    });

    if (!resolvedRegions.some(({ region }) => region.getId() === this.primaryRegionId)) {
      throw new Error(`Primary region with ID ${this.primaryRegionId} was not found in the selected set.`);
    }

    const projectedStates: ProjectedRegionState[] = resolvedRegions.map(({ region, track }) => {
      const newStartBeat = region.getStartFromBeat() + this.startBeatDelta;
      if (newStartBeat < -EPSILON) {
        throw new Error(`Cannot move regions because "${region.getName()}" would start before bar 1.`);
      }

      return {
        regionId: region.getId(),
        trackId: track.getId().toString(),
        trackIndex: track.getTrackIndex(),
        startBeat: Math.max(0, newStartBeat),
        length: region.getLength(),
        clipStartOffsetSeconds: region instanceof KGAudioRegion ? region.getClipStartOffsetSeconds() : undefined,
        region,
      };
    });

    validateNoProjectedOverlaps(projectedStates, tracks);

    this.originalStates = resolvedRegions.map(({ region, track }) => ({
      regionId: region.getId(),
      trackId: track.getId().toString(),
      trackIndex: track.getTrackIndex(),
      startBeat: region.getStartFromBeat(),
      length: region.getLength(),
      clipStartOffsetSeconds: region instanceof KGAudioRegion ? region.getClipStartOffsetSeconds() : undefined,
    }));
    this.targetRegions = resolvedRegions.map(({ region }) => region);

    projectedStates.forEach(projectedState => {
      projectedState.region.setStartFromBeat(projectedState.startBeat);
    });

    console.log(`Moved ${projectedStates.length} regions by ${this.startBeatDelta.toFixed(3)} beats`);
  }

  undo(): void {
    if (this.originalStates.length === 0) {
      throw new Error('Cannot undo: no regions were moved.');
    }

    this.originalStates.forEach(originalState => {
      const region = this.targetRegions.find(candidate => candidate.getId() === originalState.regionId);
      if (!region) {
        return;
      }
      region.setStartFromBeat(originalState.startBeat);
    });
  }

  getDescription(): string {
    return this.regionIdsToMove.length === 1
      ? 'Move region'
      : `Move ${this.regionIdsToMove.length} regions`;
  }
}

export class ResizeMultipleRegionsCommand extends KGCommand {
  private readonly primaryRegionId: string;
  private readonly resizeEdge: 'start' | 'end';
  private readonly primaryStartBeatDelta: number;
  private readonly primaryEndBeatDelta: number;
  private readonly regionIdsToResize: string[];
  private originalStates: RegionSnapshot[] = [];
  private targetRegions: KGRegion[] = [];
  private noteAdjustments = new Map<string, NoteAdjustment[]>();
  private pitchBendAdjustments = new Map<string, PitchBendAdjustment[]>();

  constructor(
    primaryRegionId: string,
    resizeEdge: 'start' | 'end',
    primaryStartBeatDelta: number,
    primaryEndBeatDelta: number,
    regionIdsToResize: string[]
  ) {
    super();
    this.primaryRegionId = primaryRegionId;
    this.resizeEdge = resizeEdge;
    this.primaryStartBeatDelta = primaryStartBeatDelta;
    this.primaryEndBeatDelta = primaryEndBeatDelta;
    this.regionIdsToResize = [...regionIdsToResize];
  }

  execute(): void {
    const project = KGCore.instance().getCurrentProject();
    const tracks = project.getTracks();
    const bpm = project.getBpm();
    const secondsPerBeat = 60 / bpm;

    const resolvedRegions = this.regionIdsToResize.map(regionId => {
      const resolved = getRegionById(tracks, regionId);
      if (!resolved) {
        throw new Error(`Region with ID ${regionId} not found.`);
      }
      return resolved;
    });

    if (!resolvedRegions.some(({ region }) => region.getId() === this.primaryRegionId)) {
      throw new Error(`Primary region with ID ${this.primaryRegionId} was not found in the selected set.`);
    }

    const projectedStates: ProjectedRegionState[] = resolvedRegions.map(({ region, track }) => {
      const startDelta = this.resizeEdge === 'start' ? this.primaryStartBeatDelta : 0;
      const endDelta = this.resizeEdge === 'end' ? this.primaryEndBeatDelta : 0;

      const newStartBeat = region.getStartFromBeat() + startDelta;
      const newLength = this.resizeEdge === 'start'
        ? region.getLength() - startDelta
        : region.getLength() + endDelta;

      if (newStartBeat < -EPSILON) {
        throw new Error(`Cannot resize regions because "${region.getName()}" would start before bar 1.`);
      }

      if (newLength < REGION_CONSTANTS.MIN_REGION_LENGTH - EPSILON) {
        throw new Error(`Cannot resize regions because "${region.getName()}" would become shorter than the minimum region length.`);
      }

      let clipStartOffsetSeconds = region instanceof KGAudioRegion ? region.getClipStartOffsetSeconds() : undefined;

      if (region instanceof KGAudioRegion) {
        const audioDuration = region.getAudioDurationSeconds();

        if (this.resizeEdge === 'start') {
          const beatOffset = newStartBeat - region.getStartFromBeat();
          const secondsDelta = beatOffset * secondsPerBeat;
          const nextOffset = region.getClipStartOffsetSeconds() + secondsDelta;

          if (nextOffset < -EPSILON) {
            throw new Error(`Cannot resize regions because "${region.getName()}" would extend before the start of its audio file.`);
          }

          clipStartOffsetSeconds = Math.min(nextOffset, audioDuration);
        }

        const effectiveOffset = clipStartOffsetSeconds ?? 0;
        const maxLengthInBeats = (audioDuration - effectiveOffset) / secondsPerBeat;
        if (newLength > maxLengthInBeats + EPSILON) {
          throw new Error(`Cannot resize regions because "${region.getName()}" would extend past the end of its audio file.`);
        }
      }

      return {
        regionId: region.getId(),
        trackId: track.getId().toString(),
        trackIndex: track.getTrackIndex(),
        startBeat: Math.max(0, newStartBeat),
        length: newLength,
        clipStartOffsetSeconds,
        region,
      };
    });

    validateNoProjectedOverlaps(projectedStates, tracks);

    this.originalStates = resolvedRegions.map(({ region, track }) => ({
      regionId: region.getId(),
      trackId: track.getId().toString(),
      trackIndex: track.getTrackIndex(),
      startBeat: region.getStartFromBeat(),
      length: region.getLength(),
      clipStartOffsetSeconds: region instanceof KGAudioRegion ? region.getClipStartOffsetSeconds() : undefined,
    }));
    this.targetRegions = resolvedRegions.map(({ region }) => region);
    this.noteAdjustments.clear();

    projectedStates.forEach(projectedState => {
      const region = projectedState.region;
      if (this.resizeEdge === 'start' && region instanceof KGMidiRegion) {
        const beatOffset = projectedState.startBeat - region.getStartFromBeat();
        const adjustments: NoteAdjustment[] = region.getNotes().map(note => ({
          noteId: note.getId(),
          originalStartBeat: note.getStartBeat(),
          originalEndBeat: note.getEndBeat(),
        }));
        this.noteAdjustments.set(region.getId(), adjustments);

        region.getNotes().forEach(note => {
          note.setStartBeat(note.getStartBeat() - beatOffset);
          note.setEndBeat(note.getEndBeat() - beatOffset);
        });
        this.pitchBendAdjustments.set(region.getId(), region.getPitchBends().map(pitchBend => ({
          pitchBendId: pitchBend.getId(),
          originalBeat: pitchBend.getBeat(),
        })));
        region.getPitchBends().forEach(pitchBend => {
          pitchBend.setBeat(pitchBend.getBeat() - beatOffset);
        });
      }

      if (region instanceof KGAudioRegion && projectedState.clipStartOffsetSeconds !== undefined) {
        region.setClipStartOffsetSeconds(projectedState.clipStartOffsetSeconds);
      }

      region.setStartFromBeat(projectedState.startBeat);
      region.setLength(projectedState.length);
    });

    console.log(`Resized ${projectedStates.length} regions from ${this.resizeEdge}`);
  }

  undo(): void {
    if (this.originalStates.length === 0) {
      throw new Error('Cannot undo: no regions were resized.');
    }

    this.originalStates.forEach(originalState => {
      const region = this.targetRegions.find(candidate => candidate.getId() === originalState.regionId);
      if (!region) {
        return;
      }

      if (region instanceof KGMidiRegion) {
        const adjustments = this.noteAdjustments.get(region.getId()) ?? [];
        adjustments.forEach(adjustment => {
          const note = region.getNotes().find(candidate => candidate.getId() === adjustment.noteId);
          if (note) {
            note.setStartBeat(adjustment.originalStartBeat);
            note.setEndBeat(adjustment.originalEndBeat);
          }
        });
        const pitchBendAdjustments = this.pitchBendAdjustments.get(region.getId()) ?? [];
        pitchBendAdjustments.forEach(adjustment => {
          const pitchBend = region.getPitchBends().find(candidate => candidate.getId() === adjustment.pitchBendId);
          if (pitchBend) {
            pitchBend.setBeat(adjustment.originalBeat);
          }
        });
      }

      if (region instanceof KGAudioRegion && originalState.clipStartOffsetSeconds !== undefined) {
        region.setClipStartOffsetSeconds(originalState.clipStartOffsetSeconds);
      }

      region.setStartFromBeat(originalState.startBeat);
      region.setLength(originalState.length);
    });
  }

  getDescription(): string {
    return this.regionIdsToResize.length === 1
      ? `Resize region from ${this.resizeEdge}`
      : `Resize ${this.regionIdsToResize.length} regions from ${this.resizeEdge}`;
  }
}
