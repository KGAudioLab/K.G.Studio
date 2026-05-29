import { KGCore } from '../core/KGCore';
import { CreateTempoRegionCommand } from '../core/commands/global-region/CreateTempoRegionCommand';
import { UpdateTempoRegionCommand } from '../core/commands/global-region/UpdateTempoRegionCommand';
import { MoveRegionCommand } from '../core/commands/region/MoveRegionCommand';
import type { KGProject } from '../core/KGProject';
import {
  findTempoRegionAtBar,
  findTempoRegionAtBeat,
} from './globalTrackUtil';

export const DETECTED_TEMPO_ACTION_UPDATE_CURRENT = 'update-current-tempo';
export const DETECTED_TEMPO_ACTION_INSERT_REGION = 'insert-tempo-change';

export type DetectedTempoAction =
  | typeof DETECTED_TEMPO_ACTION_UPDATE_CURRENT
  | typeof DETECTED_TEMPO_ACTION_INSERT_REGION;

export function buildDetectedTempoChoiceMessage(bpm: number): string {
  return `Detected tempo: ${bpm} BPM. Choose how to apply it.\n\nUpdate Current Tempo changes the active tempo at this clip location. Insert Tempo Change adds a new tempo region at the nearest bar before the clip starts.`;
}

const ALIGNMENT_EPSILON = 1e-6;

interface ApplyDetectedTempoActionParams {
  action: DetectedTempoAction;
  detectedBpm: number;
  detectedTempo: number;
  detectedOffsetSeconds: number;
  autoAlignRegionToBeat: boolean;
  project: KGProject;
  regionId: string;
  regionStartBeat: number;
  regionTrackId: string;
  regionTrackIndex: number;
  refreshProjectState: () => void;
  setBpm: (bpm: number) => void;
}

export function getRightwardBeatAlignmentShiftBeats(
  detectedTempo: number,
  offsetSeconds: number,
): number {
  if (!Number.isFinite(detectedTempo) || detectedTempo <= 0 || !Number.isFinite(offsetSeconds) || offsetSeconds <= 0) {
    return 0;
  }

  const secondsPerBeat = 60 / detectedTempo;
  const offsetWithinBeat = offsetSeconds % secondsPerBeat;
  if (offsetWithinBeat <= ALIGNMENT_EPSILON || secondsPerBeat - offsetWithinBeat <= ALIGNMENT_EPSILON) {
    return 0;
  }

  return (secondsPerBeat - offsetWithinBeat) / secondsPerBeat;
}

export function applyDetectedTempoAction({
  action,
  detectedBpm,
  detectedTempo,
  detectedOffsetSeconds,
  autoAlignRegionToBeat,
  project,
  regionId,
  regionStartBeat,
  regionTrackId,
  regionTrackIndex,
  refreshProjectState,
  setBpm,
}: ApplyDetectedTempoActionParams): void {
  const core = KGCore.instance();

  if (action === DETECTED_TEMPO_ACTION_UPDATE_CURRENT) {
    const targetRegion = findTempoRegionAtBeat(project, regionStartBeat);
    if (targetRegion) {
      core.executeCommand(new UpdateTempoRegionCommand(targetRegion.getId(), detectedBpm), { rethrow: true });
    } else {
      setBpm(detectedBpm);
    }
  } else {
    const beatsPerBar = project.getTimeSignature().numerator;
    const targetBar = Math.max(0, Math.floor(regionStartBeat / beatsPerBar));
    const existingRegionAtBar = findTempoRegionAtBar(project, targetBar);

    if (existingRegionAtBar && existingRegionAtBar.getStartBar() === targetBar) {
      core.executeCommand(new UpdateTempoRegionCommand(existingRegionAtBar.getId(), detectedBpm), { rethrow: true });
    } else {
      const createTempoRegionCommand = new CreateTempoRegionCommand(targetBar);
      core.executeCommand(createTempoRegionCommand, { rethrow: true });

      const createdRegion = createTempoRegionCommand.getCreatedRegion();
      if (!createdRegion) {
        throw new Error(`Failed to create tempo region at bar ${targetBar + 1}`);
      }

      core.executeCommand(new UpdateTempoRegionCommand(createdRegion.getId(), detectedBpm), { rethrow: true });
    }
  }

  if (autoAlignRegionToBeat) {
    const shiftBeats = getRightwardBeatAlignmentShiftBeats(detectedTempo, detectedOffsetSeconds);
    if (shiftBeats > 0) {
      core.executeCommand(
        MoveRegionCommand.createPositionOnlyMove(
          regionId,
          regionStartBeat + shiftBeats,
          regionTrackId,
          regionTrackIndex,
        ),
        { rethrow: true },
      );
    }
  }
  refreshProjectState();
}
