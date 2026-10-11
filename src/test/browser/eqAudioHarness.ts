import 'reflect-metadata';
import * as Tone from 'tone';
import { KGEQFX, KGLimiterFX, KGCompressorFX } from '../../core/fx';
import { KGTrackFXChain } from '../../core/audio-interface/KGTrackFXChain';
import { previewResponseDb } from '../../components/fx/eqPreview';

declare global {
  interface Window {
    renderEQFixture: (options: { band: number; gain: number; frequency: number; q?: number;
      bypass?: boolean; copies?: number; sampleRate?: number; edit?: boolean; remove?: boolean }) => Promise<{ gainDb: number; predictedDb: number }>;
  }
}

window.renderEQFixture = async ({ band, gain, frequency, q = 0.5, bypass = false, copies = 1,
  sampleRate = 48000, edit = false, remove = false }) => {
  const eq = new KGEQFX(); const bands = eq.getBands();
  bands[band].gainDb = gain; bands[band].q = q; eq.setBands(bands); eq.setEnabled(!bypass);
  const effects = Array.from({ length: copies }, () => eq.clone(true));
  let chain: KGTrackFXChain | undefined;
  try {
    const rendered = await Tone.Offline(context => {
      chain = new KGTrackFXChain();
      const initialEffects = edit ? effects.map(effect => {
        const flat = effect.clone();
        flat.setBands(flat.getBands().map(band => ({ ...band, gainDb: 0 })));
        return flat;
      }) : effects;
      chain.sync(initialEffects, false);
      chain.output.toDestination();
      // One steady sine in both channels verifies stereo preservation as well.
      const buffer = context.createBuffer(2, sampleRate, sampleRate);
      for (let channel = 0; channel < 2; channel++) {
        const data = buffer.getChannelData(channel);
        for (let i = 0; i < data.length; i++) data[i] = 0.05 * Math.sin(2 * Math.PI * frequency * i / sampleRate);
      }
      new Tone.ToneBufferSource(buffer).connect(chain.input).start(0);
      if (edit) context.transport.schedule(() => chain!.sync(effects), 0.1);
      if (remove) context.transport.schedule(() => chain!.sync([]), 0.2);
      context.transport.start(0);
    }, 1, 2, sampleRate);
    const rms = (data: Float32Array) => {
      let sum = 0;
      for (let i = sampleRate / 2; i < sampleRate; i++) sum += data[i] * data[i];
      return Math.sqrt(sum / (sampleRate / 2));
    };
    const left = rms(rendered.getChannelData(0));
    const right = rms(rendered.getChannelData(1));
    if (Math.abs(left - right) > 1e-6) throw new Error('EQ changed stereo balance');
    const gainDb = 20 * Math.log10(left / (0.05 / Math.sqrt(2)));
    const predictedDb = bypass || remove ? 0 : copies * previewResponseDb(
      bands.map(b => ({ frequency: b.frequencyHz, q: b.q, gain: b.gainDb })), frequency, sampleRate);
    rendered.dispose();
    return { gainDb, predictedDb };
  } finally { chain?.dispose(); }
};

// Exercise the actual project bounce path with an in-memory audio clip.
declare global { interface Window { renderEQProjectFixture: (type?: 'audio' | 'midi', effectType?: 'eq' | 'limiter' | 'compressor') => Promise<number> } }
window.renderEQProjectFixture = async (type = 'audio', effectType = 'eq') => {
  // Initialize through the store, matching the app entry point’s circular imports.
  await import('../../stores/projectStore');
  const [{ KGProject }, { KGAudioTrack }, { KGAudioRegion }, { KGAudioInterface }, { KGOfflineRenderer }] = await Promise.all([
    import('../../core/KGProject'), import('../../core/track/KGAudioTrack'),
    import('../../core/region/KGAudioRegion'), import('../../core/audio-interface/KGAudioInterface'),
    import('../../core/audio-interface/KGOfflineRenderer'),
  ]);
  const sampleRate = 44100;
  const amplitude = effectType !== 'eq' ? 0.5 : 0.05;
  const raw = Tone.getContext().createBuffer(2, sampleRate, sampleRate);
  for (let channel = 0; channel < 2; channel++) {
    const data = raw.getChannelData(channel);
    for (let i = 0; i < sampleRate; i++) data[i] = amplitude * Math.sin(2 * Math.PI * 1350 * i / sampleRate);
  }
  const [{ KGMidiTrack }, { KGMidiRegion }, { KGMidiNote }, { KGToneBuffersPool }] = await Promise.all([
    import('../../core/track/KGMidiTrack'), import('../../core/region/KGMidiRegion'),
    import('../../core/midi/KGMidiNote'), import('../../core/audio-interface/KGToneBuffersPool'),
  ]);
  const track = type === 'audio' ? new KGAudioTrack('EQ fixture', 123) : new KGMidiTrack('EQ fixture', 123);
  const eq = new KGEQFX(); const bands = eq.getBands(); bands[1].gainDb = 6; eq.setBands(bands);
  track.addFX(effectType === 'limiter' ? new KGLimiterFX({ inputGainDb: 6, thresholdDb: -18 }) : effectType === 'compressor' ? new KGCompressorFX({ gainDb: 6, thresholdDb: -18 }) : eq);
  if (track instanceof KGAudioTrack) {
    track.setRegions([new KGAudioRegion('clip', '123', 0, 'Sine', 0, 1920, 'fixture', 'fixture.wav', 1)]);
  } else {
    const region = new KGMidiRegion('clip', '123', 0, 'Sine', 0, 1920);
    region.setNotes([new KGMidiNote('note', 0, 1920, 60, 127)]); track.setRegions([region]);
  }
  const project = new KGProject(); project.setTracks([track]);
  const audio = KGAudioInterface.instance(); const getBuffer = audio.getAudioBuffer;
  audio.getAudioBuffer = () => raw;
  const pool = KGToneBuffersPool.instance(); const getBuffers = pool.getToneAudioBuffers;
  const buffers = new Tone.ToneAudioBuffers({ C4: raw });
  pool.getToneAudioBuffers = async () => buffers;
  try {
    const rendered = await KGOfflineRenderer.instance().renderToBuffer(project, { sampleRate, tailSeconds: 0 });
    const data = rendered.getChannelData(0); let sum = 0;
    for (let i = sampleRate / 2; i < sampleRate * 0.9; i++) sum += data[i] * data[i];
    rendered.dispose();
    return 20 * Math.log10(Math.sqrt(sum / (sampleRate * 0.4)) / (amplitude / Math.sqrt(2)));
  } finally { audio.getAudioBuffer = getBuffer; pool.getToneAudioBuffers = getBuffers; buffers.dispose(); }
};
