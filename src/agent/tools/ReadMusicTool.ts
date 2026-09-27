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
import { quarterNotesToTicks, ticksPerBar, ticksToQuarterNotes } from '../../core/timing';

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
      description: 'Start position in quarter-note units, independent of meter. The actual output is rounded down to the nearest bar boundary. Defaults to 0.',
      required: false
    },
    length: {
      type: 'number',
      description: 'Length in quarter-note units, independent of meter. The actual output is rounded up to the nearest bar boundary. If omitted, reads to the end of the track.',
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
      const startQuarterNotes = (normalizedParams.start as number) || 0;
      const lengthQuarterNotes = normalizedParams.length as number | undefined;
      const startTick = quarterNotesToTicks(startQuarterNotes);
      const lengthTicks = lengthQuarterNotes === undefined ? undefined : quarterNotesToTicks(lengthQuarterNotes);

      const project = this.getCurrentProject();
      const tracks = project.getTracks();

      if (tracks.length === 0) {
        return this.createErrorResult('No tracks found in the project');
      }

      // Validate start
      if (startTick < 0) {
        return this.createErrorResult(`Invalid start ${startTick}. Must be >= 0.`);
      }

      // Validate length
      if (lengthTicks !== undefined && lengthTicks <= 0) {
        return this.createErrorResult(`Invalid length ${lengthQuarterNotes}. Must be > 0.`);
      }

      // Get project settings for bar rounding
      const timeSignature = project.getTimeSignature();
      const barTicks = ticksPerBar(timeSignature);

      // Round startTick to floor bar beats and calculate endTick
      const roundedStartTick = Math.floor(startTick / barTicks) * barTicks;
      const rawEndTick = lengthTicks !== undefined ? startTick + lengthTicks : undefined;
      const roundedEndTick = rawEndTick !== undefined ? Math.ceil(rawEndTick / barTicks) * barTicks : undefined;

      let abcOutput = '';

      if (!trackId || trackId === '' || trackId === 'all') {
        // Read all tracks
        const midiTracks = tracks.filter(track => track instanceof KGMidiTrack) as KGMidiTrack[];
        abcOutput = this.generateAllTracksABC(midiTracks, roundedStartTick, roundedEndTick);
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

        abcOutput = this.generateSingleTrackABC(targetTrack, roundedStartTick, roundedEndTick);
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

    const projectTimeSignature = project.getTimeSignature();
    const barTicks = ticksPerBar(projectTimeSignature);
    const startQuarterNotes = (normalizedArgs.start as number) || 0;
    const lengthQuarterNotes = normalizedArgs.length as number | undefined;
    if (startQuarterNotes < 0 || (lengthQuarterNotes !== undefined && lengthQuarterNotes <= 0)) {
      return null;
    }
    const startTick = quarterNotesToTicks(startQuarterNotes);
    const lengthTicks = lengthQuarterNotes === undefined ? undefined : quarterNotesToTicks(lengthQuarterNotes);

    const roundedStartTick = Math.floor(startTick / barTicks) * barTicks;
    const rawEndTick = lengthTicks !== undefined ? startTick + lengthTicks : undefined;
    const roundedEndTick = rawEndTick !== undefined
      ? Math.ceil(rawEndTick / barTicks) * barTicks
      : this.getTrackReadEndTick(normalizedArgs, tracks, roundedStartTick);

    const trackNames = this.resolveSummaryTrackNames(normalizedArgs, tracks);
    if (trackNames.length === 0 || roundedEndTick === undefined) {
      return null;
    }

    return {
      trackNames,
      startBar: Math.floor(roundedStartTick / barTicks) + 1,
      endBar: Math.max(1, Math.ceil(roundedEndTick / barTicks)),
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

  private getTrackReadEndTick(
    args: Record<string, unknown>,
    tracks: KGTrack[],
    roundedStartTick: number,
  ): number | undefined {
    const trackId = args.track_id as string | undefined;

    if (!trackId || trackId === '' || trackId === 'all') {
      const midiTracks = tracks.filter(track => track instanceof KGMidiTrack) as KGMidiTrack[];
      const endTicks = midiTracks.flatMap(track =>
        track.getRegions()
          .filter(region => region instanceof KGMidiRegion)
          .map(region => region.getStartTick() + region.getLengthTicks())
      );
      return endTicks.length > 0 ? Math.max(roundedStartTick, ...endTicks) : roundedStartTick;
    }

    const targetTrack = tracks.find(track => track.getId().toString() === trackId);
    if (!(targetTrack instanceof KGMidiTrack)) {
      return undefined;
    }

    const endTicks = targetTrack.getRegions()
      .filter(region => region instanceof KGMidiRegion)
      .map(region => region.getStartTick() + region.getLengthTicks());
    return endTicks.length > 0 ? Math.max(roundedStartTick, ...endTicks) : roundedStartTick;
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

  private hasMidiContentInRange(track: KGMidiTrack, startTick: number, endTick?: number): boolean {
    const rangeEndTick = endTick ?? Infinity;

    return track.getRegions().some(region => {
      if (!(region instanceof KGMidiRegion)) {
        return false;
      }

      const regionStart = region.getStartTick();
      const regionEnd = regionStart + region.getLengthTicks();
      const overlapsRange = regionStart < rangeEndTick && regionEnd > startTick;

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
      `Q:1/4=${bpm}`,
      `K:${abcKeySignature}`
    ].join('\n');
  }

  private hasAnyMidiNotes(tracks: KGMidiTrack[]): boolean {
    return tracks.some(track => track.getRegions().some(region => (
      region instanceof KGMidiRegion && region.getNotes().length > 0
    )));
  }

  private buildRestBody(startTick: number, endTick: number | undefined): string {
    const currentTimeSignature = this.getCurrentProject().getTimeSignature();
    const ticksPerBar = currentTimeSignature.numerator * 960 * (4 / currentTimeSignature.denominator);
    const effectiveEndTick = endTick ?? (startTick + ticksPerBar);
    const totalBars = Math.max(1, Math.ceil((effectiveEndTick - startTick) / ticksPerBar));
    const restToken = `z${ticksToQuarterNotes(ticksPerBar)}`;
    return Array.from({ length: totalBars }, () => restToken).join(' | ') + ' |';
  }

  /**
   * Generate ABC notation for all tracks
   */
  private generateAllTracksABC(tracks: KGMidiTrack[], startTick: number, endTick?: number): string {
    const midiTracks = tracks.filter(track => track instanceof KGMidiTrack);

    if (midiTracks.length === 0) {
      return this.getEmptyProjectMessage();
    }

    if (!this.hasAnyMidiNotes(midiTracks)) {
      return this.getEmptyProjectMessage();
    }

    const hasContentInRange = midiTracks.some(track => this.hasMidiContentInRange(track, startTick, endTick));
    if (!hasContentInRange) {
      return this.getEmptyRangeMessage();
    }

    let output = `Tracks (quarter-notes ${ticksToQuarterNotes(startTick)}-${endTick === undefined ? 'end' : ticksToQuarterNotes(endTick)}):\n\n`;

    midiTracks.forEach((track) => {
      // Get all regions from the track and convert each one
      const regions = track.getRegions().filter(region => region instanceof KGMidiRegion) as KGMidiRegion[];

      if (regions.length === 0) {
      output += `${this.buildTrackHeader(track)}\n`;
      output += `${this.buildRestBody(startTick, endTick)} // No regions found\n\n`;
      } else {
        // Convert each region that overlaps with the requested range
        let hasContent = false;
        regions.forEach((region) => {
          const regionStart = region.getStartTick();
          const regionEnd = regionStart + region.getLengthTicks();

          // Check if region overlaps with requested range
          if (regionStart < (endTick || Infinity) && regionEnd > startTick) {
            const abcNotation = convertRegionToABCNotation(region, startTick, endTick);
            output += abcNotation + '\n\n';
            hasContent = true;
          }
        });

        if (!hasContent) {
          output += `${this.buildTrackHeader(track)}\n`;
          output += `${this.buildRestBody(startTick, endTick)} // No content in specified range\n\n`;
        }
      }
    });

    return output.trim();
  }

  /**
   * Generate ABC notation for a single track
   */
  private generateSingleTrackABC(track: KGMidiTrack, startTick: number, endTick?: number): string {
    if (!(track instanceof KGMidiTrack)) {
      return `Track is not a MIDI track.`;
    }

    if (!track.getRegions().some(region => (
      region instanceof KGMidiRegion && region.getNotes().length > 0
    ))) {
      return this.getEmptyProjectMessage();
    }

    if (!this.hasMidiContentInRange(track, startTick, endTick)) {
      return this.getEmptyRangeMessage();
    }

    let output = '';

    // Get all regions from the track and convert each one
    const regions = track.getRegions().filter(region => region instanceof KGMidiRegion) as KGMidiRegion[];

    if (regions.length === 0) {
      output += `${this.buildTrackHeader(track)}\n`;
      output += `${this.buildRestBody(startTick, endTick)} // No regions found`;
    } else {
      // Convert each region that overlaps with the requested range
      let hasContent = false;
      regions.forEach((region) => {
        const regionStart = region.getStartTick();
        const regionEnd = regionStart + region.getLengthTicks();

        // Check if region overlaps with requested range
        if (regionStart < (endTick || Infinity) && regionEnd > startTick) {
          const abcNotation = convertRegionToABCNotation(region, startTick, endTick);
          output += abcNotation;
          hasContent = true;
        }
      });

      if (!hasContent) {
        output += `${this.buildTrackHeader(track)}\n`;
        output += `${this.buildRestBody(startTick, endTick)} // No content in specified range`;
      }
    }

    return output;
  }

}
