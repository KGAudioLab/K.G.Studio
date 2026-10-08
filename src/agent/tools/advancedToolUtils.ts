import { BaseTool } from './BaseTool';
import type { StructuredToolPayload, ToolResult } from './BaseTool';
import type { KGProject } from '../../core/KGProject';
import { KEY_SIGNATURE_MAP } from '../../constants/coreConstants';
import { getEffectiveBpmAtTick, getEffectiveKeySignatureAtTick } from '../../util/globalTrackUtil';
import { TICKS_PER_QUARTER } from '../../core/timing';

export function requireTick(value: unknown, field: string, positive = false): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < (positive ? 1 : 0)) {
    throw new Error(`${field} must be a ${positive ? 'positive' : 'nonnegative'} integer tick value.`);
  }
  return value;
}

export function advancedMusicMetadata(project: KGProject, start: number) {
  return {
    time_signature: project.getTimeSignature(),
    key_signature: KEY_SIGNATURE_MAP[getEffectiveKeySignatureAtTick(project, start)].abcNotationKeySignature,
    tempo: getEffectiveBpmAtTick(project, start),
    ticks_per_quarter_note: TICKS_PER_QUARTER,
  };
}

export abstract class AdvancedReaderTool extends BaseTool<StructuredToolPayload> {
  override buildToolResultDisplayContent(
    _args: Record<string, unknown> | null,
    toolResult: ToolResult<StructuredToolPayload>,
  ): string | undefined {
    if (!toolResult.success || typeof toolResult.result === 'string') return undefined;
    const result = toolResult.result;
    if (typeof result.msg === 'string') return result.msg;
    if (Array.isArray(result.tracks)) {
      const tracks = result.tracks as Array<{ track_name: string; notes: unknown[] }>;
      return tracks.length === 0 ? 'No MIDI tracks found.' : tracks.map(track =>
        `Read ${track.track_name}, ${track.notes.length} notes.`).join('\n');
    }
    const key = ['chords', 'bpms', 'key_signatures', 'markers'].find(field => Array.isArray(result[field]));
    if (key) return `Read ${(result[key] as unknown[]).length} ${key.replaceAll('_', ' ')}.`;
    return JSON.stringify(result, null, 2);
  }
}
