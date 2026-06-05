import { BaseTool } from './BaseTool';
import type { ToolParameter, ToolResult } from './BaseTool';
import {
  WriteTempoTrackCommand,
  type WriteTempoEntry,
} from '../../core/commands/global-region/WriteTempoTrackCommand';

interface RequestedBpmEntry {
  bpm: number;
  beat?: number | null | '';
}

interface NormalizedExplicitEntry extends WriteTempoEntry {
  inputBeat: number;
  normalizedBar: number;
}

interface NormalizedPayload {
  baseBpm: number;
  explicitEntries: NormalizedExplicitEntry[];
}

export class WriteBpmTool extends BaseTool {
  readonly name = 'write_bpm';
  readonly description = 'Write BPM changes to the global Tempo track. This tool updates the project default BPM and rebuilds the Tempo track as a gapless full-song tempo plan with bar-aligned boundaries.';

  readonly parameters: Record<string, ToolParameter> = {
    bpms: {
      type: 'array',
      description: 'The complete BPM plan to write. Provide one optional beat-less item for the project default BPM, plus any explicit beat-based tempo changes.',
      required: true,
      items: {
        type: 'object',
        description: 'One BPM entry. Omit "beat", set it to null, or set it to an empty string to provide the global/default BPM.',
        properties: {
          bpm: {
            type: 'number',
            description: 'Required BPM value. Must be a finite number greater than 0.',
            required: true,
          },
          beat: {
            type: 'number',
            description: 'Optional absolute beat on the project timeline. When omitted, null, or empty, this entry becomes the project default BPM.',
            required: false,
          },
        },
      },
    },
  };

  override isReadOnlyTool(): boolean {
    return false;
  }

  override isAvailableInEfficientMode(): boolean {
    return false;
  }

  override buildToolResultDisplayContent(_args: Record<string, unknown> | null, toolResult: ToolResult): string | undefined {
    return toolResult.result;
  }

  override buildToolHistoryContent(_args: Record<string, unknown> | null, toolResult: ToolResult): string | undefined {
    return toolResult.result;
  }

  override buildConfirmationContent(args: Record<string, unknown> | null): string | undefined {
    if (!args) {
      return undefined;
    }

    try {
      const normalized = this.normalizePayload(args.bpms as RequestedBpmEntry[]);
      const explicitEntries = normalized.explicitEntries;
      if (explicitEntries.length === 0) {
        return `Allow rebuilding the global Tempo track using project default tempo ${normalized.baseBpm} BPM with no explicit tempo regions?`;
      }

      const firstBeat = explicitEntries[0].inputBeat;
      const lastBeat = explicitEntries[explicitEntries.length - 1].inputBeat;
      return `Allow rebuilding the global Tempo track with default tempo ${normalized.baseBpm} BPM and ${explicitEntries.length} explicit tempo ${explicitEntries.length === 1 ? 'change' : 'changes'} from beat ${firstBeat} to beat ${lastBeat}?`;
    } catch {
      return undefined;
    }
  }

  async execute(params: Record<string, unknown>): Promise<ToolResult> {
    try {
      if (!Array.isArray(params.bpms)) {
        throw new Error('Parameter "bpms" must be an array.');
      }

      const normalized = this.normalizePayload(params.bpms as RequestedBpmEntry[]);
      const command = new WriteTempoTrackCommand(
        normalized.baseBpm,
        normalized.explicitEntries.map(entry => ({
          startBeat: entry.startBeat,
          bpm: entry.bpm,
        })),
      );
      await this.executeCommand(command);

      const explicitDetails = normalized.explicitEntries.length === 0
        ? 'No explicit tempo regions were written; the Tempo track now falls back entirely to the project default BPM.'
        : normalized.explicitEntries
          .map(entry => `${entry.bpm} BPM from beat ${entry.startBeat} (bar ${entry.normalizedBar + 1})`)
          .join(', ');

      return this.createSuccessResult(
        `Successfully rebuilt the global Tempo track. Project default BPM: ${normalized.baseBpm} BPM. ${explicitDetails}`,
      );
    } catch (error) {
      return this.createErrorResult(`Failed to write BPM: ${error}`);
    }
  }

  private normalizePayload(entries: RequestedBpmEntry[]): NormalizedPayload {
    if (!Array.isArray(entries) || entries.length === 0) {
      throw new Error('Parameter "bpms" must contain at least one BPM entry.');
    }

    const project = this.getCurrentProject();
    const beatsPerBar = project.getTimeSignature().numerator;
    const songEndBeat = project.getMaxBars() * beatsPerBar;

    let baseBpm = project.getBpm();
    let sawDefaultEntry = false;
    const explicitEntries: NormalizedExplicitEntry[] = [];

    entries.forEach((entry, index) => {
      const bpm = this.validateBpm(entry.bpm, index);
      const beat = entry.beat;

      if (beat === undefined || beat === null || beat === '') {
        if (sawDefaultEntry) {
          throw new Error('Only one global/default BPM entry may omit the "beat" field.');
        }
        baseBpm = bpm;
        sawDefaultEntry = true;
        return;
      }

      if (!Number.isFinite(beat)) {
        throw new Error(`BPM entry ${index + 1} has invalid "beat": ${String(beat)}. Expected a finite number >= 0.`);
      }
      if (beat < 0) {
        throw new Error(`BPM entry ${index + 1} has invalid "beat": ${beat}. Expected a value >= 0.`);
      }
      if (beat >= songEndBeat) {
        throw new Error(`BPM entry ${index + 1} has invalid "beat": ${beat}. It must be within the song range.`);
      }

      explicitEntries.push({
        bpm,
        startBeat: beat,
        inputBeat: beat,
        normalizedBar: Math.floor(beat / beatsPerBar),
      });
    });

    explicitEntries.sort((left, right) => left.startBeat - right.startBeat);

    for (let index = 1; index < explicitEntries.length; index += 1) {
      const previous = explicitEntries[index - 1];
      const current = explicitEntries[index];
      if (current.normalizedBar <= previous.normalizedBar) {
        throw new Error(
          `BPM entry ${index + 1} overlaps with or collapses into entry ${index} after bar alignment. Entry ${index} normalizes to bar ${previous.normalizedBar + 1}, and entry ${index + 1} normalizes to bar ${current.normalizedBar + 1}.`,
        );
      }
    }

    return {
      baseBpm,
      explicitEntries,
    };
  }

  private validateBpm(rawValue: number, index: number): number {
    if (!Number.isFinite(rawValue) || rawValue <= 0) {
      throw new Error(`BPM entry ${index + 1} has invalid "bpm": ${String(rawValue)}. Expected a finite number greater than 0.`);
    }

    return rawValue;
  }
}
