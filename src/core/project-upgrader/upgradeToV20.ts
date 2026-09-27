import { KGProject } from '../KGProject';
import { KGMidiRegion } from '../region/KGMidiRegion';
import { KGTempoRegion } from '../region/KGTempoRegion';
import { KGKeySignatureRegion } from '../region/KGKeySignatureRegion';
import { TICKS_PER_QUARTER, ticksPerBar } from '../timing';

type LegacyRecord = Record<string, unknown>;

function readLegacyNumber(target: object, legacyKey: string, fallback: number): number {
  const value = (target as LegacyRecord)[legacyKey];
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function removeLegacyKey(target: object, legacyKey: string): void {
  delete (target as LegacyRecord)[legacyKey];
}

/**
 * Convert the legacy denominator-beat timeline to integer quarter-note ticks.
 * Scaling BPM by the same quarter-note ratio preserves elapsed playback time.
 */
export function upgradeToV20(project: KGProject): KGProject {
  if (project.getProjectStructureVersion() >= 20) {
    return project;
  }
  const denominator = project.getTimeSignature().denominator;
  const ticksPerLegacyBeat = TICKS_PER_QUARTER * (4 / denominator);
  const canonicalBarTicks = ticksPerBar(project.getTimeSignature());
  const bpmScale = 4 / denominator;
  const convert = (value: number): number => Math.round(value * ticksPerLegacyBeat);

  try {
    const legacyPlayhead = readLegacyNumber(project, 'playheadPosition', project.getPlayheadTick());
    project.setPlayheadTick(convert(legacyPlayhead));
    removeLegacyKey(project, 'playheadPosition');
    project.setBpm(project.getBpm() * bpmScale);

    for (const track of project.getTracks()) {
      const automationGroups = [track.getVolumeAutomation(), track.getPanAutomation()];
      for (const points of automationGroups) {
        for (const point of points) {
          const legacyBeat = readLegacyNumber(point, 'beat', point.getTick());
          point.setTick(convert(legacyBeat));
          removeLegacyKey(point, 'beat');
        }
      }

      for (const region of track.getRegions()) {
        const legacyStart = readLegacyNumber(region, 'startFromBeat', region.getStartTick());
        const legacyLength = readLegacyNumber(region, 'length', region.getLengthTicks());
        region.setStartTick(convert(legacyStart));
        region.setLengthTicks(convert(legacyLength));
        removeLegacyKey(region, 'startFromBeat');
        removeLegacyKey(region, 'length');

        if (!(region instanceof KGMidiRegion)) continue;
        for (const note of region.getNotes()) {
          const legacyStartTick = readLegacyNumber(note, 'startBeat', note.getStartTick());
          const legacyEndTick = readLegacyNumber(note, 'endBeat', note.getEndTick());
          note.setStartTick(convert(legacyStartTick));
          note.setEndTick(convert(legacyEndTick));
          removeLegacyKey(note, 'startBeat');
          removeLegacyKey(note, 'endBeat');
        }
        for (const event of [
          ...region.getPitchBends(),
          ...region.getControllerEventsByType().flat(),
        ]) {
          const legacyBeat = readLegacyNumber(event, 'beat', event.getTick());
          event.setTick(convert(legacyBeat));
          removeLegacyKey(event, 'beat');
        }
      }
    }

    for (const track of project.getGlobalTracks()) {
      for (const region of track.getRegions()) {
        const legacyStart = readLegacyNumber(region, 'startFromBeat', region.getStartTick());
        const legacyLength = readLegacyNumber(region, 'length', region.getLengthTicks());
        region.setStartTick(convert(legacyStart));
        region.setLengthTicks(convert(legacyLength));
        removeLegacyKey(region, 'startFromBeat');
        removeLegacyKey(region, 'length');
        removeLegacyKey(region, 'startBar');
        removeLegacyKey(region, 'lengthBars');
        if (region instanceof KGTempoRegion) {
          region.setBpm(region.getBpm() * bpmScale);
          region.syncBarsFromTicks(canonicalBarTicks);
        } else if (region instanceof KGKeySignatureRegion) {
          region.syncBarsFromTicks(canonicalBarTicks);
        }
      }
    }
  } finally {
    project.setProjectStructureVersion(20);
  }

  return project;
}
