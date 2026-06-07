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
import { CreateNotesCommand } from '../../core/commands/note/CreateNotesCommand';
import type { NoteCreationData } from '../../core/commands/note/CreateNotesCommand';
import { KGCommand } from '../../core/commands/KGCommand';
import { CreateRegionCommand } from '../../core/commands/region/CreateRegionCommand';
import { ResizeRegionCommand } from '../../core/commands/region/ResizeRegionCommand';
import { KGCore } from '../../core/KGCore';
import { KGMidiRegion } from '../../core/region/KGMidiRegion';
import { KGMidiTrack } from '../../core/track/KGMidiTrack';
import { normalizeOptionalTrackIdParam } from './trackIdNormalization';

interface RequestedNote {
  pitch: string;
  start: number;
  length: number;
  velocity?: number;
}

interface AddNotesSummaryData {
  noteCount: number;
  regionName: string;
  trackName: string;
  earliestNoteStartBar: number;
  latestNoteEndBar: number;
  createdRegion: boolean;
}

interface NoteSpan {
  startBeat: number;
  endBeat: number;
}

interface ResolvedRegionContext {
  track: KGMidiTrack;
  trackName: string;
  regionName: string;
  regionId?: string;
  finalRegionStartBeat: number;
  finalRegionLength: number;
  createdRegion: boolean;
}

class AddNotesToResolvedRegionCommand extends KGCommand {
  private readonly resolvedRegion: ResolvedRegionContext;
  private readonly notes: Array<RequestedNote & { midiPitch: number; velocity: number }>;
  private createRegionCommand: CreateRegionCommand | null = null;
  private resizeRegionCommand: ResizeRegionCommand | null = null;
  private createNotesCommand: CreateNotesCommand | null = null;

  constructor(
    resolvedRegion: ResolvedRegionContext,
    notes: Array<RequestedNote & { midiPitch: number; velocity: number }>,
  ) {
    super();
    this.resolvedRegion = resolvedRegion;
    this.notes = notes;
  }

  execute(): void {
    let regionId = this.resolvedRegion.regionId;

    if (this.resolvedRegion.createdRegion) {
      this.createRegionCommand = new CreateRegionCommand(
        this.resolvedRegion.track.getId().toString(),
        this.resolvedRegion.track.getTrackIndex(),
        this.resolvedRegion.finalRegionStartBeat,
        this.resolvedRegion.finalRegionLength,
        this.resolvedRegion.regionName,
      );
      this.createRegionCommand.execute();
      regionId = this.createRegionCommand.getRegionId();
    } else if (regionId) {
      const existingRegion = this.findMidiRegion(regionId);
      if (
        existingRegion.getStartFromBeat() !== this.resolvedRegion.finalRegionStartBeat
        || existingRegion.getLength() !== this.resolvedRegion.finalRegionLength
      ) {
        this.resizeRegionCommand = new ResizeRegionCommand(
          regionId,
          this.resolvedRegion.finalRegionStartBeat,
          this.resolvedRegion.finalRegionLength,
        );
        this.resizeRegionCommand.execute();
      }
    }

    if (!regionId) {
      throw new Error('Unable to resolve the MIDI region for note creation.');
    }

    const noteCreationData: NoteCreationData[] = this.notes.map(note => ({
      regionId,
      startBeat: note.start - this.resolvedRegion.finalRegionStartBeat,
      endBeat: note.start - this.resolvedRegion.finalRegionStartBeat + note.length,
      pitch: note.midiPitch,
      velocity: note.velocity,
    }));
    this.createNotesCommand = new CreateNotesCommand(noteCreationData);
    this.createNotesCommand.execute();
  }

  undo(): void {
    this.createNotesCommand?.undo();
    this.resizeRegionCommand?.undo();
    this.createRegionCommand?.undo();
  }

  getDescription(): string {
    return `Add ${this.notes.length} note${this.notes.length === 1 ? '' : 's'}`;
  }

  private findMidiRegion(regionId: string): KGMidiRegion {
    const tracks = KGCore.instance().getCurrentProject().getTracks();
    for (const track of tracks) {
      const region = track.getRegions().find(candidate => candidate.getId() === regionId);
      if (region instanceof KGMidiRegion) {
        return region;
      }
    }

    throw new Error(`MIDI region with ID "${regionId}" not found.`);
  }
}

export class AddNotesTool extends BaseTool {
  readonly name = 'add_notes';
  readonly description = 'Add one or more MIDI notes to a target track or the currently active MIDI region. Use track_id when the user identifies a track. Regions are resolved or created automatically, so you should think in terms of tracks rather than clips. Notes use absolute beat positions on the project timeline.';

  override isReadOnlyTool(): boolean {
    return false;
  }

