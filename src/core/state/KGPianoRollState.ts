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
}