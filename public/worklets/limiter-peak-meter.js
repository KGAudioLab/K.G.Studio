/* A silent parallel monitor: audio processing stays in the original FX chain. */
class LimiterPeakMeter extends AudioWorkletProcessor {
  constructor(options) {
    super();
    this.interval = Math.max(1, Math.round(sampleRate / options.processorOptions.fps));
    this.frames = 0;
    this.peak = 0;
    this.running = true;
    this.port.onmessage = () => { this.running = false; };
  }

  process(inputs) {
    if (!this.running) return false;
    const channels = inputs[0];
    const length = channels[0]?.length ?? 128;
    for (let frame = 0; frame < length; frame++) {
      for (let channel = 0; channel < channels.length; channel++) {
        this.peak = Math.max(this.peak, Math.abs(channels[channel][frame]));
      }
      if (++this.frames >= this.interval) {
        this.port.postMessage({ peak: this.peak, time: currentTime + (frame + 1) / sampleRate });
        this.frames = 0;
        this.peak = 0;
      }
    }
    // The default output buffer is silence, used only to keep the monitor running.
    return true;
  }
}
registerProcessor('kg-limiter-peak-meter', LimiterPeakMeter);
