import type { KeySignature } from '../core/KGProject';
import { KGMidiRegion } from '../core/region/KGMidiRegion';
import { KGMidiTrack, type MidiTransposeSettings } from '../core/track/KGMidiTrack';
import type { KGProject } from '../core/KGProject';
import type { KGMidiNote } from '../core/midi/KGMidiNote';
import { getRootNoteFromKeySignature, noteNameToPitchClass } from './scaleUtil';

export const MIN_TRANSPOSE = -36;
export const MAX_TRANSPOSE = 36;
export const MIN_MIDI_PITCH = 0;
export const MAX_MIDI_PITCH = 127;

export function validateTransposeSettings(settings: MidiTransposeSettings): void {
  if (!Number.isInteger(settings.transpose) || settings.transpose < MIN_TRANSPOSE || settings.transpose > MAX_TRANSPOSE) {
    throw new Error(`Transpose must be an integer between ${MIN_TRANSPOSE} and ${MAX_TRANSPOSE}.`);
  }
}

export function validateTransposedPitch(pitch: number): void {
  if (!Number.isInteger(pitch) || pitch < MIN_MIDI_PITCH || pitch > MAX_MIDI_PITCH) {
    throw new Error(`Transposition would move a MIDI note outside ${MIN_MIDI_PITCH}-${MAX_MIDI_PITCH}.`);
  }
}

export function getEffectiveTransposeSettings(track: KGMidiTrack, region: KGMidiRegion): MidiTransposeSettings {
  return region.getTransposeSettingsOverride() ?? track.getTransposeSettings();
}

export function getKeySignatureTransposeDelta(previous: KeySignature, next: KeySignature): number {
  const previousRoot = getRootNoteFromKeySignature(previous);
  const nextRoot = getRootNoteFromKeySignature(next);
  const raw = (noteNameToPitchClass(nextRoot) - noteNameToPitchClass(previousRoot) + 12) % 12;
  if (raw === 6) {
    if (nextRoot.includes('#')) return 6;
    if (nextRoot.includes('b')) return -6;
    return 6;
  }
  return raw > 6 ? raw - 12 : raw;
}

interface SettingsOwnerSnapshot {
  owner: KGMidiTrack | KGMidiRegion;
  previous: MidiTransposeSettings;
  next: MidiTransposeSettings;
}

interface NoteSnapshot {
  note: KGMidiNote;
  pitch: number;
}

export interface FollowKeyTransposePlan {
  apply: () => void;
  undo: () => void;
  changedNoteCount: number;
}

export function buildFollowKeyTransposePlan(
  project: KGProject,
  previousKey: KeySignature,
  nextKey: KeySignature,
  scope?: { startBeat: number; endBeat: number },
): FollowKeyTransposePlan {
  const delta = getKeySignatureTransposeDelta(previousKey, nextKey);
  const noteSnapshots: NoteSnapshot[] = [];
  const owners = new Map<KGMidiTrack | KGMidiRegion, SettingsOwnerSnapshot>();

  if (delta !== 0) {
    for (const candidate of project.getTracks()) {
      if (!(candidate instanceof KGMidiTrack) || candidate.getNoTranspose()) continue;
      for (const region of candidate.getRegions()) {
        const override = region.getTransposeSettingsOverride();
        const settings = override ?? candidate.getTransposeSettings();
        if (!settings.followKeySignature) continue;

        const eligibleNotes = region.getNotes().filter(note => {
          if (!scope) return true;
          const absoluteStart = region.getStartFromBeat() + note.getStartBeat();
          return absoluteStart >= scope.startBeat && absoluteStart < scope.endBeat;
        });
        if (eligibleNotes.length === 0) continue;

        const owner = override ? region : candidate;
        if (!owners.has(owner)) {
          const nextSettings = { ...settings, transpose: settings.transpose + delta };
          validateTransposeSettings(nextSettings);
          owners.set(owner, { owner, previous: settings, next: nextSettings });
        }
        for (const note of eligibleNotes) {
          validateTransposedPitch(note.getPitch() + delta);
          noteSnapshots.push({ note, pitch: note.getPitch() });
        }
      }
    }
  }

  const setOwner = (snapshot: SettingsOwnerSnapshot, settings: MidiTransposeSettings) => {
    if (snapshot.owner instanceof KGMidiTrack) snapshot.owner.setTransposeSettings(settings);
    else snapshot.owner.setTransposeSettingsOverride(settings);
  };

  return {
    changedNoteCount: noteSnapshots.length,
    apply: () => {
      for (const snapshot of owners.values()) setOwner(snapshot, snapshot.next);
      for (const snapshot of noteSnapshots) snapshot.note.setPitch(snapshot.pitch + delta);
    },
    undo: () => {
      for (const snapshot of noteSnapshots) snapshot.note.setPitch(snapshot.pitch);
      for (const snapshot of owners.values()) setOwner(snapshot, snapshot.previous);
    },
  };
}
