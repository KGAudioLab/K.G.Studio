import { KGCommand } from '../KGCommand';
import { KGCore } from '../../KGCore';
import { KGMidiControllerEvent } from '../../midi/KGMidiControllerEvent';
import { KGMidiRegion } from '../../region/KGMidiRegion';
import { KGTrack } from '../../track/KGTrack';

interface ControllerEventSnapshot {
  controllerEventId: string;
  controller: number;
  beat: number;
  value: number;
}

interface ControllerEventUpdate {
  controllerEventId: string;
  controller?: number;
  beat?: number;
  value?: number;
}

export class UpdateControllerEventPropertiesCommand extends KGCommand {
  private regionId: string;
  private snapshots: ControllerEventSnapshot[];
  private updates: ControllerEventUpdate[];
  private targetRegion: KGMidiRegion | null = null;
  private parentTrack: KGTrack | null = null;

  constructor(regionId: string, snapshots: ControllerEventSnapshot[], updates: ControllerEventUpdate[]) {
    super();
    this.regionId = regionId;
    this.snapshots = [...snapshots];
    this.updates = [...updates];
  }

  execute(): void {
    const tracks = KGCore.instance().getCurrentProject().getTracks();

    for (const track of tracks) {
      const region = track.getRegions().find(r => r.getId() === this.regionId) as KGMidiRegion | undefined;
      if (region) {
        this.targetRegion = region;
        this.parentTrack = track;
        break;
      }
    }

    if (!this.targetRegion) {
      throw new Error(`Region with ID ${this.regionId} not found`);
    }

    for (const update of this.updates) {
      const currentController = this.snapshots.find(snapshot => snapshot.controllerEventId === update.controllerEventId)?.controller;
      if (currentController === undefined) {
        continue;
      }

      const event = this.findControllerEvent(currentController, update.controllerEventId);
      if (!event) {
        continue;
      }

      if (update.controller !== undefined && update.controller !== currentController) {
        this.targetRegion.removeControllerEvent(currentController, event.getId());
        this.targetRegion.addControllerEvent(update.controller, event);
      }

      if (update.beat !== undefined) event.setBeat(update.beat);
      if (update.value !== undefined) event.setValue(update.value);
    }
  }

  undo(): void {
    if (!this.targetRegion) {
      throw new Error('Cannot undo: command was not executed');
    }

    this.snapshots.forEach(snapshot => {
      const existing = this.findControllerEventAcrossBuckets(snapshot.controllerEventId);
      if (!existing) {
        return;
      }

      if (existing.controller !== snapshot.controller) {
        this.targetRegion!.removeControllerEvent(existing.controller, existing.event.getId());
        this.targetRegion!.addControllerEvent(snapshot.controller, existing.event);
      }

      existing.event.setBeat(snapshot.beat);
      existing.event.setValue(snapshot.value);
    });
  }

  getDescription(): string {
    const count = this.snapshots.length;
    return count === 1 ? 'Update controller event properties' : `Update ${count} controller events' properties`;
  }

  public getParentTrack(): KGTrack | null {
    return this.parentTrack;
  }

  private findControllerEvent(controller: number, controllerEventId: string): KGMidiControllerEvent | undefined {
    return this.targetRegion?.getControllerEvents(controller).find(candidate => candidate.getId() === controllerEventId);
  }

  private findControllerEventAcrossBuckets(controllerEventId: string): { controller: number; event: KGMidiControllerEvent } | null {
    if (!this.targetRegion) {
      return null;
    }

    for (const { controller, event } of this.targetRegion.getAllControllerEventsFlattened()) {
      if (event.getId() === controllerEventId) {
        return { controller, event };
      }
    }

    return null;
  }
}
