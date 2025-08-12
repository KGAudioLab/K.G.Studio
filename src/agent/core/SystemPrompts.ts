import { KGCore } from '../../core/KGCore';
import { KGRegion } from '../../core/region/KGRegion';
import { KGMidiTrack } from '../../core/track/KGMidiTrack';
import { KGTrack } from '../../core/track/KGTrack';
import { useProjectStore } from '../../stores/projectStore';
import { ConfigManager } from '../../core/config/ConfigManager';
import { FLUIDR3_INSTRUMENT_MAP } from '../../constants/generalMidiConstants';

/**
 * Context data structure for system prompt template replacement
 */
interface SystemPromptContext {
  bpm: number;
  time_signature: string;
  key_signature: string;
  track_instrument: string;
  current_region_start: number;
  current_region_end: number;
}

/**
 * System prompts for the AI agent with dynamic context loading
 */
export class SystemPrompts {
  private static cachedTemplate: string | null = null;
  private static readonly FALLBACK_PROMPT = `You are K.G.Studio Musician Assistant Agent, a highly skilled music musician with extensive knowledge in music theory, composition, and production.`;
  
  /**
   * Load the system prompt template from the public folder
   */
  private static async loadTemplate(): Promise<string> {
    if (this.cachedTemplate) {
      return this.cachedTemplate;
    }
    
    try {
      const response = await fetch('/prompts/system.md');
      if (!response.ok) {
        throw new Error(`Failed to load system prompt: ${response.status}`);
      }
      
      this.cachedTemplate = await response.text();
      return this.cachedTemplate;
    } catch (error) {
      console.error('Failed to load system prompt template:', error);
      return this.FALLBACK_PROMPT;
    }
  }
  
  /**
   * Find a region by ID across all tracks
   */
  private static findRegionById(regionId: string): KGRegion | null {
    const core = KGCore.instance();
    const project = core.getCurrentProject();
    const tracks = project.getTracks();
    
    for (const track of tracks) {
      const regions = track.getRegions();
      const region = regions.find(r => r.getId() === regionId);
      if (region) {
        return region;
      }
    }
    
    return null;
  }
  
  /**
   * Find track that contains the given region
   */
  private static findTrackByRegion(region: KGRegion): KGTrack | null {
    const core = KGCore.instance();
    const project = core.getCurrentProject();
    const tracks = project.getTracks();
    
    return tracks.find(track => track.getRegions().includes(region)) || null;
  }
  
  /**
   * Extract current project context from KGCore
   */
  private static extractProjectContext(): Partial<SystemPromptContext> {
    const core = KGCore.instance();
    const project = core.getCurrentProject();
    
    // Get basic project info
    const context: Partial<SystemPromptContext> = {
      bpm: project.getBpm(),
      time_signature: `${project.getTimeSignature().numerator}/${project.getTimeSignature().denominator}`,
      key_signature: project.getKeySignature(),
    };
    
    // Get current track instrument using the corrected logic
    let trackInstrument = 'Piano'; // Default
    
    // Step 1: Check if there's an active piano roll region
    const activeRegionId = this.getActiveRegionId();
    if (activeRegionId) {
      const activeRegion = this.findRegionById(activeRegionId);
      if (activeRegion) {
        const track = this.findTrackByRegion(activeRegion);
        if (track && track instanceof KGMidiTrack) {
          trackInstrument = FLUIDR3_INSTRUMENT_MAP[track.getInstrument()].displayName;
        }
      }
    } else {
      // Step 2: Check if user has selected region(s)
      const selectedItems = core.getSelectedItems();
      const selectedRegion = selectedItems.find(item => item instanceof KGRegion) as KGRegion;
      
      if (selectedRegion) {
        const track = this.findTrackByRegion(selectedRegion);
        if (track && track instanceof KGMidiTrack) {
          trackInstrument = FLUIDR3_INSTRUMENT_MAP[track.getInstrument()].displayName;
        }
      } else {
        // Step 3: Find the first track
        const tracks = project.getTracks();
        const firstMidiTrack = tracks.find(track => track instanceof KGMidiTrack) as KGMidiTrack;
        if (firstMidiTrack) {
          trackInstrument = FLUIDR3_INSTRUMENT_MAP[firstMidiTrack.getInstrument()].displayName;
        }
      }
    }
    
    context.track_instrument = trackInstrument;
    return context;
  }
  
