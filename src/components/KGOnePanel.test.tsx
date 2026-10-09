import React from 'react';
import * as Tone from 'tone';
import { KGAudioFileStorage } from '../core/io/KGAudioFileStorage';
import { runLocalSeparator } from '../util/local-separator/runner';
import { ImportStemsCommand } from '../core/commands';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import KGOnePanel from './KGOnePanel';
import { KGAudioRegion } from '../core/region/KGAudioRegion';
import { KGAudioTrack } from '../core/track/KGAudioTrack';
import { KGMidiRegion } from '../core/region/KGMidiRegion';
import { KGMidiTrack } from '../core/track/KGMidiTrack';
import { KGMidiNote } from '../core/midi/KGMidiNote';
import { aireCache } from '../util/aire/config';
import { quarterNotesToTicks } from '../core/timing';
import { LOCAL_SEPARATOR_MODEL_IDS } from '../util/local-separator/config';

const { mockLocalSeparatorDownload } = vi.hoisted(() => ({
  mockLocalSeparatorDownload: vi.fn(async (_url?: string, _filename?: string, _onProgress?: unknown) => undefined),
}));

let kgoneEnabled = false;
let musicGeneratorTab: 'separator' | 'humanize' = 'separator';
let humanizeFlashVersion = 0;
let stemExtractionFlashVersion = 0;
let extraTracks: KGMidiTrack[] = [];
const mockSetMusicGeneratorTab = vi.fn((tab: 'separator' | 'humanize') => { musicGeneratorTab = tab; });
let selectedRegionIds: string[] = [];
let projectName = 'Test Project';
let savedProjectName = 'Test Project';
let localModelCached: Record<string, boolean> = {};
let localSeparationResult: Array<{ name: string; blob: Blob }> = [];

const mockRefreshProjectState = vi.fn();
const mockExecuteCommand = vi.fn();

