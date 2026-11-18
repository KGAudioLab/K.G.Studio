import { createStore } from 'zustand/vanilla';
import { ConfigManager } from '../../core/config/ConfigManager';
import { INSTVELA_BASE_URL, instVelaAssets, instVelaCache, instVelaModelUrl, readInstVelaAsset, INSTVELA_BUNDLES } from './modelAssets';

export const instVelaModels = createStore(() => ({
  cached: 0,
  hasFiles: false,
  activity: 'idle' as 'idle' | 'checking' | 'downloading' | 'deleting',
  downloadProgress: null as { completed: number; total: number } | null,
  percent: 0,
  error: '',
}));

let operation: Promise<void> | undefined;
const allAssets = instVelaAssets.flatMap((assets, index) =>
  assets.map(asset => ({ ...asset, bundle: INSTVELA_BUNDLES[index] })));
const totalBytes = allAssets.reduce((sum, asset) => sum + asset.bytes, 0);

function runModelOperation(activity: 'checking' | 'downloading' | 'deleting', work: () => Promise<void>): Promise<void> {
  instVelaModels.setState({ activity, error: '' });
  operation = Promise.resolve().then(work).catch(error => {
    instVelaModels.setState({ error: error instanceof Error ? error.message : String(error) });
    throw error;
  }).finally(() => {
    operation = undefined;
    instVelaModels.setState({ activity: 'idle', downloadProgress: null });
  });
  return operation;
}

async function inspectCache() {
  const files = await Promise.all(allAssets.map(async asset => ({
    ...asset,
    exists: await instVelaCache.exists(asset.path, { expectedSizeBytes: asset.bytes }),
  })));
  const missing = files.filter(asset => !asset.exists);
  const cached = INSTVELA_BUNDLES.length - new Set(missing.map(asset => asset.bundle)).size;
  instVelaModels.setState({ cached, hasFiles: missing.length < allAssets.length });
  return missing;
}

export function refreshInstVelaModels(): Promise<void> {
  return operation ?? runModelOperation('checking', async () => { await inspectCache(); });
}

export function ensureInstVelaModels(): Promise<void> {
  if (operation) {
    return instVelaModels.getState().activity === 'downloading'
      ? operation
      : operation.then(ensureInstVelaModels);
  }
  if (instVelaModels.getState().cached === INSTVELA_BUNDLES.length) return Promise.resolve();
  return runModelOperation('downloading', async () => {
    instVelaModels.setState({ percent: 0 });
    const missing = await inspectCache();
    if (!missing.length) return;
    const total = allAssets.length;
    let completed = total - missing.length;
    instVelaModels.setState({ downloadProgress: { completed, total } });

    const config = ConfigManager.instance();
    if (!config.getIsInitialized()) await config.initialize();
    const base = config.get('general.instvela.base_url') as string || INSTVELA_BASE_URL;
    const missingByBundle = new Map(INSTVELA_BUNDLES.map(bundle => [
      bundle, missing.filter(asset => asset.bundle === bundle).length,
    ]));
    const received = new Map<string, number>();
    let remaining = missing.reduce((sum, asset) => sum + asset.bytes, 0);
    let next = 0;
    let failed = false;

    const download = async () => {
      while (!failed && next < missing.length) {
        const asset = missing[next++];
        try {
          await instVelaCache.download(instVelaModelUrl(base, asset.source), asset.path,
            { expectedSizeBytes: asset.bytes }, progress => {
              received.set(asset.path, progress.receivedBytes);
              const inFlight = Array.from(received.values()).reduce((sum, bytes) => sum + bytes, 0);
              const percent = Math.min(99, Math.floor((1 - (remaining - inFlight) / totalBytes) * 100));
              if (percent !== instVelaModels.getState().percent) instVelaModels.setState({ percent });
            });
          await readInstVelaAsset(asset.bundle, asset.source.slice(asset.bundle.length + 1));
          remaining -= asset.bytes;
          received.delete(asset.path);
          const left = missingByBundle.get(asset.bundle)! - 1;
          missingByBundle.set(asset.bundle, left);
          completed++;
          instVelaModels.setState(state => ({
            cached: state.cached + (left === 0 ? 1 : 0),
            hasFiles: true,
            downloadProgress: { completed, total },
          }));
        } catch (error) {
          failed = true;
          throw error;
        }
      }
    };

    const results = await Promise.allSettled(Array.from({ length: 4 }, download));
    const failure = results.find(result => result.status === 'rejected');
    if (failure?.status === 'rejected') throw failure.reason;
    instVelaModels.setState({ percent: 100 });
  });
}

export function deleteInstVelaModels(): Promise<void> {
  if (operation) return operation.then(deleteInstVelaModels);
  return runModelOperation('deleting', async () => {
    const results = await Promise.allSettled(allAssets.map(asset => instVelaCache.delete(asset.path)));
    await inspectCache();
    const failure = results.find(result => result.status === 'rejected');
    if (failure?.status === 'rejected') throw failure.reason;
  });
}
