import { OpfsModelCache } from '../opfsModelCache';
import modelFiles from './modelFiles.json';
import type { InstVelaBundle } from './types';

export const INSTVELA_MODEL_PAGE = 'https://huggingface.co/KGAudioLab/InstVELA-models-onnx';
export const INSTVELA_BASE_URL = `${INSTVELA_MODEL_PAGE}/resolve/main/models/`;
export const INSTVELA_BUNDLES = Object.keys(modelFiles) as InstVelaBundle[];
export const instVelaCache = new OpfsModelCache({ directoryName: 'instvela-models' });

export function instVelaModelUrl(base: string, path: string): string {
  const url = new URL(base.trim());
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) {
    throw new Error('Use an HTTP or HTTPS model directory URL.');
  }
  url.pathname = url.pathname.replace(/\/*$/, '/');
  return new URL(path, url).href;
}

export function instVelaAsset(bundle: InstVelaBundle, name: string) {
  const file = (modelFiles[bundle] as Record<string, { bytes: number; sha256: string }>)[name];
  if (!file) throw new Error(`Unexpected InstVELA model asset: ${bundle}/${name}`);
  return { ...file, path: `${bundle}/${file.sha256}/${name}`, source: `${bundle}/${name}` };
}

export const instVelaAssets = INSTVELA_BUNDLES.map(bundle =>
  Object.keys(modelFiles[bundle]).map(name => instVelaAsset(bundle, name)));

export async function readInstVelaAsset(bundle: InstVelaBundle, name: string): Promise<ArrayBuffer> {
  const asset = instVelaAsset(bundle, name);
  const buffer = await instVelaCache.getArrayBuffer(asset.path);
  const digest = await crypto.subtle.digest('SHA-256', buffer);
  const hash = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
  if (hash !== asset.sha256) {
    await instVelaCache.delete(asset.path);
    throw new Error(`InstVELA model file failed verification: ${asset.source}`);
  }
  return buffer;
}
