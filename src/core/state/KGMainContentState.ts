/**
 * KGMainContentState - State management for the main content area
 * Implements the singleton pattern for global access
 */
export class KGMainContentState {
  private static _instance: KGMainContentState | null = null;

  private activeTool: string = "pointer";

  private constructor() {
    console.log("KGMainContentState initialized");
  }

  public static instance(): KGMainContentState {
    if (!KGMainContentState._instance) {
      KGMainContentState._instance = new KGMainContentState();
    }
    return KGMainContentState._instance;
  }

  // Getters and setters
  public getActiveTool(): string {
    return this.activeTool;
  }

  public setActiveTool(tool: string): void {
    this.activeTool = tool;
  }
}