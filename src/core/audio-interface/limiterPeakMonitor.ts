import * as Tone from 'tone';

export interface LimiterLevel { time: number; peakDb: number; reductionDb: number }
export interface LimiterMonitor { readonly closed: boolean; dispose(): void }
const modules = new WeakMap<Tone.BaseContext, Promise<void>>();

export async function loadLimiterMeter(context: Tone.BaseContext): Promise<void> {
  let pending = modules.get(context);
  if (!pending) {
    pending = context.rawContext.audioWorklet.addModule(`${import.meta.env.BASE_URL}worklets/limiter-peak-meter.js`);
    modules.set(context, pending);
    void pending.catch(() => modules.delete(context));
  }
  await pending;
}

/** Capture stereo peaks without mono downmix cancellation or gaps between UI frames. */
export function createLimiterMonitor(context: Tone.BaseContext, source: Tone.ToneAudioNode,
  fps: number, reduction: () => number, onLevel: (level: LimiterLevel) => void,
  onDispose: () => void): LimiterMonitor {
  const node = context.createAudioWorkletNode('kg-limiter-peak-meter', {
    numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [1], processorOptions: { fps },
  });
  // Pull the monitor continuously while adding only silence to the destination.
  const sink = new Tone.Gain({ context, gain: 0 }).toDestination();
  let closed = false;
  node.port.onmessage = event => {
    if (closed) return;
    const { peak, time } = event.data as { peak: number; time: number };
    onLevel({ time, peakDb: peak > 0 ? 20 * Math.log10(peak) : -Infinity, reductionDb: reduction() });
  };
  source.connect(node);
  Tone.connect(node, sink);
  return {
    get closed() { return closed; },
    dispose() {
      if (closed) return;
      closed = true;
      source.disconnect(node);
      node.port.onmessage = null;
      node.port.postMessage('stop');
      node.port.close();
      node.disconnect();
      sink.dispose();
      onDispose();
    },
  };
}
