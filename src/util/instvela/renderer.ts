import { createStore } from 'zustand/vanilla';
import type { KGProject } from '../../core/KGProject';
import { ensureInstVelaModels, refreshInstVelaModels } from './models';
import { getInstVelaRegions, type InstVelaRegion } from './regionScore';
import type { InstVelaAudio, InstVelaProgress, InstVelaProvider, InstVelaRequest, InstVelaWorkerMessage } from './types';

interface RenderRow {
  id: string;
  name: string;
  trackName: string;
  status: 'queued' | 'rendering' | 'failed';
  progress?: InstVelaProgress;
  error?: string;
}

interface PlayProgress {
  completed: number;
  total: number;
}

interface Job {
  project: KGProject;
  region: InstVelaRegion;
  promise: Promise<boolean>;
  resolve: (published: boolean) => void;
  reject: (error: Error) => void;
}

export class InstVelaRegionError extends Error {
  constructor(region: InstVelaRegion, message: string) {
    super(`${region.trackName} / ${region.name}: ${message}`);
  }
}

class InstVelaRenderer {
  readonly state = createStore(() => ({
    queue: [] as RenderRow[],
    playback: null as PlayProgress | null,
    provider: null as InstVelaProvider | null,
  }));

  private project?: KGProject;
  private worker?: Worker;
  private active?: Job;
  private pending: Job[] = [];
  private progress?: InstVelaProgress;
  private playback?: PlayProgress;
  private failures = new Map<string, RenderRow>();
  private renders = new Map<string, { fingerprint: string; buffer: AudioBuffer }>();

  setProject(project: KGProject): void {
    if (this.project === project) return;
    this.project = project;
    this.pending.forEach(job => job.resolve(false));
    this.pending = [];
    this.failures.clear();
    this.renders.clear();
    this.playback = undefined;
    this.state.setState({ playback: null, provider: null });
    if (!this.active) this.releaseWorker();
    this.updateQueue();
  }

  renderDeselected(project: KGProject, ids: string[]): void {
    if (!ids.length || !project.getInstVelaAutoRender()) return;
    this.setProject(project);
    for (const region of getInstVelaRegions(project, ids)) {
      if (this.needsRender(region)) {
        void this.enqueue(project, region).catch(() => { /* Shown in the queue. */ });
      }
    }
  }

  async prepareProject(project: KGProject, signal?: AbortSignal): Promise<void> {
    this.setProject(project);
    const wait = signal ? { completed: 0, total: 0 } : undefined;
    if (wait) this.playback = wait;
    const counted = new Map<string, string>();
    const publish = () => {
      if (wait && this.playback === wait) this.state.setState({ playback: wait.total ? { ...wait } : null });
    };
    let stopWaiting: () => void;
    const canceled = new Promise<void>(resolve => { stopWaiting = resolve; });
    const cancel = () => {
      stopWaiting();
      if (this.playback === wait) {
        this.playback = undefined;
        this.state.setState({ playback: null });
      }
    };
    signal?.addEventListener('abort', cancel, { once: true });
    try {
      while (this.project === project && !signal?.aborted) {
        const dirty = getInstVelaRegions(project).filter(region => this.needsRender(region));
        if (!dirty.length) return;
        for (const region of dirty) {
          if (counted.get(region.id) !== region.fingerprint) {
            if (wait) wait.total++;
            counted.set(region.id, region.fingerprint);
          }
        }
        publish();
        const renders = Promise.all(dirty.map(async region => {
          const rendered = await this.enqueue(project, region);
          if (wait && rendered) {
            wait.completed++;
            publish();
          }
        }));
        await Promise.race([renders, canceled]);
      }
    } finally {
      signal?.removeEventListener('abort', cancel);
      if (wait) cancel();
    }
  }

  getProjectBuffers(project: KGProject): Map<string, AudioBuffer> {
    const buffers = new Map<string, AudioBuffer>();
    if (this.project !== project || !this.renders.size) return buffers;
    const regions = getInstVelaRegions(project);
    for (const region of regions) {
      const rendered = this.renders.get(region.id);
      if (!region.error && rendered?.fingerprint === region.fingerprint) buffers.set(region.id, rendered.buffer);
    }
    return buffers;
  }

