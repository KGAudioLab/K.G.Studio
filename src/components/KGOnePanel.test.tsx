import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import KGOnePanel from './KGOnePanel';
import { KGAudioRegion } from '../core/region/KGAudioRegion';
import { KGAudioTrack } from '../core/track/KGAudioTrack';
import { LOCAL_SEPARATOR_MODEL_IDS } from '../util/local-separator/config';

const { mockLocalSeparatorDownload } = vi.hoisted(() => ({
  mockLocalSeparatorDownload: vi.fn(async (_url?: string, _filename?: string, _onProgress?: unknown) => undefined),
}));

let kgoneEnabled = false;
let selectedRegionIds: string[] = [];
let localModelCached: Record<string, boolean> = {};
let localSeparationResult: Array<{ name: string; blob: Blob }> = [];

const mockRefreshProjectState = vi.fn();
const mockExecuteCommand = vi.fn();

vi.mock('../stores/projectStore', () => ({
  useProjectStore: () => ({
    selectedRegionIds,
    projectName: 'Test Project',
    bpm: 120,
    keySignature: 'C major',
    timeSignature: { numerator: 4, denominator: 4 },
    maxBars: 32,
    refreshProjectState: mockRefreshProjectState,
  }),
}));

vi.mock('../core/config/ConfigManager', () => ({
  ConfigManager: {
    instance: () => ({
      get: (key: string) => {
        if (key === 'general.kgone.enabled') return kgoneEnabled;
        if (key === 'general.kgone.base_url') return 'http://127.0.0.1:8000';
        if (key === 'general.uvr5_web_runtime.mdx_net_model_url') return 'https://example.com/custom-uvr5.onnx';
        if (key === 'general.uvr5_web_runtime.htdemucs_4s_model_url') return 'https://example.com/custom-htdemucs.onnx';
        return undefined;
      },
    }),
  },
}));

const audioRegion = new KGAudioRegion(
  'audio-region-1',
  'track-1',
  0,
  'Verse Stem',
  0,
  4,
  'audio-file-1',
  'verse.wav',
  2,
  0,
);
const audioTrack = new KGAudioTrack('Audio Track', 1);
audioTrack.setTrackIndex(0);
audioTrack.setRegions([audioRegion]);

vi.mock('../core/KGCore', () => ({
  KGCore: {
    instance: () => ({
      getCurrentProject: () => ({
        getTracks: () => [audioTrack],
        getName: () => 'Test Project',
      }),
      executeCommand: mockExecuteCommand,
    }),
  },
}));

vi.mock('../core/io/KGAudioFileStorage', () => ({
  KGAudioFileStorage: {
    loadAudioFile: vi.fn(async () => new ArrayBuffer(8)),
    storeAudioFile: vi.fn(async () => undefined),
  },
}));

vi.mock('../util/audioUtil', () => ({
  sliceAudioToWav: vi.fn(async (_buffer: ArrayBuffer) => _buffer),
}));

vi.mock('../util/local-separator/modelCache', () => ({
  LocalSeparatorModelCache: {
    exists: vi.fn(async (modelConfig: { id: string }) => localModelCached[modelConfig.id] ?? false),
    download: vi.fn(async (modelConfig: { id: string; filename: string }, url: string, onProgress: (progress: unknown) => void) => {
      localModelCached[modelConfig.id] = true;
      return mockLocalSeparatorDownload(modelConfig.filename, url, onProgress);
    }),
    delete: vi.fn(async (modelConfig: { id: string }) => {
      localModelCached[modelConfig.id] = false;
    }),
    getArrayBuffer: vi.fn(async () => new ArrayBuffer(16)),
  },
}));

vi.mock('../util/local-separator/runtime', () => ({
  detectLocalRuntimeSupport: () => ({ webgpuExposed: false }),
  LocalOrtRuntimeManager: class {
    constructor(private readonly options?: { onProviderChange?: (provider: string) => void }) {}

    reset() {}

    async ensureRuntime() {
      this.options?.onProviderChange?.('cpu/wasm');
      return { provider: 'wasm', session: {} };
    }
  },
}));

vi.mock('../util/local-separator/runner', () => ({
  runLocalSeparator: vi.fn(async ({ onProgress, onProviderChange }) => {
    onProviderChange?.('cpu/wasm');
    onProgress({ stage: 'main', passLabel: 'Main pass', percent: 100, processedChunks: 1, totalChunks: 1 });
    return {
      stems: localSeparationResult,
      providerLabel: 'CPU/wasm',
      debugSummary: {},
    };
  }),
}));

