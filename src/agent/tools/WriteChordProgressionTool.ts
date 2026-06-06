import { BaseTool } from './BaseTool';
import type { ToolParameter, ToolResult } from './BaseTool';
import {
  WriteChordProgressionCommand,
  type WriteChordProgressionEntry,
} from '../../core/commands/global-region/WriteChordProgressionCommand';
import { parseChordSymbol } from '../../util/chordUtil';

interface RequestedChordEntry {
  chord: string;
  start: number;
  length: number;
}

interface ValidatedChordEntry extends WriteChordProgressionEntry {
  chord: string;
}

interface ChordWriteSummaryData {
  chordCount: number;
  startBar: number;
  endBar: number;
}

export class WriteChordProgressionTool extends BaseTool {
  readonly name = 'write_chord_progression';
  readonly description = 'Write chord-reference regions to the global chord track using absolute beat positions on the project timeline. The global chord track is for harmonic reference only and does not affect playback by itself. If the user wants audible chord playback, create notes on actual MIDI tracks with add_notes instead. Use chord symbols matching the chord input popup format, such as C, Dm, or Bm7b5.';

  override isReadOnlyTool(): boolean {
    return false;
  }

  override isAvailableInEfficientMode(): boolean {
    return false;
  }

  readonly parameters: Record<string, ToolParameter> = {
    chords: {
      type: 'array',
      description: 'Chord-reference regions to write to the global chord track. Each entry uses an absolute beat start on the project timeline. Use chord symbols matching the chord input popup format, for example C, Dm, or Bm7b5.',
      required: true,
      items: {
        type: 'object',
        description: 'A single chord-reference region',
        properties: {
          chord: {
            type: 'string',
            description: 'Chord symbol in the app-accepted chord format. Examples: "C", "Dm", "Bm7b5".',
            required: true,
          },
          start: {
            type: 'number',
            description: 'Start beat on the absolute project timeline. This is not relative to a clip or region.',
            required: true,
          },
          length: {
            type: 'number',
            description: 'Chord duration in beats. Must be greater than 0.',
            required: true,
          },
        },
      },
    },
  };

  override buildToolResultDisplayContent(args: Record<string, unknown> | null, toolResult: ToolResult): string | undefined {
    if (!args || !toolResult.success) {
      return undefined;
    }

    const summary = this.buildSummaryData(args);
    if (!summary) {
      return undefined;
    }

    return `Updated ${summary.chordCount} chord ${summary.chordCount === 1 ? 'reference' : 'references'} on the global Chord Track across ${summary.startBar === summary.endBar ? `bar ${summary.startBar}` : `bars ${summary.startBar} to ${summary.endBar}`}.`;
  }

  override buildToolHistoryContent(_args: Record<string, unknown> | null, toolResult: ToolResult): string | undefined {
    return toolResult.result;
  }

  override buildConfirmationContent(args: Record<string, unknown> | null): string | undefined {
    if (!args) {
      return undefined;
    }

    const summary = this.buildSummaryData(args);
    if (!summary) {
      return undefined;
    }

    return `Allow updating ${summary.chordCount} chord ${summary.chordCount === 1 ? 'reference' : 'references'} on the global Chord Track across ${summary.startBar === summary.endBar ? `bar ${summary.startBar}` : `bars ${summary.startBar} to ${summary.endBar}`}?`;
  }

  async execute(params: Record<string, unknown>): Promise<ToolResult> {
    try {
      this.validateParameters(params);

      const validatedChords = this.validateAndNormalizeChords(params.chords as RequestedChordEntry[]);
      const command = new WriteChordProgressionCommand(validatedChords.map(chord => ({
        startBeat: chord.startBeat,
        length: chord.length,
        symbol: chord.chord,
      })));
      await this.executeCommand(command);

      const details = validatedChords
        .map(chord => `"${chord.chord}" from beat ${chord.startBeat} to beat ${chord.startBeat + chord.length}`)
        .join(', ');

      return this.createSuccessResult(
        `Successfully wrote ${validatedChords.length} chord ${validatedChords.length === 1 ? 'reference' : 'references'} to the global chord track: ${details}. These chord regions are for harmonic reference only and do not change playback by themselves. If audible playback is needed, create notes on actual MIDI tracks with add_notes.`,
      );
    } catch (error) {
      return this.createErrorResult(`Failed to write chord progression: ${error}`);
    }
  }

  private buildSummaryData(args: Record<string, unknown>): ChordWriteSummaryData | null {
    const typedArgs = args as { chords?: Array<{ start: number; length: number }> };
    if (!Array.isArray(typedArgs.chords) || typedArgs.chords.length === 0) {
      return null;
    }

    const beatsPerBar = this.getCurrentProject().getTimeSignature().numerator;
    const startBeat = Math.min(...typedArgs.chords.map(chord => chord.start));
    const endBeat = Math.max(...typedArgs.chords.map(chord => chord.start + chord.length));

    return {
      chordCount: typedArgs.chords.length,
      startBar: Math.floor(startBeat / beatsPerBar) + 1,
      endBar: Math.max(1, Math.ceil(endBeat / beatsPerBar)),
    };
  }

  private validateAndNormalizeChords(chords: RequestedChordEntry[]): ValidatedChordEntry[] {
    if (chords.length === 0) {
      throw new Error('Parameter "chords" must contain at least one chord entry.');
    }

    const validated = chords.map((chord, index) => this.validateChordEntry(chord, index));
    validated.sort((left, right) => left.startBeat - right.startBeat);

    for (let index = 1; index < validated.length; index += 1) {
      const previous = validated[index - 1];
      const current = validated[index];
      if (current.startBeat < previous.startBeat + previous.length) {
        throw new Error(
          `Chord entry ${index + 1} overlaps with chord entry ${index}. Entry ${index} ends at beat ${previous.startBeat + previous.length}, but entry ${index + 1} starts at beat ${current.startBeat}.`,
        );
      }
    }

    return validated;
  }

  private validateChordEntry(chord: RequestedChordEntry, index: number): ValidatedChordEntry {
    if (!Number.isFinite(chord.start)) {
      throw new Error(`Chord entry ${index + 1} has invalid "start": ${String(chord.start)}. Expected a finite number >= 0.`);
    }
    if (chord.start < 0) {
      throw new Error(`Chord entry ${index + 1} has invalid "start": ${chord.start}. Expected a value >= 0.`);
    }
    if (!Number.isFinite(chord.length)) {
      throw new Error(`Chord entry ${index + 1} has invalid "length": ${String(chord.length)}. Expected a finite number > 0.`);
    }
    if (chord.length <= 0) {
      throw new Error(`Chord entry ${index + 1} has invalid "length": ${chord.length}. Expected a value > 0.`);
    }

    const trimmedChord = chord.chord?.trim();
    if (!trimmedChord) {
      throw new Error(`Chord entry ${index + 1} has invalid "chord": expected a non-empty chord symbol.`);
    }

    const parsed = parseChordSymbol(trimmedChord);
    if (!parsed) {
      throw new Error(`Chord entry ${index + 1} has invalid "chord": "${trimmedChord}". Use a chord symbol the app can parse, such as C, Dm, or Bm7b5.`);
    }

    return {
      chord: parsed.symbol,
      symbol: parsed.symbol,
      startBeat: chord.start,
      length: chord.length,
    };
  }
}
