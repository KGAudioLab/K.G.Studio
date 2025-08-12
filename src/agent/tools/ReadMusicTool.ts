import { BaseTool } from './BaseTool';
import type { ToolResult, ToolParameter } from './BaseTool';
import { KGMidiTrack } from '../../core/track/KGMidiTrack';
import { KGMidiRegion } from '../../core/region/KGMidiRegion';
import { convertRegionToABCNotation } from '../../util/abcNotationUtil';
import { KEY_SIGNATURE_MAP } from '../../constants/coreConstants';
import { useProjectStore } from '../../stores/projectStore';
import { KGRegion } from '../../core/region/KGRegion';
import { KGCore } from '../../core/KGCore';

/**
 * Tool for reading music content from the project
 * Provides read-only access to project data and converts to ABC notation
 */
export class ReadMusicTool extends BaseTool {
  readonly name = 'read_music';
  readonly description = 'Read the music content from a specific track or all tracks, returning the content in ABC notation format.';
  
  readonly parameters: Record<string, ToolParameter> = {
    track_id: {
      type: 'string',
      description: 'The track ID to read, or "all" to read all tracks. If not provided, reads the first available track.',
      required: false
    },
    start_beat: {
      type: 'number',
      description: 'Start beat position to read from (default: 0)',
      required: false
    },
    length: {
      type: 'number',
      description: 'Length in beats to read (default: entire track/project)',
      required: false
    }
  };

  async execute(params: Record<string, unknown>): Promise<ToolResult> {
    try {
      // Validate parameters
      this.validateParameters(params);
      
      const trackId = params.track_id as string | undefined;
      const startBeat = (params.start_beat as number) || 0;
      const length = params.length as number | undefined;
      
      const project = this.getCurrentProject();
      const tracks = project.getTracks();
      
      if (tracks.length === 0) {
        return this.createErrorResult('No tracks found in the project');
      }
      
      // Validate start_beat
      if (startBeat < 0) {
        return this.createErrorResult(`Invalid start_beat ${startBeat}. Must be >= 0.`);
      }
      
      // Validate length
      if (length !== undefined && length <= 0) {
        return this.createErrorResult(`Invalid length ${length}. Must be > 0.`);
      }

      // Get project settings for bar rounding
      const timeSignature = project.getTimeSignature();
      const beatsPerBar = timeSignature.numerator;
      
      // Round startBeat to floor bar beats and calculate endBeat
      const roundedStartBeat = Math.floor(startBeat / beatsPerBar) * beatsPerBar;
      const rawEndBeat = length !== undefined ? startBeat + length : undefined;
      const roundedEndBeat = rawEndBeat !== undefined ? Math.ceil(rawEndBeat / beatsPerBar) * beatsPerBar : undefined;

      let abcOutput = '';

      if (!trackId || trackId === '' || trackId === 'all') {
        // Read all tracks
        const midiTracks = tracks.filter(track => track instanceof KGMidiTrack) as KGMidiTrack[];
        abcOutput = this.generateAllTracksABC(midiTracks, roundedStartBeat, roundedEndBeat);
      } else {
        // Read specific track or first available track
        const targetTrack = trackId 
          ? tracks.find(t => t.getId().toString() === trackId)
          : tracks[0];
          
        if (!targetTrack) {
          return this.createErrorResult(
            trackId 
              ? `Track with ID "${trackId}" not found`
              : 'No tracks available'
          );
        }
        
        if (!(targetTrack instanceof KGMidiTrack)) {
          return this.createErrorResult(`Track "${targetTrack.getName()}" is not a MIDI track`);
        }
        
        abcOutput = this.generateSingleTrackABC(targetTrack, roundedStartBeat, roundedEndBeat);
      }
      
      return this.createSuccessResult(abcOutput);
      
    } catch (error) {
      return this.createErrorResult(`Failed to read music: ${error}`);
    }
  }

  /**
   * Get KGCore instance
   */
  private getKGCore(): KGCore {
    return KGCore.instance();
  }

  /**
   * Find the track that contains the active piano roll region or first selected region
   */
  private findTrackToSkip(tracks: KGMidiTrack[]): KGMidiTrack | null {
    try {
      const store = useProjectStore.getState();
      const core = this.getKGCore();
      
      // First check for active piano roll region
      if (store.activeRegionId) {
        const activeRegion = this.findRegionById(store.activeRegionId, tracks);
        if (activeRegion) {
          const track = this.findTrackByRegion(activeRegion, tracks);
          return track;
        }
      }
      
      // Then check for selected regions
      const selectedItems = core.getSelectedItems();
      const selectedRegion = selectedItems.find((item: unknown) => item instanceof KGRegion) as KGRegion;
      
      if (selectedRegion) {
        const track = this.findTrackByRegion(selectedRegion, tracks);
        return track;
      }
      
      return null;
    } catch (error) {
      console.error('Error finding track to skip:', error);
      return null;
    }
  }
  