describe('KGOnePanel local separator mode', () => {
  beforeEach(() => {
    kgoneEnabled = false;
    selectedRegionIds = [];
    localModelCached = {};
    localSeparationResult = [
      { name: 'Instrumental', blob: new Blob(['instrumental'], { type: 'audio/wav' }) },
      { name: 'Vocals', blob: new Blob(['vocals'], { type: 'audio/wav' }) },
    ];
    mockLocalSeparatorDownload.mockClear();
    mockRefreshProjectState.mockReset();
    mockExecuteCommand.mockReset();
  });

  it('defaults to separator and shows other tabs as disabled in local mode', async () => {
    render(<KGOnePanel isVisible={true} />);

    expect(await screen.findByText('Local Separator Mode')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Full Song' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Remix' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Repaint' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Separator' })).not.toBeDisabled();
    expect(screen.getByRole('button', { name: 'Download Selected Model' })).toBeInTheDocument();
  });

  it('shows the single local separator model and advanced settings when the model is cached', async () => {
    localModelCached[LOCAL_SEPARATOR_MODEL_IDS.mdxMedium] = true;
    selectedRegionIds = ['audio-region-1'];

    render(<KGOnePanel isVisible={true} />);

    await screen.findByText('Selected Region');
    const options = await screen.findAllByRole('option');
    expect(options).toHaveLength(2);
    expect(options[0]).toHaveTextContent('Vocal and Instrument (Medium Accuracy)');
    expect(options[1]).toHaveTextContent('Vocal, Drums, Bass, and Others');

    fireEvent.click(screen.getByRole('button', { name: /Advanced Settings/i }));
    expect(screen.getByLabelText('Optional audio chunk duration (seconds)')).toBeInTheDocument();
    expect(screen.getByLabelText('Model overlap')).toBeInTheDocument();
  });

  it('uses the configured UVR5 model URL when downloading the local model', async () => {
    render(<KGOnePanel isVisible={true} />);

    fireEvent.click(await screen.findByRole('button', { name: 'Download Selected Model' }));

    await waitFor(() => {
      expect(mockLocalSeparatorDownload).toHaveBeenCalledWith(
        'UVR-MDX-NET-Inst_HQ_3.onnx',
        'https://example.com/custom-uvr5.onnx',
        expect.any(Function),
      );
    });
  });

  it('prompts for an audio region when the model is cached but nothing is selected', async () => {
    localModelCached[LOCAL_SEPARATOR_MODEL_IDS.mdxMedium] = true;

    render(<KGOnePanel isVisible={true} />);

    expect(await screen.findByText(/Select an audio region on the timeline/)).toBeInTheDocument();
  });

  it('renders local separation outputs after processing completes', async () => {
    localModelCached[LOCAL_SEPARATOR_MODEL_IDS.mdxMedium] = true;
    selectedRegionIds = ['audio-region-1'];

    render(<KGOnePanel isVisible={true} />);

    fireEvent.click(await screen.findByRole('button', { name: 'Separate Stems' }));

    await waitFor(() => {
      expect(screen.getByText('Instrumental')).toBeInTheDocument();
      expect(screen.getByText('Vocals')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Import All Stems to Timeline' })).toBeInTheDocument();
    });
  });

  it('uses Demucs defaults and renders four local stem players', async () => {
    localModelCached[LOCAL_SEPARATOR_MODEL_IDS.htdemucs4s] = true;
    localSeparationResult = [
      { name: 'Vocals', blob: new Blob(['vocals'], { type: 'audio/wav' }) },
      { name: 'Drums', blob: new Blob(['drums'], { type: 'audio/wav' }) },
      { name: 'Bass', blob: new Blob(['bass'], { type: 'audio/wav' }) },
      { name: 'Others', blob: new Blob(['others'], { type: 'audio/wav' }) },
    ];
    selectedRegionIds = ['audio-region-1'];

    render(<KGOnePanel isVisible={true} />);

    await screen.findByText('Selected Region');
    fireEvent.change(screen.getByRole('combobox'), { target: { value: LOCAL_SEPARATOR_MODEL_IDS.htdemucs4s } });
    fireEvent.click(screen.getByRole('button', { name: /Advanced Settings/i }));

    await waitFor(() => {
      expect((screen.getByLabelText('Optional audio chunk duration (seconds)') as HTMLInputElement).value).toBe('8');
      expect((screen.getByLabelText('Model overlap') as HTMLInputElement).value).toBe('0.25');
    });

    fireEvent.click(screen.getByRole('button', { name: 'Separate Stems' }));

    await waitFor(() => {
      expect(screen.getByText('Vocals')).toBeInTheDocument();
      expect(screen.getByText('Drums')).toBeInTheDocument();
      expect(screen.getByText('Bass')).toBeInTheDocument();
      expect(screen.getByText('Others')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Import All Stems to Timeline' })).toBeInTheDocument();
    });
  });
});
