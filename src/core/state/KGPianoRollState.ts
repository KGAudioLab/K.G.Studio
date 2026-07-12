import type { ResolvedChordGuideItem } from '../ChordGuideTypes';
import type { NoteRankSelectionOptions } from '../../components/piano-roll/noteRankSelection';

export const PIANO_ROLL_NO_SNAP = 'none' as const;

export interface PianoRollOptionDefinition<TValue extends string = string> {
  value: TValue;
  labelKey: string;
}

export type PianoRollSnapValue = typeof PIANO_ROLL_NO_SNAP | '1/3' | '1/4' | '1/6' | '1/8' | '1/12' | '1/16' | '1/24' | '1/32';
export type PianoRollQuantizePositionValue = '1/3' | '1/4' | '1/6' | '1/8' | '1/12' | '1/16' | '1/24' | '1/32';
export type PianoRollQuantizeLengthValue = '1/1' | '1/2' | '1/3' | '1/4' | '1/6' | '1/8' | '1/12' | '1/16' | '1/24' | '1/32';

/**
 * KGPianoRollState - State management for the piano roll
 * Implements the singleton pattern for global access
 */
export class KGPianoRollState {
  private static _instance: KGPianoRollState | null = null;

  public static SNAP_OPTIONS: PianoRollOptionDefinition<PianoRollSnapValue>[] = [
    { value: PIANO_ROLL_NO_SNAP, labelKey: 'pianoRoll.snap.none' },
    { value: '1/3', labelKey: 'pianoRoll.quantize.1/3' },
    { value: '1/4', labelKey: 'pianoRoll.quantize.1/4' },
    { value: '1/6', labelKey: 'pianoRoll.quantize.1/6' },
    { value: '1/8', labelKey: 'pianoRoll.quantize.1/8' },
    { value: '1/12', labelKey: 'pianoRoll.quantize.1/12' },
    { value: '1/16', labelKey: 'pianoRoll.quantize.1/16' },
    { value: '1/24', labelKey: 'pianoRoll.quantize.1/24' },
    { value: '1/32', labelKey: 'pianoRoll.quantize.1/32' },
  ];
  public static QUANT_POS_OPTIONS: PianoRollOptionDefinition<PianoRollQuantizePositionValue>[] = [
    { value: '1/3', labelKey: 'pianoRoll.quantize.1/3' },
    { value: '1/4', labelKey: 'pianoRoll.quantize.1/4' },
    { value: '1/6', labelKey: 'pianoRoll.quantize.1/6' },
    { value: '1/8', labelKey: 'pianoRoll.quantize.1/8' },
    { value: '1/12', labelKey: 'pianoRoll.quantize.1/12' },
    { value: '1/16', labelKey: 'pianoRoll.quantize.1/16' },
    { value: '1/24', labelKey: 'pianoRoll.quantize.1/24' },
    { value: '1/32', labelKey: 'pianoRoll.quantize.1/32' },
  ];
  public static QUANT_LEN_OPTIONS: PianoRollOptionDefinition<PianoRollQuantizeLengthValue>[] = [
    { value: '1/1', labelKey: 'pianoRoll.quantize.1/1' },
    { value: '1/2', labelKey: 'pianoRoll.quantize.1/2' },
    { value: '1/3', labelKey: 'pianoRoll.quantize.1/3' },
    { value: '1/4', labelKey: 'pianoRoll.quantize.1/4' },
    { value: '1/6', labelKey: 'pianoRoll.quantize.1/6' },
    { value: '1/8', labelKey: 'pianoRoll.quantize.1/8' },
    { value: '1/12', labelKey: 'pianoRoll.quantize.1/12' },
    { value: '1/16', labelKey: 'pianoRoll.quantize.1/16' },
    { value: '1/24', labelKey: 'pianoRoll.quantize.1/24' },
    { value: '1/32', labelKey: 'pianoRoll.quantize.1/32' },
  ];

  private activeTool: string = "pointer";
  private currentSnap: PianoRollSnapValue = PIANO_ROLL_NO_SNAP;
  private lastEditedNoteLength: number = 1; // Default to 1 beat
  private lastEditedNoteVelocity: number = 127;
  private currentMode: string = "ionian"; // Default mode
  private automationViewEnabled: boolean = false;
  private currentAutomationType: string = "pitch-bend";
  private pianoRollZoom: number = 1;
  private sheetMusicViewEnabled: boolean = false;
  private sheetMusicTrackScopeEnabled: boolean = false;
  private sheetQuantization: string = '16,48';
  private noteRankSelectionOptions: NoteRankSelectionOptions = {
    direction: 'bottom-to-top',
    rank: 1,
    interval: '1/16',
    range: 'selected-only',
  };

