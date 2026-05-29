import React, { useCallback, useEffect, useRef } from 'react';
import * as Tone from 'tone';
import { KGAudioRegion } from '../../core/region/KGAudioRegion';
import { KGAudioInterface } from '../../core/audio-interface/KGAudioInterface';
import { KGAudioFileStorage } from '../../core/io/KGAudioFileStorage';
import { KGCore } from '../../core/KGCore';
import { beatRangeToSeconds } from '../../util/globalTrackUtil';

interface AudioWaveformCanvasProps {
  audioRegion: KGAudioRegion;
  trackId: string;
  projectName: string;
  zoom: number;
}

const LIGHT_ROW_COLOR = '#4a4a4a';
const DARK_ROW_COLOR = '#282828';
const BASE_BEAT_WIDTH = 40;

const AudioWaveformCanvas: React.FC<AudioWaveformCanvasProps> = ({
  audioRegion,
  trackId,
  projectName,
  zoom,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const audioBufferRef = useRef<AudioBuffer | null>(null);

  const drawWaveform = useCallback((audioBuffer: AudioBuffer) => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }

    const context = canvas.getContext('2d');
    if (!context) {
      return;
    }

    const project = KGCore.instance().getCurrentProject();
    const regionStartBeat = audioRegion.getStartFromBeat();
    const regionEndBeat = regionStartBeat + audioRegion.getLength();
    const clipStartOffsetSeconds = audioRegion.getClipStartOffsetSeconds();
    const visibleDurationSeconds = Math.min(
      beatRangeToSeconds(project, regionStartBeat, regionEndBeat),
      Math.max(0, audioRegion.getAudioDurationSeconds() - clipStartOffsetSeconds),
    );

    const zoomedBeatWidth = BASE_BEAT_WIDTH * zoom;
    const renderWidth = Math.max(1, Math.ceil(audioRegion.getLength() * zoomedBeatWidth));
    const parentHeight = canvas.parentElement?.clientHeight ?? 0;
    const canvasHeight = Math.max(160, parentHeight || canvas.clientHeight || 320);
    const centerY = canvasHeight / 2;
    const amplitudeScale = canvasHeight * 0.42;

    canvas.width = renderWidth;
    canvas.height = canvasHeight;
    canvas.style.width = `${renderWidth}px`;
    canvas.style.height = `${canvasHeight}px`;

    context.clearRect(0, 0, renderWidth, canvasHeight);
    context.fillStyle = DARK_ROW_COLOR;
    context.fillRect(0, 0, renderWidth, canvasHeight);

    const channelData = audioBuffer.getChannelData(0);
    const totalSamples = channelData.length;
    const sampleRate = audioBuffer.sampleRate;
    const renderStartSample = Math.max(0, Math.min(totalSamples, Math.floor(clipStartOffsetSeconds * sampleRate)));
    const renderEndSample = Math.max(
      renderStartSample,
      Math.min(totalSamples, renderStartSample + Math.floor(visibleDurationSeconds * sampleRate)),
    );
    const renderSampleCount = renderEndSample - renderStartSample;

    if (renderSampleCount <= 0) {
      return;
    }

    const samplesPerPixel = Math.max(1, Math.ceil(renderSampleCount / renderWidth));

    for (let x = 0; x < renderWidth; x++) {
      const startSample = renderStartSample + (x * samplesPerPixel);
      const endSample = Math.min(renderEndSample, startSample + samplesPerPixel);

      let min = 1;
      let max = -1;
      for (let sampleIndex = startSample; sampleIndex < endSample; sampleIndex++) {
        const sample = channelData[sampleIndex];
        if (sample < min) min = sample;
        if (sample > max) max = sample;
      }

      const topHeight = Math.max(1, Math.abs(max) * amplitudeScale);
      const bottomHeight = Math.max(1, Math.abs(min) * amplitudeScale);

      context.fillStyle = LIGHT_ROW_COLOR;
      context.fillRect(x, centerY - topHeight, 1, topHeight);
      context.fillRect(x, centerY, 1, bottomHeight);
    }
  }, [audioRegion]);

  useEffect(() => {
    let cancelled = false;

    const loadAndDraw = async () => {
      try {
        let audioBuffer = KGAudioInterface.instance().getAudioBuffer(trackId, audioRegion.getAudioFileId());
        if (!audioBuffer) {
          const arrayBuffer = await KGAudioFileStorage.loadAudioFile(projectName, audioRegion.getAudioFileId());
          if (cancelled) {
            return;
          }
          const audioContext = Tone.getContext().rawContext as AudioContext;
          audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
        }

      if (cancelled || !audioBuffer) {
          return;
        }

        audioBufferRef.current = audioBuffer;
        drawWaveform(audioBuffer);
      } catch (error) {
        if (!cancelled) {
          console.error('AudioWaveformCanvas: failed to render waveform', error);
        }
      }
    };

    void loadAndDraw();

    return () => {
      cancelled = true;
    };
  }, [audioRegion, drawWaveform, projectName, trackId]);

  useEffect(() => {
    const parent = canvasRef.current?.parentElement;
    if (!parent) {
      return;
    }

    const resizeObserver = new ResizeObserver(() => {
      if (audioBufferRef.current) {
        drawWaveform(audioBufferRef.current);
      }
    });

    resizeObserver.observe(parent);
    return () => resizeObserver.disconnect();
  }, [drawWaveform]);

  return (
    <canvas
      ref={canvasRef}
      data-testid="audio-waveform-canvas"
      style={{
        position: 'absolute',
        top: 0,
        left: `${audioRegion.getStartFromBeat() * BASE_BEAT_WIDTH * zoom}px`,
        zIndex: 0,
        pointerEvents: 'none',
      }}
    />
  );
};

export default AudioWaveformCanvas;