  readonly parameters: Record<string, ToolParameter> = {
    notes: {
      type: 'array',
      description: 'List of notes to add. To create a chord, give multiple notes the same start beat. To create a melody, use sequential start values.',
      required: true,
      items: {
        type: 'object',
        description: 'A single note',
        properties: {
          pitch: {
            type: 'string',
            description: 'Pitch in scientific notation: note name, optional accidental (# or b), and octave number. Examples: "C4" (middle C), "F#3" (F-sharp 3rd octave), "Bb2" (B-flat 2nd octave).',
            required: true,
          },
          start: {
            type: 'number',
            description: 'Start beat — the absolute beat position on the project timeline where the note begins. This is NOT relative to the region or clip — beat 6 means beat 6 in the project regardless of where any MIDI region begins. Fractional values are supported (e.g., 0.5 = half a beat after beat 0).',
            required: true,
          },
          length: {
            type: 'number',
            description: 'Duration of the note in beats. In 4/4 time: 4 = whole note, 2 = half note, 1 = quarter note, 0.5 = eighth note, 0.25 = sixteenth note.',
            required: true,
          },
          velocity: {
            type: 'number',
            description: 'Note velocity / loudness from 1 (softest) to 127 (loudest). Defaults to 127 if omitted.',
            required: false,
          },
        },
      },
    },
    track_id: {
      type: 'string',
      description: 'Optional target MIDI track ID. If provided, the app automatically resolves the best overlapping MIDI region on that track for the requested note span, expands it if needed, or creates a new MIDI region when no overlap exists.',
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
    if (!summary) {
      return undefined;
    }

    const regionLabel = summary.createdRegion
      ? `new region **${summary.regionName}**`
      : `region **${summary.regionName}**`;
    return `Successfully created ${summary.noteCount} ${summary.noteCount === 1 ? 'note' : 'notes'} in ${regionLabel} on track **${summary.trackName}**, spanning bars ${summary.earliestNoteStartBar} to ${summary.latestNoteEndBar}.`;
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

    const regionVerb = summary.createdRegion ? 'a new region' : `region **${summary.regionName}**`;
    return `Allow creating ${summary.noteCount} ${summary.noteCount === 1 ? 'note' : 'notes'} on track **${summary.trackName}** in ${regionVerb}, spanning bars ${summary.earliestNoteStartBar} to ${summary.latestNoteEndBar}?`;
  }

  async execute(params: Record<string, unknown>): Promise<ToolResult> {
    try {
      const normalizedParams = normalizeOptionalTrackIdParam(params);
      this.validateParameters(normalizedParams);

      const notes = normalizedParams.notes as RequestedNote[];
      if (notes.length === 0) {
        return this.createErrorResult('No notes were provided.');
      }

      const validatedNotes: Array<RequestedNote & { midiPitch: number; velocity: number }> = [];
      for (const note of notes) {
        try {
          const midiPitch = this.convertPitchToMidi(note.pitch);
          const velocity = note.velocity ?? 127;

          if (velocity < 1 || velocity > 127) {
            return this.createErrorResult(`Invalid velocity ${velocity}. Must be between 1 and 127.`);
          }
          if (note.start < 0) {
            return this.createErrorResult(`Invalid start ${note.start}. Must be >= 0.`);
          }
          if (note.length <= 0) {
            return this.createErrorResult(`Invalid length ${note.length}. Must be > 0.`);
          }

          validatedNotes.push({ ...note, midiPitch, velocity });
        } catch (error) {
          return this.createErrorResult(`Invalid note pitch "${note.pitch}": ${error}`);
        }
      }

      const trackId = normalizedParams.track_id as string | undefined;
      const trackName = normalizedParams.track_name as string | undefined;
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

      const resolvedRegion = this.resolveTargetRegion(trackId, trackName, this.getNoteSpan(validatedNotes));
      if (!resolvedRegion) {
        return this.createErrorResult(NO_MIDI_TARGET_RAW_MESSAGE);
      }

      const command = new AddNotesToResolvedRegionCommand(resolvedRegion, validatedNotes);
      await this.executeCommand(command);

      const noteList = validatedNotes
        .map(note => `${note.pitch} (beat ${note.start}, length ${note.length})`)
        .join(', ');

      const actionPrefix = resolvedRegion.createdRegion
        ? `Successfully created ${validatedNotes.length} note${validatedNotes.length > 1 ? 's' : ''} on track "${resolvedRegion.trackName}" by creating MIDI region "${resolvedRegion.regionName}"`
        : `Successfully created ${validatedNotes.length} note${validatedNotes.length > 1 ? 's' : ''} in MIDI region "${resolvedRegion.regionName}" on track "${resolvedRegion.trackName}"`;

      return this.createSuccessResult(`${actionPrefix}: ${noteList}`);
    } catch (error) {
      return this.createErrorResult(`Failed to create notes: ${error}`);
    }
  }

  private buildSummaryData(args: Record<string, unknown>): AddNotesSummaryData | null {
    const normalizedArgs = normalizeOptionalTrackIdParam(args);
    const typedArgs = normalizedArgs as {
      notes?: Array<{ start: number; length: number }>;
      track_id?: string;
      track_name?: string;
    };

    if (!Array.isArray(typedArgs.notes) || typedArgs.notes.length === 0) {
      return null;
    }

    const span = this.getNoteSpan(typedArgs.notes);
    const resolvedRegion = this.resolveTargetRegion(typedArgs.track_id, typedArgs.track_name, span);
    if (!resolvedRegion) {
      return null;
    }

    const beatsPerBar = this.getCurrentProject().getTimeSignature().numerator;

    return {
      noteCount: typedArgs.notes.length,
      regionName: resolvedRegion.regionName,
      trackName: resolvedRegion.trackName,
      earliestNoteStartBar: Math.floor(span.startBeat / beatsPerBar) + 1,
      latestNoteEndBar: Math.max(1, Math.ceil(span.endBeat / beatsPerBar)),
      createdRegion: resolvedRegion.createdRegion,
    };
  }

  private resolveTargetRegion(
    trackId: string | undefined,
    trackName: string | undefined,
    span: NoteSpan,
  ): ResolvedRegionContext | null {
    if (trackId || trackName) {
      return this.resolveTrackTarget(trackId, trackName, span);
    }

    const activeRegion = resolveActiveOrSelectedMidiRegionContext();
    if (!activeRegion) {
      return null;
    }

    const region = activeRegion.region;
    const regionStartBeat = region.getStartFromBeat();
    const regionEndBeat = regionStartBeat + region.getLength();
    return {
      track: activeRegion.track,
      trackName: activeRegion.trackName,
      regionId: region.getId(),
      regionName: region.getName(),
      finalRegionStartBeat: Math.min(regionStartBeat, span.startBeat),
      finalRegionLength: Math.max(regionEndBeat, span.endBeat) - Math.min(regionStartBeat, span.startBeat),
      createdRegion: false,
    };
  }

  private resolveTrackTarget(
    trackId: string | undefined,
    trackName: string | undefined,
    span: NoteSpan,
  ): ResolvedRegionContext | null {
    const track = resolveMidiTrackByIdOrName(trackId, trackName);
    if (!track) {
      return null;
    }

    const resolvedTrackName = getTrackDisplayName(track);
    const midiRegions = track.getRegions().filter(region => region instanceof KGMidiRegion) as KGMidiRegion[];
    const selectedRegion = this.pickBestOverlappingRegion(midiRegions, span);

    if (!selectedRegion) {
      return {
        track,
        trackName: resolvedTrackName,
        regionName: `${resolvedTrackName} Region`,
        finalRegionStartBeat: span.startBeat,
        finalRegionLength: span.endBeat - span.startBeat,
        createdRegion: true,
      };
    }

    const regionStartBeat = selectedRegion.getStartFromBeat();
    const regionEndBeat = regionStartBeat + selectedRegion.getLength();
    const finalRegionStartBeat = Math.min(regionStartBeat, span.startBeat);
    const finalRegionEndBeat = Math.max(regionEndBeat, span.endBeat);

    return {
      track,
      trackName: resolvedTrackName,
      regionId: selectedRegion.getId(),
      regionName: selectedRegion.getName(),
      finalRegionStartBeat,
      finalRegionLength: finalRegionEndBeat - finalRegionStartBeat,
      createdRegion: false,
    };
  }

  private pickBestOverlappingRegion(regions: KGMidiRegion[], span: NoteSpan): KGMidiRegion | null {
    let bestRegion: KGMidiRegion | null = null;
    let bestOverlap = -1;
    let bestDistance = Number.POSITIVE_INFINITY;

    for (const region of regions) {
      const regionStart = region.getStartFromBeat();
      const regionEnd = regionStart + region.getLength();
      const overlap = Math.min(regionEnd, span.endBeat) - Math.max(regionStart, span.startBeat);
      if (overlap <= 0) {
        continue;
      }

      const distance = Math.abs(regionStart - span.startBeat);
      if (overlap > bestOverlap || (overlap === bestOverlap && distance < bestDistance)) {
        bestRegion = region;
        bestOverlap = overlap;
        bestDistance = distance;
      }
    }

    return bestRegion;
  }

  private getNoteSpan(notes: Array<{ start: number; length: number }>): NoteSpan {
    return {
      startBeat: Math.min(...notes.map(note => note.start)),
      endBeat: Math.max(...notes.map(note => note.start + note.length)),
    };
  }

  private convertPitchToMidi(pitch: string): number {
    const match = pitch.match(/^([A-G])([#b]?)(\d+)$/);
    if (!match) {
      throw new Error(`Invalid pitch format "${pitch}". Use format like "C4", "F#3", "Bb2"`);
    }

    const [, noteName, accidental, octaveStr] = match;
    const octave = parseInt(octaveStr, 10);
    const noteOffsets: Record<string, number> = {
      C: 0,
      D: 2,
      E: 4,
      F: 5,
      G: 7,
      A: 9,
      B: 11,
    };

    let midiNote = (octave + 1) * 12 + noteOffsets[noteName];
    if (accidental === '#') {
      midiNote += 1;
    } else if (accidental === 'b') {
      midiNote -= 1;
    }

    if (midiNote < 0 || midiNote > 127) {
      throw new Error(`Note "${pitch}" is out of MIDI range (0-127)`);
    }

    return midiNote;
  }
}
