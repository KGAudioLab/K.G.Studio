import { BaseTool } from './BaseTool';
import type { ToolResult, ToolParameter } from './BaseTool';
import {
  NO_MIDI_TARGET_HISTORY_MESSAGE,
  NO_MIDI_TARGET_RAW_MESSAGE,
  NO_MIDI_TARGET_UI_MESSAGE,
  getTrackDisplayName,
  resolveMidiTrackByIdOrName,
  resolveActiveOrSelectedMidiRegionContext,
} from './toolTargeting';
import { DeleteNotesCommand } from '../../core/commands/note/DeleteNotesCommand';
import { KGMidiNote } from '../../core/midi/KGMidiNote';
import { KGMidiRegion } from '../../core/region/KGMidiRegion';
import { KGMidiTrack } from '../../core/track/KGMidiTrack';

interface RemoveTargetRegionContext {
  region: KGMidiRegion;
  trackName: string;
}

interface RemoveNotesSummaryData {
  noteCount: number;
  startBeat: number;
  endBeat: number;
  regionName?: string;
  trackName: string;
  earliestNoteStartBar: number;
  latestNoteEndBar: number;
  scope: 'region' | 'track';
}

export class RemoveNotesTool extends BaseTool {
  readonly name = 'remove_notes';
  readonly description = 'Remove MIDI notes from an absolute beat range. Use track_id to remove notes across every MIDI region on a track. If track_id is omitted, the currently active or selected MIDI region is used.';

  override isReadOnlyTool(): boolean {
    return false;
  }

  readonly parameters: Record<string, ToolParameter> = {
    start: {
      type: 'number',
      description: 'Start beat — the absolute beat position where the removal range begins (inclusive). A note starting at exactly this beat will be removed.',
      required: true,
    },
    end: {
      type: 'number',
      description: 'End beat — the absolute beat position where the removal range ends (exclusive). A note starting at exactly this beat will NOT be removed. Must be greater than start.',
      required: true,
    },
    track_id: {
      type: 'string',
      description: 'Optional target MIDI track ID. If provided, matching notes are removed across all MIDI regions on that track whose absolute start positions fall within the requested beat range.',
      required: false,
    },
    track_name: {
      type: 'string',
      description: 'Optional target MIDI track name. Used only when track_id is omitted. If multiple MIDI tracks share the same name, the first matching track is used.',
      required: false,
    },
  };

  override buildToolResultDisplayContent(args: Record<string, unknown> | null, toolResult: ToolResult): string | undefined {
    if (!args) {
      return undefined;
    }

    if (!toolResult.success) {
      return toolResult.result === NO_MIDI_TARGET_RAW_MESSAGE ? NO_MIDI_TARGET_UI_MESSAGE : undefined;
    }

    const summary = this.buildSummaryData(args);
    if (!summary || summary.noteCount === 0) {
      return undefined;
    }

    const location = summary.scope === 'track'
      ? `on track **${summary.trackName}**`
      : `in region **${summary.regionName}** on track **${summary.trackName}**`;
    return `Successfully removed ${summary.noteCount} ${summary.noteCount === 1 ? 'note' : 'notes'} from beats ${summary.startBeat}-${summary.endBeat}, ${location}, spanning bars ${summary.earliestNoteStartBar} to ${summary.latestNoteEndBar}.`;
  }

  override buildToolHistoryContent(args: Record<string, unknown> | null, toolResult: ToolResult): string | undefined {
    if (!args || toolResult.success) {
      return undefined;
    }

    return toolResult.result === NO_MIDI_TARGET_RAW_MESSAGE ? NO_MIDI_TARGET_HISTORY_MESSAGE : undefined;
  }

  override buildConfirmationContent(args: Record<string, unknown> | null): string | undefined {
    if (!args) {
      return undefined;
    }

    const summary = this.buildSummaryData(args);
    if (!summary) {
      return undefined;
    }

    const location = summary.scope === 'track'
      ? `on track **${summary.trackName}**`
      : `in region **${summary.regionName}** on track **${summary.trackName}**`;
    return `Allow removing ${summary.noteCount} ${summary.noteCount === 1 ? 'note' : 'notes'} from beats ${summary.startBeat}-${summary.endBeat}, ${location}, spanning bars ${summary.earliestNoteStartBar} to ${summary.latestNoteEndBar}?`;
  }

  async execute(params: Record<string, unknown>): Promise<ToolResult> {
    try {
      this.validateParameters(params);

      const startBeat = params.start as number;
      const endBeat = params.end as number;
      const trackId = params.track_id as string | undefined;
      const trackName = params.track_name as string | undefined;

      if (startBeat < 0) {
        return this.createErrorResult(`Invalid start ${startBeat}. Must be >= 0.`);
      }
      if (endBeat <= startBeat) {
        return this.createErrorResult(`Invalid beat range: end (${endBeat}) must be greater than start (${startBeat}).`);
      }

      if (trackId || trackName) {
        const explicitTrack = resolveMidiTrackByIdOrName(trackId, trackName);
        if (!explicitTrack) {
          return this.createErrorResult(
            trackId
              ? `Track with ID "${trackId}" not found or is not a MIDI track.`
              : `Track with name "${trackName}" not found or is not a MIDI track.`,
          );
        }
      }

      const notesToRemove = (trackId || trackName)
        ? this.findTrackNotesInRange(trackId, trackName, startBeat, endBeat)
        : this.findFallbackRegionNotesInRange(startBeat, endBeat);

      if (!notesToRemove) {
        return this.createErrorResult(NO_MIDI_TARGET_RAW_MESSAGE);
      }

      if (notesToRemove.notes.length === 0) {
        return this.createSuccessResult(`No notes found in the range from beat ${startBeat} to ${endBeat}.`);
      }

      const noteIds = notesToRemove.notes.map(note => note.getId());
      await this.executeCommand(new DeleteNotesCommand(noteIds));

      const noteList = notesToRemove.notes.map(note => this.formatMidiPitch(note.getPitch())).join(', ');
      const scopeLabel = notesToRemove.scope === 'track'
        ? `track "${notesToRemove.trackName}"`
        : `MIDI region "${notesToRemove.regionName}" on track "${notesToRemove.trackName}"`;
      return this.createSuccessResult(
        `Successfully removed ${notesToRemove.notes.length} note${notesToRemove.notes.length > 1 ? 's' : ''} from beats ${startBeat}-${endBeat} in ${scopeLabel}: ${noteList}`,
      );
    } catch (error) {
      return this.createErrorResult(`Failed to remove notes: ${error}`);
    }
  }