vi.mock('../stores/projectStore', () => ({
  useProjectStore: () => ({
    selectedRegionIds,
    musicGeneratorTab, humanizeFlashVersion, stemExtractionFlashVersion, setMusicGeneratorTab: mockSetMusicGeneratorTab,
    tracks: [audioTrack, ...extraTracks], showPianoRoll: false, activeRegionId: null,
    isLooping: false, loopingRange: [0, 0], completeHumanize: vi.fn(),
    projectName,
    savedProjectName,
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
  quarterNotesToTicks(4),
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
        getTracks: () => [audioTrack, ...extraTracks],
        getName: () => 'Test Project',
        getTimeSignature: () => ({ numerator: 4, denominator: 4 }),
        getBpm: () => 120,
        getGlobalTracks: () => [],
        getIsLooping: () => false,
        getMaxBars: () => 32,
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

describe('KGOnePanel browser stem extraction', () => {
  afterEach(() => vi.unstubAllGlobals());
  beforeEach(() => {
    kgoneEnabled = false;
    musicGeneratorTab = 'separator'; humanizeFlashVersion = 0;
    mockSetMusicGeneratorTab.mockClear();
    selectedRegionIds = [];
    projectName = 'Test Project';
    savedProjectName = 'Test Project';
    localModelCached = {};
    localSeparationResult = [
      { name: 'Instrumental', blob: new Blob(['instrumental'], { type: 'audio/wav' }) },
      { name: 'Vocals', blob: new Blob(['vocals'], { type: 'audio/wav' }) },
    ];
    mockLocalSeparatorDownload.mockClear();
    extraTracks = []; stemExtractionFlashVersion = 0;
    mockRefreshProjectState.mockReset();
    mockExecuteCommand.mockReset();
  });

  it.each([false, true])('shows only browser separation with legacy KGOne enabled=%s', async (enabled) => {
    kgoneEnabled = enabled;
    render(<KGOnePanel isVisible={true} />);

    expect(await screen.findByText('Stem Extraction', { selector: '.kgone-local-mode-title' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Full Song' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Remix' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Repaint' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Stem Extraction' })).not.toBeDisabled();
    expect(screen.getByText('AI Music Tools')).toBeInTheDocument();
    expect(screen.queryByText(/K\.G\.One/)).not.toBeInTheDocument();
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
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
    expect(screen.getByRole('button', { name: 'Separate Stems' })).toBeDisabled();
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

  it('keeps stem results visible and disables separation after the selection is cleared', async () => {
    localModelCached[LOCAL_SEPARATOR_MODEL_IDS.mdxMedium] = true;
    selectedRegionIds = ['audio-region-1'];

    const { rerender } = render(<KGOnePanel isVisible={true} />);

    fireEvent.click(await screen.findByRole('button', { name: 'Separate Stems' }));

    await waitFor(() => {
      expect(screen.getByText('Instrumental')).toBeInTheDocument();
      expect(screen.getByText('Vocals')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Import All Stems to Timeline' })).toBeInTheDocument();
    });

    selectedRegionIds = [];
    rerender(<KGOnePanel isVisible={true} />);

    expect(screen.getByText('Instrumental')).toBeInTheDocument();
    expect(screen.getByText('Vocals')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Import All Stems to Timeline' })).toBeInTheDocument();
    expect(screen.queryByText(/Select an audio region on the timeline/)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Separate Stems' })).toBeDisabled();
  });

  it('clears stem results when the saved project changes', async () => {
    localModelCached[LOCAL_SEPARATOR_MODEL_IDS.mdxMedium] = true;
    selectedRegionIds = ['audio-region-1'];

    const { rerender } = render(<KGOnePanel isVisible={true} />);

    fireEvent.click(await screen.findByRole('button', { name: 'Separate Stems' }));

    await waitFor(() => {
      expect(screen.getByText('Instrumental')).toBeInTheDocument();
    });
    expect(screen.getAllByText('Separation complete.').length).toBeGreaterThan(0);

    savedProjectName = 'Loaded Project';
    projectName = 'Loaded Project';
    selectedRegionIds = [];
    rerender(<KGOnePanel isVisible={true} />);

    await waitFor(() => {
      expect(screen.queryByText('Instrumental')).not.toBeInTheDocument();
      expect(screen.queryByText('Vocals')).not.toBeInTheDocument();
    });
    expect(screen.queryAllByText('Separation complete.')).toHaveLength(0);
    expect(screen.queryByRole('button', { name: 'Import All Stems to Timeline' })).not.toBeInTheDocument();
    expect(screen.getByText(/Select an audio region on the timeline/)).toBeInTheDocument();
  });

  it('preserves stem results when only the project name changes', async () => {
    localModelCached[LOCAL_SEPARATOR_MODEL_IDS.mdxMedium] = true;
    selectedRegionIds = ['audio-region-1'];

    const { rerender } = render(<KGOnePanel isVisible={true} />);

    fireEvent.click(await screen.findByRole('button', { name: 'Separate Stems' }));

    await waitFor(() => {
      expect(screen.getByText('Instrumental')).toBeInTheDocument();
    });

    projectName = 'Renamed Project';
    selectedRegionIds = [];
    rerender(<KGOnePanel isVisible={true} />);

    expect(screen.getByText('Instrumental')).toBeInTheDocument();
    expect(screen.getByText('Vocals')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Import All Stems to Timeline' })).toBeInTheDocument();
    expect(screen.queryByText(/Select an audio region on the timeline/)).not.toBeInTheDocument();
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

  it('previews, downloads, and drags extracted stems as WAV audio', async () => {
    localModelCached[LOCAL_SEPARATOR_MODEL_IDS.mdxMedium] = true;
    selectedRegionIds = ['audio-region-1'];
    const { container } = render(<KGOnePanel isVisible={true} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Separate Stems' }));
    await screen.findByText('Instrumental');
    const player = container.querySelector('.kgone-audio-player')!;
    const audio = player.querySelector('audio')!;
    const play = vi.spyOn(audio, 'play').mockResolvedValue();
    const pause = vi.spyOn(audio, 'pause').mockImplementation(() => {});
    fireEvent.click(player.querySelector('button[title="Play"]')!);
    expect(play).toHaveBeenCalledOnce();
    fireEvent.play(audio);
    Object.defineProperty(audio, 'paused', { value: false });
    fireEvent.click(player.querySelector('button[title="Pause"]')!);
    expect(pause).toHaveBeenCalledOnce();
    Object.defineProperty(audio, 'duration', { value: 2 });
    fireEvent.loadedMetadata(audio);
    const dataTransfer = { setData: vi.fn(), effectAllowed: '' };
    fireEvent.dragStart(player, { dataTransfer });
    expect(dataTransfer.effectAllowed).toBe('copy');
    expect(dataTransfer.setData).toHaveBeenCalledWith('application/kgone-clip', expect.any(String));
    const payload = JSON.parse(dataTransfer.setData.mock.calls[0][1]);
    expect(payload).toEqual({
      audioUrl: 'mocked-url', audioDurationSeconds: 2,
      audioFileName: expect.stringMatching(/^Stem_Instrumental_local_\d+\.wav$/),
    });
    let downloadName = '';
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
      downloadName = this.download;
    });
    fireEvent.click(player.querySelector('button[title="Download audio"]')!);
    expect(downloadName).toBe(payload.audioFileName);
    click.mockRestore();
    play.mockRestore();
    pause.mockRestore();
  });

  it('stores WAV stems and issues one aligned bulk import command', async () => {
    localModelCached[LOCAL_SEPARATOR_MODEL_IDS.mdxMedium] = true;
    selectedRegionIds = ['audio-region-1'];
    const blob = Object.assign(new Blob(['stem'], { type: 'audio/wav' }), {
      arrayBuffer: async () => new ArrayBuffer(8),
    });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ blob: async () => blob }));
    vi.mocked(Tone.getContext).mockReturnValueOnce({
      ...Tone.getContext(),
      rawContext: { decodeAudioData: (_buffer: ArrayBuffer, success: (decoded: unknown) => void) => success({ duration: 2 }) },
    } as unknown as ReturnType<typeof Tone.getContext>);
    render(<KGOnePanel isVisible={true} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Separate Stems' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Import All Stems to Timeline' }));
    await waitFor(() => expect(mockExecuteCommand).toHaveBeenCalledOnce());
    expect(KGAudioFileStorage.storeAudioFile).toHaveBeenCalledTimes(2);
    for (const [project, , file] of vi.mocked(KGAudioFileStorage.storeAudioFile).mock.calls) {
      expect(project).toBe('Test Project');
      expect(file.name).toMatch(/^Stem_(Instrumental|Vocals)_local_\d+\.wav$/);
      expect(file.type).toBe('audio/wav');
    }
    expect(mockExecuteCommand.mock.calls[0][0]).toBeInstanceOf(ImportStemsCommand);
    expect(mockExecuteCommand.mock.calls[0][0]).toEqual(expect.objectContaining({
      originalTrackIndex: 0, insertTick: audioRegion.getStartTick(),
      stems: expect.arrayContaining([expect.objectContaining({ trackName: 'Audio Track - Instrumental' })]),
    }));
    expect(mockRefreshProjectState).toHaveBeenCalledOnce();
  });

  it('shows browser separation failures and allows retrying', async () => {
    localModelCached[LOCAL_SEPARATOR_MODEL_IDS.mdxMedium] = true;
    selectedRegionIds = ['audio-region-1'];
    vi.mocked(runLocalSeparator).mockRejectedValueOnce(new Error('Local inference failed'));
    render(<KGOnePanel isVisible={true} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Separate Stems' }));
    expect(await screen.findByText('Local inference failed')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Separate Stems' }));
    expect(await screen.findByText('Instrumental')).toBeInTheDocument();
    expect(screen.queryByText('Local inference failed')).not.toBeInTheDocument();
  });

  it('switches tabs and keeps Humanize configuration when the panel is hidden', async () => {
    const view = render(<KGOnePanel isVisible={true} />);
    fireEvent.click(screen.getByRole('button', { name: 'Humanize' }));
    expect(mockSetMusicGeneratorTab).toHaveBeenCalledWith('humanize');
    view.rerender(<KGOnePanel isVisible={true} />);
    expect(screen.getByLabelText('Instrument Family')).toBeVisible();
    expect(screen.getAllByText('Stem Extraction').find(el => el.classList.contains('kgone-local-mode-title'))!).not.toBeVisible();
    expect(screen.queryByText(/Advanced Settings/)).not.toBeVisible();
    fireEvent.change(screen.getByLabelText('Instrument Family'), { target: { value: 'B01' } });
    view.rerender(<KGOnePanel isVisible={false} />);
    view.rerender(<KGOnePanel isVisible={true} />);
    expect(screen.getByLabelText('Instrument Family')).toHaveValue('B01');
    fireEvent.click(screen.getByRole('button', { name: 'Stem Extraction' }));
    view.rerender(<KGOnePanel isVisible={true} />);
    expect(screen.getAllByText('Stem Extraction').find(el => el.classList.contains('kgone-local-mode-title'))!).toBeVisible();
  });

  it('restarts the two-pulse background feedback for each repeat request and clears it when leaving', () => {
    musicGeneratorTab = 'humanize';
    const view = render(<KGOnePanel isVisible={true} />);
    expect(view.container.querySelector('.music-generator-flash')).toBeNull();
    humanizeFlashVersion = 1;
    view.rerender(<KGOnePanel isVisible={true} />);
    const firstFlash = view.container.querySelector('.music-generator-flash')!;
    expect(firstFlash).toBeInTheDocument();
    humanizeFlashVersion = 2;
    view.rerender(<KGOnePanel isVisible={true} />);
    const nextFlash = view.container.querySelector('.music-generator-flash')!;
    expect(nextFlash).not.toBe(firstFlash);
    fireEvent.animationEnd(nextFlash);
    expect(view.container.querySelector('.music-generator-flash')).toBeNull();
    humanizeFlashVersion = 3;
    view.rerender(<KGOnePanel isVisible={true} />);
    view.rerender(<KGOnePanel isVisible={false} />);
    view.rerender(<KGOnePanel isVisible={true} />);
    expect(view.container.querySelector('.music-generator-flash')).toBeNull();
  });

  it('tracks MIDI timeline selection and disables Humanize after deselection or audio selection', async () => {
    vi.spyOn(aireCache, 'exists').mockResolvedValue(true);
    const track = new KGMidiTrack('Strings', 1);
    const region = new KGMidiRegion('midi-region', 'midi-track', 0, 'Melody', 0, 3840);
    region.setNotes([new KGMidiNote('note', 0, 3840, 60, 64)]);
    track.addRegion(region); extraTracks = [track];
    musicGeneratorTab = 'humanize';
    const view = render(<KGOnePanel isVisible={true} />);
    expect(screen.getByRole('button', { name: 'Humanize', pressed: true })).toBeEnabled();
    const action = () => screen.getAllByRole('button', { name: 'Humanize' }).find(button => button.classList.contains('kgone-btn-generate'))!;
    expect(action()).toBeDisabled();
    selectedRegionIds = ['midi-region']; view.rerender(<KGOnePanel isVisible={true} />);
    expect(action()).toBeEnabled();
    expect(screen.getByText('Melody')).toBeVisible();
    expect(screen.getByText('Strings', { selector: '.kgone-region-info-value' })).toBeVisible();
    selectedRegionIds = []; view.rerender(<KGOnePanel isVisible={true} />);
    expect(action()).toBeDisabled();
    expect(screen.getByText(/Select a MIDI region on the timeline/)).toBeVisible();
    selectedRegionIds = ['audio-region-1']; view.rerender(<KGOnePanel isVisible={true} />);
    expect(action()).toBeDisabled();
    expect(screen.queryByText('Melody')).toBeNull();
  });

  it('pulses Stem Extraction twice again on each repeat request', () => {
    const view = render(<KGOnePanel isVisible={true} />);
    stemExtractionFlashVersion = 1; view.rerender(<KGOnePanel isVisible={true} />);
    const first = view.container.querySelector('.stem-extraction-tab-content .music-generator-flash')!;
    expect(first).toBeInTheDocument();
    stemExtractionFlashVersion = 2; view.rerender(<KGOnePanel isVisible={true} />);
    const second = view.container.querySelector('.music-generator-flash')!;
    expect(second).not.toBe(first);
    fireEvent.animationEnd(second);
    expect(view.container.querySelector('.music-generator-flash')).toBeNull();
  });

});