  /**
   * Get active region ID from project store
   */
  private static getActiveRegionId(): string | null {
    try {
      const store = useProjectStore.getState();
      return store.activeRegionId;
    } catch {
      return null;
    }
  }
  
  /**
   * Extract current region context with fallback logic
   */
  private static extractRegionContext(): Partial<SystemPromptContext> {
    const core = KGCore.instance();
    const project = core.getCurrentProject();
    
    // Step 1: Try active piano roll region
    const activeRegionId = this.getActiveRegionId();
    if (activeRegionId) {
      const activeRegion = this.findRegionById(activeRegionId);
      if (activeRegion) {
        return {
          current_region_start: activeRegion.getStartFromBeat(),
          current_region_end: activeRegion.getStartFromBeat() + activeRegion.getLength(),
        };
      }
    }
    
    // Step 2: Try selected region
    const selectedItems = core.getSelectedItems();
    const selectedRegion = selectedItems.find(item => item instanceof KGRegion) as KGRegion;
    
    if (selectedRegion) {
      return {
        current_region_start: selectedRegion.getStartFromBeat(),
        current_region_end: selectedRegion.getStartFromBeat() + selectedRegion.getLength(),
      };
    }
    
    // Step 3: Fallback to project bounds
    const timeSignature = project.getTimeSignature();
    const beatsPerBar = timeSignature.numerator;
    const maxBars = project.getMaxBars();
    
    return {
      current_region_start: 0,
      current_region_end: maxBars * beatsPerBar,
    };
  }
  
  /**
   * Get full context by combining project and region data
   */
  private static getFullContext(): SystemPromptContext {
    const projectContext = this.extractProjectContext();
    const regionContext = this.extractRegionContext();
    
    return {
      bpm: projectContext.bpm || 120,
      time_signature: projectContext.time_signature || '4/4',
      key_signature: projectContext.key_signature || 'C major',
      track_instrument: projectContext.track_instrument || 'Piano',
      current_region_start: regionContext.current_region_start || 0,
      current_region_end: regionContext.current_region_end || 32,
    };
  }
  
  /**
   * Replace template variables with actual context values
   */
  static replaceTemplateVariables(template: string, context: SystemPromptContext): string {
    let result = template;
    
    // Replace all context variables
    result = result.replace(/{bpm}/g, context.bpm.toString());
    result = result.replace(/{time_signature}/g, context.time_signature);
    result = result.replace(/{key_signature}/g, context.key_signature);
    result = result.replace(/{track_instrument}/g, context.track_instrument);
    result = result.replace(/{current_region_start}/g, context.current_region_start.toString());
    result = result.replace(/{current_region_end}/g, context.current_region_end.toString());
    
    return result;
  }
  
  /**
   * Apply context to an arbitrary prompt string
   */
  static async getPromptWithContext(prompt: string): Promise<string> {
    try {
      const context = this.getFullContext();
      return this.replaceTemplateVariables(prompt, context);
    } catch (error) {
      console.error('Error generating prompt with context:', error);
      return prompt;
    }
  }

  /**
   * Get the system prompt with current context applied (backward compatible)
   */
  static async getSystemPromptWithContext(): Promise<string> {
    try {
      const template = await this.loadTemplate();
      let promptWithContext = await this.getPromptWithContext(template);

      // Append custom instructions from config if provided
      try {
        const configManager = ConfigManager.instance();
        if (!configManager.getIsInitialized()) {
          await configManager.initialize();
        }
        const customInstructions = ((configManager.get('templates.custom_instructions') as string) || '').trim();
        if (customInstructions.length > 0) {
          promptWithContext += `\n\n====\n\nADDITIONAL INSTRUCTIONS\n\n${customInstructions}`;
        }
      } catch (e) {
        console.warn('Failed to load custom instructions from config:', e);
      }

      return promptWithContext;
    } catch (error) {
      console.error('Error generating system prompt with context:', error);
      return this.FALLBACK_PROMPT;
    }
  }
  
  /**
   * Clear the cached template (useful for development/testing)
   */
  static clearCache(): void {
    this.cachedTemplate = null;
  }
}