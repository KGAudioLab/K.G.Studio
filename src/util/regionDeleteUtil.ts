type DeleteRegionsCallback = () => boolean;

class RegionDeleteManager {
  private static instance: RegionDeleteManager;
  private deleteCallback: DeleteRegionsCallback | null = null;

  private constructor() {}

  static getInstance(): RegionDeleteManager {
    if (!RegionDeleteManager.instance) {
      RegionDeleteManager.instance = new RegionDeleteManager();
    }
    return RegionDeleteManager.instance;
  }

  registerDeleteCallback(callback: DeleteRegionsCallback): void {
    this.deleteCallback = callback;
    console.log('RegionDeleteManager: Delete callback registered');
  }

  unregisterDeleteCallback(): void {
    this.deleteCallback = null;
    console.log('RegionDeleteManager: Delete callback unregistered');
  }

  deleteSelectedRegions(): boolean {
    if (this.deleteCallback) {
      console.log('RegionDeleteManager: Executing delete callback');
      return this.deleteCallback();
    }
    console.log('RegionDeleteManager: No delete callback registered');
    return false;
  }
}

export const regionDeleteManager = RegionDeleteManager.getInstance(); 