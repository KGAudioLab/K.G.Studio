import { BaseTool } from './BaseTool';
import type { ToolResult, ToolParameter } from './BaseTool';
import { KGMidiTrack } from '../../core/track/KGMidiTrack';
import { KGMidiRegion } from '../../core/region/KGMidiRegion';
import { convertRegionToABCNotation } from '../../util/abcNotationUtil';
import { KEY_SIGNATURE_MAP } from '../../constants/coreConstants';
import { FLUIDR3_INSTRUMENT_MAP } from '../../constants/generalMidiConstants';

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

  /**
   * Get the display name for percussion instruments, or null if not percussion
   */
  private getPercussionDisplayName(track: KGMidiTrack): string | null {
    try {
      const instrument = track.getInstrument();
      const instrumentInfo = FLUIDR3_INSTRUMENT_MAP[instrument];
      
      if (instrumentInfo && instrumentInfo.group === 'PERCUSSION_KIT') {
        return instrumentInfo.displayName;
      }
      
      return null;
    } catch (error) {
      console.error('Error getting percussion display name:', error);
      return null;
    }
  }

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
   * Find tracks that should be skipped because they have no musical content
   * (no regions or regions with no notes)
   */
  private findTracksToSkip(tracks: KGMidiTrack[]): KGMidiTrack[] {
    try {
      const tracksToSkip: KGMidiTrack[] = [];
      
      for (const track of tracks) {
        const regions = track.getRegions();
        
        // Skip tracks with no regions
        if (regions.length === 0) {
          tracksToSkip.push(track);
          continue;
        }
        
        // Check if all regions in this track are empty (have no notes)
        const hasAnyNotes = regions.some(region => {
          if (region.getCurrentType() === 'KGMidiRegion') {
            return (region as KGMidiRegion).getNotes().length > 0;
          }
          return false;
        });
        
        // Skip tracks where no regions have notes
        if (!hasAnyNotes) {
          tracksToSkip.push(track);
        }
      }
      
      return tracksToSkip;
    } catch (error) {
      console.error('Error finding tracks to skip:', error);
      return [];
    }
  }
  

  /**
   * Generate ABC notation for all tracks
   */
  private generateAllTracksABC(tracks: KGMidiTrack[], startBeat: number, endBeat?: number): string {
    const midiTracks = tracks.filter(track => track instanceof KGMidiTrack);
    
    if (midiTracks.length === 0) {
      return 'No MIDI tracks found in the project.';
    }
    
    // Find tracks to skip (tracks with no content)
    const tracksToSkip = this.findTracksToSkip(midiTracks);
    
    // Get project settings for proper notation
    const project = this.getCurrentProject();
    const timeSignature = project.getTimeSignature();
    const keySignature = project.getKeySignature();
    const abcKeySignature = KEY_SIGNATURE_MAP[keySignature]?.abcNotationKeySignature || 'C';
    
    let output = `All Tracks (beats ${startBeat}-${endBeat || 'end'}):\n\n`;
    
    midiTracks.forEach((track, index) => {
      // Skip tracks that have no musical content
      if (tracksToSkip.includes(track)) {
        return; // Skip this track
      }
      const trackNumber = index + 1;
      const trackName = track.getName() || `Track ${trackNumber}`;
      
      // Check if this track uses a percussion instrument
      const percussionDisplayName = this.getPercussionDisplayName(track);
      
      let displayTrackName: string;
      if (percussionDisplayName) {
        // Use percussion instrument display name for all percussion tracks
        displayTrackName = percussionDisplayName;
      } else if (trackNumber === 1) {
        // Use "Melody" for the first non-percussion track
        displayTrackName = 'Melody';
      } else {
        // Use original track name for other non-percussion tracks
        displayTrackName = trackName;
      }
      
      output += `Track ${trackNumber} - ${displayTrackName}:\n`;
      
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