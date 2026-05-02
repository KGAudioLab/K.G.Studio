import React, { useCallback, useEffect, useRef, useState } from 'react';
import * as Tone from 'tone';
import { KGAudioRegion } from '../../core/region/KGAudioRegion';
import { KGAudioInterface } from '../../core/audio-interface/KGAudioInterface';
import { KGAudioFileStorage } from '../../core/io/KGAudioFileStorage';
import type { SpectrogramRequest, SpectrogramResult } from '../../workers/spectrogramWorker';

interface SpectrogramCanvasProps {
  audioRegion: KGAudioRegion;
  trackId: string;
  projectName: string;
  bpm: number;
  thresholdDb: number;
  power: number;
  zoom: number;
}

const PITCH_BINS = 128;
const HOP_SIZE = 1024;

// Piecewise-linear RGB colormap: black → dark blue → blue → purple → red → orange → yellow
// Hue rotates 240°→300°→0°→60°, bypassing green entirely.
const COLORMAP_STOPS: Array<[number, [number, number, number]]> = [
  [0.00, [  0,   0,   0]],
  [0.15, [  0,   0, 180]],
  [0.35, [  0,  60, 255]],
  [0.55, [180,   0, 120]],
  [0.70, [255,   0,   0]],
  [0.85, [255, 140,   0]],
  [1.00, [255, 255,   0]],
];

function hotColormap(v: number): [number, number, number] {
  v = Math.max(0, Math.min(1, v));
  for (let i = 0; i < COLORMAP_STOPS.length - 1; i++) {
    const [t0, c0] = COLORMAP_STOPS[i];
    const [t1, c1] = COLORMAP_STOPS[i + 1];
    if (v <= t1) {
      const t = (v - t0) / (t1 - t0);
      return [
        Math.round(c0[0] + t * (c1[0] - c0[0])),
        Math.round(c0[1] + t * (c1[1] - c0[1])),
        Math.round(c0[2] + t * (c1[2] - c0[2])),
      ];
    }
  }
  return COLORMAP_STOPS[COLORMAP_STOPS.length - 1][1];
}

