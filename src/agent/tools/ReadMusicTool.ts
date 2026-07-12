import { BaseTool } from './BaseTool';
import type { ToolResult, ToolParameter } from './BaseTool';
import type { KGTrack } from '../../core/track/KGTrack';
import { KGMidiTrack } from '../../core/track/KGMidiTrack';
import { KGMidiRegion } from '../../core/region/KGMidiRegion';
import { convertRegionToABCNotation } from '../../util/abcNotationUtil';
import { KEY_SIGNATURE_MAP } from '../../constants/coreConstants';
import { FLUIDR3_INSTRUMENT_MAP } from '../../constants/generalMidiConstants';
import { getInstrumentDisplayName } from '../../core/instruments/instrumentResolver';
import { normalizeOptionalTrackIdParam } from './trackIdNormalization';

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
      const normalizedParams = normalizeOptionalTrackIdParam(params);
      // Validate parameters
      this.validateParameters(normalizedParams);

      const trackId = normalizedParams.track_id as string | undefined;
      const startBeat = (normalizedParams.start as number) || 0;
      const length = normalizedParams.length as number | undefined;

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
    const normalizedArgs = normalizeOptionalTrackIdParam(args);
    const project = this.getCurrentProject();
    const tracks = project.getTracks();
    if (tracks.length === 0) {
      return null;
    }

    const beatsPerBar = project.getTimeSignature().numerator;
    const startBeat = (normalizedArgs.start as number) || 0;
    const length = normalizedArgs.length as number | undefined;
    if (startBeat < 0 || (length !== undefined && length <= 0)) {
      return null;
    }

    const roundedStartBeat = Math.floor(startBeat / beatsPerBar) * beatsPerBar;
    const rawEndBeat = length !== undefined ? startBeat + length : undefined;
    const roundedEndBeat = rawEndBeat !== undefined
      ? Math.ceil(rawEndBeat / beatsPerBar) * beatsPerBar
      : this.getTrackReadEndBeat(normalizedArgs, tracks, roundedStartBeat);

    const trackNames = this.resolveSummaryTrackNames(normalizedArgs, tracks);
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
      return midiTracks.map((track, index) => track.getName() || `Track ${index + 1}`);
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
      const endBeats = midiTracks.flatMap(track =>
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

  private buildTrackHeader(track: KGMidiTrack): string {
    const project = this.getCurrentProject();
    const timeSignature = project.getTimeSignature();
    const bpm = project.getBpm();
    const keySignature = project.getKeySignature();
    const abcKeySignature = KEY_SIGNATURE_MAP[keySignature]?.abcNotationKeySignature || 'C';
    const trackId = track.getId().toString();
    const trackName = track.getName() || 'Unnamed Track';
    const instrumentName = getInstrumentDisplayName(String(track.getInstrument()));

    return [
      `track_id: ${trackId}`,
      `track_name: ${trackName}`,
      `Instrument: ${instrumentName}`,
      'X:1',
      `M:${timeSignature.numerator}/${timeSignature.denominator}`,
      `L:1/${timeSignature.denominator}`,
      `Q:1/${timeSignature.denominator}=${bpm}`,
      `K:${abcKeySignature}`
    ].join('\n');
  }

  private hasAnyMidiNotes(tracks: KGMidiTrack[]): boolean {
    return tracks.some(track => track.getRegions().some(region => (
      region instanceof KGMidiRegion && region.getNotes().length > 0
    )));
  }

  private buildRestBody(startBeat: number, endBeat: number | undefined): string {
    const beatsPerBar = this.getCurrentProject().getTimeSignature().numerator;
    const effectiveEndBeat = endBeat ?? (startBeat + beatsPerBar);
    const totalBars = Math.max(1, Math.ceil((effectiveEndBeat - startBeat) / beatsPerBar));
    const restToken = `z${beatsPerBar}`;
    return Array.from({ length: totalBars }, () => restToken).join(' | ') + ' |';
  }

  /**
   * Generate ABC notation for all tracks
   */
  private generateAllTracksABC(tracks: KGMidiTrack[], startBeat: number, endBeat?: number): string {
    const midiTracks = tracks.filter(track => track instanceof KGMidiTrack);

    if (midiTracks.length === 0) {
      return this.getEmptyProjectMessage();
    }

    if (!this.hasAnyMidiNotes(midiTracks)) {
      return this.getEmptyProjectMessage();
    }

    const hasContentInRange = midiTracks.some(track => this.hasMidiContentInRange(track, startBeat, endBeat));
    if (!hasContentInRange) {
      return this.getEmptyRangeMessage();
    }

    let output = `Tracks (beats ${startBeat}-${endBeat || 'end'}):\n\n`;

    midiTracks.forEach((track) => {
      // Get all regions from the track and convert each one
      const regions = track.getRegions().filter(region => region instanceof KGMidiRegion) as KGMidiRegion[];

      if (regions.length === 0) {
      output += `${this.buildTrackHeader(track)}\n`;
      output += `${this.buildRestBody(startBeat, endBeat)} // No regions found\n\n`;
      } else {
        // Convert each region that overlaps with the requested range
        let hasContent = false;
        regions.forEach((region) => {
          const regionStart = region.getStartFromBeat();
          const regionEnd = regionStart + region.getLength();

          // Check if region overlaps with requested range
          if (regionStart < (endBeat || Infinity) && regionEnd > startBeat) {
            const abcNotation = convertRegionToABCNotation(region, startBeat, endBeat);
            output += abcNotation + '\n\n';
            hasContent = true;
          }
        });

        if (!hasContent) {
          output += `${this.buildTrackHeader(track)}\n`;
          output += `${this.buildRestBody(startBeat, endBeat)} // No content in specified range\n\n`;
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

    if (!track.getRegions().some(region => (
      region instanceof KGMidiRegion && region.getNotes().length > 0
    ))) {
      return this.getEmptyProjectMessage();
    }

    if (!this.hasMidiContentInRange(track, startBeat, endBeat)) {
      return this.getEmptyRangeMessage();
    }

    let output = '';

    // Get all regions from the track and convert each one
    const regions = track.getRegions().filter(region => region instanceof KGMidiRegion) as KGMidiRegion[];

    if (regions.length === 0) {
      output += `${this.buildTrackHeader(track)}\n`;
      output += `${this.buildRestBody(startBeat, endBeat)} // No regions found`;
    } else {
      // Convert each region that overlaps with the requested range
      let hasContent = false;
      regions.forEach((region) => {
        const regionStart = region.getStartFromBeat();
        const regionEnd = regionStart + region.getLength();

        // Check if region overlaps with requested range
        if (regionStart < (endBeat || Infinity) && regionEnd > startBeat) {
          const abcNotation = convertRegionToABCNotation(region, startBeat, endBeat);
          output += abcNotation;
          hasContent = true;
        }
      });

      if (!hasContent) {
        output += `${this.buildTrackHeader(track)}\n`;
        output += `${this.buildRestBody(startBeat, endBeat)} // No content in specified range`;
      }
    }

    return output;
  }

}