  // Chord guide state
  private currentSuitableChords: ResolvedChordGuideItem[] = [];
  private currentSuitableChordsPitchClasses: Record<string, number[]> = {};
  private currentMatchingChords: number[][] = [];
  private currentSelectedChordIndex: number = 0;
  private currentChordCursorPitch: number | null = null;
  private currentHoveredChordGuideCandidate: ResolvedChordGuideItem | null = null;
  private listeners = new Set<() => void>();

  private constructor() {
    console.log("KGPianoRollState initialized");
  }

  public static instance(): KGPianoRollState {
    if (!KGPianoRollState._instance) {
      KGPianoRollState._instance = new KGPianoRollState();
    }
    return KGPianoRollState._instance;
  }

  // Getters and setters
  public getActiveTool(): string {
    return this.activeTool;
  }

  public setActiveTool(tool: string): void {
    this.activeTool = tool;
  }

  public getCurrentSnap(): PianoRollSnapValue {
    return this.currentSnap;
  }

  public setCurrentSnap(snap: PianoRollSnapValue): void {
    this.currentSnap = snap;
  }

  public getLastEditedNoteLength(): number {
    return this.lastEditedNoteLength;
  }

  public setLastEditedNoteLength(length: number): void {
    this.lastEditedNoteLength = length;
  }

  public getLastEditedNoteVelocity(): number {
    return this.lastEditedNoteVelocity;
  }

  public setLastEditedNoteVelocity(velocity: number): void {
    this.lastEditedNoteVelocity = velocity;
  }

  public getCurrentMode(): string {
    return this.currentMode;
  }

  public setCurrentMode(mode: string): void {
    this.currentMode = mode;
  }

  public getAutomationViewEnabled(): boolean {
    return this.automationViewEnabled;
  }

  public setAutomationViewEnabled(enabled: boolean): void {
    this.automationViewEnabled = enabled;
  }

  public getCurrentAutomationType(): string {
    return this.currentAutomationType;
  }

  public setCurrentAutomationType(type: string): void {
    this.currentAutomationType = type;
  }

  public getPianoRollZoom(): number {
    return this.pianoRollZoom;
  }

  public setPianoRollZoom(zoom: number): void {
    this.pianoRollZoom = zoom;
  }

  public getSheetMusicViewEnabled(): boolean {
    return this.sheetMusicViewEnabled;
  }

  public setSheetMusicViewEnabled(enabled: boolean): void {
    this.sheetMusicViewEnabled = enabled;
  }

  public getSheetMusicTrackScopeEnabled(): boolean {
    return this.sheetMusicTrackScopeEnabled;
  }

  public setSheetMusicTrackScopeEnabled(enabled: boolean): void {
    this.sheetMusicTrackScopeEnabled = enabled;
  }

  public getSheetQuantization(): string {
    return this.sheetQuantization;
  }

  public setSheetQuantization(value: string): void {
    this.sheetQuantization = value;
  }

  public getNoteRankSelectionOptions(): NoteRankSelectionOptions {
    return { ...this.noteRankSelectionOptions };
  }

  public setNoteRankSelectionOptions(options: NoteRankSelectionOptions): void {
    this.noteRankSelectionOptions = { ...options };
  }

  public getCurrentSuitableChords(): ResolvedChordGuideItem[] {
    return this.currentSuitableChords;
  }

  public setCurrentSuitableChords(chords: ResolvedChordGuideItem[]): void {
    this.currentSuitableChords = chords;
  }

  public getCurrentSuitableChordsPitchClasses(): Record<string, number[]> {
    return this.currentSuitableChordsPitchClasses;
  }

  public setCurrentSuitableChordsPitchClasses(chordsPitchClasses: Record<string, number[]>): void {
    this.currentSuitableChordsPitchClasses = chordsPitchClasses;
  }

  public getCurrentMatchingChords(): number[][] {
    return this.currentMatchingChords;
  }

  public setCurrentMatchingChords(chords: number[][]): void {
    this.currentMatchingChords = chords;
    this.emitChange();
  }

  public getCurrentSelectedChordIndex(): number {
    return this.currentSelectedChordIndex;
  }

  public setCurrentSelectedChordIndex(index: number): void {
    this.currentSelectedChordIndex = index;
    this.emitChange();
  }

  public getCurrentChordCursorPitch(): number | null {
    return this.currentChordCursorPitch;
  }

  public setCurrentChordCursorPitch(pitch: number | null): void {
    this.currentChordCursorPitch = pitch;
    this.emitChange();
  }

  public getCurrentHoveredChordGuideCandidate(): ResolvedChordGuideItem | null {
    return this.currentHoveredChordGuideCandidate;
  }

  public setCurrentHoveredChordGuideCandidate(candidate: ResolvedChordGuideItem | null): void {
    this.currentHoveredChordGuideCandidate = candidate;
    this.emitChange();
  }

  public subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private emitChange(): void {
    this.listeners.forEach((listener) => listener());
  }
}
