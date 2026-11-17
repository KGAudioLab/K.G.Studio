import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { KGProject } from '../../core/KGProject';
import { KGMidiNote } from '../../core/midi/KGMidiNote';
import { KGMidiRegion } from '../../core/region/KGMidiRegion';
import { KGMidiTrack } from '../../core/track/KGMidiTrack';
import { instVelaRenderer } from './renderer';
import type { InstVelaProvider, InstVelaRequest, InstVelaWorkerMessage } from './types';

vi.mock('./models', () => ({
  ensureInstVelaModels: vi.fn().mockResolvedValue(undefined),
  refreshInstVelaModels: vi.fn().mockResolvedValue(undefined),
}));

const posted: InstVelaRequest[] = [];
const workers: WorkerStub[] = [];
class WorkerStub {
  onmessage?: (event: { data: InstVelaWorkerMessage }) => void;
  terminate = vi.fn();

  constructor() { workers.push(this); }

  postMessage(request: InstVelaRequest) { posted.push(request); }

  reportProvider(provider: InstVelaProvider | null) {
    this.onmessage?.({ data: { type: 'provider', provider } });
  }

  finish() {
    this.onmessage?.({ data: { type: 'result', audio: { wave: Float32Array.of(0.1), sampleRate: 48000 } } });
  }
}

function createProject() {
  const project = new KGProject();
  const first = new KGMidiTrack('Violin', 1, 'ai_violin');
  const second = new KGMidiTrack('Viola', 2, 'ai_viola');
  for (const track of [first, second]) {
    const id = String(track.getId());
    const region = new KGMidiRegion(id, id, 0, track.getName(), 0, 960);
    region.addNote(new KGMidiNote(id, 0, 960, 69, 80));
    track.addRegion(region);
  }
  project.setTracks([first, second]);
  return project;
}

describe('InstVELA render queue', () => {
  beforeEach(() => {
    workers.length = 0;
    posted.length = 0;
    vi.stubGlobal('Worker', WorkerStub);
    vi.stubGlobal('AudioBuffer', class { copyToChannel() {} });
  });

  afterEach(() => {
    instVelaRenderer.setProject(new KGProject());
    vi.unstubAllGlobals();
  });

  it('waits for background rendering and starts each distinct region once', async () => {
    const project = createProject();
    instVelaRenderer.renderDeselected(project, ['1']);
    const play = instVelaRenderer.prepareProject(project, new AbortController().signal);
    await vi.waitFor(() => expect(posted).toHaveLength(1));
    expect(instVelaRenderer.state.getState().playback).toEqual({ completed: 0, total: 2 });
    expect(instVelaRenderer.state.getState().queue.map(row => row.status)).toEqual(['rendering', 'queued']);

    workers[0].reportProvider('webgpu');
    expect(instVelaRenderer.state.getState().provider).toBe('webgpu');
    workers[0].reportProvider('wasm');
    expect(instVelaRenderer.state.getState().provider).toBe('wasm');

    workers[0].finish();
    await vi.waitFor(() => expect(posted).toHaveLength(2));
    expect(instVelaRenderer.state.getState().provider).toBeNull();
    expect(posted.map(request => request.bundle)).toEqual(['m01-violin-onnx-v1', 'm01-viola-onnx-v1']);
    expect(instVelaRenderer.state.getState().playback).toEqual({ completed: 1, total: 2 });
    workers[0].reportProvider('wasm');
    workers[0].finish();
    await play;

    instVelaRenderer.renderDeselected(project, ['1', '2']);
    expect(posted).toHaveLength(2);
    expect(instVelaRenderer.getProjectBuffers(project).size).toBe(2);
    expect(instVelaRenderer.state.getState()).toEqual({ queue: [], playback: null, provider: 'wasm' });
  });

  it('discards a result if the MIDI changes during synthesis and renders the new notes before Play', async () => {
    const project = createProject();
    project.setTracks(project.getTracks().slice(0, 1));
    const play = instVelaRenderer.prepareProject(project);
    await vi.waitFor(() => expect(posted).toHaveLength(1));
    const track = project.getTracks()[0] as KGMidiTrack;
    track.getRegions()[0].getNotes()[0].setPitch(74);
    workers[0].finish();

    await vi.waitFor(() => expect(posted).toHaveLength(2));
    expect(instVelaRenderer.getProjectBuffers(project).size).toBe(0);
    expect(posted[1].score.notes[0].pitch).toBe(74);
    workers[0].finish();
    await play;
    expect(instVelaRenderer.getProjectBuffers(project).size).toBe(1);
  });
});
