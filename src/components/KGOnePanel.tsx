import React, { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import * as Tone from 'tone';
import HumanizeTab from './HumanizeTab';
import { KGMidiRegion } from '../core/region/KGMidiRegion';
import './KGOnePanel.css';
import { FaPlay, FaPause, FaDownload } from 'react-icons/fa';
import { FaCircleNotch, FaGripVertical } from 'react-icons/fa6';
import { useProjectStore } from '../stores/projectStore';
import { KGCore } from '../core/KGCore';
import { KGAudioRegion } from '../core/region/KGAudioRegion';
import { KGAudioFileStorage } from '../core/io/KGAudioFileStorage';
import { ConfigManager } from '../core/config/ConfigManager';
import { DEBUG_MODE } from '../constants/uiConstants';
import { sliceAudioToWav } from '../util/audioUtil';
import { ImportStemsCommand } from '../core/commands';
import type { StemImportEntry } from '../core/commands';
import { useI18n } from '../i18n/useI18n';
import { runtimeProviderLabel } from '../i18n/runtimeProvider';
import {
  getLocalSeparatorModelConfig,
  LOCAL_SEPARATOR_MODELS,
} from '../util/local-separator/config';
import { LocalSeparatorModelCache } from '../util/local-separator/modelCache';
import { runLocalSeparator } from '../util/local-separator/runner';
import { LocalOrtRuntimeManager, detectLocalRuntimeSupport } from '../util/local-separator/runtime';
import type { LocalSeparatorModelConfig, LocalSeparatorModelId } from '../util/local-separator/types';
import { tickRangeToSeconds } from '../util/globalTrackUtil';

// ─── Types ────────────────────────────────────────────────────────────────────

type GenStatus = 'idle' | 'loading-model' | 'generating' | 'polling' | 'done' | 'error';

const LOCAL_SEPARATOR_MODEL_OPTIONS = LOCAL_SEPARATOR_MODELS.map(modelConfig => ({
  label: modelConfig.displayName,
  value: modelConfig.id,
})) as ReadonlyArray<{ label: string; value: LocalSeparatorModelId }>;

function formatTime(sec: number): string {
  if (!isFinite(sec)) return '0:00';
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

// ─── Shared components ────────────────────────────────────────────────────────

interface ExpanderProps {
  label: string;
  children: React.ReactNode;
}

const Expander: React.FC<ExpanderProps> = ({ label, children }) => {
  const [open, setOpen] = useState(false);
  return (
    <div>
      <button className="kgone-expander-toggle" onClick={() => setOpen(o => !o)}>
        <span className={`arrow ${open ? 'open' : ''}`}>▶</span>
        {label}
      </button>
      {open && <div className="kgone-expander-body">{children}</div>}
    </div>
  );
};

// ─── Audio Player ─────────────────────────────────────────────────────────────

interface AudioPlayerProps {
  src: string;
  /** When provided, makes the player draggable (shows grip handle) and adds a download button */
  dragData?: {
    audioFileName: string; // filename used for download and OPFS storage
  };
}

const AudioPlayer: React.FC<AudioPlayerProps> = ({ src, dragData }) => {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);

  const togglePlay = () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (audio.paused) {
      audio.play().catch(() => { });
    } else {
      audio.pause();
    }
  };

  const handleProgressClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const audio = audioRef.current;
    if (!audio || duration === 0) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    audio.currentTime = ratio * duration;
    setCurrentTime(ratio * duration);
  };

  const handleDragStart = (e: React.DragEvent<HTMLDivElement>) => {
    if (!dragData) return;
    e.dataTransfer.setData('application/kgone-clip', JSON.stringify({
      audioUrl: src,
      audioDurationSeconds: duration,
      audioFileName: dragData.audioFileName,
    }));
    e.dataTransfer.effectAllowed = 'copy';
  };

  const handleDownload = () => {
    const a = document.createElement('a');
    a.href = src;
    a.download = dragData?.audioFileName ?? 'stem.wav';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;

  return (
    <div
      className="kgone-audio-player"
      draggable={!!dragData}
      onDragStart={handleDragStart}
    >
      <audio
        ref={audioRef}
        src={src}
        onTimeUpdate={() => setCurrentTime(audioRef.current?.currentTime ?? 0)}
        onLoadedMetadata={() => setDuration(audioRef.current?.duration ?? 0)}
        onPlay={() => setIsPlaying(true)}
        onPause={() => setIsPlaying(false)}
        onEnded={() => { setIsPlaying(false); setCurrentTime(0); }}
      />
      {dragData && (
        <span className="kgone-player-drag-handle" title="Drag to a track to import">
          <FaGripVertical />
        </span>
      )}
      <button className="kgone-player-play-btn" onClick={togglePlay} title={isPlaying ? 'Pause' : 'Play'}>
        {isPlaying ? <FaPause /> : <FaPlay />}
      </button>
      <div className="kgone-player-progress-track" onClick={handleProgressClick} title="Click to seek">
        <div className="kgone-player-progress-fill" style={{ width: `${progress}%` }} />
      </div>
      <span className="kgone-player-time">{formatTime(currentTime)} / {formatTime(duration)}</span>
      {dragData && (
        <button className="kgone-player-download-btn" onClick={handleDownload} title="Download audio">
          <FaDownload />
        </button>
      )}
    </div>
  );
};

