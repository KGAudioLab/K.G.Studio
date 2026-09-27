import { KGCommand } from '../KGCommand';
import { KGCore } from '../../KGCore';
import { KGRegion } from '../../region/KGRegion';
import { KGMidiRegion } from '../../region/KGMidiRegion';
import { KGAudioRegion } from '../../region/KGAudioRegion';
import { KGTrack } from '../../track/KGTrack';
import { REGION_CONSTANTS } from '../../../constants';
import { secondsToTick, tickToSeconds } from '../../../util/globalTrackUtil';

interface RegionSnapshot {
  regionId: string;
  trackId: string;
  trackIndex: number;
  startTick: number;
  length: number;
  clipStartOffsetSeconds?: number;
}

interface ProjectedRegionState extends RegionSnapshot {
  region: KGRegion;
}

interface NoteAdjustment {
  noteId: string;
  originalStartTick: number;
  originalEndTick: number;
}

interface PitchBendAdjustment {
  pitchBendId: string;
  originalTick: number;
}

interface ControllerEventAdjustment {
  controller: number;
  controllerEventId: string;
  originalTick: number;
}

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
  return aStart < bEnd && aEnd > bStart;
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
        startTick: region.getStartTick(),
        length: region.getLengthTicks(),
        clipStartOffsetSeconds: region instanceof KGAudioRegion ? region.getClipStartOffsetSeconds() : undefined,
        region,
      };

      if (comparisonState.regionId === projectedState.regionId) {
        continue;
      }

      if (rangesOverlap(projectedState.startTick, projectedState.length, comparisonState.startTick, comparisonState.length)) {
        throw new Error(`Cannot complete this edit because "${projectedState.region.getName()}" would overlap another region on its track.`);
      }
    }
  }
}

export class MoveMultipleRegionsCommand extends KGCommand {
  private readonly primaryRegionId: string;
  private readonly startTickDelta: number;
  private readonly regionIdsToMove: string[];
  private originalStates: RegionSnapshot[] = [];
  private targetRegions: KGRegion[] = [];

