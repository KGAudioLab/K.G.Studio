import models from './models.json';
import type { AireModelId } from './types';
import { OpfsModelCache } from '../opfsModelCache';
export const AIRE_MODELS = models;
export const AIRE_MODEL_IDS = Object.keys(models) as AireModelId[];
export const AIRE_BASE_URL = 'https://huggingface.co/KGAudioLab/instrument-aire-models/resolve/main/models/';
export const aireCache = new OpfsModelCache();
export function aireModelUrl(base: string, id: AireModelId): string {
  const url = new URL(`${base.trim().replace(/\/+$/, '')}/`);
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error('Use an HTTP or HTTPS model base URL.');
  return new URL(models[id].path, url).href;
}
export async function deleteAireModels(): Promise<void> {
  await Promise.all(AIRE_MODEL_IDS.map(id => aireCache.delete(models[id].path)));
}
