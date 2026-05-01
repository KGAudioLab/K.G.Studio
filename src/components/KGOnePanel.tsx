import React, { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import * as Tone from 'tone';
import './KGOnePanel.css';
import { FaPlay, FaPause, FaDownload } from 'react-icons/fa';
import { FaCircleNotch, FaGripVertical } from 'react-icons/fa6';
import { useProjectStore } from '../stores/projectStore';
import { KGCore } from '../core/KGCore';
import { KGAudioRegion } from '../core/region/KGAudioRegion';
import { KGAudioFileStorage } from '../core/io/KGAudioFileStorage';
import { ConfigManager } from '../core/config/ConfigManager';
import { DEBUG_MODE } from '../constants/uiConstants';
import { fetchWithRetry } from '../util/retryUtil';
import { sliceAudioToWav } from '../util/audioUtil';
import type { KeySignature } from '../core/KGProject';
import { ImportStemsCommand } from '../core/commands';
import type { StemImportEntry } from '../core/commands';
import { showAlert } from './common/DialogProvider';

// ─── Types ────────────────────────────────────────────────────────────────────

type Tab = 'clip' | 'fullsong' | 'remix' | 'repaint' | 'separator';

type GenStatus = 'idle' | 'loading-model' | 'generating' | 'polling' | 'downloading' | 'done' | 'error';

const SEPARATOR_MODELS = [
  { label: 'Vocal and Instrument (Medium Accuracy)', value: 'UVR-MDX-NET-Inst_HQ_3.onnx' },
  { label: 'Vocal and Instrument (High Accuracy)', value: 'MDX23C-8KFFT-InstVoc_HQ.ckpt' },
  { label: 'Vocal, Drums, Bass, Guitar, Piano, and Others', value: 'htdemucs_6s.yaml' },
] as const;

const CLIP_NOTES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

const FLAT_TO_SHARP: Record<string, string> = {
  Bb: 'A#', Eb: 'D#', Ab: 'G#', Db: 'C#', Gb: 'F#', Cb: 'B', Fb: 'E',
};

function parseKeySignature(ks: string): { note: string; scale: 'major' | 'minor' } {
  const parts = ks.split(' ');
  const rawNote = parts[0] ?? 'C';
  const note = FLAT_TO_SHARP[rawNote] ?? rawNote;
  const scale = (parts[1] === 'minor' ? 'minor' : 'major') as 'major' | 'minor';
  return { note, scale };
}

// Debug helper — logs KGOne requests and responses when DEBUG_MODE.KGONE is on
function kgoneLog(direction: 'REQ' | 'RES', label: string, payload: unknown) {
  if (!DEBUG_MODE.KGONE) return;
  console.log(`[KGOne ${direction}] ${label}`, payload);
}

function getKGOneBaseUrl(): string {
  return (ConfigManager.instance().get('general.kgone.base_url') as string) || 'http://127.0.0.1:8000';
}

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
    midiUrl?: string;      // full URL to /v1/clip/midi/{taskId}; absent = MIDI import not supported
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
      midiUrl: dragData.midiUrl,
      audioUrl: src,
      audioDurationSeconds: duration,
      audioFileName: dragData.audioFileName,
    }));
    e.dataTransfer.effectAllowed = 'copy';
  };

  const handleDownload = () => {
    const a = document.createElement('a');
    a.href = src;
    a.download = dragData?.audioFileName ?? 'kgone_clip.wav';
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

// ─── Clip Tab ─────────────────────────────────────────────────────────────────

interface ClipTabProps {
  bpm: number;
  keySignature: KeySignature;
}

const ClipTab: React.FC<ClipTabProps> = ({ bpm, keySignature }) => {
  const { note: defaultNote, scale: defaultScale } = parseKeySignature(keySignature);

  // Form state
  const [prompt, setPrompt] = useState('');
  const [negativePrompt, setNegativePrompt] = useState('');
  const [bars, setBars] = useState<4 | 8>(4);
  // Advanced
  const [note, setNote] = useState(defaultNote);
  const [scale, setScale] = useState<'major' | 'minor'>(defaultScale);
  const [clipBpm, setClipBpm] = useState(bpm);
  const [steps, setSteps] = useState(75);
  const [cfgScale, setCfgScale] = useState(7.0);
  const [seed, setSeed] = useState(-1);
  const [samplerType, setSamplerType] = useState('dpmpp-2m-sde');
  const [sigmaMin, setSigmaMin] = useState(0.03);
  const [sigmaMax, setSigmaMax] = useState(500.0);
  const [cfgRescale, setCfgRescale] = useState(0.0);

  // Generation state
  const [genStatus, setGenStatus] = useState<GenStatus>('idle');
  const [genHint, setGenHint] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [audioUrl, setAudioUrl] = useState<string | null>(null);

  const abortRef = useRef<AbortController | null>(null);
  const taskIdRef = useRef<string>('');

  // Revoke blob URL on unmount
  useEffect(() => {
    return () => {
      abortRef.current?.abort();
      if (audioUrl) URL.revokeObjectURL(audioUrl);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const isGenerating = genStatus !== 'idle' && genStatus !== 'done' && genStatus !== 'error';

  const handleGenerate = useCallback(async () => {
    // Abort any in-flight request
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    const { signal } = ctrl;

    // Revoke previous audio URL
    if (audioUrl) {
      URL.revokeObjectURL(audioUrl);
      setAudioUrl(null);
    }

    setErrorMsg('');

    try {
      // ── 1. Load the clip model ──────────────────────────────────────────────
      setGenStatus('loading-model');
      setGenHint('Loading model — this can take 60+ seconds, please wait...');

      const baseUrl = getKGOneBaseUrl();

      const loadPayload = { model: 'clip' };
      kgoneLog('REQ', 'POST /v1/models/load', loadPayload);
      const loadResp = await fetch(`${baseUrl}/v1/models/load`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(loadPayload),
        signal,
        // No timeout — model loading can take 60-120 s
      });

      if (!loadResp.ok) {
        const body = await loadResp.text().catch(() => '');
        kgoneLog('RES', `POST /v1/models/load → ${loadResp.status}`, body);
        throw new Error(`Model load failed (${loadResp.status}): ${body}`);
      }
      kgoneLog('RES', `POST /v1/models/load → ${loadResp.status}`, await loadResp.clone().json().catch(() => '(unparseable)'));

      // ── 2. Submit generation job ────────────────────────────────────────────
      setGenStatus('generating');
      setGenHint('Submitting generation request...');

      const genPayload = {
        prompt,
        negative_prompt: negativePrompt,
        bars,
        bpm: clipBpm,
        note,
        scale,
        steps,
        cfg_scale: cfgScale,
        seed,
        sampler_type: samplerType,
        sigma_min: sigmaMin,
        sigma_max: sigmaMax,
        cfg_rescale: cfgRescale,
      };
      kgoneLog('REQ', 'POST /v1/clip/generate', genPayload);
      const genResp = await fetch(`${baseUrl}/v1/clip/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(genPayload),
        signal,
      });

      if (!genResp.ok) {
        const body = await genResp.text().catch(() => '');
        kgoneLog('RES', `POST /v1/clip/generate → ${genResp.status}`, body);
        throw new Error(`Generation request failed (${genResp.status}): ${body}`);
      }

      const genJson = (await genResp.json()) as { task_id: string };
      kgoneLog('RES', `POST /v1/clip/generate → ${genResp.status}`, genJson);
      const { task_id } = genJson;
      taskIdRef.current = task_id;

      // ── 3. Poll for completion ──────────────────────────────────────────────
      setGenStatus('polling');
      setGenHint('Generating clip...');

       
      while (true) {
        if (signal.aborted) return;

        await new Promise<void>(r => {
          const t = setTimeout(r, 5000);
          signal.addEventListener('abort', () => { clearTimeout(t); r(); }, { once: true });
        });

        if (signal.aborted) return;

        kgoneLog('REQ', `GET /v1/clip/result/${task_id}`, null);
        const resultResp = await fetchWithRetry(`${baseUrl}/v1/clip/result/${task_id}`, { signal });

        const result = (await resultResp.json()) as { task_id: string; status: string; error?: string };
        kgoneLog('RES', `GET /v1/clip/result/${task_id} → ${resultResp.status}`, result);

        if (result.status === 'complete') break;
        if (result.status === 'error') {
          throw new Error(result.error ?? 'Generation failed on the server');
        }
        // still running — keep polling
      }

      // ── 4. Download the WAV ─────────────────────────────────────────────────
      setGenStatus('downloading');
      setGenHint('Downloading audio...');

      kgoneLog('REQ', `GET /v1/clip/audio/${task_id}`, null);
      const audioResp = await fetchWithRetry(`${baseUrl}/v1/clip/audio/${task_id}`, { signal });

      const blob = await audioResp.blob();
      const url = URL.createObjectURL(blob);
      kgoneLog('RES', `GET /v1/clip/audio/${task_id} → ${audioResp.status} (binary WAV)`, url);

      setAudioUrl(url);
      setGenStatus('done');
      setGenHint('');
    } catch (err) {
      if (signal.aborted) return; // User navigated away / new generation started — silent
      console.error('[KGOne] Clip generation error:', err);
      setErrorMsg(err instanceof Error ? err.message : String(err));
      setGenStatus('error');
      setGenHint('');
    }
  }, [
    prompt, negativePrompt, bars, clipBpm, note, scale,
    steps, cfgScale, seed, samplerType, sigmaMin, sigmaMax, cfgRescale,
    audioUrl,
  ]);

  const btnLabel = () => {
    switch (genStatus) {
      case 'loading-model': return 'Loading model...';
      case 'generating': return 'Generating...';
      case 'polling': return 'Processing...';
      case 'downloading': return 'Downloading...';
      default: return 'Generate Clip';
    }
  };

  return (
    <>
      <div className="kgone-field">
        <label className="kgone-label">Prompt</label>
        <textarea
          className="kgone-textarea"
          value={prompt}
          onChange={e => setPrompt(e.target.value)}
          placeholder="e.g. Gritty, Acid, Bassline, 303, Synth Lead, FM, Sub, Upper Mids, High Phaser, High Reverb, Pitch Bend, 8 Bars, 140 BPM, E minor"
          rows={3}
        />
        <div className="kgone-hint">
          Describe the clip with comma-separated tags: instrument family, sub-type, timbre, FX, bars, BPM, key.
        </div>
      </div>

      <div className="kgone-field">
        <label className="kgone-label">Negative Prompt</label>
        <textarea
          className="kgone-textarea"
          value={negativePrompt}
          onChange={e => setNegativePrompt(e.target.value)}
          placeholder="e.g. distortion, noise"
          rows={2}
        />
      </div>

      <div className="kgone-field">
        <label className="kgone-label">Bars</label>
        <select
          className="kgone-select"
          value={bars}
          onChange={e => setBars(Number(e.target.value) as 4 | 8)}
        >
          <option value={4}>4 Bars</option>
          <option value={8}>8 Bars</option>
        </select>
      </div>

      <Expander label="Advanced Settings">
        <div className="kgone-row">
          <div className="kgone-field">
            <label className="kgone-label">Note</label>
            <select className="kgone-select" value={note} onChange={e => setNote(e.target.value)}>
              {CLIP_NOTES.map(n => <option key={n} value={n}>{n}</option>)}
            </select>
          </div>
          <div className="kgone-field">
            <label className="kgone-label">Scale</label>
            <select className="kgone-select" value={scale} onChange={e => setScale(e.target.value as 'major' | 'minor')}>
              <option value="major">Major</option>
              <option value="minor">Minor</option>
            </select>
          </div>
        </div>

        <div className="kgone-field">
          <label className="kgone-label">BPM</label>
          <input type="number" className="kgone-input" value={clipBpm} min={40} max={300}
            onChange={e => setClipBpm(Number(e.target.value))} />
        </div>

        <div className="kgone-row">
          <div className="kgone-field">
            <label className="kgone-label">Steps</label>
            <input type="number" className="kgone-input" value={steps} min={1} max={500}
              onChange={e => setSteps(Number(e.target.value))} />
          </div>
          <div className="kgone-field">
            <label className="kgone-label">CFG Scale</label>
            <input type="number" className="kgone-input" value={cfgScale} min={0} max={25} step={0.1}
              onChange={e => setCfgScale(Number(e.target.value))} />
          </div>
        </div>

        <div className="kgone-field">
          <label className="kgone-label">Seed (-1 = random)</label>
          <input type="number" className="kgone-input" value={seed}
            onChange={e => setSeed(Number(e.target.value))} />
        </div>

        <div className="kgone-field">
          <label className="kgone-label">Sampler Type</label>
          <input type="text" className="kgone-input" value={samplerType}
            onChange={e => setSamplerType(e.target.value)} />
        </div>

        <div className="kgone-row">
          <div className="kgone-field">
            <label className="kgone-label">Sigma Min</label>
            <input type="number" className="kgone-input" value={sigmaMin} step={0.01}
              onChange={e => setSigmaMin(Number(e.target.value))} />
          </div>
          <div className="kgone-field">
            <label className="kgone-label">Sigma Max</label>
            <input type="number" className="kgone-input" value={sigmaMax} step={1}
              onChange={e => setSigmaMax(Number(e.target.value))} />
          </div>
        </div>

        <div className="kgone-field">
          <label className="kgone-label">CFG Rescale</label>
          <input type="number" className="kgone-input" value={cfgRescale} min={0} max={1} step={0.01}
            onChange={e => setCfgRescale(Number(e.target.value))} />
        </div>
      </Expander>

      {/* Audio preview player — shown once generation is complete */}
      {audioUrl && (
        <AudioPlayer
          src={audioUrl}
          dragData={taskIdRef.current ? {
            midiUrl: `${getKGOneBaseUrl()}/v1/clip/midi/${taskIdRef.current}`,
            audioFileName: `KGOne_Clip_${taskIdRef.current}.wav`,
          } : undefined}
        />
      )}

      {/* Drag-to-track hint — shown after a successful generation */}
      {genStatus === 'done' && (
        <div className="kgone-hint">
          Drag the player above to a track to import the clip.
          Drop onto an <strong>audio track</strong> to import as a WAV region (recommended),
          or onto a <strong>MIDI track</strong> to import as a MIDI region.
          Note: MIDI is transcribed from the audio and may not be perfectly accurate.
        </div>
      )}

      {/* Error message */}
      {genStatus === 'error' && errorMsg && (
        <div className="kgone-error-msg">{errorMsg}</div>
      )}

      <button
        className="kgone-btn-generate"
        disabled={isGenerating || !prompt.trim()}
        onClick={handleGenerate}
      >
        {isGenerating && <FaCircleNotch className="kgone-spinner" />}
        {btnLabel()}
      </button>

      {/* Status hint below button */}
      {genHint && <div className="kgone-gen-hint">{genHint}</div>}

      <div className="kgone-powered-by">
        Powered by <a href="https://huggingface.co/RoyalCities/Foundation-1" target="_blank" rel="noopener noreferrer">Foundation-1</a>
      </div>
    </>
  );
};

// ─── Full Song Tab ────────────────────────────────────────────────────────────

const FullSongTab: React.FC = () => {
  // Form state
  const [caption, setCaption] = useState('');
  const [lyrics, setLyrics] = useState('');
  const [instrumental, setInstrumental] = useState(false);
  const [inferenceSteps, setInferenceSteps] = useState(8);
  const [guidanceScale, setGuidanceScale] = useState(7.0);
  const [useRandomSeed, setUseRandomSeed] = useState(true);
  const [seed, setSeed] = useState(-1);
  const [thinking, setThinking] = useState(true);

  // Generation state
  const [genStatus, setGenStatus] = useState<GenStatus>('idle');
  const [genHint, setGenHint] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [audioUrl, setAudioUrl] = useState<string | null>(null);

  const abortRef = useRef<AbortController | null>(null);
  const taskIdRef = useRef<string>('');

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
      if (audioUrl) URL.revokeObjectURL(audioUrl);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const isGenerating = genStatus !== 'idle' && genStatus !== 'done' && genStatus !== 'error';

  const handleGenerate = useCallback(async () => {
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    const { signal } = ctrl;

    if (audioUrl) {
      URL.revokeObjectURL(audioUrl);
      setAudioUrl(null);
    }
    setErrorMsg('');

    try {
      // ── 1. Load the fullsong model ──────────────────────────────────────────
      setGenStatus('loading-model');
      setGenHint('Loading model — this can take 60+ seconds, please wait...');

      const baseUrl = getKGOneBaseUrl();

      const loadPayload = { model: 'fullsong' };
      kgoneLog('REQ', 'POST /v1/models/load', loadPayload);
      const loadResp = await fetch(`${baseUrl}/v1/models/load`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(loadPayload),
        signal,
      });

      if (!loadResp.ok) {
        const body = await loadResp.text().catch(() => '');
        kgoneLog('RES', `POST /v1/models/load → ${loadResp.status}`, body);
        throw new Error(`Model load failed (${loadResp.status}): ${body}`);
      }
      kgoneLog('RES', `POST /v1/models/load → ${loadResp.status}`, await loadResp.clone().json().catch(() => '(unparseable)'));

      // ── 2. Submit generation job ────────────────────────────────────────────
      setGenStatus('generating');
      setGenHint('Submitting generation request...');

      const genPayload = {
        caption,
        lyrics: instrumental ? '' : lyrics,
        instrumental,
        inference_steps: inferenceSteps,
        guidance_scale: guidanceScale,
        use_random_seed: useRandomSeed,
        seed,
        thinking,
        // Hardcoded — not exposed in UI
        // lm_model_path: "acestep-5Hz-lm-0.6B",
        batch_size: 1,
        audio_format: 'mp3',
      };
      kgoneLog('REQ', 'POST /v1/fullsong/generate', genPayload);
      const genResp = await fetch(`${baseUrl}/v1/fullsong/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(genPayload),
        signal,
      });

      if (!genResp.ok) {
        const body = await genResp.text().catch(() => '');
        kgoneLog('RES', `POST /v1/fullsong/generate → ${genResp.status}`, body);
        throw new Error(`Generation request failed (${genResp.status}): ${body}`);
      }

      // Response shape: { "data": { "task_id": "...", ... }, "code": 200, ... }
      const genJson = (await genResp.json()) as { data: { task_id: string }; code: number };
      kgoneLog('RES', `POST /v1/fullsong/generate → ${genResp.status}`, genJson);
      const task_id = genJson.data.task_id;
      taskIdRef.current = task_id;

      // ── 3. Poll for completion ──────────────────────────────────────────────
      setGenStatus('polling');
      setGenHint('Generating...');

      // Response shape: { "data": [{ "status": 0|1, "result": "<JSON_STRING>", ... }], ... }
      type ResultItem = { progress: number; stage: string; status: number };
      type PollResponse = { data: Array<{ status: number; result: string }>; code: number };

       
      while (true) {
        if (signal.aborted) return;

        await new Promise<void>(r => {
          const t = setTimeout(r, 5000);
          signal.addEventListener('abort', () => { clearTimeout(t); r(); }, { once: true });
        });

        if (signal.aborted) return;

        kgoneLog('REQ', `GET /v1/fullsong/result/${task_id}`, null);
        const resultResp = await fetchWithRetry(`${baseUrl}/v1/fullsong/result/${task_id}`, { signal });

        const pollJson = (await resultResp.json()) as PollResponse;
        kgoneLog('RES', `GET /v1/fullsong/result/${task_id} → ${resultResp.status}`, pollJson);

        const outer = pollJson.data?.[0];
        if (!outer) continue;

        // Parse the nested JSON string for progress/stage info
        try {
          const inner = JSON.parse(outer.result) as ResultItem[];
          const item = inner[0];
          if (item) {
            const pct = Math.round((item.progress ?? 0) * 100);
            const stage = item.stage ?? '';
            setGenHint(stage ? `Generating... ${pct}% — ${stage}` : `Generating... ${pct}%`);
          }
        } catch {
          // result may be empty string while still queued — ignore parse errors
        }

        if (outer.status === 1) break; // finished
        // status === 0 → still running, keep polling
      }

      // ── 4. Download the MP3 ─────────────────────────────────────────────────
      setGenStatus('downloading');
      setGenHint('Downloading audio...');

      kgoneLog('REQ', `GET /v1/fullsong/audio/${task_id}?index=0`, null);
      const audioResp = await fetchWithRetry(`${baseUrl}/v1/fullsong/audio/${task_id}?index=0`, { signal });

      const blob = await audioResp.blob();
      const url = URL.createObjectURL(blob);
      kgoneLog('RES', `GET /v1/fullsong/audio/${task_id}?index=0 → ${audioResp.status} (binary MP3)`, url);

      setAudioUrl(url);
      setGenStatus('done');
      setGenHint('');
    } catch (err) {
      if (signal.aborted) return;
      console.error('[KGOne] Full song generation error:', err);
      setErrorMsg(err instanceof Error ? err.message : String(err));
      setGenStatus('error');
      setGenHint('');
    }
  }, [caption, lyrics, instrumental, inferenceSteps, guidanceScale, useRandomSeed, seed, thinking, audioUrl]);

  const btnLabel = () => {
    switch (genStatus) {
      case 'loading-model': return 'Loading model...';
      case 'generating': return 'Generating...';
      case 'polling': return 'Processing...';
      case 'downloading': return 'Downloading...';
      default: return 'Generate Song';
    }
  };

  return (
    <>
      <div className="kgone-field">
        <label className="kgone-label">Caption</label>
        <textarea
          className="kgone-textarea"
          value={caption}
          onChange={e => setCaption(e.target.value)}
          placeholder="e.g. Genre: Eurodance, 90s dance-pop, upbeat electronic. Style: Catchy, energetic... Tempo: ~130 BPM. Instrumentation: driving kick drum, eurodance bassline..."
          rows={5}
        />
        <div className="kgone-hint">
          Describe the song style, mood, tempo, instrumentation, and structure in natural language.
        </div>
      </div>

      <div className="kgone-field">
        <label className="kgone-label">Lyrics</label>
        <textarea
          className="kgone-textarea"
          value={lyrics}
          onChange={e => setLyrics(e.target.value)}
          placeholder={"[Verse 1]\nYour lyrics here...\n\n[Chorus]\n..."}
          rows={6}
          disabled={instrumental}
          style={instrumental ? { opacity: 0.4 } : undefined}
        />
        <div className="kgone-hint">
          Use [Intro], [Verse], [Chorus], [Bridge] tags to mark sections.
        </div>
      </div>

      <div className="kgone-checkbox-row">
        <input type="checkbox" id="kgone-instrumental" checked={instrumental}
          onChange={e => setInstrumental(e.target.checked)} />
        <label htmlFor="kgone-instrumental">Instrumental (no vocals)</label>
      </div>

      <Expander label="Advanced Settings">
        <div className="kgone-row">
          <div className="kgone-field">
            <label className="kgone-label">Inference Steps</label>
            <input type="number" className="kgone-input" value={inferenceSteps} min={1} max={200}
              onChange={e => setInferenceSteps(Number(e.target.value))} />
          </div>
          <div className="kgone-field">
            <label className="kgone-label">Guidance Scale</label>
            <input type="number" className="kgone-input" value={guidanceScale} min={0} max={20} step={0.1}
              onChange={e => setGuidanceScale(Number(e.target.value))} />
          </div>
        </div>

        <div className="kgone-checkbox-row">
          <input type="checkbox" id="kgone-use-random-seed" checked={useRandomSeed}
            onChange={e => setUseRandomSeed(e.target.checked)} />
          <label htmlFor="kgone-use-random-seed">Use Random Seed</label>
        </div>

        <div className="kgone-field">
          <label className="kgone-label">Seed</label>
          <input type="number" className="kgone-input" value={seed}
            disabled={useRandomSeed} style={useRandomSeed ? { opacity: 0.4 } : undefined}
            onChange={e => setSeed(Number(e.target.value))} />
        </div>

        <div className="kgone-checkbox-row">
          <input type="checkbox" id="kgone-thinking" checked={thinking}
            onChange={e => setThinking(e.target.checked)} />
          <label htmlFor="kgone-thinking">Thinking (CoT metadata generation)</label>
        </div>
      </Expander>

      {audioUrl && (
        <AudioPlayer
          src={audioUrl}
          dragData={taskIdRef.current ? {
            audioFileName: `KGOne_FullSong_${taskIdRef.current}.mp3`,
          } : undefined}
        />
      )}

      {genStatus === 'done' && (
        <div className="kgone-hint">
          Drag the player above to an <strong>audio track</strong> to import the song.
          Dropping onto a MIDI track is not supported for full song generation.
        </div>
      )}

      {genStatus === 'error' && errorMsg && (
        <div className="kgone-error-msg">{errorMsg}</div>
      )}

      <button
        className="kgone-btn-generate"
        disabled={isGenerating || !caption.trim()}
        onClick={handleGenerate}
      >
        {isGenerating && <FaCircleNotch className="kgone-spinner" />}
        {btnLabel()}
      </button>

      {genHint && <div className="kgone-gen-hint">{genHint}</div>}

      <div className="kgone-powered-by">
        Powered by <a href="https://github.com/ace-step/ACE-Step-1.5" target="_blank" rel="noopener noreferrer">ACE-Step 1.5</a>
      </div>
    </>
  );
};

// ─── Separator Tab ────────────────────────────────────────────────────────────

/** Extract the stem label from a filename like `uuid_(Vocals)_ModelName.mp3` */
function extractStemName(filename: string): string {
  const match = filename.match(/\(([^)]+)\)/);
  return match ? match[1] : filename;
}

/** Count existing remix tracks derived from `sourceTrackName` (for naming new ones). */
function countRemixTracks(sourceTrackName: string): number {
  const tracks = KGCore.instance().getCurrentProject().getTracks();
  const escaped = sourceTrackName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = new RegExp(`^${escaped} - remix \\(\\d+\\)$`);
  return tracks.filter(t => pattern.test(t.getName())).length;
}

/** Count existing repaint tracks derived from `sourceTrackName` (for naming new ones). */
function countRepaintTracks(sourceTrackName: string): number {
  const tracks = KGCore.instance().getCurrentProject().getTracks();
  const escaped = sourceTrackName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = new RegExp(`^${escaped} - repaint \\(\\d+\\)$`);
  return tracks.filter(t => pattern.test(t.getName())).length;
}

const SeparatorTab: React.FC = () => {
  const { selectedRegionIds, projectName, bpm, timeSignature, maxBars, refreshProjectState } = useProjectStore();
  const [model, setModel] = useState<typeof SEPARATOR_MODELS[number]['value']>(SEPARATOR_MODELS[0].value);

  // Generation state
  const [genStatus, setGenStatus] = useState<GenStatus>('idle');
  const [genHint, setGenHint] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [stemAudioUrls, setStemAudioUrls] = useState<Array<{ name: string; url: string }>>([]);

  const abortRef = useRef<AbortController | null>(null);
  const taskIdRef = useRef<string>('');
  const originalRegionRef = useRef<{
    regionName: string;
    trackName: string;
    startFromBeat: number;
    trackIndex: number;
  } | null>(null);

  const [isImporting, setIsImporting] = useState(false);
  const [importError, setImportError] = useState('');

  // Revoke all blob URLs on unmount
  useEffect(() => {
    return () => {
      abortRef.current?.abort();
      stemAudioUrls.forEach(s => URL.revokeObjectURL(s.url));
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

  const isGenerating = genStatus !== 'idle' && genStatus !== 'done' && genStatus !== 'error';

  const handleSeparate = useCallback(async () => {
    if (!selectedAudioRegion) return;

    // Capture snapshot before anything changes — selection may shift during generation
    originalRegionRef.current = {
      regionName: selectedAudioRegion.region.getName(),
      trackName: selectedAudioRegion.trackName,
      startFromBeat: selectedAudioRegion.region.getStartFromBeat(),
      trackIndex: selectedAudioRegion.trackIndex,
    };
    setImportError('');

    // Abort any in-flight request
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    const { signal } = ctrl;

    // Revoke previous stem URLs
    stemAudioUrls.forEach(s => URL.revokeObjectURL(s.url));
    setStemAudioUrls([]);
    setErrorMsg('');

    try {
      // ── 1. Load the separator model ────────────────────────────────────────
      setGenStatus('loading-model');
      setGenHint('Loading model — this can take 60+ seconds, please wait...');

      const baseUrl = getKGOneBaseUrl();

      const loadPayload = { model: 'separator' };
      kgoneLog('REQ', 'POST /v1/models/load', loadPayload);
      const loadResp = await fetch(`${baseUrl}/v1/models/load`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(loadPayload),
        signal,
      });

      if (!loadResp.ok) {
        const body = await loadResp.text().catch(() => '');
        kgoneLog('RES', `POST /v1/models/load → ${loadResp.status}`, body);
        throw new Error(`Model load failed (${loadResp.status}): ${body}`);
      }
      kgoneLog('RES', `POST /v1/models/load → ${loadResp.status}`, await loadResp.clone().json().catch(() => '(unparseable)'));

      if (signal.aborted) return;

      // ── 2. Load audio file from OPFS and build multipart form ──────────────
      setGenStatus('generating');
      setGenHint('Reading audio file...');

      const audioFileId = selectedAudioRegion.region.getAudioFileId();
      const audioFileName = selectedAudioRegion.region.getAudioFileName();
      const clipStart = selectedAudioRegion.region.getClipStartOffsetSeconds();
      const fullDuration = selectedAudioRegion.region.getAudioDurationSeconds();
      const regionLengthSec = selectedAudioRegion.region.getLength() * (60 / bpm);
      const effectiveDuration = Math.min(regionLengthSec, fullDuration - clipStart);

      const rawBuffer = await KGAudioFileStorage.loadAudioFile(projectName, audioFileId);
      const needsSlice = clipStart > 0.01 || effectiveDuration < fullDuration - 0.01;

      let uploadBuffer: ArrayBuffer;
      let uploadFileName: string;
      let uploadMimeType: string;

      if (needsSlice) {
        setGenHint('Trimming audio to region range...');
        uploadBuffer = await sliceAudioToWav(rawBuffer, clipStart, effectiveDuration);
        uploadFileName = audioFileName.replace(/\.[^.]+$/, '.wav');
        uploadMimeType = 'audio/wav';
      } else {
        uploadBuffer = rawBuffer;
        uploadFileName = audioFileName;
        uploadMimeType = 'audio/mpeg';
      }

      const audioFile = new File([uploadBuffer], uploadFileName, { type: uploadMimeType });

      const formData = new FormData();
      formData.append('file', audioFile, uploadFileName);
      formData.append('model_filename', model);

      if (signal.aborted) return;

      setGenHint('Submitting separation request...');

      kgoneLog('REQ', 'POST /v1/separator/separate', { file: uploadFileName, model_filename: model });
      const sepResp = await fetch(`${baseUrl}/v1/separator/separate`, {
        method: 'POST',
        body: formData,
        signal,
      });

      if (!sepResp.ok) {
        const body = await sepResp.text().catch(() => '');
        kgoneLog('RES', `POST /v1/separator/separate → ${sepResp.status}`, body);
        throw new Error(`Separation request failed (${sepResp.status}): ${body}`);
      }

      const sepJson = (await sepResp.json()) as { task_id: string };
      kgoneLog('RES', `POST /v1/separator/separate → ${sepResp.status}`, sepJson);
      const { task_id } = sepJson;
      taskIdRef.current = task_id;

      // ── 3. Poll for completion ─────────────────────────────────────────────
      setGenStatus('polling');
      setGenHint('Separating stems...');

      type SepPollResponse = {
        task_id: string;
        status: 'running' | 'complete' | 'error';
        files?: string[];
        error?: string;
      };

      let files: string[] = [];

       
      while (true) {
        if (signal.aborted) return;

        await new Promise<void>(r => {
          const t = setTimeout(r, 5000);
          signal.addEventListener('abort', () => { clearTimeout(t); r(); }, { once: true });
        });

        if (signal.aborted) return;

        kgoneLog('REQ', `GET /v1/separator/result/${task_id}`, null);
        const resultResp = await fetchWithRetry(`${baseUrl}/v1/separator/result/${task_id}`, { signal });

        const pollJson = (await resultResp.json()) as SepPollResponse;
        kgoneLog('RES', `GET /v1/separator/result/${task_id} → ${resultResp.status}`, pollJson);

        if (pollJson.status === 'complete') {
          files = pollJson.files ?? [];
          break;
        }
        if (pollJson.status === 'error') {
          throw new Error(pollJson.error ?? 'Separation failed on the server');
        }
        // status === 'running' — keep polling
      }

      // ── 4. Download all stem files in parallel ─────────────────────────────
      setGenStatus('downloading');
      setGenHint('Downloading stems...');

      const stemResults = await Promise.all(
        files.map(async (filename) => {
          kgoneLog('REQ', `GET /v1/separator/download/${filename}`, null);
          const dlResp = await fetchWithRetry(
            `${baseUrl}/v1/separator/download/${encodeURIComponent(filename)}`,
            { signal }
          );
          const blob = await dlResp.blob();
          const url = URL.createObjectURL(blob);
          kgoneLog('RES', `GET /v1/separator/download/${filename} → ${dlResp.status} (binary MP3)`, url);
          return { name: extractStemName(filename), url };
        })
      );

      setStemAudioUrls(stemResults);
      setGenStatus('done');
      setGenHint('');
    } catch (err) {
      if (signal.aborted) return;
      console.error('[KGOne] Separator error:', err);
      setErrorMsg(err instanceof Error ? err.message : String(err));
      setGenStatus('error');
      setGenHint('');
    }
  }, [selectedAudioRegion, projectName, model, stemAudioUrls]);

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
          const fileName = `KGOne_Stem_${stem.name}_${taskIdRef.current}.mp3`;
          const fileId = `kgone_stem_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
          const audioFile = new File([blob], fileName, { type: 'audio/mpeg' });

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
        snap.startFromBeat,
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
      case 'loading-model': return 'Loading model...';
      case 'generating': return 'Preparing upload...';
      case 'polling': return 'Separating stems...';
      case 'downloading': return 'Downloading...';
      default: return 'Separate Stems';
    }
  };

  return (
    <>
      {selectedAudioRegion ? (
        <>
          <div className="kgone-region-info">
            <div className="kgone-region-info-label">Selected Region</div>
            <div className="kgone-region-info-value">{selectedAudioRegion.region.getName()}</div>
            <div className="kgone-region-info-label" style={{ marginTop: 4 }}>Track</div>
            <div className="kgone-region-info-value">{selectedAudioRegion.trackName}</div>
          </div>

          <div className="kgone-field">
            <label className="kgone-label">Separation Model</label>
            <select className="kgone-select" value={model} onChange={e => setModel(e.target.value as typeof SEPARATOR_MODELS[number]['value'])}>

              {SEPARATOR_MODELS.map(m => (
                <option key={m.value} value={m.value}>{m.label}</option>
              ))}
            </select>
          </div>

          {/* Stem audio players — shown once separation is complete */}
          {stemAudioUrls.length > 0 && (
            <div className="kgone-stems">
              {stemAudioUrls.map(stem => (
                <div key={stem.name} className="kgone-stem-player">
                  <div className="kgone-label" style={{ marginBottom: 4 }}>{stem.name}</div>
                  <AudioPlayer
                    src={stem.url}
                    dragData={taskIdRef.current ? {
                      audioFileName: `KGOne_Stem_${stem.name}_${taskIdRef.current}.mp3`,
                    } : undefined}
                  />
                </div>
              ))}
            </div>
          )}

          {/* Drag-to-track hint — shown after successful separation */}
          {genStatus === 'done' && (
            <div className="kgone-hint">
              Drag each stem player above to an <strong>audio track</strong> to import it.
              Dropping onto a MIDI track is not supported for stem separation.
            </div>
          )}

          {/* Bulk import button — shown after successful separation */}
          {genStatus === 'done' && stemAudioUrls.length > 0 && (
            <>
              <button
                className="kgone-btn-generate"
                disabled={isImporting}
                onClick={handleImportAll}
                style={{ marginTop: 0 }}
              >
                {isImporting && <FaCircleNotch className="kgone-spinner" />}
                {isImporting ? 'Importing...' : 'Import All Stems to Timeline'}
              </button>
              {importError && <div className="kgone-error-msg">{importError}</div>}
            </>
          )}

          {/* Separation error message */}
          {genStatus === 'error' && errorMsg && (
            <div className="kgone-error-msg">{errorMsg}</div>
          )}

          <button
            className="kgone-btn-generate"
            disabled={isGenerating}
            onClick={handleSeparate}
          >
            {isGenerating && <FaCircleNotch className="kgone-spinner" />}
            {btnLabel()}
          </button>

          {/* Status hint below button */}
          {genHint && <div className="kgone-gen-hint">{genHint}</div>}
        </>
      ) : (
        <div className="kgone-separator-hint">
          Select an audio region on the timeline to extract stems from it.
          Only audio regions are supported — MIDI regions cannot be separated.
        </div>
      )}

      <div className="kgone-powered-by">
        Powered by <a href="https://github.com/nomadkaraoke/python-audio-separator" target="_blank" rel="noopener noreferrer">UVR5 CLI</a>
      </div>
    </>
  );
};

// ─── Remix Tab ────────────────────────────────────────────────────────────────

const RemixTab: React.FC = () => {
  const { selectedRegionIds, projectName, bpm, maxBars, refreshProjectState } = useProjectStore();

  // Form state (mirrors FullSongTab)
  const [caption, setCaption] = useState('');
  const [lyrics, setLyrics] = useState('');
  const [instrumental, setInstrumental] = useState(false);
  const [inferenceSteps, setInferenceSteps] = useState(8);
  const [guidanceScale, setGuidanceScale] = useState(7.0);
  const [useRandomSeed, setUseRandomSeed] = useState(true);
  const [seed, setSeed] = useState(-1);
  const [thinking, setThinking] = useState(true);

  // Remix-specific params
  const [audioCoverStrength, setAudioCoverStrength] = useState(0.5);
  const [coverNoiseStrength, setCoverNoiseStrength] = useState(0.2);

  // Generation state
  const [genStatus, setGenStatus] = useState<GenStatus>('idle');
  const [genHint, setGenHint] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [audioUrl, setAudioUrl] = useState<string | null>(null);

  // Import state
  const [isImporting, setIsImporting] = useState(false);
  const [importError, setImportError] = useState('');

  const abortRef = useRef<AbortController | null>(null);
  const taskIdRef = useRef<string>('');
  const originalRegionRef = useRef<{
    regionName: string;
    trackName: string;
    startFromBeat: number;
    trackIndex: number;
  } | null>(null);

  // Revoke blob URL on unmount
  useEffect(() => {
    return () => {
      abortRef.current?.abort();
      if (audioUrl) URL.revokeObjectURL(audioUrl);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

  const isGenerating = genStatus !== 'idle' && genStatus !== 'done' && genStatus !== 'error';

  const handleRemix = useCallback(async () => {
    if (!selectedAudioRegion) return;

    // Capture snapshot before anything changes — selection may shift during generation
    originalRegionRef.current = {
      regionName: selectedAudioRegion.region.getName(),
      trackName: selectedAudioRegion.trackName,
      startFromBeat: selectedAudioRegion.region.getStartFromBeat(),
      trackIndex: selectedAudioRegion.trackIndex,
    };
    setImportError('');

    // Abort any in-flight request
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    const { signal } = ctrl;

    if (audioUrl) {
      URL.revokeObjectURL(audioUrl);
      setAudioUrl(null);
    }
    setErrorMsg('');

    try {
      const baseUrl = getKGOneBaseUrl();

      // ── 1. Load the fullsong model ──────────────────────────────────────────
      setGenStatus('loading-model');
      setGenHint('Loading model — this can take 60+ seconds, please wait...');

      const loadPayload = { model: 'fullsong' };
      kgoneLog('REQ', 'POST /v1/models/load', loadPayload);
      const loadResp = await fetch(`${baseUrl}/v1/models/load`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(loadPayload),
        signal,
      });

      if (!loadResp.ok) {
        const body = await loadResp.text().catch(() => '');
        kgoneLog('RES', `POST /v1/models/load → ${loadResp.status}`, body);
        throw new Error(`Model load failed (${loadResp.status}): ${body}`);
      }
      kgoneLog('RES', `POST /v1/models/load → ${loadResp.status}`, await loadResp.clone().json().catch(() => '(unparseable)'));

      if (signal.aborted) return;

      // ── 2. Load audio from OPFS and build multipart form ───────────────────
      setGenStatus('generating');
      setGenHint('Reading audio file...');

      const audioFileId = selectedAudioRegion.region.getAudioFileId();
      const audioFileName = selectedAudioRegion.region.getAudioFileName();
      const clipStart = selectedAudioRegion.region.getClipStartOffsetSeconds();
      const fullDuration = selectedAudioRegion.region.getAudioDurationSeconds();
      const regionLengthSec = selectedAudioRegion.region.getLength() * (60 / bpm);
      const effectiveDuration = Math.min(regionLengthSec, fullDuration - clipStart);

      const rawBuffer = await KGAudioFileStorage.loadAudioFile(projectName, audioFileId);
      const needsSlice = clipStart > 0.01 || effectiveDuration < fullDuration - 0.01;

      let uploadBuffer: ArrayBuffer;
      let uploadFileName: string;
      let uploadMimeType: string;

      if (needsSlice) {
        setGenHint('Trimming audio to region range...');
        uploadBuffer = await sliceAudioToWav(rawBuffer, clipStart, effectiveDuration);
        uploadFileName = audioFileName.replace(/\.[^.]+$/, '.wav');
        uploadMimeType = 'audio/wav';
      } else {
        uploadBuffer = rawBuffer;
        uploadFileName = audioFileName;
        uploadMimeType = 'audio/mpeg';
      }

      const audioFile = new File([uploadBuffer], uploadFileName, { type: uploadMimeType });

      const formData = new FormData();
      formData.append('audio_file', audioFile, uploadFileName);
      formData.append('caption', caption);
      formData.append('lyrics', instrumental ? '' : lyrics);
      formData.append('instrumental', String(instrumental));
      formData.append('inference_steps', String(inferenceSteps));
      formData.append('guidance_scale', String(guidanceScale));
      formData.append('use_random_seed', String(useRandomSeed));
      formData.append('seed', String(seed));
      formData.append('thinking', String(thinking));
      formData.append('batch_size', '1');
      formData.append('audio_format', 'mp3');
      formData.append('audio_cover_strength', String(audioCoverStrength));
      formData.append('cover_noise_strength', String(coverNoiseStrength));

      if (signal.aborted) return;

      setGenHint('Submitting remix request...');

      kgoneLog('REQ', 'POST /v1/fullsong/remix', {
        file: uploadFileName, caption, instrumental, inference_steps: inferenceSteps,
        guidance_scale: guidanceScale, use_random_seed: useRandomSeed, seed, thinking,
        audio_cover_strength: audioCoverStrength, cover_noise_strength: coverNoiseStrength,
      });
      const remixResp = await fetch(`${baseUrl}/v1/fullsong/remix`, {
        method: 'POST',
        body: formData,
        signal,
      });

      if (!remixResp.ok) {
        const body = await remixResp.text().catch(() => '');
        kgoneLog('RES', `POST /v1/fullsong/remix → ${remixResp.status}`, body);
        throw new Error(`Remix request failed (${remixResp.status}): ${body}`);
      }

      // Response shape: { "data": { "task_id": "...", ... }, "code": 200, ... }
      const remixJson = (await remixResp.json()) as { data: { task_id: string }; code: number };
      kgoneLog('RES', `POST /v1/fullsong/remix → ${remixResp.status}`, remixJson);

      const task_id = remixJson.data.task_id;
      taskIdRef.current = task_id;

      // ── 3. Poll for completion (same as FullSongTab) ───────────────────────
      setGenStatus('polling');
      setGenHint('Generating remix...');

      type ResultItem = { progress: number; stage: string; status: number };
      type PollResponse = { data: Array<{ status: number; result: string }>; code: number };

       
      while (true) {
        if (signal.aborted) return;

        await new Promise<void>(r => {
          const t = setTimeout(r, 5000);
          signal.addEventListener('abort', () => { clearTimeout(t); r(); }, { once: true });
        });

        if (signal.aborted) return;

        kgoneLog('REQ', `GET /v1/fullsong/result/${task_id}`, null);
        const resultResp = await fetchWithRetry(`${baseUrl}/v1/fullsong/result/${task_id}`, { signal });

        const pollJson = (await resultResp.json()) as PollResponse;
        kgoneLog('RES', `GET /v1/fullsong/result/${task_id} → ${resultResp.status}`, pollJson);

        const outer = pollJson.data?.[0];
        if (!outer) continue;

        try {
          const inner = JSON.parse(outer.result) as ResultItem[];
          const item = inner[0];
          if (item) {
            const pct = Math.round((item.progress ?? 0) * 100);
            const stage = item.stage ?? '';
            setGenHint(stage ? `Generating remix... ${pct}% — ${stage}` : `Generating remix... ${pct}%`);
          }
        } catch {
          // result may be empty string while still queued — ignore parse errors
        }

        if (outer.status === 1) break;
      }

      // ── 4. Download the MP3 ─────────────────────────────────────────────────
      setGenStatus('downloading');
      setGenHint('Downloading audio...');

      kgoneLog('REQ', `GET /v1/fullsong/audio/${task_id}?index=0`, null);
      const audioResp = await fetchWithRetry(`${baseUrl}/v1/fullsong/audio/${task_id}?index=0`, { signal });

      const blob = await audioResp.blob();
      const url = URL.createObjectURL(blob);
      kgoneLog('RES', `GET /v1/fullsong/audio/${task_id}?index=0 → ${audioResp.status} (binary MP3)`, url);

      setAudioUrl(url);
      setGenStatus('done');
      setGenHint('');
    } catch (err) {
      if (signal.aborted) return;
      console.error('[KGOne] Remix error:', err);
      setErrorMsg(err instanceof Error ? err.message : String(err));
      setGenStatus('error');
      setGenHint('');
    }
  }, [selectedAudioRegion, projectName, bpm, caption, lyrics, instrumental, inferenceSteps, guidanceScale, useRandomSeed, seed, thinking, audioCoverStrength, coverNoiseStrength, audioUrl]);

  const handleImportAligned = useCallback(async () => {
    const snap = originalRegionRef.current;
    if (!snap || !audioUrl) return;

    setIsImporting(true);
    setImportError('');

    try {
      const audioContext = Tone.getContext().rawContext as AudioContext;

      const blob = await fetch(audioUrl).then(r => r.blob());
      const fileName = `KGOne_Remix_${taskIdRef.current || Date.now()}.mp3`;
      const fileId = `kgone_remix_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
      const audioFile = new File([blob], fileName, { type: 'audio/mpeg' });

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

      const project = KGCore.instance().getCurrentProject();
      const count = countRemixTracks(snap.trackName) + 1;
      const stemEntry: StemImportEntry = {
        trackName: `${snap.trackName} - remix (${count})`,
        regionName: `${snap.regionName} - remix (${count})`,
        audioFileId: fileId,
        audioFileName: fileName,
        audioDurationSeconds: toneBuffer.duration,
        toneBuffer,
      };

      const cmd = new ImportStemsCommand(
        project.getTracks().length,
        snap.trackIndex,
        snap.startFromBeat,
        [stemEntry],
        maxBars,
      );
      KGCore.instance().executeCommand(cmd);
      refreshProjectState();
    } catch (err) {
      setImportError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsImporting(false);
    }
  }, [audioUrl, projectName, maxBars, refreshProjectState]);

  const btnLabel = () => {
    switch (genStatus) {
      case 'loading-model': return 'Loading model...';
      case 'generating': return 'Preparing upload...';
      case 'polling': return 'Processing remix...';
      case 'downloading': return 'Downloading...';
      default: return 'Generate Remix';
    }
  };

  return (
    <>
      {selectedAudioRegion ? (
        <>
          <div className="kgone-region-info">
            <div className="kgone-region-info-label">Selected Region</div>
            <div className="kgone-region-info-value">{selectedAudioRegion.region.getName()}</div>
            <div className="kgone-region-info-label" style={{ marginTop: 4 }}>Track</div>
            <div className="kgone-region-info-value">{selectedAudioRegion.trackName}</div>
          </div>

          <div className="kgone-field">
            <label className="kgone-label">Caption</label>
            <textarea
              className="kgone-textarea"
              value={caption}
              onChange={e => setCaption(e.target.value)}
              placeholder="e.g. Genre: Jazz, Style: Smooth and mellow, Instrumentation: piano, upright bass, brushed drums..."
              rows={5}
            />
            <div className="kgone-hint">
              Describe the target style, mood, and instrumentation for the remix.
            </div>
          </div>

          <div className="kgone-field">
            <label className="kgone-label">Lyrics</label>
            <textarea
              className="kgone-textarea"
              value={lyrics}
              onChange={e => setLyrics(e.target.value)}
              placeholder={"[Verse 1]\nYour lyrics here...\n\n[Chorus]\n..."}
              rows={6}
              disabled={instrumental}
              style={instrumental ? { opacity: 0.4 } : undefined}
            />
            <div className="kgone-hint">
              Leave empty to keep the original lyrics, or provide new ones. Use [Verse], [Chorus], [Bridge] tags.
            </div>
          </div>

          <div className="kgone-checkbox-row">
            <input type="checkbox" id="kgone-remix-instrumental" checked={instrumental}
              onChange={e => setInstrumental(e.target.checked)} />
            <label htmlFor="kgone-remix-instrumental">Instrumental (no vocals)</label>
          </div>

          <Expander label="Advanced Settings">
            <div className="kgone-row">
              <div className="kgone-field">
                <label className="kgone-label">Inference Steps</label>
                <input type="number" className="kgone-input" value={inferenceSteps} min={1} max={200}
                  onChange={e => setInferenceSteps(Number(e.target.value))} />
              </div>
              <div className="kgone-field">
                <label className="kgone-label">Guidance Scale</label>
                <input type="number" className="kgone-input" value={guidanceScale} min={0} max={20} step={0.1}
                  onChange={e => setGuidanceScale(Number(e.target.value))} />
              </div>
            </div>

            <div className="kgone-checkbox-row">
              <input type="checkbox" id="kgone-remix-use-random-seed" checked={useRandomSeed}
                onChange={e => setUseRandomSeed(e.target.checked)} />
              <label htmlFor="kgone-remix-use-random-seed">Use Random Seed</label>
            </div>

            <div className="kgone-field">
              <label className="kgone-label">Seed</label>
              <input type="number" className="kgone-input" value={seed}
                disabled={useRandomSeed} style={useRandomSeed ? { opacity: 0.4 } : undefined}
                onChange={e => setSeed(Number(e.target.value))} />
            </div>

            <div className="kgone-row">
              <div className="kgone-field">
                <label className="kgone-label">Cover Strength</label>
                <input type="number" className="kgone-input" value={audioCoverStrength} min={0} max={1} step={0.05}
                  onChange={e => setAudioCoverStrength(Number(e.target.value))} />
                <div className="kgone-hint">0 = creative, 1 = faithful to source structure</div>
              </div>
              <div className="kgone-field">
                <label className="kgone-label">Noise Strength</label>
                <input type="number" className="kgone-input" value={coverNoiseStrength} min={0} max={1} step={0.05}
                  onChange={e => setCoverNoiseStrength(Number(e.target.value))} />
                <div className="kgone-hint">0 = pure style transfer, 0.1–0.25 recommended</div>
              </div>
            </div>

            <div className="kgone-checkbox-row">
              <input type="checkbox" id="kgone-remix-thinking" checked={thinking}
                onChange={e => setThinking(e.target.checked)} />
              <label htmlFor="kgone-remix-thinking">Thinking (CoT metadata generation)</label>
            </div>
          </Expander>

          {audioUrl && (
            <AudioPlayer
              src={audioUrl}
              dragData={taskIdRef.current ? {
                audioFileName: `KGOne_Remix_${taskIdRef.current}.mp3`,
              } : undefined}
            />
          )}

          {genStatus === 'done' && (
            <div className="kgone-hint">
              Drag the player above to an <strong>audio track</strong> to import the remix.
            </div>
          )}

          {genStatus === 'done' && audioUrl && (
            <>
              <button
                className="kgone-btn-generate"
                disabled={isImporting}
                onClick={handleImportAligned}
                style={{ marginTop: 0 }}
              >
                {isImporting && <FaCircleNotch className="kgone-spinner" />}
                {isImporting ? 'Importing...' : 'Import Aligned to Source'}
              </button>
              {importError && <div className="kgone-error-msg">{importError}</div>}
            </>
          )}

          {genStatus === 'error' && errorMsg && (
            <div className="kgone-error-msg">{errorMsg}</div>
          )}

          <button
            className="kgone-btn-generate"
            disabled={isGenerating || !caption.trim()}
            onClick={handleRemix}
          >
            {isGenerating && <FaCircleNotch className="kgone-spinner" />}
            {btnLabel()}
          </button>

          {genHint && <div className="kgone-gen-hint">{genHint}</div>}
        </>
      ) : (
        <div className="kgone-separator-hint">
          Select an audio region on the timeline to remix it.
          Only audio regions are supported — MIDI regions cannot be remixed.
        </div>
      )}

      <div className="kgone-powered-by">
        Powered by <a href="https://github.com/ace-step/ACE-Step-1.5" target="_blank" rel="noopener noreferrer">ACE-Step 1.5</a>
      </div>
    </>
  );
};

