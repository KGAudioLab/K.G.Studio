import { BaseTool } from './BaseTool';
import type { ToolParameter, ToolResult } from './BaseTool';
import {
  WriteMarkersCommand,
  type WriteMarkerEntry,
} from '../../core/commands/global-region/WriteMarkersCommand';
import { quarterNotesToTicks, ticksToQuarterNotes } from '../../core/timing';

interface RequestedMarkerEntry {
  marker: string;
  beat: number;
  length: number;
}

interface ValidatedMarkerEntry extends WriteMarkerEntry {
  marker: string;
}

export class WriteMarkersTool extends BaseTool {
  readonly name = 'write_markers';
  readonly description = 'Write marker annotations using absolute quarter-note positions independent of meter. Marker regions are annotation-only and do not affect playback.';

  override isReadOnlyTool(): boolean {
    return false;
  }

  override isAvailableInEfficientMode(): boolean {
    return false;
  }

  readonly parameters: Record<string, ToolParameter> = {
    markers: {
      type: 'array',
      description: 'Marker annotations to write. Each entry uses an absolute start in quarter-note units.',
      required: true,
      items: {
        type: 'object',
        description: 'A single marker annotation region.',
        properties: {
          marker: {
            type: 'string',
            description: 'Marker label text. Must be non-empty after trimming.',
            required: true,
          },
          beat: {
            type: 'number',
            description: 'Absolute start in quarter-note units, independent of meter.',
            required: true,
          },
          length: {
            type: 'number',
            description: 'Marker duration in quarter-note units. Must be greater than 0.',
            required: true,
          },
        },
      },
    },
  };

  override buildToolResultDisplayContent(_args: Record<string, unknown> | null, toolResult: ToolResult): string | undefined {
    return this.formatMultilineResult(toolResult.result);
  }

  override buildToolHistoryContent(_args: Record<string, unknown> | null, toolResult: ToolResult): string | undefined {
    return toolResult.result;
  }

  override buildConfirmationContent(args: Record<string, unknown> | null): string | undefined {
    if (!args) {
      return undefined;
    }

    try {
      const validatedMarkers = this.validateAndNormalizeMarkers(args.markers as RequestedMarkerEntry[]);
      const firstBeat = ticksToQuarterNotes(validatedMarkers[0].startTick);
      const lastBeatExclusive = ticksToQuarterNotes(Math.max(...validatedMarkers.map(marker => marker.startTick + marker.length)));
      return `Allow writing ${validatedMarkers.length} marker ${validatedMarkers.length === 1 ? 'annotation' : 'annotations'} to the global Marker track from quarter-note ${firstBeat} to quarter-note ${lastBeatExclusive}?`;
    } catch {
      return undefined;
    }
  }

  async execute(params: Record<string, unknown>): Promise<ToolResult> {
    try {
      this.validateParameters(params);

      const validatedMarkers = this.validateAndNormalizeMarkers(params.markers as RequestedMarkerEntry[]);
      await this.executeCommand(new WriteMarkersCommand(validatedMarkers.map(marker => ({
        startTick: marker.startTick,
        length: marker.length,
        name: marker.marker,
      }))));

      const details = validatedMarkers
        .map(marker => `[Quarter-note: ${ticksToQuarterNotes(marker.startTick)}; Length: ${ticksToQuarterNotes(marker.length)}]: ${marker.marker}`)
        .join('\n');

      return this.createSuccessResult(
        `Successfully wrote ${validatedMarkers.length} marker ${validatedMarkers.length === 1 ? 'annotation' : 'annotations'} to the global Marker track. Markers are annotation-only and do not affect playback.\n${details}`,
      );
    } catch (error) {
      return this.createErrorResult(`Failed to write markers: ${error}`);
    }
  }

  private validateAndNormalizeMarkers(markers: RequestedMarkerEntry[]): ValidatedMarkerEntry[] {
    if (markers.length === 0) {
      throw new Error('Parameter "markers" must contain at least one marker entry.');
    }

    const validated = markers.map((marker, index) => this.validateMarkerEntry(marker, index));
    validated.sort((left, right) => left.startTick - right.startTick);

    for (let index = 1; index < validated.length; index += 1) {
      const previous = validated[index - 1];
      const current = validated[index];
      if (current.startTick < previous.startTick + previous.length) {
        throw new Error(
          `Marker entry ${index + 1} overlaps with marker entry ${index}. Entry ${index} ends at quarter-note ${ticksToQuarterNotes(previous.startTick + previous.length)}, but entry ${index + 1} starts at quarter-note ${ticksToQuarterNotes(current.startTick)}.`,
        );
      }
    }

    return validated;
  }

  private validateMarkerEntry(marker: RequestedMarkerEntry, index: number): ValidatedMarkerEntry {
    if (!Number.isFinite(marker.beat)) {
      throw new Error(`Marker entry ${index + 1} has invalid "beat": ${String(marker.beat)}. Expected a finite number >= 0.`);
    }
    if (marker.beat < 0) {
      throw new Error(`Marker entry ${index + 1} has invalid "beat": ${marker.beat}. Expected a value >= 0.`);
    }
    if (!Number.isFinite(marker.length)) {
      throw new Error(`Marker entry ${index + 1} has invalid "length": ${String(marker.length)}. Expected a finite number > 0.`);
    }
    if (marker.length <= 0) {
      throw new Error(`Marker entry ${index + 1} has invalid "length": ${marker.length}. Expected a value > 0.`);
    }

    const normalizedMarker = marker.marker?.replace(/\r?\n/g, ' ').trim();
    if (!normalizedMarker) {
      throw new Error(`Marker entry ${index + 1} has invalid "marker": expected a non-empty marker label.`);
    }

    return {
      marker: normalizedMarker,
      name: normalizedMarker,
      startTick: quarterNotesToTicks(marker.beat),
      length: quarterNotesToTicks(marker.length),
    };
  }

  private formatMultilineResult(result: string): string {
    return result.replace(/\n/g, '  \n');
  }
}
