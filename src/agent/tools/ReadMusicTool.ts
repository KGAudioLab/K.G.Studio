import { BaseTool } from './BaseTool';
import type { ToolResult, ToolParameter } from './BaseTool';
import type { KGTrack } from '../../core/track/KGTrack';
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
  readonly description = 'Read existing musical content from one or more tracks, returned as ABC notation. Use this to understand what notes already exist before making edits. Always call this before asking the user about their music. The output is bar-aligned and includes key/time signature headers.';

  readonly parameters: Record<string, ToolParameter> = {
    track_id: {
      type: 'string',
      description: 'Which track to read. Pass a specific track ID, or "all" to read every track. If omitted, reads the first available track.',
      required: false
    },
    start: {
      type: 'number',
      description: 'Start beat — the absolute beat position to start reading from. The actual output will be rounded down to the nearest bar boundary. Defaults to 0.',
      required: false
    },
    length: {
      type: 'number',
      description: 'Number of beats to read. The actual output will be rounded up to the nearest bar boundary. If omitted, reads to the end of the track.',
      required: false
    }
  };

  buildToolResultDisplayContent(args: Record<string, unknown> | null, toolResult: ToolResult): string | undefined {
    if (!toolResult.success || !args) {
      return undefined;
    }

    const summary = this.buildSummaryData(args);
    if (!summary) {
      return undefined;
    }

    const trackLabel = summary.trackNames.length === 1 ? 'track' : 'tracks';
    return `Read ${trackLabel} ${this.formatTrackNameList(summary.trackNames)} from ${this.formatBarRange(summary.startBar, summary.endBar)}.`;
  }

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
      const startBeat = (params.start as number) || 0;
      const length = params.length as number | undefined;

      const project = this.getCurrentProject();
      const tracks = project.getTracks();

      if (tracks.length === 0) {
        return this.createErrorResult('No tracks found in the project');
      }

      // Validate start
      if (startBeat < 0) {
        return this.createErrorResult(`Invalid start ${startBeat}. Must be >= 0.`);
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

  private buildSummaryData(args: Record<string, unknown>): {
    trackNames: string[];
    startBar: number;
    endBar: number;
  } | null {
    const project = this.getCurrentProject();
    const tracks = project.getTracks();
    if (tracks.length === 0) {
      return null;
    }

    const beatsPerBar = project.getTimeSignature().numerator;
    const startBeat = (args.start as number) || 0;
    const length = args.length as number | undefined;
    if (startBeat < 0 || (length !== undefined && length <= 0)) {
      return null;
    }

    const roundedStartBeat = Math.floor(startBeat / beatsPerBar) * beatsPerBar;
    const rawEndBeat = length !== undefined ? startBeat + length : undefined;
    const roundedEndBeat = rawEndBeat !== undefined
      ? Math.ceil(rawEndBeat / beatsPerBar) * beatsPerBar
      : this.getTrackReadEndBeat(args, tracks, roundedStartBeat);

    const trackNames = this.resolveSummaryTrackNames(args, tracks);
    if (trackNames.length === 0 || roundedEndBeat === undefined) {
      return null;
    }

    return {
      trackNames,
      startBar: Math.floor(roundedStartBeat / beatsPerBar) + 1,
      endBar: Math.max(1, Math.ceil(roundedEndBeat / beatsPerBar)),
    };
  }

  private resolveSummaryTrackNames(
    args: Record<string, unknown>,
    tracks: KGTrack[],
  ): string[] {
    const trackId = args.track_id as string | undefined;

    if (!trackId || trackId === '' || trackId === 'all') {
      const midiTracks = tracks.filter(track => track instanceof KGMidiTrack) as KGMidiTrack[];
      const tracksToSkip = this.findTracksToSkip(midiTracks);
      return midiTracks
        .filter(track => !tracksToSkip.includes(track))
        .map((track, index) => track.getName() || `Track ${index + 1}`);
    }

    const targetTrack = tracks.find(track => track.getId().toString() === trackId);
    if (!(targetTrack instanceof KGMidiTrack)) {
      return [];
    }

    return [targetTrack.getName() || 'Unnamed Track'];
  }

  private getTrackReadEndBeat(
    args: Record<string, unknown>,
    tracks: KGTrack[],
    roundedStartBeat: number,
  ): number | undefined {
    const trackId = args.track_id as string | undefined;

    if (!trackId || trackId === '' || trackId === 'all') {
      const midiTracks = tracks.filter(track => track instanceof KGMidiTrack) as KGMidiTrack[];
      const tracksToSkip = this.findTracksToSkip(midiTracks);
      const visibleTracks = midiTracks.filter(track => !tracksToSkip.includes(track));
      const endBeats = visibleTracks.flatMap(track =>
        track.getRegions()
          .filter(region => region instanceof KGMidiRegion)
          .map(region => region.getStartFromBeat() + region.getLength())
      );
      return endBeats.length > 0 ? Math.max(roundedStartBeat, ...endBeats) : roundedStartBeat;
    }

    const targetTrack = tracks.find(track => track.getId().toString() === trackId);
    if (!(targetTrack instanceof KGMidiTrack)) {
      return undefined;
    }

    const endBeats = targetTrack.getRegions()
      .filter(region => region instanceof KGMidiRegion)
      .map(region => region.getStartFromBeat() + region.getLength());
    return endBeats.length > 0 ? Math.max(roundedStartBeat, ...endBeats) : roundedStartBeat;
  }

  private formatTrackNameList(trackNames: string[]): string {
    if (trackNames.length === 1) {
      return trackNames[0];
    }
    if (trackNames.length === 2) {
      return `${trackNames[0]} and ${trackNames[1]}`;
    }

    return `${trackNames.slice(0, -1).join(', ')}, and ${trackNames.at(-1)}`;
  }

  private formatBarRange(startBar: number, endBar: number): string {
    return startBar === endBar
      ? `bar ${startBar}`
      : `bars ${startBar} to ${endBar}`;
  }

  private hasMidiContentInRange(track: KGMidiTrack, startBeat: number, endBeat?: number): boolean {
    const rangeEndBeat = endBeat ?? Infinity;

    return track.getRegions().some(region => {
      if (!(region instanceof KGMidiRegion)) {
        return false;
      }

      const regionStart = region.getStartFromBeat();
      const regionEnd = regionStart + region.getLength();
      const overlapsRange = regionStart < rangeEndBeat && regionEnd > startBeat;

      return overlapsRange && region.getNotes().length > 0;
    });
  }

  private getEmptyProjectMessage(): string {
    return 'No musical content is present in the project yet.';
  }

  private getEmptyRangeMessage(): string {
    return 'No musical content was found in the selected range.';
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
      return this.getEmptyProjectMessage();
    }

    // Find tracks to skip (tracks with no content)
    const tracksToSkip = this.findTracksToSkip(midiTracks);
    const visibleTracks = midiTracks.filter(track => !tracksToSkip.includes(track));
    if (visibleTracks.length === 0) {
      return this.getEmptyProjectMessage();
    }

    const hasContentInRange = visibleTracks.some(track => this.hasMidiContentInRange(track, startBeat, endBeat));
    if (!hasContentInRange) {
      return this.getEmptyRangeMessage();
    }

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

    if (track.getRegions().length === 0 || !track.getRegions().some(region => (
      region instanceof KGMidiRegion && region.getNotes().length > 0
    ))) {
      return this.getEmptyProjectMessage();
    }

    if (!this.hasMidiContentInRange(track, startBeat, endBeat)) {
      return this.getEmptyRangeMessage();
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
