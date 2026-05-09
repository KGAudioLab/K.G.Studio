import * as Tone from 'tone';

export interface AudioRecordingPeak {
  min: number;
  max: number;
}

export interface AudioRecordingResult {
  blob: Blob;
  mimeType: string;
  durationSeconds: number;
  peaks: AudioRecordingPeak[];
}

export interface AudioRecordingStartResult {
  usedDeviceId: string;
  fellBackToDefault: boolean;
}

export class KGAudioRecorder {
  private static readonly DEBUG_LOG_PREFIX = '[KGAudioRecorder]';
  private static readonly PEAK_LOG_EVERY_FRAMES = 20;

  private mediaStream: MediaStream | null = null;
  private mediaRecorder: MediaRecorder | null = null;
  private audioSource: MediaStreamAudioSourceNode | null = null;
  private analyserNode: AnalyserNode | null = null;
  private peakPollIntervalId: number | null = null;
  private chunks: Blob[] = [];
  private peaks: AudioRecordingPeak[] = [];
  private recordingStartedAtMs: number | null = null;
  private onPeaks: ((peaks: AudioRecordingPeak[]) => void) | null = null;
  private peakFrameCount: number = 0;

  public async start(
    inputDeviceId: string = 'default',
    onPeaks?: (peaks: AudioRecordingPeak[]) => void
  ): Promise<AudioRecordingStartResult> {
    if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
      throw new Error('Audio recording is already in progress.');
    }

    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error('This browser does not support microphone recording.');
    }

    if (typeof MediaRecorder === 'undefined') {
      throw new Error('This browser does not support MediaRecorder.');
    }

    this.cleanup(false);

    this.onPeaks = onPeaks ?? null;
    this.chunks = [];
    this.peaks = [];
    this.peakFrameCount = 0;

    let stream: MediaStream;
    let usedDeviceId = inputDeviceId;
    let fellBackToDefault = false;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: inputDeviceId === 'default'
          ? true
          : { deviceId: { exact: inputDeviceId } },
      });
    } catch (error) {
      if (inputDeviceId === 'default') {
        throw error;
      }

      console.warn(`${KGAudioRecorder.DEBUG_LOG_PREFIX} selected input unavailable, retrying default input`, {
        inputDeviceId,
        error,
      });
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      usedDeviceId = 'default';
      fellBackToDefault = true;
    }

    this.mediaStream = stream;
    this.logInputTracks(stream);

    const audioContext = Tone.getContext().rawContext as AudioContext;
    this.audioSource = audioContext.createMediaStreamSource(stream);
    this.analyserNode = audioContext.createAnalyser();
    this.analyserNode.fftSize = 2048;
    this.audioSource.connect(this.analyserNode);

    const mimeType = this.getPreferredMimeType();
    this.mediaRecorder = mimeType
      ? new MediaRecorder(stream, { mimeType })
      : new MediaRecorder(stream);
    console.info(
      `${KGAudioRecorder.DEBUG_LOG_PREFIX} MediaRecorder created`,
      {
        mimeType: this.mediaRecorder.mimeType || mimeType || 'browser-default',
        audioContextState: audioContext.state,
        sampleRate: audioContext.sampleRate,
      }
    );
    this.mediaRecorder.ondataavailable = (event: BlobEvent) => {
      if (event.data.size > 0) {
        this.chunks.push(event.data);
        console.info(
          `${KGAudioRecorder.DEBUG_LOG_PREFIX} dataavailable`,
          { chunkBytes: event.data.size, totalChunks: this.chunks.length }
        );
      }
    };
    this.mediaRecorder.onerror = (event) => {
      console.error(`${KGAudioRecorder.DEBUG_LOG_PREFIX} MediaRecorder error`, event);
    };

    this.mediaRecorder.start(250);
    this.recordingStartedAtMs = performance.now();
    console.info(`${KGAudioRecorder.DEBUG_LOG_PREFIX} recording started`);
    this.startPeakPolling();
    return {
      usedDeviceId,
      fellBackToDefault,
    };
  }

  public async stop(): Promise<AudioRecordingResult | null> {
    const recorder = this.mediaRecorder;
    if (!recorder) {
      return null;
    }

    if (recorder.state === 'inactive') {
      const blob = this.chunks.length > 0
        ? new Blob(this.chunks, { type: recorder.mimeType || 'audio/webm' })
        : null;
      const durationSeconds = this.recordingStartedAtMs === null
        ? 0
        : Math.max(0, (performance.now() - this.recordingStartedAtMs) / 1000);
      this.cleanup(false);
      console.info(
        `${KGAudioRecorder.DEBUG_LOG_PREFIX} stop requested on inactive recorder`,
        { blobBytes: blob?.size ?? 0, peakFrames: this.peaks.length, durationSeconds }
      );
      return blob
        ? { blob, mimeType: blob.type || recorder.mimeType || 'audio/webm', durationSeconds, peaks: [...this.peaks] }
        : null;
    }

    return await new Promise<AudioRecordingResult | null>((resolve) => {
      const handleStop = () => {
        recorder.removeEventListener('stop', handleStop);
        this.capturePeakFrame();
        const mimeType = recorder.mimeType || 'audio/webm';
        const blob = new Blob(this.chunks, { type: mimeType });
        const durationSeconds = this.recordingStartedAtMs === null
          ? 0
          : Math.max(0, (performance.now() - this.recordingStartedAtMs) / 1000);
        const peaks = [...this.peaks];
        console.info(
          `${KGAudioRecorder.DEBUG_LOG_PREFIX} recording stopped`,
          {
            mimeType,
            blobBytes: blob.size,
            peakFrames: peaks.length,
            durationSeconds,
          }
        );
        this.cleanup(false);
        resolve(blob.size > 0 ? { blob, mimeType: blob.type || mimeType, durationSeconds, peaks } : null);
      };

      recorder.addEventListener('stop', handleStop, { once: true });
      recorder.stop();
    });
  }

  public async cancel(): Promise<void> {
    const recorder = this.mediaRecorder;
    if (recorder && recorder.state !== 'inactive') {
      await new Promise<void>((resolve) => {
        recorder.addEventListener('stop', () => resolve(), { once: true });
        recorder.stop();
      });
    }

    this.cleanup(false);
  }

  private startPeakPolling(): void {
    this.stopPeakPolling();
    this.peakPollIntervalId = window.setInterval(() => {
      this.capturePeakFrame();
    }, 50);
  }

  private stopPeakPolling(): void {
    if (this.peakPollIntervalId !== null) {
      window.clearInterval(this.peakPollIntervalId);
      this.peakPollIntervalId = null;
    }
  }

  private capturePeakFrame(): void {
    if (!this.analyserNode) {
      return;
    }

    const buffer = new Float32Array(this.analyserNode.fftSize);
    this.analyserNode.getFloatTimeDomainData(buffer);

    let min = 1;
    let max = -1;
    for (const sample of buffer) {
      if (sample < min) min = sample;
      if (sample > max) max = sample;
    }

    this.peaks.push({ min, max });
    this.peakFrameCount += 1;

    if (this.peakFrameCount === 1 || this.peakFrameCount % KGAudioRecorder.PEAK_LOG_EVERY_FRAMES === 0) {
      console.info(
        `${KGAudioRecorder.DEBUG_LOG_PREFIX} analyser peak`,
        {
          frame: this.peakFrameCount,
          min: Number(min.toFixed(4)),
          max: Number(max.toFixed(4)),
          span: Number((max - min).toFixed(4)),
        }
      );
    }

    this.onPeaks?.([...this.peaks]);
  }

  private getPreferredMimeType(): string | undefined {
    const candidates = [
      'audio/webm;codecs=opus',
      'audio/ogg;codecs=opus',
      'audio/mp4',
      'audio/webm',
    ];

    return candidates.find(type => typeof MediaRecorder.isTypeSupported === 'function' && MediaRecorder.isTypeSupported(type));
  }

  private cleanup(resetPeaks: boolean): void {
    this.stopPeakPolling();

    if (this.audioSource) {
      this.audioSource.disconnect();
      this.audioSource = null;
    }

    if (this.analyserNode) {
      this.analyserNode.disconnect();
      this.analyserNode = null;
    }

    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach(track => track.stop());
      this.mediaStream = null;
    }

    this.mediaRecorder = null;
    this.recordingStartedAtMs = null;
    this.onPeaks = null;
    this.peakFrameCount = 0;

    if (resetPeaks) {
      this.peaks = [];
      this.chunks = [];
    }
  }

  private logInputTracks(stream: MediaStream): void {
    const tracks = stream.getAudioTracks();
    console.info(
      `${KGAudioRecorder.DEBUG_LOG_PREFIX} acquired audio stream`,
      tracks.map(track => ({
        id: track.id,
        label: track.label,
        enabled: track.enabled,
        muted: track.muted,
        readyState: track.readyState,
        settings: typeof track.getSettings === 'function' ? track.getSettings() : {},
      }))
    );
  }
}
