export interface AireNote { pitch: number; start: number; end: number; velocity: number }
export type AireModelId = 'S03' | 'B01' | 'W01';
export type AireController = 1 | 2 | 7 | 11;
export const AIRE_CONTROLLERS: readonly AireController[] = [1, 2, 7, 11];
export type AireSimplification = 'none' | 'mild' | 'medium' | 'aggressive';
export const AIRE_SIMPLIFICATION_LEVELS: readonly AireSimplification[] = ['none', 'mild', 'medium', 'aggressive'];
export interface AireOptions {
  modelId: AireModelId;
  mood: string;
  role: string;
  /** Defaults to true; uniform note velocities automatically disable conditioning. */
  useVelocity?: boolean;
}
export interface AireSection {
  notes: AireNote[];
  tempo: number;
  meter: [number, number];
  /** Project beat at section start; note times are relative to this start. */
  originBeat: number;
  duration: number;
  /** Context duration includes the final note's one-beat tail. */
  hardEnd: number;
}
export interface AirePoint { tick: number; value: number }
export type AireProgress = { completed: number; total: number; provider: 'webgpu' | 'wasm' };
export interface AireWorkerRequest {
  model: ArrayBuffer;
  options: AireOptions;
  sections: AireSection[];
  /** Defaults to none for callers that need the original dense output. */
  simplification?: AireSimplification;
}
export type AireWorkerMessage =
  | { type: 'progress'; progress: AireProgress }
  | { type: 'result'; points: AirePoint[] }
  | { type: 'error'; error: string };