  private buildSummaryData(args: Record<string, unknown>): RemoveNotesSummaryData | null {
    const typedArgs = args as {
      start?: number;
      end?: number;
      track_id?: string;
      track_name?: string;
    };

    if (typeof typedArgs.start !== 'number' || typeof typedArgs.end !== 'number' || typedArgs.end <= typedArgs.start) {
      return null;
    }

    const notesInRange = (typedArgs.track_id || typedArgs.track_name)
      ? this.findTrackNotesInRange(typedArgs.track_id, typedArgs.track_name, typedArgs.start, typedArgs.end)
      : this.findFallbackRegionNotesInRange(typedArgs.start, typedArgs.end);

    if (!notesInRange) {
      return null;
    }

    const beatsPerBar = this.getCurrentProject().getTimeSignature().numerator;
    let earliestBeat = typedArgs.start;
    let latestBeat = typedArgs.end;

    if (notesInRange.notes.length > 0) {
      earliestBeat = Math.min(...notesInRange.notes.map(note => notesInRange.absoluteBoundsByNoteId.get(note.getId())!.startBeat));
      latestBeat = Math.max(...notesInRange.notes.map(note => notesInRange.absoluteBoundsByNoteId.get(note.getId())!.endBeat));
    }

    return {
      noteCount: notesInRange.notes.length,
      startBeat: typedArgs.start,
      endBeat: typedArgs.end,
      regionName: notesInRange.scope === 'region' ? notesInRange.regionName : undefined,
      trackName: notesInRange.trackName,
      earliestNoteStartBar: Math.floor(earliestBeat / beatsPerBar) + 1,
      latestNoteEndBar: Math.max(1, Math.ceil(latestBeat / beatsPerBar)),
      scope: notesInRange.scope,
    };
  }

  private findFallbackRegionNotesInRange(startBeat: number, endBeat: number): {
    scope: 'region';
    trackName: string;
    regionName: string;
    notes: KGMidiNote[];
    absoluteBoundsByNoteId: Map<string, { startBeat: number; endBeat: number }>;
  } | null {
    const resolvedRegion = this.resolveFallbackRegion();
    if (!resolvedRegion) {
      return null;
    }

    const regionStartBeat = resolvedRegion.region.getStartFromBeat();
    const adjustedStartBeat = startBeat - regionStartBeat;
    const adjustedEndBeat = endBeat - regionStartBeat;
    const notes = resolvedRegion.region.getNotes().filter(note => {
      const noteStartBeat = note.getStartBeat();
      return noteStartBeat >= adjustedStartBeat && noteStartBeat < adjustedEndBeat;
    });

    return {
      scope: 'region',
      trackName: resolvedRegion.trackName,
      regionName: resolvedRegion.region.getName(),
      notes,
      absoluteBoundsByNoteId: new Map(notes.map(note => ([
        note.getId(),
        {
          startBeat: note.getStartBeat() + regionStartBeat,
          endBeat: note.getEndBeat() + regionStartBeat,
        },
      ]))),
    };
  }

  private findTrackNotesInRange(trackId: string | undefined, trackName: string | undefined, startBeat: number, endBeat: number): {
    scope: 'track';
    trackName: string;
    notes: KGMidiNote[];
    absoluteBoundsByNoteId: Map<string, { startBeat: number; endBeat: number }>;
  } | null {
    const track = resolveMidiTrackByIdOrName(trackId, trackName);
    if (!track) {
      return null;
    }

    const notes: KGMidiNote[] = [];
    const absoluteBoundsByNoteId = new Map<string, { startBeat: number; endBeat: number }>();

    for (const region of track.getRegions()) {
      if (!(region instanceof KGMidiRegion)) {
        continue;
      }

      const regionStartBeat = region.getStartFromBeat();
      for (const note of region.getNotes()) {
        const absoluteStartBeat = regionStartBeat + note.getStartBeat();
        if (absoluteStartBeat < startBeat || absoluteStartBeat >= endBeat) {
          continue;
        }

        notes.push(note);
        absoluteBoundsByNoteId.set(note.getId(), {
          startBeat: absoluteStartBeat,
          endBeat: regionStartBeat + note.getEndBeat(),
        });
      }
    }

    return {
      scope: 'track',
      trackName: getTrackDisplayName(track),
      notes,
      absoluteBoundsByNoteId,
    };
  }

  private resolveFallbackRegion(): RemoveTargetRegionContext | null {
    const resolved = resolveActiveOrSelectedMidiRegionContext();
    if (!resolved) {
      return null;
    }

    return {
      region: resolved.region,
      trackName: resolved.trackName,
    };
  }

  private formatMidiPitch(midiPitch: number): string {
    const noteNames = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
    const octave = Math.floor(midiPitch / 12) - 1;
    const noteName = noteNames[midiPitch % 12];
    return `${noteName}${octave}`;
  }
}
