import { KGCommand } from '../KGCommand';
import { KGCore } from '../../KGCore';
import { KGProject, type KeySignature } from '../../KGProject';
import type { TimeSignature } from '../../../types/projectTypes';

/**
 * Interface defining properties that can be updated on a project
 */
export interface ProjectUpdateProperties {
  name?: string;
  maxBars?: number;
  currentBars?: number;
  bpm?: number;
  timeSignature?: TimeSignature;
  keySignature?: KeySignature;
}

/**
 * Command to update project properties
 * Handles updating project name, BPM, time signature, etc. with undo support
 */
export class ChangeProjectPropertyCommand extends KGCommand {
  private newProperties: ProjectUpdateProperties;
  private originalProperties: ProjectUpdateProperties = {};
  private targetProject: KGProject | null = null;
  private changedProperties: Set<keyof ProjectUpdateProperties> = new Set();

  constructor(properties: ProjectUpdateProperties) {
    super();
    this.newProperties = properties;
  }

  execute(): void {
    const core = KGCore.instance();
    this.targetProject = core.getCurrentProject();

    // Store original properties for undo
    this.originalProperties = {
      name: this.targetProject.getName(),
      maxBars: this.targetProject.getMaxBars(),
      currentBars: this.targetProject.getCurrentBars(),
      bpm: this.targetProject.getBpm(),
      timeSignature: { ...this.targetProject.getTimeSignature() }, // Create a copy
      keySignature: this.targetProject.getKeySignature(),
    };

    // Apply updates and track what actually changes
    const updatedProperties: string[] = [];

    // Update name
    if (this.newProperties.name !== undefined && this.newProperties.name !== this.originalProperties.name) {
      this.targetProject.setName(this.newProperties.name);
      this.changedProperties.add('name');
      updatedProperties.push(`name: "${this.originalProperties.name}" → "${this.newProperties.name}"`);
    }

    // Update maxBars
    if (this.newProperties.maxBars !== undefined && this.newProperties.maxBars !== this.originalProperties.maxBars) {
      this.targetProject.setMaxBars(this.newProperties.maxBars);
      this.changedProperties.add('maxBars');
      updatedProperties.push(`maxBars: ${this.originalProperties.maxBars} → ${this.newProperties.maxBars}`);
    }

    // Update currentBars
    if (this.newProperties.currentBars !== undefined && this.newProperties.currentBars !== this.originalProperties.currentBars) {
      this.targetProject.setCurrentBars(this.newProperties.currentBars);
      this.changedProperties.add('currentBars');
      updatedProperties.push(`currentBars: ${this.originalProperties.currentBars} → ${this.newProperties.currentBars}`);
    }

    // Update BPM
    if (this.newProperties.bpm !== undefined && this.newProperties.bpm !== this.originalProperties.bpm) {
      this.targetProject.setBpm(this.newProperties.bpm);
      this.changedProperties.add('bpm');
      updatedProperties.push(`bpm: ${this.originalProperties.bpm} → ${this.newProperties.bpm}`);
    }

    // Update time signature
    if (this.newProperties.timeSignature !== undefined) {
      const originalTS = this.originalProperties.timeSignature!;
      const newTS = this.newProperties.timeSignature;
      
      // Compare time signatures
      if (originalTS.numerator !== newTS.numerator || originalTS.denominator !== newTS.denominator) {
        this.targetProject.setTimeSignature(newTS);
        this.changedProperties.add('timeSignature');
        updatedProperties.push(`timeSignature: ${originalTS.numerator}/${originalTS.denominator} → ${newTS.numerator}/${newTS.denominator}`);
      }
    }

    // Update key signature
    if (this.newProperties.keySignature !== undefined && this.newProperties.keySignature !== this.originalProperties.keySignature) {
      this.targetProject.setKeySignature(this.newProperties.keySignature);
      this.changedProperties.add('keySignature');
      updatedProperties.push(`keySignature: "${this.originalProperties.keySignature}" → "${this.newProperties.keySignature}"`);
    }

    if (updatedProperties.length > 0) {
      console.log(`Updated project: ${updatedProperties.join(', ')}`);
    } else {
      console.log('No changes applied to project');
    }
  }

