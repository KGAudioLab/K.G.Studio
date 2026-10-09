import type { KGProject } from '../../core/KGProject';
import type { KGMidiRegion } from '../../core/region/KGMidiRegion';
import { KGTempoRegion } from '../../core/region/KGTempoRegion';
import { getEffectiveBpmAtTick } from '../globalTrackUtil';
import { TICKS_PER_QUARTER, ticksPerBar } from '../../core/timing';
import type { AireSection } from './types';
export interface AireTarget { startTick: number; endTick: number; sections: AireSection[] }
export function buildAireTarget(project: KGProject, region: KGMidiRegion): AireTarget | null {
  let start: number = region.getStartTick(), end = start + region.getLengthTicks();
  if (project.getIsLooping()) {
    const barTicks = ticksPerBar(project.getTimeSignature());
    const [a, b] = project.getLoopingRange();
    start = Math.max(start, a * barTicks); end = Math.min(end, (b + 1) * barTicks);
  }
  if (end <= start) return null;
  const notes = region.getNotes().filter(n => n.getVelocity() > 0 && region.getStartTick() + n.getStartTick() < end && region.getStartTick() + n.getEndTick() > start);
  if (!notes.length) return null;
  const boundaries = new Set([start, end]);
  for (const track of project.getGlobalTracks()) for (const r of track.getRegions()) if (r instanceof KGTempoRegion) {
    for (const tick of [r.getStartTick(), r.getStartTick() + r.getLengthTicks()]) if (tick > start && tick < end) boundaries.add(tick);
  }
  const ordered = [...boundaries].sort((a, b) => a - b);
  // Merge neighboring spans when their effective tempo is the same.
  const spans: { start: number; end: number; tempo: number }[] = [];
  for (let i = 0; i < ordered.length - 1; i++) {
    const tempo = getEffectiveBpmAtTick(project, ordered[i]);
    const previous = spans.at(-1);
    if (previous?.tempo === tempo) previous.end = ordered[i + 1];
    else spans.push({ start: ordered[i], end: ordered[i + 1], tempo });
  }
  const meter = project.getTimeSignature();
  const sections = spans.map(span => {
    const sectionNotes = notes.map(n => ({ pitch: n.getPitch(), velocity: n.getVelocity(),
      start: (region.getStartTick() + n.getStartTick() - span.start) / TICKS_PER_QUARTER,
      end: (region.getStartTick() + n.getEndTick() - span.start) / TICKS_PER_QUARTER,
    }));
    const duration = (span.end - span.start) / TICKS_PER_QUARTER;
    // Preserve original note context, but only materialize the requested span and one tail beat.
    const lastEnd = Math.min(duration, Math.max(0, ...sectionNotes.map(n => n.end)));
    return { notes: sectionNotes, tempo: span.tempo, meter: [meter.numerator, meter.denominator] as [number, number],
      originBeat: span.start / TICKS_PER_QUARTER, duration, hardEnd: Math.max(duration, lastEnd + 1) };
  });
  return { startTick: start - region.getStartTick(), endTick: end - region.getStartTick(), sections };
}
export function aireInputSnapshot(project: KGProject, region: KGMidiRegion): string {
  return JSON.stringify({ id: region.getId(), start: region.getStartTick(), length: region.getLengthTicks(),
    target: buildAireTarget(project, region),
    cc1: region.getControllerEvents(1).map(e => [e.getId(), e.getTick(), e.getValue()]),
  });
}
