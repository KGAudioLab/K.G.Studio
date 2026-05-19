import {
  detectLocalLLMRuntimeSupport,
  LOCAL_LLM_LEGACY_FILENAMES,
  LOCAL_LLM_MODEL_FILENAME,
  type LocalLLMRuntimeSupport,
} from './localLLMConfig';
import { LocalLLMModelCache } from './localLLMModelCache';

export interface LocalLLMModelState {
  isCached: boolean;
  isChecking: boolean;
  isDownloading: boolean;
  isDeleting: boolean;
  progressPercent: number;
  progressText: string;
  error: string;
  runtimeSupport: LocalLLMRuntimeSupport;
}

type Listener = (state: LocalLLMModelState) => void;

export class LocalLLMModelManager {
  private static listeners = new Set<Listener>();
  private static initialized = false;
  private static state: LocalLLMModelState = {
    isCached: false,
    isChecking: false,
    isDownloading: false,
    isDeleting: false,
    progressPercent: 0,
    progressText: '',
    error: '',
    runtimeSupport: detectLocalLLMRuntimeSupport(),
  };

  public static subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    listener(this.getState());
    if (!this.initialized) {
      this.initialized = true;
      void this.refresh();
    }
    return () => this.listeners.delete(listener);
  }

  public static getState(): LocalLLMModelState {
    return { ...this.state, runtimeSupport: { ...this.state.runtimeSupport } };
  }

  public static async refresh(): Promise<void> {
    const runtimeSupport = detectLocalLLMRuntimeSupport();
    this.logSoftRuntimeWarning(runtimeSupport);
    this.setState({
      isChecking: true,
      runtimeSupport,
    });
    try {
      await this.cleanupLegacyEntries();
      const isCached = await LocalLLMModelCache.exists();
      this.setState({ isCached, error: '' });
    } catch (error) {
      this.setState({ error: error instanceof Error ? error.message : String(error) });
    } finally {
      this.setState({ isChecking: false });
    }
  }

  public static async ensureRuntimeSupported(): Promise<void> {
    const runtimeSupport = detectLocalLLMRuntimeSupport();
    this.logSoftRuntimeWarning(runtimeSupport);
    this.setState({ runtimeSupport });
    if (!runtimeSupport.supported) {
      throw new Error(runtimeSupport.reason ?? 'Local browser LLM is not supported in this browser.');
    }

    await this.cleanupLegacyEntries();
  }

  public static async deleteCachedModel(): Promise<void> {
    this.setState({ isDeleting: true, error: '' });
    try {
      await LocalLLMModelCache.delete();
      await this.cleanupLegacyEntries();
      this.setState({
        isCached: false,
        progressPercent: 0,
        progressText: '',
      });
    } catch (error) {
      this.setState({ error: error instanceof Error ? error.message : String(error) });
      throw error;
    } finally {
      this.setState({ isDeleting: false });
    }
  }

  private static setState(partial: Partial<LocalLLMModelState>): void {
    this.state = {
      ...this.state,
      ...partial,
    };
    for (const listener of this.listeners) {
      listener(this.getState());
    }
  }

  private static logSoftRuntimeWarning(runtimeSupport: LocalLLMRuntimeSupport): void {
    if (runtimeSupport.supported && runtimeSupport.reason) {
      console.warn('[localLLM] Runtime warning:', runtimeSupport.reason, {
        secureContext: runtimeSupport.secureContext,
        webgpuExposed: runtimeSupport.webgpuExposed,
        crossOriginIsolated: runtimeSupport.crossOriginIsolated,
        sharedArrayBufferAvailable: runtimeSupport.sharedArrayBufferAvailable,
      });
    }
  }

  private static async cleanupLegacyEntries(): Promise<void> {
    await Promise.all(
      LOCAL_LLM_LEGACY_FILENAMES.map(async legacyFilename => {
        try {
          await LocalLLMModelCache.delete(legacyFilename);
        } catch {
          // Ignore best-effort legacy cleanup failures.
        }
      }),
    );
  }

  public static notifyLoadStart(fromCache: boolean): void {
    this.setState({
      isDownloading: true,
      progressPercent: 0,
      progressText: fromCache ? 'Loading local language model from browser cache...' : 'Downloading local language model...',
      error: '',
    });
  }

  public static notifyLoadProgress(receivedBytes: number, totalBytes: number | null, fromCache: boolean): void {
    const receivedMb = (receivedBytes / (1024 * 1024)).toFixed(1);
    const totalMb = totalBytes ? (totalBytes / (1024 * 1024)).toFixed(1) : null;
    this.setState({
      isDownloading: true,
      progressPercent: totalBytes ? (receivedBytes / totalBytes) * 100 : 0,
      progressText: fromCache
        ? totalMb
          ? `Loading local language model from browser cache... ${receivedMb} / ${totalMb} MB`
          : `Loading local language model from browser cache... ${receivedMb} MB`
        : totalMb
          ? `Downloading local language model... ${receivedMb} / ${totalMb} MB`
          : `Downloading local language model... ${receivedMb} MB`,
      error: '',
    });
  }

  public static notifyCacheReady(): void {
    this.setState({
      isCached: true,
      isDownloading: false,
      progressPercent: 100,
      progressText: 'Using the local browser model. No external API requests are being sent.',
      error: '',
    });
  }

  public static notifyLoadError(error: unknown): void {
    this.setState({
      isDownloading: false,
      progressPercent: 0,
      progressText: '',
      error: error instanceof Error ? error.message : String(error),
    });
  }
}
