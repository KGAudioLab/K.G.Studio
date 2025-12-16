/**
 * KGPianoRollState - State management for the piano roll
 * Implements the singleton pattern for global access
 */
export class KGPianoRollState {
  private static _instance: KGPianoRollState | null = null;

  public static SNAP_OPTIONS: string[] = ['NO SNAP', '1/3', '1/4', '1/6', '1/8', '1/12', '1/16', '1/24', '1/32'];
  public static QUANT_POS_OPTIONS: string[] = ['1/3', '1/4', '1/6', '1/8', '1/12', '1/16', '1/24', '1/32'];
  public static QUANT_LEN_OPTIONS: string[] = ['1/1', '1/2', '1/3', '1/4', '1/6', '1/8', '1/12', '1/16', '1/24', '1/32'];

  private activeTool: string = "pointer";
  private currentSnap: string = "NO SNAP";
  private lastEditedNoteLength: number = 1; // Default to 1 beat
  private currentMode: string = "ionian"; // Default mode

  // Chord guide state
  private currentSuitableChords: Record<string, string[]> = {}; // Map of chord symbols to note names (e.g., {"I": ["C", "E", "G"]})
  private currentSuitableChordsPitchClasses: Record<string, number[]> = {}; // Map of chord symbols to pitch classes (e.g., {"I": [0, 4, 7]})
  private currentMatchingChords: number[][] = [];
  private currentSelectedChordIndex: number = 0;
  private currentChordCursorPitch: number | null = null;

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

  public getCurrentSnap(): string {
    return this.currentSnap;
  }

  public setCurrentSnap(snap: string): void {
    this.currentSnap = snap;
  }

  public getLastEditedNoteLength(): number {
    return this.lastEditedNoteLength;
  }

  public setLastEditedNoteLength(length: number): void {
    this.lastEditedNoteLength = length;
  }

  public getCurrentMode(): string {
    return this.currentMode;
  }

  public setCurrentMode(mode: string): void {
    this.currentMode = mode;
  }

  public getCurrentSuitableChords(): Record<string, string[]> {
    return this.currentSuitableChords;
  }

  public setCurrentSuitableChords(chords: Record<string, string[]>): void {
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
  }

  public getCurrentSelectedChordIndex(): number {
    return this.currentSelectedChordIndex;
  }

  public setCurrentSelectedChordIndex(index: number): void {
    this.currentSelectedChordIndex = index;
  }

  public getCurrentChordCursorPitch(): number | null {
    return this.currentChordCursorPitch;
  }

  public setCurrentChordCursorPitch(pitch: number | null): void {
    this.currentChordCursorPitch = pitch;
  }
}