// ─── Repaint Tab ──────────────────────────────────────────────────────────────

const RepaintTab: React.FC = () => {
  const { selectedRegionIds, projectName, bpm, timeSignature, maxBars,
          isLooping, loopingRange, refreshProjectState } = useProjectStore();

  // Form state (mirrors FullSongTab)
  const [caption, setCaption] = useState('');
  const [lyrics, setLyrics] = useState('');
  const [instrumental, setInstrumental] = useState(false);
  const [inferenceSteps, setInferenceSteps] = useState(8);
  const [guidanceScale, setGuidanceScale] = useState(7.0);
  const [useRandomSeed, setUseRandomSeed] = useState(true);
  const [seed, setSeed] = useState(-1);
  const [thinking, setThinking] = useState(true);

  // Repaint-specific param
  const [repaintStrength, setRepaintStrength] = useState(0.5);

  // Generation state
  const [genStatus, setGenStatus] = useState<GenStatus>('idle');
  const [genHint, setGenHint] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [audioUrl, setAudioUrl] = useState<string | null>(null);

  // Import state
  const [isImporting, setIsImporting] = useState(false);
  const [importError, setImportError] = useState('');

  const abortRef = useRef<AbortController | null>(null);
  const taskIdRef = useRef<string>('');
  const originalRegionRef = useRef<{
    regionName: string;
    trackName: string;
    startFromBeat: number;
    trackIndex: number;
  } | null>(null);

  // Revoke blob URL on unmount
  useEffect(() => {
    return () => {
      abortRef.current?.abort();
      if (audioUrl) URL.revokeObjectURL(audioUrl);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

  const isGenerating = genStatus !== 'idle' && genStatus !== 'done' && genStatus !== 'error';

  // Computed repaint range in seconds (read-only display, derived from loop + region)
  const computedRepaintRange = useMemo(() => {
    if (!selectedAudioRegion || !isLooping) return null;
    const beatsPerBar = timeSignature.numerator;
    const secondsPerBeat = 60 / bpm;
    const regionStartBeat = selectedAudioRegion.region.getStartFromBeat();
    const clipStart = selectedAudioRegion.region.getClipStartOffsetSeconds();
    const fullDuration = selectedAudioRegion.region.getAudioDurationSeconds();
    const regionLengthSec = selectedAudioRegion.region.getLength() * secondsPerBeat;
    const effectiveDuration = Math.min(regionLengthSec, fullDuration - clipStart);
    const needsSlice = clipStart > 0.01 || effectiveDuration < fullDuration - 0.01;
    const uploadedDuration = needsSlice ? effectiveDuration : fullDuration;
    const loopStartBeat = loopingRange[0] * beatsPerBar;
    const loopEndBeat = (loopingRange[1] + 1) * beatsPerBar; // endBar is inclusive
    // Both sliced and non-sliced cases: uploaded audio time 0 ≈ regionStartBeat in the timeline
    const startRaw = (loopStartBeat - regionStartBeat) * secondsPerBeat;
    const endRaw = (loopEndBeat - regionStartBeat) * secondsPerBeat;
    const startClamped = Math.max(0, startRaw);
    const endClamped = Math.min(uploadedDuration, endRaw);
    return { startClamped, endClamped, uploadedDuration, hasIntersection: endClamped > startClamped };
  }, [selectedAudioRegion, isLooping, loopingRange, bpm, timeSignature]);

  const handleRepaint = useCallback(async () => {
    if (!selectedAudioRegion) return;

    // ── Validate loop state ────────────────────────────────────────────────────
    if (!isLooping) {
      await showAlert('Please enable loop mode on the toolbar and set a loop range to define the repaint window.');
      return;
    }

    // Re-compute range inline (fresh values independent of the display memo)
    const beatsPerBar = timeSignature.numerator;
    const secondsPerBeat = 60 / bpm;
    const regionStartBeat = selectedAudioRegion.region.getStartFromBeat();
    const clipStart = selectedAudioRegion.region.getClipStartOffsetSeconds();
    const fullDuration = selectedAudioRegion.region.getAudioDurationSeconds();
    const regionLengthSec = selectedAudioRegion.region.getLength() * secondsPerBeat;
    const effectiveDuration = Math.min(regionLengthSec, fullDuration - clipStart);
    const needsSlice = clipStart > 0.01 || effectiveDuration < fullDuration - 0.01;
    const uploadedDuration = needsSlice ? effectiveDuration : fullDuration;
    const loopStartBeat = loopingRange[0] * beatsPerBar;
    const loopEndBeat = (loopingRange[1] + 1) * beatsPerBar;
    const startClamped = Math.max(0, (loopStartBeat - regionStartBeat) * secondsPerBeat);
    const endClamped = Math.min(uploadedDuration, (loopEndBeat - regionStartBeat) * secondsPerBeat);

    if (endClamped <= startClamped) {
      await showAlert('The loop range does not overlap with the selected audio region. Please adjust the loop range to overlap with the region.');
      return;
    }

    const apiRepaintStart = startClamped;
    const apiRepaintEnd = endClamped >= uploadedDuration - 0.1 ? -1 : endClamped;

    // Capture snapshot before anything changes — selection may shift during generation
    originalRegionRef.current = {
      regionName: selectedAudioRegion.region.getName(),
      trackName: selectedAudioRegion.trackName,
      startFromBeat: selectedAudioRegion.region.getStartFromBeat(),
      trackIndex: selectedAudioRegion.trackIndex,
    };
    setImportError('');

    // Abort any in-flight request
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    const { signal } = ctrl;

    if (audioUrl) {
      URL.revokeObjectURL(audioUrl);
      setAudioUrl(null);
    }
    setErrorMsg('');

    try {
      const baseUrl = getKGOneBaseUrl();

      // ── 1. Load the fullsong model ──────────────────────────────────────────
      setGenStatus('loading-model');
      setGenHint('Loading model — this can take 60+ seconds, please wait...');

      const loadPayload = { model: 'fullsong' };
      kgoneLog('REQ', 'POST /v1/models/load', loadPayload);
      const loadResp = await fetch(`${baseUrl}/v1/models/load`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(loadPayload),
        signal,
      });

      if (!loadResp.ok) {
        const body = await loadResp.text().catch(() => '');
        kgoneLog('RES', `POST /v1/models/load → ${loadResp.status}`, body);
        throw new Error(`Model load failed (${loadResp.status}): ${body}`);
      }
      kgoneLog('RES', `POST /v1/models/load → ${loadResp.status}`, await loadResp.clone().json().catch(() => '(unparseable)'));

      if (signal.aborted) return;

      // ── 2. Load audio from OPFS and build multipart form ───────────────────
      setGenStatus('generating');
      setGenHint('Reading audio file...');

      const audioFileId = selectedAudioRegion.region.getAudioFileId();
      const audioFileName = selectedAudioRegion.region.getAudioFileName();
      const rawBuffer = await KGAudioFileStorage.loadAudioFile(projectName, audioFileId);

      let uploadBuffer: ArrayBuffer;
      let uploadFileName: string;
      let uploadMimeType: string;

      if (needsSlice) {
        setGenHint('Trimming audio to region range...');
        uploadBuffer = await sliceAudioToWav(rawBuffer, clipStart, effectiveDuration);
        uploadFileName = audioFileName.replace(/\.[^.]+$/, '.wav');
        uploadMimeType = 'audio/wav';
      } else {
        uploadBuffer = rawBuffer;
        uploadFileName = audioFileName;
        uploadMimeType = 'audio/mpeg';
      }

      const audioFile = new File([uploadBuffer], uploadFileName, { type: uploadMimeType });

      const formData = new FormData();
      formData.append('audio_file', audioFile, uploadFileName);
      formData.append('caption', caption);
      formData.append('lyrics', instrumental ? '' : lyrics);
      formData.append('instrumental', String(instrumental));
      formData.append('inference_steps', String(inferenceSteps));
      formData.append('guidance_scale', String(guidanceScale));
      formData.append('use_random_seed', String(useRandomSeed));
      formData.append('seed', String(seed));
      formData.append('thinking', String(thinking));
      formData.append('batch_size', '1');
      formData.append('audio_format', 'mp3');
      formData.append('repaint_strength', String(repaintStrength));
      formData.append('repainting_start', String(apiRepaintStart));
      formData.append('repainting_end', String(apiRepaintEnd));

      if (signal.aborted) return;

      setGenHint('Submitting repaint request...');

      kgoneLog('REQ', 'POST /v1/fullsong/repaint', {
        file: uploadFileName, caption, instrumental, inference_steps: inferenceSteps,
        guidance_scale: guidanceScale, use_random_seed: useRandomSeed, seed, thinking,
        repaint_strength: repaintStrength, repainting_start: apiRepaintStart, repainting_end: apiRepaintEnd,
      });
      const repaintResp = await fetch(`${baseUrl}/v1/fullsong/repaint`, {
        method: 'POST',
        body: formData,
        signal,
      });

      if (!repaintResp.ok) {
        const body = await repaintResp.text().catch(() => '');
        kgoneLog('RES', `POST /v1/fullsong/repaint → ${repaintResp.status}`, body);
        throw new Error(`Repaint request failed (${repaintResp.status}): ${body}`);
      }

      // Response shape: { "data": { "task_id": "...", ... }, "code": 200, ... }
      const repaintJson = (await repaintResp.json()) as { data: { task_id: string }; code: number };
      kgoneLog('RES', `POST /v1/fullsong/repaint → ${repaintResp.status}`, repaintJson);

      const task_id = repaintJson.data.task_id;
      taskIdRef.current = task_id;

      // ── 3. Poll for completion (same as FullSongTab) ───────────────────────
      setGenStatus('polling');
      setGenHint('Generating repaint...');

      type ResultItem = { progress: number; stage: string; status: number };
      type PollResponse = { data: Array<{ status: number; result: string }>; code: number };

       
      while (true) {
        if (signal.aborted) return;

        await new Promise<void>(r => {
          const t = setTimeout(r, 5000);
          signal.addEventListener('abort', () => { clearTimeout(t); r(); }, { once: true });
        });

        if (signal.aborted) return;

        kgoneLog('REQ', `GET /v1/fullsong/result/${task_id}`, null);
        const resultResp = await fetchWithRetry(`${baseUrl}/v1/fullsong/result/${task_id}`, { signal });

        const pollJson = (await resultResp.json()) as PollResponse;
        kgoneLog('RES', `GET /v1/fullsong/result/${task_id} → ${resultResp.status}`, pollJson);

        const outer = pollJson.data?.[0];
        if (!outer) continue;

        try {
          const inner = JSON.parse(outer.result) as ResultItem[];
          const item = inner[0];
          if (item) {
            const pct = Math.round((item.progress ?? 0) * 100);
            const stage = item.stage ?? '';
            setGenHint(stage ? `Generating repaint... ${pct}% — ${stage}` : `Generating repaint... ${pct}%`);
          }
        } catch {
          // result may be empty string while still queued — ignore parse errors
        }

        if (outer.status === 1) break;
      }

      // ── 4. Download the MP3 ─────────────────────────────────────────────────
      setGenStatus('downloading');
      setGenHint('Downloading audio...');

      kgoneLog('REQ', `GET /v1/fullsong/audio/${task_id}?index=0`, null);
      const audioResp = await fetchWithRetry(`${baseUrl}/v1/fullsong/audio/${task_id}?index=0`, { signal });

      const blob = await audioResp.blob();
      const url = URL.createObjectURL(blob);
      kgoneLog('RES', `GET /v1/fullsong/audio/${task_id}?index=0 → ${audioResp.status} (binary MP3)`, url);

      setAudioUrl(url);
      setGenStatus('done');
      setGenHint('');
    } catch (err) {
      if (signal.aborted) return;
      console.error('[KGOne] Repaint error:', err);
      setErrorMsg(err instanceof Error ? err.message : String(err));
      setGenStatus('error');
      setGenHint('');
    }
  }, [selectedAudioRegion, projectName, bpm, timeSignature, isLooping, loopingRange, caption, lyrics, instrumental, inferenceSteps, guidanceScale, useRandomSeed, seed, thinking, repaintStrength, audioUrl]);

  const handleImportAligned = useCallback(async () => {
    const snap = originalRegionRef.current;
    if (!snap || !audioUrl) return;

    setIsImporting(true);
    setImportError('');

    try {
      const audioContext = Tone.getContext().rawContext as AudioContext;

      const blob = await fetch(audioUrl).then(r => r.blob());
      const fileName = `KGOne_Repaint_${taskIdRef.current || Date.now()}.mp3`;
      const fileId = `kgone_repaint_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
      const audioFile = new File([blob], fileName, { type: 'audio/mpeg' });

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

      const project = KGCore.instance().getCurrentProject();
      const count = countRepaintTracks(snap.trackName) + 1;
      const stemEntry: StemImportEntry = {
        trackName: `${snap.trackName} - repaint (${count})`,
        regionName: `${snap.regionName} - repaint (${count})`,
        audioFileId: fileId,
        audioFileName: fileName,
        audioDurationSeconds: toneBuffer.duration,
        toneBuffer,
      };

      const cmd = new ImportStemsCommand(
        project.getTracks().length,
        snap.trackIndex,
        snap.startFromBeat,
        [stemEntry],
        maxBars,
      );
      KGCore.instance().executeCommand(cmd);
      refreshProjectState();
    } catch (err) {
      setImportError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsImporting(false);
    }
  }, [audioUrl, projectName, maxBars, refreshProjectState]);

  const btnLabel = () => {
    switch (genStatus) {
      case 'loading-model': return 'Loading model...';
      case 'generating': return 'Preparing upload...';
      case 'polling': return 'Processing repaint...';
      case 'downloading': return 'Downloading...';
      default: return 'Generate Repaint';
    }
  };

  return (
    <>
      {selectedAudioRegion ? (
        <>
          <div className="kgone-region-info">
            <div className="kgone-region-info-label">Selected Region</div>
            <div className="kgone-region-info-value">{selectedAudioRegion.region.getName()}</div>
            <div className="kgone-region-info-label" style={{ marginTop: 4 }}>Track</div>
            <div className="kgone-region-info-value">{selectedAudioRegion.trackName}</div>
          </div>

          <div className="kgone-region-info">
            <div className="kgone-region-info-label">Repaint Range</div>
            {!isLooping ? (
              <div className="kgone-region-info-value" style={{ opacity: 0.6 }}>
                Loop mode is off. Enable the loop button on the toolbar and set a loop range to define the repaint window.
              </div>
            ) : computedRepaintRange ? (
              <>
                <div className="kgone-region-info-label" style={{ marginTop: 4 }}>Start</div>
                <div className="kgone-region-info-value">{computedRepaintRange.startClamped.toFixed(2)} s</div>
                <div className="kgone-region-info-label" style={{ marginTop: 4 }}>End</div>
                <div className="kgone-region-info-value">
                  {computedRepaintRange.endClamped >= computedRepaintRange.uploadedDuration - 0.1
                    ? 'until end of audio'
                    : `${computedRepaintRange.endClamped.toFixed(2)} s`}
                </div>
              </>
            ) : null}
          </div>

          <div className="kgone-field">
            <label className="kgone-label">Caption</label>
            <textarea
              className="kgone-textarea"
              value={caption}
              onChange={e => setCaption(e.target.value)}
              placeholder="e.g. Genre: Jazz, Style: Smooth and mellow, Instrumentation: piano, upright bass, brushed drums..."
              rows={5}
            />
            <div className="kgone-hint">
              Describe the target style and instrumentation for the repainted section.
            </div>
          </div>

          <div className="kgone-field">
            <label className="kgone-label">Lyrics</label>
            <textarea
              className="kgone-textarea"
              value={lyrics}
              onChange={e => setLyrics(e.target.value)}
              placeholder={"[Verse 1]\nYour lyrics here...\n\n[Chorus]\n..."}
              rows={6}
              disabled={instrumental}
              style={instrumental ? { opacity: 0.4 } : undefined}
            />
            <div className="kgone-hint">
              Leave empty to keep the original lyrics, or provide new ones for the repainted section.
            </div>
          </div>

          <div className="kgone-checkbox-row">
            <input type="checkbox" id="kgone-repaint-instrumental" checked={instrumental}
              onChange={e => setInstrumental(e.target.checked)} />
            <label htmlFor="kgone-repaint-instrumental">Instrumental (no vocals)</label>
          </div>

          <Expander label="Advanced Settings">
            <div className="kgone-row">
              <div className="kgone-field">
                <label className="kgone-label">Inference Steps</label>
                <input type="number" className="kgone-input" value={inferenceSteps} min={1} max={200}
                  onChange={e => setInferenceSteps(Number(e.target.value))} />
              </div>
              <div className="kgone-field">
                <label className="kgone-label">Guidance Scale</label>
                <input type="number" className="kgone-input" value={guidanceScale} min={0} max={20} step={0.1}
                  onChange={e => setGuidanceScale(Number(e.target.value))} />
              </div>
            </div>

            <div className="kgone-checkbox-row">
              <input type="checkbox" id="kgone-repaint-use-random-seed" checked={useRandomSeed}
                onChange={e => setUseRandomSeed(e.target.checked)} />
              <label htmlFor="kgone-repaint-use-random-seed">Use Random Seed</label>
            </div>

            <div className="kgone-field">
              <label className="kgone-label">Seed</label>
              <input type="number" className="kgone-input" value={seed}
                disabled={useRandomSeed} style={useRandomSeed ? { opacity: 0.4 } : undefined}
                onChange={e => setSeed(Number(e.target.value))} />
            </div>

            <div className="kgone-field">
              <label className="kgone-label">Repaint Strength</label>
              <input type="number" className="kgone-input" value={repaintStrength} min={0} max={1} step={0.05}
                onChange={e => setRepaintStrength(Number(e.target.value))} />
              <div className="kgone-hint">0 = preserve original, 1 = full regeneration</div>
            </div>

            <div className="kgone-checkbox-row">
              <input type="checkbox" id="kgone-repaint-thinking" checked={thinking}
                onChange={e => setThinking(e.target.checked)} />
              <label htmlFor="kgone-repaint-thinking">Thinking (CoT metadata generation)</label>
            </div>
          </Expander>

          {audioUrl && (
            <AudioPlayer
              src={audioUrl}
              dragData={taskIdRef.current ? {
                audioFileName: `KGOne_Repaint_${taskIdRef.current}.mp3`,
              } : undefined}
            />
          )}

          {genStatus === 'done' && (
            <div className="kgone-hint">
              Drag the player above to an <strong>audio track</strong> to import the repaint.
            </div>
          )}

          {genStatus === 'done' && audioUrl && (
            <>
              <button
                className="kgone-btn-generate"
                disabled={isImporting}
                onClick={handleImportAligned}
                style={{ marginTop: 0 }}
              >
                {isImporting && <FaCircleNotch className="kgone-spinner" />}
                {isImporting ? 'Importing...' : 'Import Aligned to Source'}
              </button>
              {importError && <div className="kgone-error-msg">{importError}</div>}
            </>
          )}

          {genStatus === 'error' && errorMsg && (
            <div className="kgone-error-msg">{errorMsg}</div>
          )}

          <button
            className="kgone-btn-generate"
            disabled={isGenerating || !caption.trim()}
            onClick={handleRepaint}
          >
            {isGenerating && <FaCircleNotch className="kgone-spinner" />}
            {btnLabel()}
          </button>

          {genHint && <div className="kgone-gen-hint">{genHint}</div>}
        </>
      ) : (
        <div className="kgone-separator-hint">
          Select an audio region on the timeline to repaint it.
          Only audio regions are supported — MIDI regions cannot be repainted.
        </div>
      )}

      <div className="kgone-powered-by">
        Powered by <a href="https://github.com/ace-step/ACE-Step-1.5" target="_blank" rel="noopener noreferrer">ACE-Step 1.5</a>
      </div>
    </>
  );
};

// ─── Main Panel ───────────────────────────────────────────────────────────────

interface KGOnePanelProps {
  isVisible: boolean;
}

const KGOnePanel: React.FC<KGOnePanelProps> = ({ isVisible }) => {
  const [activeTab, setActiveTab] = useState<Tab>('fullsong');
  const { bpm, keySignature } = useProjectStore();

  return (
    <div className={`kgone-panel${isVisible ? '' : ' is-hidden'}`}>
      <div className="kgone-panel-header">
        <h3>K.G.One Music Generator</h3>
      </div>

      <div className="kgone-tabs">
        {/* Clip tab temporarily disabled, will enable in the future */}
        {(['fullsong', 'remix', 'repaint', 'separator'] as const).map(tab => (
          <button
            key={tab}
            className={`kgone-tab${activeTab === tab ? ' active' : ''}`}
            onClick={() => setActiveTab(tab)}
          >
            {tab === 'fullsong' ? 'Full Song'
              : tab === 'remix' ? 'Remix'
              : tab === 'repaint' ? 'Repaint'
              : 'Separator'}
          </button>
        ))}
      </div>

      <div className="kgone-panel-body">
        {/* Clip tab temporarily disabled, will enable in the future */}
        {activeTab === 'clip' && <ClipTab bpm={bpm} keySignature={keySignature} />}
        {activeTab === 'fullsong' && <FullSongTab />}
        {activeTab === 'remix' && <RemixTab />}
        {activeTab === 'repaint' && <RepaintTab />}
        {activeTab === 'separator' && <SeparatorTab />}
      </div>
    </div>
  );
};

export default KGOnePanel;
