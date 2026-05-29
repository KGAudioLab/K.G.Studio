declare module 'demucs-web' {
  export interface DemucsTrackOutput {
    left: Float32Array;
    right: Float32Array;
  }

  export interface DemucsSeparationResult {
    drums: DemucsTrackOutput;
    bass: DemucsTrackOutput;
    other: DemucsTrackOutput;
    vocals: DemucsTrackOutput;
  }

  export interface DemucsProgressInfo {
    progress: number;
    currentSegment: number;
    totalSegments: number;
  }

  export interface DemucsProcessorOptions {
    ort: typeof import('onnxruntime-web/webgpu');
    modelPath?: string;
    sessionOptions?: import('onnxruntime-web/webgpu').InferenceSession.SessionOptions;
    onProgress?: (info: DemucsProgressInfo) => void;
    onLog?: (phase: string, message: string) => void;
    onDownloadProgress?: (loaded: number, total: number) => void;
  }

  export class DemucsProcessor {
    constructor(options?: DemucsProcessorOptions);
    session: import('onnxruntime-web/webgpu').InferenceSession | null;
    loadModel(pathOrBuffer?: string | ArrayBuffer): Promise<import('onnxruntime-web/webgpu').InferenceSession>;
    separate(left: Float32Array, right: Float32Array): Promise<DemucsSeparationResult>;
  }
}