  private needsRender(region: InstVelaRegion): boolean {
    return !!region.error || this.renders.get(region.id)?.fingerprint !== region.fingerprint;
  }

  private enqueue(project: KGProject, region: InstVelaRegion): Promise<boolean> {
    const same = (job?: Job) => job?.project === project && job.region.id === region.id
      && job.region.fingerprint === region.fingerprint && job.region.error === region.error;
    const existing = same(this.active) ? this.active : this.pending.find(same);
    if (existing) return existing.promise;

    this.failures.delete(region.id);
    let resolve!: Job['resolve'];
    let reject!: Job['reject'];
    const promise = new Promise<boolean>((yes, no) => { resolve = yes; reject = no; });
    this.pending.push({ project, region, promise, resolve, reject });
    this.updateQueue();
    void this.drain();
    return promise;
  }

  private async drain(): Promise<void> {
    if (this.active) return;
    let job: Job | undefined;
    while ((job = this.pending.shift())) {
      this.active = job;
      this.progress = undefined;
      this.state.setState({ provider: null });
      this.updateQueue();
      try {
        if (!this.isCurrent(job)) {
          job.resolve(false);
          continue;
        }
        if (job.region.error) throw new Error(job.region.error);
        await ensureInstVelaModels();
        if (!this.isCurrent(job)) {
          job.resolve(false);
          continue;
        }
        const { wave, sampleRate } = await this.synthesize(job.region.request);
        if (!this.isCurrent(job)) {
          job.resolve(false);
          continue;
        }
        const buffer = new AudioBuffer({ length: wave.length, sampleRate, numberOfChannels: 1 });
        buffer.copyToChannel(wave, 0);
        this.renders.set(job.region.id, { fingerprint: job.region.fingerprint, buffer });
        job.resolve(true);
      } catch (error) {
        if (this.isCurrent(job)) {
          const message = error instanceof Error ? error.message : String(error);
          this.failures.set(job.region.id, { ...this.row(job, 'failed'), error: message });
          job.reject(new InstVelaRegionError(job.region, message));
        } else {
          job.resolve(false);
        }
      } finally {
        if (this.project !== job.project) this.releaseWorker();
        this.active = undefined;
        this.updateQueue();
      }
    }
  }

  private isCurrent(job: Job): boolean {
    if (this.project !== job.project) return false;
    const [region] = getInstVelaRegions(job.project, [job.region.id]);
    return region?.fingerprint === job.region.fingerprint && region.error === job.region.error;
  }

  private row(job: Job, status: RenderRow['status']): RenderRow {
    const { id, name, trackName } = job.region;
    return { id, name, trackName, status };
  }

  private updateQueue(): void {
    const queue = this.pending.map(job => this.row(job, 'queued'));
    if (this.active?.project === this.project && this.active) {
      queue.unshift({ ...this.row(this.active, 'rendering'), progress: this.progress });
    }
    queue.push(...this.failures.values());
    this.state.setState({ queue });
  }

  private releaseWorker(): void {
    this.worker?.terminate();
    this.worker = undefined;
  }

  private synthesize(request: InstVelaRequest): Promise<InstVelaAudio> {
    const worker = this.worker ??= new Worker(new URL('../../workers/instVelaWorker.ts', import.meta.url), { type: 'module' });
    return new Promise((resolve, reject) => {
      const fail = (error: string) => {
        this.releaseWorker();
        this.state.setState({ provider: null });
        void refreshInstVelaModels().catch(() => {});
        reject(new Error(error));
      };
      worker.onmessage = ({ data }: MessageEvent<InstVelaWorkerMessage>) => {
        if (data.type === 'progress') {
          this.progress = data.progress;
          this.updateQueue();
        } else if (data.type === 'provider') {
          if (this.active?.project === this.project) this.state.setState({ provider: data.provider });
        } else if (data.type === 'result') {
          resolve(data.audio);
        } else {
          fail(data.message);
        }
      };
      worker.onerror = event => fail(event.message || 'InstVELA worker failed to start.');
      worker.onmessageerror = () => fail('Could not read the InstVELA worker response.');
      worker.postMessage(request);
    });
  }
}

export const instVelaRenderer = new InstVelaRenderer();
