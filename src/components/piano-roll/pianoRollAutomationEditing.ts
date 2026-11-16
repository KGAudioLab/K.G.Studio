import { UpdateNotePropertiesCommand } from '../../core/commands/note/UpdateNotePropertiesCommand';
import type { KGMidiNote } from '../../core/midi/KGMidiNote';
import type { KGMidiRegion } from '../../core/region/KGMidiRegion';
import { simplifyAirePoints } from '../../util/aire/simplification';
import {
  findMidiAutomationPointAfter,
  resolveSortedMidiAutomationValueAtTick,
  type MidiAutomationPoint,
} from '../../util/midiAutomationUtil';
import { MIDI_CONTROLLER_MAX } from '../../util/midiUtil';

export function getAutomationLaneScale(height: number, maxValue = MIDI_CONTROLLER_MAX) {
  const padding = Math.min(16, height / 4);
  const bottom = height - padding;
  const valueHeight = height - 2 * padding;
  return {
    toY: (value: number) => bottom - value * valueHeight / maxValue,
    toValue: (y: number) => Math.min(maxValue, Math.max(0, (bottom - y) * maxValue / valueHeight)),
  };
}

export function simplifyAutomationStroke(samples: readonly MidiAutomationPoint[], regionLength: number): MidiAutomationPoint[] {
  if (samples.length === 0 || regionLength <= 0) return [];

  const curve = [samples[0]];
  for (let i = 1; i < samples.length; i++) {
    const previous = samples[i - 1];
    const current = samples[i];
    const [first, last] = previous.tick <= current.tick ? [previous, current] : [current, previous];
    // The latest segment takes precedence where the pencil retraces the timeline.
    const startIndex = findMidiAutomationPointAfter(curve, first.tick - 1);
    const endIndex = findMidiAutomationPointAfter(curve, last.tick);
    const segment = first.tick === last.tick ? [current] : [first, last];
    curve.splice(startIndex, endIndex - startIndex, ...segment);
  }

  const start = Math.max(0, curve[0].tick);
  const end = Math.min(regionLength - 1, curve[curve.length - 1].tick);
  if (end < start) return [];

  const clipped = curve.filter(point => point.tick >= start && point.tick <= end);
  if (clipped[0]?.tick !== start) {
    clipped.unshift({ tick: start, value: resolveSortedMidiAutomationValueAtTick(curve, start, 0) });
  }
  if (clipped[clipped.length - 1].tick !== end) {
    clipped.push({ tick: end, value: resolveSortedMidiAutomationValueAtTick(curve, end, 0) });
  }
  return simplifyAirePoints(clipped, 'medium');
}

export function createNoteVelocityCommand(
  region: KGMidiRegion,
  getNewVelocity: (note: KGMidiNote) => number | undefined,
): UpdateNotePropertiesCommand | null {
  const snapshots = [];
  const updates = [];
  for (const note of region.getNotes()) {
    const velocity = getNewVelocity(note);
    if (velocity === undefined || velocity === note.getVelocity()) continue;

    const noteId = note.getId();
    snapshots.push({
      noteId,
      velocity: note.getVelocity(),
      pitch: note.getPitch(),
      startTick: note.getStartTick(),
      endTick: note.getEndTick(),
    });
    updates.push({ noteId, velocity });
  }
  return updates.length > 0 ? new UpdateNotePropertiesCommand(region.getId(), snapshots, updates) : null;
}
