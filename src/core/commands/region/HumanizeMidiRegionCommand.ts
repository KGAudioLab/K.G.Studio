import { KGCommand } from '../KGCommand';
import { KGCore } from '../../KGCore';
import { KGMidiRegion } from '../../region/KGMidiRegion';
import { KGMidiControllerEvent } from '../../midi/KGMidiControllerEvent';
import { generateUniqueId } from '../../../util/miscUtil';
import { resolveMidiAutomationValueAtTick } from '../../../util/midiAutomationUtil';
import type { AirePoint } from '../../../util/aire/types';

export class HumanizeMidiRegionCommand extends KGCommand {
  private readonly before: KGMidiControllerEvent[];
  private readonly after: KGMidiControllerEvent[];
  constructor(private readonly region: KGMidiRegion, start: number, end: number, points: AirePoint[]) {
    super();
    if (!Number.isInteger(start) || !Number.isInteger(end) || start < 0 || end <= start || end > region.getLengthTicks() || !points.length) throw new Error('Invalid humanization range.');
    this.before = [...region.getControllerEvents(1)];
    const generated = new Map<number, number>();
    for (const p of points) {
      if (!Number.isInteger(p.tick) || p.tick < start || p.tick >= end || !Number.isInteger(p.value) || p.value < 0 || p.value > 127) throw new Error('Invalid humanization point.');
      generated.set(p.tick, p.value);
    }
    // Anchor the generated curve at both discrete edit boundaries.
    generated.set(start, points[0].value);
    generated.set(end - 1, points.at(-1)!.value);
    const oldPoints = this.before.map(e => ({ tick: e.getTick(), value: e.getValue() }));
    for (const tick of [start - 1, end]) {
      if (tick < 0 || tick >= region.getLengthTicks() || this.before.some(e => e.getTick() === tick)) continue;
      // Preserve the original continuous value; MIDI export/playback quantizes controllers.
      generated.set(tick, resolveMidiAutomationValueAtTick(oldPoints, tick, 0));
    }
    this.after = [...this.before.filter(e => e.getTick() < start || e.getTick() >= end),
      ...[...generated].map(([tick, value]) => new KGMidiControllerEvent(generateUniqueId('KGMidiControllerEvent'), tick, value))]
      .sort((a, b) => a.getTick() - b.getTick());
  }
  execute(): void {
    const project = KGCore.instance().getCurrentProject();
    if (!project.getTracks().some(t => t.getRegions().includes(this.region))) throw new Error('The MIDI region no longer exists.');
    this.region.setControllerEvents(1, [...this.after]);
    const removed = new Set(this.before.filter(e => !this.after.includes(e)));
    for (const item of KGCore.instance().getSelectedItems()) {
      if (item instanceof KGMidiControllerEvent && removed.has(item)) KGCore.instance().removeSelectedItem(item);
    }
  }
  undo(): void { this.region.setControllerEvents(1, [...this.before]); }
  getDescription(): string { return 'Humanize MIDI expression (AIRE)'; }
}
