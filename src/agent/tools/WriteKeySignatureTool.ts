import { BaseTool } from './BaseTool';
import type { ToolParameter, ToolResult } from './BaseTool';
import { KEY_SIGNATURE_MAP } from '../../constants/coreConstants';
import type { KeySignature } from '../../core/KGProject';
import {
  WriteKeySignatureTrackCommand,
  type WriteKeySignatureEntry,
} from '../../core/commands/global-region/WriteKeySignatureTrackCommand';

interface RequestedKeySignatureEntry {
  key_signature: string;
  beat?: number | null | '';
}

interface NormalizedExplicitEntry extends WriteKeySignatureEntry {
  inputBeat: number;
}

interface NormalizedPayload {
  baseKeySignature: KeySignature;
  explicitEntries: NormalizedExplicitEntry[];
}

export class WriteKeySignatureTool extends BaseTool {
  readonly name = 'write_key_signature';
  readonly description = 'Write key-signature changes to the global Signature track using the same canonical key-signature format as the key-signature picker. Use exact picker values such as "C major", "F# minor", or "Bb major". This fully rebuilds the global Signature track as a gapless song-wide key plan.';

  readonly parameters: Record<string, ToolParameter> = {
    key_signatures: {
      type: 'array',
      description: 'The complete key-signature plan to write. Use exact key-signature picker values such as "C major", "F# minor", or "Bb major".',
      required: true,
      items: {
        type: 'object',
        description: 'One key-signature entry. Omit "beat", set it to null, or set it to an empty string to provide the global/default key signature.',
        properties: {
          key_signature: {
            type: 'string',
            description: 'Required canonical key signature exactly matching the key-signature picker. Examples: "C major", "F# minor", "Bb major".',
            required: true,
          },
          beat: {
            type: 'number',
            description: 'Optional absolute beat on the project timeline. When omitted, null, or empty, this entry becomes the global/default key signature.',
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
      const normalized = this.normalizePayload(args.key_signatures as RequestedKeySignatureEntry[]);
      const explicitEntries = normalized.explicitEntries;
      const writeCount = explicitEntries.length + 1;

      if (explicitEntries.length === 0) {
        return 'Allow rebuilding the global Signature track with 1 key signature across the full song?';
      }

      const firstBeat = explicitEntries[0].inputBeat;
      const lastBeat = explicitEntries[explicitEntries.length - 1].inputBeat;
      return `Allow rebuilding the global Signature track with ${writeCount} key signatures from beat ${firstBeat} to beat ${lastBeat}?`;
    } catch {
      return undefined;
    }
  }

  async execute(params: Record<string, unknown>): Promise<ToolResult> {
    try {
      if (!Array.isArray(params.key_signatures)) {
        throw new Error('Parameter "key_signatures" must be an array.');
      }
      const normalized = this.normalizePayload(params.key_signatures as RequestedKeySignatureEntry[]);

      const command = new WriteKeySignatureTrackCommand(
        normalized.baseKeySignature,
        normalized.explicitEntries.map(entry => ({
          startBeat: entry.startBeat,
          keySignature: entry.keySignature,
        })),
      );
      await this.executeCommand(command);

      const details = normalized.explicitEntries.length === 0
        ? `base key signature "${normalized.baseKeySignature}" across the full song`
        : [
          `base key signature "${normalized.baseKeySignature}"`,
          ...normalized.explicitEntries.map(entry => `"${entry.keySignature}" from beat ${entry.startBeat}`),
        ].join(', ');

      return this.createSuccessResult(
        `Successfully rebuilt the global Signature track as a gapless full-song key plan using ${details}. All boundaries were normalized to bar starts.`,
      );
    } catch (error) {
      return this.createErrorResult(`Failed to write key signature: ${error}`);
    }
  }

  private normalizePayload(entries: RequestedKeySignatureEntry[]): NormalizedPayload {
    if (!Array.isArray(entries) || entries.length === 0) {
      throw new Error('Parameter "key_signatures" must contain at least one key-signature entry.');
    }

    const project = this.getCurrentProject();
    const beatsPerBar = project.getTimeSignature().numerator;
    const songEndBeat = project.getMaxBars() * beatsPerBar;

    let baseKeySignature: KeySignature = project.getKeySignature();
    let sawDefaultEntry = false;
    const explicitEntries: NormalizedExplicitEntry[] = [];

    entries.forEach((entry, index) => {
      const keySignature = this.validateKeySignature(entry.key_signature, index);
      const beat = entry.beat;
      if (beat === undefined || beat === null || beat === '') {
        if (sawDefaultEntry) {
          throw new Error('Only one global/default key signature entry may omit the "beat" field.');
        }
        baseKeySignature = keySignature;
        sawDefaultEntry = true;
        return;
      }

      if (!Number.isFinite(beat)) {
        throw new Error(`Key-signature entry ${index + 1} has invalid "beat": ${String(beat)}. Expected a finite number >= 0.`);
      }
      if (beat < 0) {
        throw new Error(`Key-signature entry ${index + 1} has invalid "beat": ${beat}. Expected a value >= 0.`);
      }
      if (beat >= songEndBeat) {
        throw new Error(`Key-signature entry ${index + 1} has invalid "beat": ${beat}. It must be within the song range.`);
      }

      explicitEntries.push({
        keySignature,
        startBeat: beat,
        inputBeat: beat,
      });
    });

    explicitEntries.sort((left, right) => left.startBeat - right.startBeat);

    for (let index = 1; index < explicitEntries.length; index += 1) {
      const previous = explicitEntries[index - 1];
      const current = explicitEntries[index];
      const previousBar = Math.floor(previous.startBeat / beatsPerBar);
      const currentBar = Math.floor(current.startBeat / beatsPerBar);
      if (currentBar <= previousBar) {
        throw new Error(
          `Key-signature entry ${index + 1} overlaps with or collapses into entry ${index} after bar alignment. Entry ${index} normalizes to bar ${previousBar + 1}, and entry ${index + 1} normalizes to bar ${currentBar + 1}.`,
        );
      }
    }

    return {
      baseKeySignature,
      explicitEntries,
    };
  }

  private validateKeySignature(rawValue: string, index: number): KeySignature {
    const trimmed = rawValue?.trim();
    if (!trimmed) {
      throw new Error(`Key-signature entry ${index + 1} has invalid "key_signature": expected a non-empty string.`);
    }

    if (!(trimmed in KEY_SIGNATURE_MAP)) {
      throw new Error(
        `Key-signature entry ${index + 1} has invalid "key_signature": "${trimmed}". Use an exact key-signature picker value such as "C major", "F# minor", or "Bb major".`,
      );
    }

    return trimmed as KeySignature;
  }
}