const SpectrogramCanvas: React.FC<SpectrogramCanvasProps> = ({
  audioRegion,
  trackId,
  projectName,
  bpm,
  thresholdDb,
  power,
  zoom,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [loading, setLoading] = useState(true);
  const workerRef = useRef<Worker | null>(null);

  // Cache the raw linear result so threshold/power changes re-render without re-running FFT
  const rawResultRef = useRef<SpectrogramResult | null>(null);
  const sampleRateRef = useRef<number>(44100);
  const regionDurationRef = useRef<number>(0);
  // Natural (1x) canvas pixel width — set after each draw, used to apply zoom as CSS stretch
  const naturalWidthRef = useRef<number>(0);
  // Always-current zoom without making it a renderSpectrogram dependency
  const zoomRef = useRef(zoom);
  useEffect(() => { zoomRef.current = zoom; }, [zoom]);

  const renderSpectrogram = useCallback((
    result: SpectrogramResult,
    sampleRate: number,
    regionDurationSeconds: number,
    thresholdDb: number,
    power: number,
  ) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const noteHeight =
      parseInt(getComputedStyle(document.documentElement).getPropertyValue('--region-piano-key-height')) || 20;

    const totalBeats = (regionDurationSeconds * bpm) / 60;
    // Always draw at 1x resolution; zoom is applied as CSS width stretch
    const canvasWidth = Math.ceil(totalBeats * 40);
    const canvasHeight = PITCH_BINS * noteHeight;

    // Convert dB threshold to linear: values below this → black
    const linearThreshold = Math.pow(10, thresholdDb / 20);

    // 1. Paint at natural STFT resolution onto an offscreen canvas (timeSteps × 128).
    //    Row i = pitchIndex i = pitch (107 − i). Apply threshold then power curve.
    const offscreen = document.createElement('canvas');
    offscreen.width = result.timeSteps;
    offscreen.height = PITCH_BINS;
    const offCtx = offscreen.getContext('2d');
    if (!offCtx) return;

    const imgData = offCtx.createImageData(result.timeSteps, PITCH_BINS);
    const pixels = imgData.data;

    for (let row = 0; row < PITCH_BINS; row++) {
      const pitch = 107 - row;
      for (let col = 0; col < result.timeSteps; col++) {
        const idx = (row * result.timeSteps + col) * 4;
        pixels[idx + 3] = 255; // always opaque

        if (pitch < 12 || pitch > 107) continue; // outside range → black

        const raw = result.data[col * PITCH_BINS + pitch];

        // Hard threshold: values below noise floor → 0 (black)
        // Re-scale surviving range to [0,1] then apply power curve
        const gated = raw < linearThreshold
          ? 0
          : Math.pow((raw - linearThreshold) / (1 - linearThreshold), power);

        if (gated <= 0) continue; // stays black

        const [r, g, b] = hotColormap(gated);
        pixels[idx]     = r;
        pixels[idx + 1] = g;
        pixels[idx + 2] = b;
      }
    }

    offCtx.putImageData(imgData, 0, 0);

    // 2. Stretch onto the full canvas — browser bilinear filter smooths between bins.
    canvas.width = canvasWidth;
    canvas.height = canvasHeight;
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(offscreen, 0, 0, canvasWidth, canvasHeight);

    // Store natural width and apply current zoom as CSS stretch (no pixel recompute on zoom)
    naturalWidthRef.current = canvasWidth;
    canvas.style.width = `${canvasWidth * zoomRef.current}px`;
    canvas.style.height = `${canvasHeight}px`;
  }, [bpm]);

  // Re-render without re-running the worker when threshold or power changes
  useEffect(() => {
    if (rawResultRef.current) {
      renderSpectrogram(
        rawResultRef.current,
        sampleRateRef.current,
        regionDurationRef.current,
        thresholdDb,
        power,
      );
    }
  }, [thresholdDb, power, renderSpectrogram]);

  // Zoom changes: stretch width only, pin height to canvas pixel height
  useEffect(() => {
    if (canvasRef.current && naturalWidthRef.current > 0) {
      canvasRef.current.style.width = `${naturalWidthRef.current * zoom}px`;
      canvasRef.current.style.height = `${canvasRef.current.height}px`;
    }
  }, [zoom]);

  // Load audio + run worker when the audio region itself changes
  useEffect(() => {
    let cancelled = false;

    const compute = async () => {
      setLoading(true);
      workerRef.current?.terminate();
      workerRef.current = null;

      try {
        let audioBuffer: AudioBuffer | undefined = KGAudioInterface.instance().getAudioBuffer(
          trackId,
          audioRegion.getAudioFileId()
        );

        if (!audioBuffer) {
          const arrayBuffer = await KGAudioFileStorage.loadAudioFile(
            projectName,
            audioRegion.getAudioFileId()
          );
          if (cancelled) return;
          const actx = Tone.getContext().rawContext as AudioContext;
          audioBuffer = await actx.decodeAudioData(arrayBuffer);
        }

        if (cancelled) return;

        const pcm = audioBuffer.getChannelData(0);
        const sampleRate = audioBuffer.sampleRate;
        const regionDurationSeconds = (audioRegion.getLength() * 60) / bpm;

        const worker = new Worker(
          new URL('../../workers/spectrogramWorker.ts', import.meta.url),
          { type: 'module' }
        );
        workerRef.current = worker;

        worker.onmessage = (e: MessageEvent<SpectrogramResult>) => {
          if (cancelled) { worker.terminate(); return; }
          rawResultRef.current = e.data;
          sampleRateRef.current = sampleRate;
          regionDurationRef.current = regionDurationSeconds;
          renderSpectrogram(e.data, sampleRate, regionDurationSeconds, thresholdDb, power);
          setLoading(false);
          worker.terminate();
          workerRef.current = null;
        };

        const request: SpectrogramRequest = {
          pcm: pcm.slice(0) as Float32Array,
          sampleRate,
          clipStartOffsetSeconds: audioRegion.getClipStartOffsetSeconds(),
          regionDurationSeconds,
          bpm,
        };
        worker.postMessage(request, [request.pcm.buffer]);
      } catch (err) {
        if (!cancelled) {
          console.error('SpectrogramCanvas: failed to compute spectrogram', err);
          setLoading(false);
        }
      }
    };

    compute();

    return () => {
      cancelled = true;
      workerRef.current?.terminate();
      workerRef.current = null;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [audioRegion, trackId, projectName, bpm]);

  return (
    <>
      <canvas
        ref={canvasRef}
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          zIndex: 0,
          pointerEvents: 'none',
        }}
      />
      {loading && (
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            zIndex: 1,
            padding: '6px 10px',
            background: 'rgba(0,0,0,0.6)',
            color: '#aaa',
            fontSize: '11px',
            pointerEvents: 'none',
          }}
        >
          Computing spectrogram…
        </div>
      )}
    </>
  );
};

export default SpectrogramCanvas;