// ─── Separator Tab ────────────────────────────────────────────────────────────

/** Map a separator model value/id to its translated display label. */
function getModelLabel(modelValue: string, t: (key: string) => string): string {
  if (modelValue === 'UVR-MDX-NET-Inst_HQ_3.onnx') return t('kgone.separator.model.vocalInstMedium');
  if (modelValue === 'htdemucs_4s.onnx') return t('kgone.separator.model.htdemucs4s');
  return modelValue;
}

const SeparatorTab: React.FC = () => {
  const { t } = useI18n();
  const { selectedRegionIds, projectName, savedProjectName, maxBars, refreshProjectState } = useProjectStore();
  const availableSeparatorModels = LOCAL_SEPARATOR_MODEL_OPTIONS;
  const [model, setModel] = useState<string>(availableSeparatorModels[0].value);
  const currentLocalModelConfig = useMemo<LocalSeparatorModelConfig>(() => {
    return getLocalSeparatorModelConfig(model);
  }, [model]);

  // Generation state
  const [genStatus, setGenStatus] = useState<GenStatus>('idle');
  const [errorMsg, setErrorMsg] = useState('');
  const [stemAudioUrls, setStemAudioUrls] = useState<Array<{ name: string; url: string }>>([]);
  const runtimeSupport = useMemo(() => detectLocalRuntimeSupport(), []);
  const [localProviderLabel, setLocalProviderLabel] = useState(
    runtimeSupport.webgpuExposed ? 'webgpu available' : 'cpu/wasm only',
  );
  const [isLocalModelCached, setIsLocalModelCached] = useState(false);
  const [isCheckingLocalModel, setIsCheckingLocalModel] = useState(false);
  const [isDownloadingLocalModel, setIsDownloadingLocalModel] = useState(false);
  const [isDeletingLocalModel, setIsDeletingLocalModel] = useState(false);
  const [localProgressPercent, setLocalProgressPercent] = useState(0);
  const [localProgressText, setLocalProgressText] = useState('');
  const [localChunkDurationSeconds, setLocalChunkDurationSeconds] = useState('');
  const [localOverlap, setLocalOverlap] = useState(String(currentLocalModelConfig.defaults.overlap));

  const taskIdRef = useRef<string>('');
  const localRuntimeManagerRef = useRef<LocalOrtRuntimeManager | null>(null);
  const originalRegionRef = useRef<{
    regionName: string;
    trackName: string;
    startTick: number;
    trackIndex: number;
  } | null>(null);

  const [isImporting, setIsImporting] = useState(false);
  const [importError, setImportError] = useState('');

  // Revoke all blob URLs on unmount
  useEffect(() => {
    return () => {
      stemAudioUrls.forEach(s => URL.revokeObjectURL(s.url));
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Reset separator results whenever the active project changes
  useEffect(() => {
    stemAudioUrls.forEach(s => URL.revokeObjectURL(s.url));
    setStemAudioUrls([]);
    setGenStatus('idle');
    setLocalProgressPercent(0);
    setLocalProgressText('');
    setErrorMsg('');
    setIsImporting(false);
    setImportError('');
    originalRegionRef.current = null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [savedProjectName]);

  useEffect(() => {
    setLocalChunkDurationSeconds(
      currentLocalModelConfig.defaultChunkDurationSeconds == null
        ? ''
        : String(currentLocalModelConfig.defaultChunkDurationSeconds),
    );
    setLocalOverlap(String(currentLocalModelConfig.defaults.overlap));
  }, [currentLocalModelConfig]);

  const refreshLocalModelCacheState = useCallback(async () => {
    setIsCheckingLocalModel(true);
    try {
      setIsLocalModelCached(await LocalSeparatorModelCache.exists(currentLocalModelConfig));
    } catch (err) {
      console.error('[Stem Extraction] Local model cache check failed:', err);
      setErrorMsg(err instanceof Error ? err.message : String(err));
    } finally {
      setIsCheckingLocalModel(false);
    }
  }, [currentLocalModelConfig]);

  useEffect(() => {
    localRuntimeManagerRef.current = new LocalOrtRuntimeManager({
      onProviderChange: provider => setLocalProviderLabel(provider),
    });
    void refreshLocalModelCacheState();
  }, [refreshLocalModelCacheState]);

  const selectedAudioRegion = useMemo(() => {
    if (!selectedRegionIds.length) return null;
    const project = KGCore.instance().getCurrentProject();
    for (const track of project.getTracks()) {
      for (const region of track.getRegions()) {
        if (
          selectedRegionIds.includes(region.getId()) &&
          region.getCurrentType() === 'KGAudioRegion'
        ) {
          return { region: region as KGAudioRegion, trackName: track.getName(), trackIndex: track.getTrackIndex() };
        }
      }
    }
    return null;
  }, [selectedRegionIds]);
  const hasStemResults = stemAudioUrls.length > 0;

  const getConfiguredLocalSeparatorModelUrl = useCallback(() => {
    const configured = ConfigManager.instance().get(currentLocalModelConfig.download.configKey);
    return typeof configured === 'string' && configured.trim()
      ? configured
      : currentLocalModelConfig.download.defaultUrl;
  }, [currentLocalModelConfig]);

  const isGenerating = genStatus !== 'idle' && genStatus !== 'done' && genStatus !== 'error';

  const handleDownloadLocalModel = useCallback(async () => {
    setIsDownloadingLocalModel(true);
    setErrorMsg('');
    setLocalProgressPercent(0);
    const modelLabel = getModelLabel(currentLocalModelConfig.id, t);
    setLocalProgressText(t('kgone.separator.local.progress.downloading', { name: modelLabel }));

    try {
      await LocalSeparatorModelCache.download(
        currentLocalModelConfig,
        getConfiguredLocalSeparatorModelUrl(),
        progress => {
          const receivedMb = (progress.receivedBytes / (1024 * 1024)).toFixed(1);
          const totalMb = progress.totalBytes ? (progress.totalBytes / (1024 * 1024)).toFixed(1) : null;
          setLocalProgressPercent(progress.totalBytes ? progress.percent : 0);
          setLocalProgressText(
            totalMb
              ? t('kgone.separator.local.progress.downloadingWithSize', { name: modelLabel, received: receivedMb, total: totalMb })
              : t('kgone.separator.local.progress.downloadingMbOnly', { name: modelLabel, received: receivedMb }),
          );
        },
      );
      setLocalProgressPercent(100);
      setLocalProgressText(t('kgone.separator.local.progress.ready', { name: modelLabel }));
      await refreshLocalModelCacheState();
    } catch (err) {
      setLocalProgressPercent(0);
      setLocalProgressText('');
      setErrorMsg(err instanceof Error ? err.message : String(err));
    } finally {
      setIsDownloadingLocalModel(false);
    }
  }, [currentLocalModelConfig, getConfiguredLocalSeparatorModelUrl, refreshLocalModelCacheState, t]);

  const handleDeleteLocalModel = useCallback(async () => {
    setIsDeletingLocalModel(true);
    setErrorMsg('');
    try {
      await LocalSeparatorModelCache.delete(currentLocalModelConfig);
      localRuntimeManagerRef.current?.reset();
      setLocalProviderLabel(runtimeSupport.webgpuExposed ? 'webgpu available' : 'cpu/wasm only');
      setLocalProgressPercent(0);
      setLocalProgressText('');
      await refreshLocalModelCacheState();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : String(err));
    } finally {
      setIsDeletingLocalModel(false);
    }
  }, [currentLocalModelConfig, refreshLocalModelCacheState, runtimeSupport.webgpuExposed]);

  const handleSeparateLocal = useCallback(async () => {
    if (!selectedAudioRegion || !isLocalModelCached) return;

    originalRegionRef.current = {
      regionName: selectedAudioRegion.region.getName(),
      trackName: selectedAudioRegion.trackName,
      startTick: selectedAudioRegion.region.getStartTick(),
      trackIndex: selectedAudioRegion.trackIndex,
    };
    setImportError('');
    stemAudioUrls.forEach(s => URL.revokeObjectURL(s.url));
    setStemAudioUrls([]);
    setErrorMsg('');
    setGenStatus('loading-model');
    setLocalProgressPercent(0);
    setLocalProgressText(t('kgone.separator.local.progress.preparingRuntime'));
    setLocalProviderLabel(runtimeSupport.webgpuExposed ? 'webgpu available' : 'cpu/wasm only');

    try {
      const modelBuffer = await LocalSeparatorModelCache.getArrayBuffer(currentLocalModelConfig);
      const runtimeManager = localRuntimeManagerRef.current ?? new LocalOrtRuntimeManager({
        onProviderChange: provider => setLocalProviderLabel(provider),
      });
      localRuntimeManagerRef.current = runtimeManager;
      const runtime = await runtimeManager.ensureRuntime(currentLocalModelConfig, new Uint8Array(modelBuffer));

      setGenStatus('generating');
      setLocalProgressPercent(3);
      setLocalProgressText(t('kgone.separator.local.progress.readingAudio'));

      const audioFileId = selectedAudioRegion.region.getAudioFileId();
      const clipStart = selectedAudioRegion.region.getClipStartOffsetSeconds();
      const fullDuration = selectedAudioRegion.region.getAudioDurationSeconds();
      const timelineProject = KGCore.instance().getCurrentProject();
      const regionLengthSec = tickRangeToSeconds(
        timelineProject,
        selectedAudioRegion.region.getStartTick(),
        selectedAudioRegion.region.getStartTick() + selectedAudioRegion.region.getLengthTicks(),
      );
      const effectiveDuration = Math.min(regionLengthSec, fullDuration - clipStart);

      const rawBuffer = await KGAudioFileStorage.loadAudioFile(projectName, audioFileId);
      const needsSlice = clipStart > 0.01 || effectiveDuration < fullDuration - 0.01;
      const inputBuffer = needsSlice
        ? await sliceAudioToWav(rawBuffer, clipStart, effectiveDuration)
        : rawBuffer;

      setGenStatus('polling');
      setLocalProgressPercent(5);
      setLocalProgressText(t('kgone.separator.local.progress.running'));

      const chunkDuration = localChunkDurationSeconds.trim()
        ? Number.parseFloat(localChunkDurationSeconds)
        : null;
      const overlapValue = Number.parseFloat(localOverlap);

      const result = await runLocalSeparator({
        session: runtime.session,
        runtimeProvider: runtime.provider,
        modelConfig: currentLocalModelConfig,
        audioBuffer: inputBuffer,
        chunkDurationSeconds: Number.isFinite(chunkDuration) && (chunkDuration ?? 0) > 0 ? chunkDuration : null,
        overlap: Number.isFinite(overlapValue) ? overlapValue : currentLocalModelConfig.defaults.overlap,
        onProviderChange: provider => setLocalProviderLabel(provider),
        onProgress: progress => {
          setLocalProgressPercent(progress.percent);
          const chunkSuffix = progress.totalChunks ? ` (${progress.processedChunks}/${progress.totalChunks} chunks)` : '';
          setLocalProgressText(`${progress.passLabel}${chunkSuffix}`);
        },
      });

      taskIdRef.current = `local_${Date.now()}`;
      const nextStemAudioUrls = result.stems.map(stem => ({
        name: stem.name,
        url: URL.createObjectURL(stem.blob),
      }));
      setStemAudioUrls(nextStemAudioUrls);
      setGenStatus('done');
      setLocalProgressPercent(100);
      setLocalProgressText(t('kgone.separator.local.progress.complete'));
      if (DEBUG_MODE.KGONE) console.log('[Stem Extraction] Summary:', result.debugSummary);
    } catch (err) {
      console.error('[Stem Extraction] Local separator error:', err);
      setGenStatus('error');
      setErrorMsg(err instanceof Error ? err.message : String(err));
    }
  }, [
    selectedAudioRegion,
    isLocalModelCached,
    stemAudioUrls,
    runtimeSupport.webgpuExposed,
    projectName,
    localChunkDurationSeconds,
    localOverlap,
    currentLocalModelConfig,
    t,
  ]);

  const handleImportAll = useCallback(async () => {
    const snap = originalRegionRef.current;
    if (!snap || stemAudioUrls.length === 0) return;

    setIsImporting(true);
    setImportError('');

    try {
      const audioContext = Tone.getContext().rawContext as AudioContext;

      // Decode and store every stem before touching the core model
      const stems: StemImportEntry[] = await Promise.all(
        stemAudioUrls.map(async (stem) => {
          const blob = await fetch(stem.url).then(r => r.blob());
          const fileName = `Stem_${stem.name}_${taskIdRef.current}.wav`;
          const fileId = `kgone_stem_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
          const audioFile = new File([blob], fileName, { type: 'audio/wav' });

          const arrayBuffer = await blob.arrayBuffer();
          const toneBuffer = new Tone.ToneAudioBuffer();
          await new Promise<void>((resolve, reject) => {
            audioContext.decodeAudioData(
              arrayBuffer.slice(0),
              decoded => { toneBuffer.set(decoded); resolve(); },
              reject,
            );
          });

          await KGAudioFileStorage.storeAudioFile(projectName, fileId, audioFile);

          return {
            trackName: `${snap.trackName} - ${stem.name}`,
            regionName: `${snap.regionName} - ${stem.name}`,
            audioFileId: fileId,
            audioFileName: fileName,
            audioDurationSeconds: toneBuffer.duration,
            toneBuffer,
          };
        })
      );

      // Execute composite command (single undo step)
      const project = KGCore.instance().getCurrentProject();
      const cmd = new ImportStemsCommand(
        project.getTracks().length,
        snap.trackIndex,
        snap.startTick,
        stems,
        maxBars,
      );
      KGCore.instance().executeCommand(cmd);

      // Sync store — triggers MainContent's useEffect to rebuild tracks + regions
      refreshProjectState();

    } catch (err) {
      setImportError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsImporting(false);
    }
  }, [stemAudioUrls, projectName, maxBars, refreshProjectState]);

  const btnLabel = () => {
    switch (genStatus) {
      case 'loading-model': return t('kgone.separator.btn.local.loadingModel');
      case 'generating': return t('kgone.separator.btn.local.generating');
      case 'polling': return t('kgone.separator.btn.local.polling');
      default: return t('kgone.separator.btn.separateStems');
    }
  };

  return (
    <>
      <div className="kgone-local-mode-card">
        <div className="kgone-local-mode-title">{t('kgone.separator.local.title')}</div>
        <div className="kgone-local-mode-text">
          {t('kgone.separator.local.description')}
        </div>
        <div className="kgone-runtime-row">
          <div className="kgone-provider-chip">{t('kgone.separator.local.provider')}{runtimeProviderLabel(localProviderLabel, t)}</div>
          <div className="kgone-provider-chip">
            {t('kgone.separator.local.model')}{getModelLabel(currentLocalModelConfig.id, t)} ({isLocalModelCached ? t('kgone.separator.local.downloaded') : t('kgone.separator.local.notDownloaded')})
          </div>
        </div>
        {(localProgressText || isCheckingLocalModel) && (
          <div className="kgone-progress-block">
            <div
              className="kgone-progress-track"
              role="progressbar"
              aria-valuenow={Math.round(localProgressPercent)}
              aria-valuemin={0}
              aria-valuemax={100}
            >
              <div className="kgone-progress-fill" style={{ width: `${Math.max(0, Math.min(100, localProgressPercent))}%` }} />
            </div>
            <div className="kgone-gen-hint">
              {isCheckingLocalModel ? t('kgone.separator.local.checkingCache') : localProgressText}
            </div>
          </div>
        )}
        <div className="kgone-row">
          {!isLocalModelCached ? (
            <button
              className="kgone-btn-secondary"
              type="button"
              disabled={isCheckingLocalModel || isDownloadingLocalModel || isDeletingLocalModel || isGenerating}
              onClick={() => void handleDownloadLocalModel()}
            >
              {isDownloadingLocalModel ? t('kgone.separator.local.btn.downloading') : t('kgone.separator.local.btn.download')}
            </button>
          ) : (
            <>
              <button
                className="kgone-btn-secondary"
                type="button"
                disabled={isCheckingLocalModel || isDownloadingLocalModel || isDeletingLocalModel || isGenerating}
                onClick={() => void handleDownloadLocalModel()}
              >
                {isDownloadingLocalModel ? t('kgone.separator.local.btn.redownloading') : t('kgone.separator.local.btn.redownload')}
              </button>
              <button
                className="kgone-btn-secondary kgone-btn-danger"
                type="button"
                disabled={isCheckingLocalModel || isDownloadingLocalModel || isDeletingLocalModel || isGenerating}
                onClick={() => void handleDeleteLocalModel()}
              >
                {isDeletingLocalModel ? t('kgone.separator.local.btn.deleting') : t('kgone.separator.local.btn.deleteCache')}
              </button>
            </>
          )}
        </div>
      </div>

      <>
        {selectedAudioRegion && (
          <div className="kgone-region-info">
            <div className="kgone-region-info-label">{t('kgone.shared.selectedRegion')}</div>
            <div className="kgone-region-info-value">{selectedAudioRegion.region.getName()}</div>
            <div className="kgone-region-info-label" style={{ marginTop: 4 }}>{t('kgone.shared.track')}</div>
            <div className="kgone-region-info-value">{selectedAudioRegion.trackName}</div>
          </div>
        )}

        <div className="kgone-field">
          <label className="kgone-label">{t('kgone.separator.field.separationModel')}</label>
          <select className="kgone-select" value={model} onChange={e => setModel(e.target.value)}>
            {availableSeparatorModels.map(m => (
              <option key={m.value} value={m.value}>{getModelLabel(m.value, t)}</option>
            ))}
          </select>
        </div>

        <Expander label={t('kgone.shared.advancedSettings')}>
          <div className="kgone-field">
            <label className="kgone-label">{t('kgone.separator.field.chunkDuration')}</label>
            <input
              className="kgone-input"
              aria-label={t('kgone.separator.field.chunkDuration')}
              type="number"
              min={1}
              step={1}
              value={localChunkDurationSeconds}
              onChange={e => setLocalChunkDurationSeconds(e.target.value)}
              placeholder={t('kgone.separator.field.chunkDurationPlaceholder')}
            />
          </div>
          <div className="kgone-field">
            <label className="kgone-label">{t('kgone.separator.field.modelOverlap')}</label>
            <input
              className="kgone-input"
              aria-label={t('kgone.separator.field.modelOverlap')}
              type="number"
              min={0.001}
              max={0.999}
              step={0.01}
              value={localOverlap}
              onChange={e => setLocalOverlap(e.target.value)}
            />
          </div>
        </Expander>

        {/* Stem audio players — shown once separation is complete */}
        {hasStemResults && (
          <div className="kgone-stems">
            {stemAudioUrls.map(stem => (
              <div key={stem.name} className="kgone-stem-player">
                <div className="kgone-label" style={{ marginBottom: 4 }}>{stem.name}</div>
                <AudioPlayer
                  src={stem.url}
                  dragData={taskIdRef.current ? {
                    audioFileName: `Stem_${stem.name}_${taskIdRef.current}.wav`,
                  } : undefined}
                />
              </div>
            ))}
          </div>
        )}

        {/* Drag-to-track hint — shown after successful separation */}
        {hasStemResults && (
          <div className="kgone-hint" dangerouslySetInnerHTML={{ __html: t('kgone.separator.hint.drag') }} />
        )}

        {/* Bulk import button — shown after successful separation */}
        {hasStemResults && (
          <>
            <button
              className="dialog-btn dialog-btn-primary kgone-btn-generate"
              disabled={isImporting}
              onClick={handleImportAll}
              style={{ marginTop: 0 }}
            >
              {isImporting && <FaCircleNotch className="kgone-spinner" />}
              {isImporting ? t('kgone.shared.btn.importing') : t('kgone.separator.btn.importAllStems')}
            </button>
            {importError && <div className="kgone-error-msg">{importError}</div>}
          </>
        )}

        {/* Separation error message */}
        {genStatus === 'error' && errorMsg && (
          <div className="kgone-error-msg">{errorMsg}</div>
        )}

        <button
          className="dialog-btn dialog-btn-primary kgone-btn-generate"
          disabled={!selectedAudioRegion || isGenerating || !isLocalModelCached}
          onClick={handleSeparateLocal}
        >
          {isGenerating && <FaCircleNotch className="kgone-spinner" />}
          {btnLabel()}
        </button>

        {/* Status hint below button */}
        {localProgressText && (
          <div className="kgone-gen-hint">{localProgressText}</div>
        )}

        {!selectedAudioRegion && !hasStemResults && (
          <div className="kgone-separator-hint">
            {!isLocalModelCached
              ? t('kgone.separator.hint.noRegion.download', { model: getModelLabel(currentLocalModelConfig.id, t) })
              : t('kgone.separator.hint.noRegion.select')}
          </div>
        )}
      </>

    </>
  );
};

// ─── Main Panel ───────────────────────────────────────────────────────────────

interface KGOnePanelProps {
  isVisible: boolean;
}

const KGOnePanel: React.FC<KGOnePanelProps> = ({ isVisible }) => {
  const { t } = useI18n();
  const { musicGeneratorTab, setMusicGeneratorTab, humanizeFlashVersion, stemExtractionFlashVersion, selectedRegionIds,
    tracks, projectName, savedProjectName, isLooping, loopingRange, completeHumanize } = useProjectStore();
  const [isFlashing, setIsFlashing] = useState(false);
  const humanizeActive = isVisible && musicGeneratorTab === 'humanize';
  useEffect(() => { if (humanizeFlashVersion > 0) setIsFlashing(true); }, [humanizeFlashVersion]);
  useEffect(() => { if (!humanizeActive) setIsFlashing(false); }, [humanizeActive]);
  const [stemFlashing, setStemFlashing] = useState(false);
  const stemActive = isVisible && musicGeneratorTab === 'separator';
  useEffect(() => { if (stemExtractionFlashVersion > 0) setStemFlashing(true); }, [stemExtractionFlashVersion]);
  useEffect(() => { if (!stemActive) setStemFlashing(false); }, [stemActive]);
  let humanizeRegion: KGMidiRegion | null = null;
  let humanizeTrackName: string | undefined;
  if (selectedRegionIds.length) {
    for (const track of tracks) {
      const region = track.getRegions().find(candidate => selectedRegionIds.includes(candidate.getId()) && candidate instanceof KGMidiRegion);
      if (region instanceof KGMidiRegion) { humanizeRegion = region; humanizeTrackName = track.getName(); break; }
    }
  }
  return (
    <div className={`kgone-panel${isVisible ? '' : ' is-hidden'}`}>
      <div className="kgone-panel-header">
        <h3>{t('kgone.panel.title.local')}</h3>
      </div>
      <div className="kgone-tabs">
        <button className={`kgone-tab${musicGeneratorTab === 'separator' ? ' active' : ''}`}
          aria-pressed={musicGeneratorTab === 'separator'} onClick={() => setMusicGeneratorTab('separator')}>{t('kgone.tab.separator')}</button>
        <button className={`kgone-tab${musicGeneratorTab === 'humanize' ? ' active' : ''}`}
          aria-pressed={musicGeneratorTab === 'humanize'} onClick={() => setMusicGeneratorTab('humanize')}>{t('aire.humanize')}</button>
      </div>
      <div className="kgone-panel-body">
        <div className="kgone-tab-content stem-extraction-tab-content" hidden={musicGeneratorTab !== 'separator'}>
          {stemFlashing && stemActive && <div key={stemExtractionFlashVersion} className="music-generator-flash"
            aria-hidden="true" onAnimationEnd={() => setStemFlashing(false)} />}
          <SeparatorTab />
        </div>
        <div className="humanize-tab-content" hidden={musicGeneratorTab !== 'humanize'}>
          {isFlashing && humanizeActive && <div key={humanizeFlashVersion} className="music-generator-flash"
            aria-hidden="true" onAnimationEnd={() => setIsFlashing(false)} />}
          <HumanizeTab region={humanizeRegion} trackName={humanizeTrackName} isActive={humanizeActive}
            contextKey={JSON.stringify([projectName, savedProjectName, isLooping, loopingRange])}
            onSuccess={controller => { if (humanizeRegion) completeHumanize(humanizeRegion.getId(), controller); }} />
        </div>
      </div>
    </div>
  );
};

export default KGOnePanel;
