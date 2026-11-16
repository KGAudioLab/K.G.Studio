import { KGCommand } from '../KGCommand';
import { KGCore } from '../../KGCore';
import { KGMidiControllerEvent } from '../../midi/KGMidiControllerEvent';
import { KGMidiPitchBend } from '../../midi/KGMidiPitchBend';
import type { KGMidiRegion } from '../../region/KGMidiRegion';
import type { MidiAutomationPoint } from '../../../util/midiAutomationUtil';
import { generateUniqueId } from '../../../util/miscUtil';

type AutomationEvent = KGMidiPitchBend | KGMidiControllerEvent;
type AutomationEdit =
  | { controller: null; before: KGMidiPitchBend[]; after: KGMidiPitchBend[] }
  | { controller: number; before: KGMidiControllerEvent[]; after: KGMidiControllerEvent[] };

function replaceCoveredEvents<T extends AutomationEvent>(
  events: T[],
  curve: readonly MidiAutomationPoint[],
  createEvent: (point: MidiAutomationPoint) => T,
): { before: T[]; after: T[] } {
  const start = curve[0].tick;
  const end = curve[curve.length - 1].tick;
  const outside = events.filter(event => event.getTick() < start || event.getTick() > end);
  return {
    before: [...events],
    after: [...outside, ...curve.map(createEvent)].sort((left, right) => left.getTick() - right.getTick()),
  };
}

export class ReplaceMidiAutomationCommand extends KGCommand {
  private readonly edit: AutomationEdit;

  constructor(
    private readonly region: KGMidiRegion,
    controller: number | null,
    curve: readonly MidiAutomationPoint[],
  ) {
    super();
    if (curve.length === 0) throw new Error('An automation edit requires at least one point.');

    this.edit = controller === null
      ? { controller, ...replaceCoveredEvents(region.getPitchBends(), curve, ({ tick, value }) => (
        new KGMidiPitchBend(generateUniqueId('KGMidiPitchBend'), tick, value)
      )) }
      : { controller, ...replaceCoveredEvents(region.getControllerEvents(controller), curve, ({ tick, value }) => (
        new KGMidiControllerEvent(generateUniqueId('KGMidiControllerEvent'), tick, value)
      )) };
  }

  private apply(version: 'before' | 'after'): void {
    const core = KGCore.instance();
    if (!core.getCurrentProject().getTracks().some(track => track.getRegions().includes(this.region))) {
      throw new Error('The MIDI region no longer exists.');
    }

    const { edit, region } = this;
    const previousEvents = edit.controller === null ? region.getPitchBends() : region.getControllerEvents(edit.controller);
    if (edit.controller === null) region.setPitchBends([...edit[version]]);
    else region.setControllerEvents(edit.controller, [...edit[version]]);

    const nextEvents = new Set<AutomationEvent>(edit[version]);
    const removed = new Set(previousEvents.filter(event => !nextEvents.has(event)));
    const deselected = core.getSelectedItems().filter(item => (
      (item instanceof KGMidiPitchBend || item instanceof KGMidiControllerEvent) && removed.has(item)
    ));
    if (deselected.length > 0) {
      deselected.forEach(item => item.deselect());
      core.removeSelectedItems(deselected);
    }
  }

  execute(): void { this.apply('after'); }
  undo(): void { this.apply('before'); }
  getDescription(): string { return 'Draw MIDI automation'; }
}