  constructor(primaryRegionId: string, startTickDelta: number, regionIdsToMove: string[]) {
    super();
    this.primaryRegionId = primaryRegionId;
    this.startTickDelta = startTickDelta;
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
      const newStartTick = region.getStartTick() + this.startTickDelta;
      if (newStartTick < 0) {
        throw new Error(`Cannot move regions because "${region.getName()}" would start before bar 1.`);
      }

      return {
        regionId: region.getId(),
        trackId: track.getId().toString(),
        trackIndex: track.getTrackIndex(),
        startTick: Math.max(0, newStartTick),
        length: region.getLengthTicks(),
        clipStartOffsetSeconds: region instanceof KGAudioRegion ? region.getClipStartOffsetSeconds() : undefined,
        region,
      };
    });

    validateNoProjectedOverlaps(projectedStates, tracks);

    this.originalStates = resolvedRegions.map(({ region, track }) => ({
      regionId: region.getId(),
      trackId: track.getId().toString(),
      trackIndex: track.getTrackIndex(),
      startTick: region.getStartTick(),
      length: region.getLengthTicks(),
      clipStartOffsetSeconds: region instanceof KGAudioRegion ? region.getClipStartOffsetSeconds() : undefined,
    }));
    this.targetRegions = resolvedRegions.map(({ region }) => region);

    projectedStates.forEach(projectedState => {
      projectedState.region.setStartTick(projectedState.startTick);
    });

    console.log(`Moved ${projectedStates.length} regions by ${this.startTickDelta} ticks`);
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
      region.setStartTick(originalState.startTick);
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
  private readonly primaryStartTickDelta: number;
  private readonly primaryEndTickDelta: number;
  private readonly regionIdsToResize: string[];
  private originalStates: RegionSnapshot[] = [];
  private targetRegions: KGRegion[] = [];
  private noteAdjustments = new Map<string, NoteAdjustment[]>();
  private pitchBendAdjustments = new Map<string, PitchBendAdjustment[]>();
  private controllerEventAdjustments = new Map<string, ControllerEventAdjustment[]>();

  constructor(
    primaryRegionId: string,
    resizeEdge: 'start' | 'end',
    primaryStartTickDelta: number,
    primaryEndTickDelta: number,
    regionIdsToResize: string[]
  ) {
    super();
    this.primaryRegionId = primaryRegionId;
    this.resizeEdge = resizeEdge;
    this.primaryStartTickDelta = primaryStartTickDelta;
    this.primaryEndTickDelta = primaryEndTickDelta;
    this.regionIdsToResize = [...regionIdsToResize];
  }

  execute(): void {
    const project = KGCore.instance().getCurrentProject();
    const tracks = project.getTracks();

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
      const startDelta = this.resizeEdge === 'start' ? this.primaryStartTickDelta : 0;
      const endDelta = this.resizeEdge === 'end' ? this.primaryEndTickDelta : 0;

      const newStartTick = region.getStartTick() + startDelta;
      const newLength = this.resizeEdge === 'start'
        ? region.getLengthTicks() - startDelta
        : region.getLengthTicks() + endDelta;

      if (newStartTick < 0) {
        throw new Error(`Cannot resize regions because "${region.getName()}" would start before bar 1.`);
      }

      if (newLength < REGION_CONSTANTS.MIN_REGION_LENGTH) {
        throw new Error(`Cannot resize regions because "${region.getName()}" would become shorter than the minimum region length.`);
      }

      let clipStartOffsetSeconds = region instanceof KGAudioRegion ? region.getClipStartOffsetSeconds() : undefined;

      if (region instanceof KGAudioRegion) {
        const audioDuration = region.getAudioDurationSeconds();

        if (this.resizeEdge === 'start') {
          const secondsDelta = tickToSeconds(project, newStartTick) - tickToSeconds(project, region.getStartTick());
          const nextOffset = region.getClipStartOffsetSeconds() + secondsDelta;

          if (nextOffset < 0) {
            throw new Error(`Cannot resize regions because "${region.getName()}" would extend before the start of its audio file.`);
          }

          clipStartOffsetSeconds = Math.min(nextOffset, audioDuration);
        }

        const effectiveOffset = clipStartOffsetSeconds ?? 0;
        const maxEndTick = secondsToTick(
          project,
          tickToSeconds(project, newStartTick) + Math.max(0, audioDuration - effectiveOffset),
        );
        const maxLengthTicks = maxEndTick - newStartTick;
        if (newLength > maxLengthTicks) {
          throw new Error(`Cannot resize regions because "${region.getName()}" would extend past the end of its audio file.`);
        }
      }

      return {
        regionId: region.getId(),
        trackId: track.getId().toString(),
        trackIndex: track.getTrackIndex(),
        startTick: Math.max(0, newStartTick),
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
      startTick: region.getStartTick(),
      length: region.getLengthTicks(),
      clipStartOffsetSeconds: region instanceof KGAudioRegion ? region.getClipStartOffsetSeconds() : undefined,
    }));
    this.targetRegions = resolvedRegions.map(({ region }) => region);
    this.noteAdjustments.clear();
    this.pitchBendAdjustments.clear();
    this.controllerEventAdjustments.clear();

    projectedStates.forEach(projectedState => {
      const region = projectedState.region;
      if (this.resizeEdge === 'start' && region instanceof KGMidiRegion) {
        const tickOffset = projectedState.startTick - region.getStartTick();
        const adjustments: NoteAdjustment[] = region.getNotes().map(note => ({
          noteId: note.getId(),
          originalStartTick: note.getStartTick(),
          originalEndTick: note.getEndTick(),
        }));
        this.noteAdjustments.set(region.getId(), adjustments);

        region.getNotes().forEach(note => {
          note.setStartTick(note.getStartTick() - tickOffset);
          note.setEndTick(note.getEndTick() - tickOffset);
        });
        this.pitchBendAdjustments.set(region.getId(), region.getPitchBends().map(pitchBend => ({
          pitchBendId: pitchBend.getId(),
          originalTick: pitchBend.getTick(),
        })));
        region.getPitchBends().forEach(pitchBend => {
          pitchBend.setTick(pitchBend.getTick() - tickOffset);
        });
        this.controllerEventAdjustments.set(region.getId(), region.getAllControllerEventsFlattened().map(({ controller, event }) => ({
          controller,
          controllerEventId: event.getId(),
          originalTick: event.getTick(),
        })));
        region.getControllerEventsByType().forEach(events => {
          events.forEach(event => {
            event.setTick(event.getTick() - tickOffset);
          });
        });
      }

      if (region instanceof KGAudioRegion && projectedState.clipStartOffsetSeconds !== undefined) {
        region.setClipStartOffsetSeconds(projectedState.clipStartOffsetSeconds);
      }

      region.setStartTick(projectedState.startTick);
      region.setLengthTicks(projectedState.length);
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
            note.setStartTick(adjustment.originalStartTick);
            note.setEndTick(adjustment.originalEndTick);
          }
        });
        const pitchBendAdjustments = this.pitchBendAdjustments.get(region.getId()) ?? [];
        pitchBendAdjustments.forEach(adjustment => {
          const pitchBend = region.getPitchBends().find(candidate => candidate.getId() === adjustment.pitchBendId);
          if (pitchBend) {
            pitchBend.setTick(adjustment.originalTick);
          }
        });
        const controllerEventAdjustments = this.controllerEventAdjustments.get(region.getId()) ?? [];
        controllerEventAdjustments.forEach(adjustment => {
          const controllerEvent = region.getControllerEvents(adjustment.controller)
            .find(candidate => candidate.getId() === adjustment.controllerEventId);
          if (controllerEvent) {
            controllerEvent.setTick(adjustment.originalTick);
          }
        });
      }

      if (region instanceof KGAudioRegion && originalState.clipStartOffsetSeconds !== undefined) {
        region.setClipStartOffsetSeconds(originalState.clipStartOffsetSeconds);
      }

      region.setStartTick(originalState.startTick);
      region.setLengthTicks(originalState.length);
    });
  }

  getDescription(): string {
    return this.regionIdsToResize.length === 1
      ? `Resize region from ${this.resizeEdge}`
      : `Resize ${this.regionIdsToResize.length} regions from ${this.resizeEdge}`;
  }
}
