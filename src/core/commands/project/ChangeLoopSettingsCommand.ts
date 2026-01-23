import { KGCommand } from '../KGCommand';
import { KGCore } from '../../KGCore';
import { KGProject } from '../../KGProject';
import { useProjectStore } from '../../../stores/projectStore';

/**
 * Interface defining loop settings that can be updated
 */
export interface LoopSettings {
  isLooping?: boolean;
  loopingRange?: [number, number]; // [startBar, endBar] - bar indices (0-based)
}

/**
 * Command to update loop settings (isLooping and loopingRange)
 * Handles updating loop mode and range with undo support
 */
export class ChangeLoopSettingsCommand extends KGCommand {
  private newSettings: LoopSettings;
  private originalSettings: LoopSettings = {};
  private targetProject: KGProject | null = null;
  private changedSettings: Set<keyof LoopSettings> = new Set();

  constructor(settings: LoopSettings) {
    super();
    this.newSettings = settings;
  }

  execute(): void {
    const core = KGCore.instance();
    this.targetProject = core.getCurrentProject();

    // Store original settings for undo
    this.originalSettings = {
      isLooping: this.targetProject.getIsLooping(),
      loopingRange: [...this.targetProject.getLoopingRange()] as [number, number], // Create a copy
    };

    // Apply updates and track what actually changes
    const updatedSettings: string[] = [];

    // Update isLooping
    if (this.newSettings.isLooping !== undefined && this.newSettings.isLooping !== this.originalSettings.isLooping) {
      this.targetProject.setIsLooping(this.newSettings.isLooping);
      this.changedSettings.add('isLooping');
      updatedSettings.push(`isLooping: ${this.originalSettings.isLooping} → ${this.newSettings.isLooping}`);
    }

    // Update loopingRange
    if (this.newSettings.loopingRange !== undefined) {
      const originalRange = this.originalSettings.loopingRange!;
      const newRange = this.newSettings.loopingRange;

      // Compare loop ranges
      if (originalRange[0] !== newRange[0] || originalRange[1] !== newRange[1]) {
        this.targetProject.setLoopingRange(newRange);
        this.changedSettings.add('loopingRange');
        updatedSettings.push(`loopingRange: [${originalRange[0]}, ${originalRange[1]}] → [${newRange[0]}, ${newRange[1]}]`);
      }
    }

    // Update the store to trigger UI re-render
    const storeUpdate: { isLooping?: boolean; loopingRange?: [number, number] } = {};
    if (this.changedSettings.has('isLooping') && this.newSettings.isLooping !== undefined) {
      storeUpdate.isLooping = this.newSettings.isLooping;
    }
    if (this.changedSettings.has('loopingRange') && this.newSettings.loopingRange !== undefined) {
      storeUpdate.loopingRange = this.newSettings.loopingRange;
    }
    if (Object.keys(storeUpdate).length > 0) {
      useProjectStore.setState(storeUpdate);
    }

    if (updatedSettings.length > 0) {
      console.log(`Updated loop settings: ${updatedSettings.join(', ')}`);
    } else {
      console.log('No changes applied to loop settings');
    }
  }

  undo(): void {
    if (!this.targetProject) {
      throw new Error('Cannot undo: no loop settings were updated');
    }

    // Only restore settings that were actually changed
    const restoredSettings: string[] = [];

    // Restore isLooping (only if it was changed)
    if (this.changedSettings.has('isLooping') && this.originalSettings.isLooping !== undefined) {
      this.targetProject.setIsLooping(this.originalSettings.isLooping);
      restoredSettings.push(`isLooping: ${this.originalSettings.isLooping}`);
    }

    // Restore loopingRange (only if it was changed)
    if (this.changedSettings.has('loopingRange') && this.originalSettings.loopingRange !== undefined) {
      this.targetProject.setLoopingRange(this.originalSettings.loopingRange);
      const range = this.originalSettings.loopingRange;
      restoredSettings.push(`loopingRange: [${range[0]}, ${range[1]}]`);
    }

    // Update the store to trigger UI re-render
    const storeUpdate: { isLooping?: boolean; loopingRange?: [number, number] } = {};
    if (this.changedSettings.has('isLooping') && this.originalSettings.isLooping !== undefined) {
      storeUpdate.isLooping = this.originalSettings.isLooping;
    }
    if (this.changedSettings.has('loopingRange') && this.originalSettings.loopingRange !== undefined) {
      storeUpdate.loopingRange = this.originalSettings.loopingRange;
    }
    if (Object.keys(storeUpdate).length > 0) {
      useProjectStore.setState(storeUpdate);
    }

    console.log(`Restored loop settings: ${restoredSettings.join(', ')}`);
  }

  getDescription(): string {
    const updatedSettings: string[] = [];

    if (this.newSettings.isLooping !== undefined) {
      updatedSettings.push('loop mode');
    }
    if (this.newSettings.loopingRange !== undefined) {
      updatedSettings.push('loop range');
    }

    if (updatedSettings.length === 1) {
      return `Change ${updatedSettings[0]}`;
    } else if (updatedSettings.length > 1) {
      return `Change loop settings (${updatedSettings.join(', ')})`;
    }

    return `Change loop settings`;
  }

  /**
   * Get the new settings being applied
   */
  public getNewSettings(): LoopSettings {
    return this.newSettings;
  }

  /**
   * Get the original settings (only available after execute)
   */
  public getOriginalSettings(): LoopSettings {
    return this.originalSettings;
  }

  /**
   * Get the target project instance (only available after execute)
   */
  public getTargetProject(): KGProject | null {
    return this.targetProject;
  }

  /**
   * Get the settings that were actually changed (only available after execute)
   */
  public getChangedSettings(): Set<keyof LoopSettings> {
    return new Set(this.changedSettings);
  }
}