  undo(): void {
    if (!this.targetProject) {
      throw new Error('Cannot undo: no project was updated');
    }

    // Only restore properties that were actually changed
    const restoredProperties: string[] = [];

    // Restore name (only if it was changed)
    if (this.changedProperties.has('name') && this.originalProperties.name !== undefined) {
      this.targetProject.setName(this.originalProperties.name);
      restoredProperties.push(`name: "${this.originalProperties.name}"`);
    }

    // Restore maxBars (only if it was changed)
    if (this.changedProperties.has('maxBars') && this.originalProperties.maxBars !== undefined) {
      this.targetProject.setMaxBars(this.originalProperties.maxBars);
      restoredProperties.push(`maxBars: ${this.originalProperties.maxBars}`);
    }

    // Restore currentBars (only if it was changed)
    if (this.changedProperties.has('currentBars') && this.originalProperties.currentBars !== undefined) {
      this.targetProject.setCurrentBars(this.originalProperties.currentBars);
      restoredProperties.push(`currentBars: ${this.originalProperties.currentBars}`);
    }

    // Restore BPM (only if it was changed)
    if (this.changedProperties.has('bpm') && this.originalProperties.bpm !== undefined) {
      this.targetProject.setBpm(this.originalProperties.bpm);
      restoredProperties.push(`bpm: ${this.originalProperties.bpm}`);
    }

    // Restore time signature (only if it was changed)
    if (this.changedProperties.has('timeSignature') && this.originalProperties.timeSignature !== undefined) {
      this.targetProject.setTimeSignature(this.originalProperties.timeSignature);
      const ts = this.originalProperties.timeSignature;
      restoredProperties.push(`timeSignature: ${ts.numerator}/${ts.denominator}`);
    }

    // Restore key signature (only if it was changed)
    if (this.changedProperties.has('keySignature') && this.originalProperties.keySignature !== undefined) {
      this.targetProject.setKeySignature(this.originalProperties.keySignature);
      restoredProperties.push(`keySignature: "${this.originalProperties.keySignature}"`);
    }

    console.log(`Restored project: ${restoredProperties.join(', ')}`);
  }

  getDescription(): string {
    const updatedProps: string[] = [];

    if (this.newProperties.name !== undefined) {
      updatedProps.push('name');
    }
    if (this.newProperties.maxBars !== undefined) {
      updatedProps.push('maxBars');
    }
    if (this.newProperties.currentBars !== undefined) {
      updatedProps.push('currentBars');
    }
    if (this.newProperties.bpm !== undefined) {
      updatedProps.push('BPM');
    }
    if (this.newProperties.timeSignature !== undefined) {
      updatedProps.push('time signature');
    }
    if (this.newProperties.keySignature !== undefined) {
      updatedProps.push('key signature');
    }

    if (updatedProps.length === 1) {
      return `Change project ${updatedProps[0]}`;
    } else if (updatedProps.length > 1) {
      return `Change project properties (${updatedProps.join(', ')})`;
    }

    return `Change project properties`;
  }

  /**
   * Get the new properties being applied
   */
  public getNewProperties(): ProjectUpdateProperties {
    return this.newProperties;
  }

  /**
   * Get the original properties (only available after execute)
   */
  public getOriginalProperties(): ProjectUpdateProperties {
    return this.originalProperties;
  }

  /**
   * Get the target project instance (only available after execute)
   */
  public getTargetProject(): KGProject | null {
    return this.targetProject;
  }

  /**
   * Get the properties that were actually changed (only available after execute)
   */
  public getChangedProperties(): Set<keyof ProjectUpdateProperties> {
    return new Set(this.changedProperties);
  }
}