  /**
   * Find a region by ID across all tracks
   */
  private findRegionById(regionId: string, tracks: KGMidiTrack[]): KGRegion | null {
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
  private findTrackByRegion(region: KGRegion, tracks: KGMidiTrack[]): KGMidiTrack | null {
    return tracks.find(track => track.getRegions().includes(region)) || null;
  }

  /**
   * Generate ABC notation for all tracks
   */
  private generateAllTracksABC(tracks: KGMidiTrack[], startBeat: number, endBeat?: number): string {
    const midiTracks = tracks.filter(track => track instanceof KGMidiTrack);
    
    if (midiTracks.length === 0) {
      return 'No MIDI tracks found in the project.';
    }
    
    // Find the track to skip (unless it's the first track)
    const trackToSkip = this.findTrackToSkip(midiTracks);
    const firstTrack = midiTracks[0]; // The melody track
    
    // Get project settings for proper notation
    const project = this.getCurrentProject();
    const timeSignature = project.getTimeSignature();
    const keySignature = project.getKeySignature();
    const abcKeySignature = KEY_SIGNATURE_MAP[keySignature]?.abcNotationKeySignature || 'C';
    
    let output = `All Tracks (beats ${startBeat}-${endBeat || 'end'}):\n\n`;
    
    midiTracks.forEach((track, index) => {
      // Skip this track if it's the track to skip AND it's not the first track (melody)
      if (trackToSkip && track === trackToSkip && track !== firstTrack) {
        return; // Skip this track
      }
      const trackNumber = index + 1;
      const trackName = track.getName() || `Track ${trackNumber}`;
      
      // hardcode the 1st track to be the melody, other track names are the same as the original track names
      output += `Track ${trackNumber} - ${trackNumber === 1 ? 'Melody' : trackName}:\n`;
      
      // Get all regions from the track and convert each one
      const regions = track.getRegions().filter(region => region instanceof KGMidiRegion) as KGMidiRegion[];
      
      if (regions.length === 0) {
        output += 'X:' + trackNumber + '\n';
        output += `M:${timeSignature.numerator}/${timeSignature.denominator}\n`;
        output += `K:${abcKeySignature}\n`;
        output += 'z4 | // No regions found\n\n';
      } else {
        // Convert each region that overlaps with the requested range
        let hasContent = false;
        regions.forEach((region) => {
          const regionStart = region.getStartFromBeat();
          const regionEnd = regionStart + region.getLength();
          
          // Check if region overlaps with requested range
          if (regionStart < (endBeat || Infinity) && regionEnd > startBeat) {
            const abcNotation = convertRegionToABCNotation(region, startBeat, endBeat);
            
            // Update the X: line to include track number
            const lines = abcNotation.split('\n');
            lines[0] = `X:${trackNumber}`;
            output += lines.join('\n') + '\n\n';
            hasContent = true;
          }
        });
        
        if (!hasContent) {
          output += 'X:' + trackNumber + '\n';
          output += `M:${timeSignature.numerator}/${timeSignature.denominator}\n`;
          output += `K:${abcKeySignature}\n`;
          output += 'z4 | // No content in specified range\n\n';
        }
      }
    });
    
    return output.trim();
  }

  /**
   * Generate ABC notation for a single track
   */
  private generateSingleTrackABC(track: KGMidiTrack, startBeat: number, endBeat?: number): string {
    if (!(track instanceof KGMidiTrack)) {
      return `Track is not a MIDI track.`;
    }
    
    // Get project settings for proper notation
    const project = this.getCurrentProject();
    const timeSignature = project.getTimeSignature();
    const keySignature = project.getKeySignature();
    const abcKeySignature = KEY_SIGNATURE_MAP[keySignature]?.abcNotationKeySignature || 'C';
    
    const trackName = track.getName() || 'Unnamed Track';
    
    let output = `Track "${trackName}" (beats ${startBeat}-${endBeat || 'end'}):\n`;
    
    // Get all regions from the track and convert each one
    const regions = track.getRegions().filter(region => region instanceof KGMidiRegion) as KGMidiRegion[];
    
    if (regions.length === 0) {
      output += 'X:1\n';
      output += `T:${trackName}\n`;
      output += `M:${timeSignature.numerator}/${timeSignature.denominator}\n`;
      output += `K:${abcKeySignature}\n`;
      output += `L:1/${timeSignature.denominator}\n`;
      output += 'z4 | // No regions found';
    } else {
      // Convert each region that overlaps with the requested range
      let hasContent = false;
      regions.forEach((region) => {
        const regionStart = region.getStartFromBeat();
        const regionEnd = regionStart + region.getLength();
        
        // Check if region overlaps with requested range
        if (regionStart < (endBeat || Infinity) && regionEnd > startBeat) {
          const abcNotation = convertRegionToABCNotation(region, startBeat, endBeat);
          
          // Update the title to include track name
          const lines = abcNotation.split('\n');
          lines[1] = `T:${trackName}`;
          output += lines.join('\n');
          hasContent = true;
        }
      });
      
      if (!hasContent) {
        output += 'X:1\n';
        output += `T:${trackName}\n`;
        output += `M:${timeSignature.numerator}/${timeSignature.denominator}\n`;
        output += `K:${abcKeySignature}\n`;
        output += `L:1/${timeSignature.denominator}\n`;
        output += 'z4 | // No content in specified range';
      }
    }
    
    return output;
  }

}