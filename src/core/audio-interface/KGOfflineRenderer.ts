import * as Tone from 'tone';
import type { KGProject } from '../KGProject';
import type { KGMidiNote } from '../midi/KGMidiNote';
import type { KGMidiPitchBend } from '../midi/KGMidiPitchBend';
import type { KGAudioRegion } from '../region/KGAudioRegion';
import type { InstrumentType } from '../track/KGMidiTrack';
import { FLUIDR3_INSTRUMENT_MAP } from '../../constants/generalMidiConstants';
import { AUDIO_INTERFACE_CONSTANTS } from '../../constants/coreConstants';
import { clampMidiControllerValue, MIDI_PITCH_BEND_CENTER, midiPitchBendToNormalized } from '../../util/midiUtil';
import {
  bakeMidiAutomationPointsInWindow,
  collectRegionMidiAutomationPoints,
  normalizeMidiAutomationPoints,
  resolveMidiAutomationValueAtBeat,
  resolveSustainExtendedEndBeat,
  type BakedMidiAutomationPoint,
  type MidiAutomationPoint,
} from '../../util/midiAutomationUtil';
import {
  bakeTrackAutomationPointsInWindow,
  getTrackAutomationDefaultValue,
  resolveTrackAutomationValueAtBeat,
} from '../../util/trackAutomationUtil';
import { KGToneBuffersPool } from './KGToneBuffersPool';
import { KGToneSamplerFactory } from './KGToneSamplerFactory';
import { KGAudioInterface } from './KGAudioInterface';
import { KGAudioBus } from './KGAudioBus';
import { beatRangeToSeconds, beatToSeconds, findGlobalTrackByType, getEffectiveBpmAtBeat, getSortedTempoRegions } from '../../util/globalTrackUtil';
import { GlobalTrackType } from '../global-track';
import { ConfigManager } from '../config/ConfigManager';
import { Mp3Encoder } from '@breezystack/lamejs';
import { createStereoTrackPanner } from './createStereoTrackPanner';

export interface RenderOptions {
  sampleRate?: number;  // default 44100
  channels?: number;    // default 2 (stereo)
  tailSeconds?: number; // extra seconds after last note for release/reverb (default 2)
  mp3Kbps?: number;     // MP3 bitrate in kbps (default 192)
}

export interface RenderingEvent {
  type: 'start' | 'end' | 'error';
  message?: string;
}

/**
 * KGOfflineRenderer - Singleton for bouncing/rendering a project to audio.
 * Uses Tone.Offline() to render faster-than-realtime via OfflineAudioContext.
 */
export class KGOfflineRenderer {
  private static _instance: KGOfflineRenderer | null = null;

  private _isRendering = false;
  private renderingListeners: Array<(_evt: RenderingEvent) => void> = [];

  private constructor() {
    console.log('KGOfflineRenderer initialized');
  }

  public static instance(): KGOfflineRenderer {
    if (!KGOfflineRenderer._instance) {
      KGOfflineRenderer._instance = new KGOfflineRenderer();
    }
    return KGOfflineRenderer._instance;
  }

  // ===== EVENT LISTENERS =====

  public addRenderingListener(listener: (_evt: RenderingEvent) => void): void {
    this.renderingListeners.push(listener);
  }

  public removeRenderingListener(listener: (_evt: RenderingEvent) => void): void {
    this.renderingListeners = this.renderingListeners.filter(l => l !== listener);
  }

  private emitRenderingEvent(evt: RenderingEvent): void {
    for (const listener of this.renderingListeners) {
      try { listener(evt); } catch { /* swallow */ }
    }
  }

  public get isRendering(): boolean {
    return this._isRendering;
  }

  // ===== PUBLIC API =====

  /**
   * Render the project to a ToneAudioBuffer using Tone.Offline.
   */
  public async renderToBuffer(project: KGProject, options?: RenderOptions): Promise<Tone.ToneAudioBuffer> {
    const sampleRate = options?.sampleRate ?? 44100;
    const channels = options?.channels ?? 2;
    const tailSeconds = options?.tailSeconds ?? 2;

    // Calculate render duration in seconds
    const bpm = getEffectiveBpmAtBeat(project, 0);
    const timeSignature = project.getTimeSignature();
    const beatsPerBar = timeSignature.numerator;

    let renderStartBeat = 0;
    let renderEndBeat: number;
    const bounceStartsFromBeat1 = (ConfigManager.instance().get('audio.bounce_starts_from_beat_1') as boolean) ?? true;

    const isLooping = project.getIsLooping();
    // Looping range is determined up-front; non-looping range is computed
    // after collecting track data (see below).
    if (isLooping) {
      const [startBar, endBarOriginal] = project.getLoopingRange();
      const endBar = (startBar === 0 && endBarOriginal === 0) ? project.getMaxBars() : endBarOriginal;
      renderStartBeat = startBar * beatsPerBar;
      renderEndBeat = (endBar + 1) * beatsPerBar; // +1 because endBar is inclusive
    } else {
      // Placeholder — will be refined after track data collection
      renderEndBeat = project.getMaxBars() * beatsPerBar;
    }

    // Determine solo state from the live audio buses
    const audioInterface = KGAudioInterface.instance();

    // Collect track info we'll need inside the offline callback
    const tracks = project.getTracks();

    // Pre-collect all the data we need before entering the offline context
    const midiTrackData: Array<{
      trackId: string;
      instrumentName: InstrumentType;
      volume: number;
      muted: boolean;
      solo: boolean;
      volumeAutomation: MidiAutomationPoint[];
      panAutomation: MidiAutomationPoint[];
      regions: Array<{
        startBeat: number;
        notes: Array<{ startBeat: number; endBeat: number; durationBeats: number; pitch: number; velocity: number }>;
      }>;
      pitchBends: MidiAutomationPoint[];
      controllerEventsByType: MidiAutomationPoint[][];
    }> = [];

    const audioTrackData: Array<{
      trackId: string;
      volume: number;
      muted: boolean;
      solo: boolean;
      volumeAutomation: MidiAutomationPoint[];
      panAutomation: MidiAutomationPoint[];
      regions: Array<{
        startBeat: number;
        lengthBeats: number;
        audioFileId: string;
        clipStartOffsetSeconds: number;
        audioDurationSeconds: number;
        rawBuffer: AudioBuffer;
      }>;
    }> = [];

    let hasSoloedTracks = false;
    const interpolationIntervalMs = (ConfigManager.instance().get('audio.midi_automation_interpolation_interval_ms') as number) ?? 10;

    for (const track of tracks) {
      const trackId = track.getId().toString();

      if (track.getType() === 'MIDI') {
        const midiTrack = track as unknown as { getInstrument: () => InstrumentType };
        const instrumentName = midiTrack.getInstrument();

        // Get live bus state for volume/mute/solo via public getters
        const volume = audioInterface.getTrackVolume(trackId);
        const muted = audioInterface.getTrackMuted(trackId);
        const solo = audioInterface.getTrackSolo(trackId);
        if (solo) hasSoloedTracks = true;

        const regions: typeof midiTrackData[0]['regions'] = [];
        for (const region of track.getRegions()) {
          if (region.getCurrentType() === 'KGMidiRegion') {
            const midiRegion = region as unknown as { getNotes: () => KGMidiNote[]; getPitchBends: () => KGMidiPitchBend[] };
            if (midiRegion.getNotes) {
              const notes = midiRegion.getNotes().map(note => ({
                startBeat: note.getStartBeat() + region.getStartFromBeat(),
                endBeat: note.getEndBeat() + region.getStartFromBeat(),
                durationBeats: note.getEndBeat() - note.getStartBeat(),
                pitch: note.getPitch(),
                velocity: note.getVelocity(),
              }));
              regions.push({ startBeat: region.getStartFromBeat(), notes });
            }
          }
        }
        const pitchBends = collectRegionMidiAutomationPoints(
          track.getRegions()
            .filter(region => region.getCurrentType() === 'KGMidiRegion')
            .map(region => {
              const midiRegion = region as unknown as { getPitchBends: () => KGMidiPitchBend[] };
              return {
                startBeat: region.getStartFromBeat(),
                points: midiRegion.getPitchBends().map(pitchBend => ({
                  beat: pitchBend.getBeat(),
                  value: pitchBend.getValue(),
                })),
              };
            })
        );
        const controllerEventsByType = Array.from({ length: 128 }, (_, controller) => (
          collectRegionMidiAutomationPoints(
            track.getRegions()
              .filter(region => region.getCurrentType() === 'KGMidiRegion')
              .map(region => {
                const midiRegion = region as unknown as { getControllerEvents: (controller: number) => Array<{ getBeat: () => number; getValue: () => number }> };
                return {
                  startBeat: region.getStartFromBeat(),
                  points: midiRegion.getControllerEvents(controller).map(event => ({
                    beat: event.getBeat(),
                    value: event.getValue(),
                  })),
                };
              })
          )
        ));

        const volumeAutomation = track.getVolumeAutomation().map(point => ({ beat: point.getBeat(), value: point.getValue() }));
        const panAutomation = track.getPanAutomation().map(point => ({ beat: point.getBeat(), value: point.getValue() }));
        midiTrackData.push({ trackId, instrumentName, volume, muted, solo, volumeAutomation, panAutomation, regions, pitchBends, controllerEventsByType });
      } else if (track.getType() === 'Wave') {
        const volume = audioInterface.getTrackVolume(trackId);
        const muted = audioInterface.getTrackMuted(trackId);
        const solo = audioInterface.getTrackSolo(trackId);
        if (solo) hasSoloedTracks = true;

        const regions: typeof audioTrackData[0]['regions'] = [];
        for (const region of track.getRegions()) {
          if (region.getCurrentType() === 'KGAudioRegion') {
            const audioRegion = region as unknown as KGAudioRegion;
            const audioFileId = audioRegion.getAudioFileId();
            const rawBuffer = audioInterface.getAudioBuffer(trackId, audioFileId);
            if (rawBuffer) {
              regions.push({
                startBeat: region.getStartFromBeat(),
                lengthBeats: region.getLength(),
                audioFileId,
                clipStartOffsetSeconds: audioRegion.getClipStartOffsetSeconds(),
                audioDurationSeconds: audioRegion.getAudioDurationSeconds(),
                rawBuffer,
              });
            }
          }
        }

        const volumeAutomation = track.getVolumeAutomation().map(point => ({ beat: point.getBeat(), value: point.getValue() }));
        const panAutomation = track.getPanAutomation().map(point => ({ beat: point.getBeat(), value: point.getValue() }));
        audioTrackData.push({ trackId, volume, muted, solo, volumeAutomation, panAutomation, regions });
      }
    }

    // For non-looping mode, tighten the render range to the actual content
    if (!isLooping) {
      let contentStart = Infinity;
      let contentEnd = 0;

      for (const t of midiTrackData) {
        for (const r of t.regions) {
          for (const n of r.notes) {
            if (n.startBeat < contentStart) contentStart = n.startBeat;
            if (n.endBeat > contentEnd) contentEnd = n.endBeat;
          }
        }
      }
      for (const t of audioTrackData) {
        for (const r of t.regions) {
          if (r.startBeat < contentStart) contentStart = r.startBeat;
          const regionEnd = r.startBeat + r.lengthBeats;
          if (regionEnd > contentEnd) contentEnd = regionEnd;
        }
      }

      if (contentEnd > 0) {
        renderStartBeat = bounceStartsFromBeat1 ? 0 : contentStart;
        renderEndBeat = contentEnd;
      }
      // else: no content found, keep the full project range as fallback
    }

    const durationSeconds = beatRangeToSeconds(project, renderStartBeat, renderEndBeat) + tailSeconds;

    console.log(`Offline render: ${durationSeconds}s (beats ${renderStartBeat}-${renderEndBeat}), ${sampleRate}Hz, ${channels}ch`);

    // Run offline render
    const buffer = await Tone.Offline(async (context) => {
      // Master gain routed to offline destination
      const masterGain = new Tone.Gain(1).toDestination();

      // Set BPM and time signature on offline transport
      context.transport.bpm.value = getEffectiveBpmAtBeat(project, renderStartBeat);
      context.transport.timeSignature = [timeSignature.numerator, timeSignature.denominator];
      const tempoTrack = findGlobalTrackByType(project, GlobalTrackType.Tempo);
      const tempoRegions = tempoTrack ? getSortedTempoRegions(tempoTrack, timeSignature.numerator) : [];
      tempoRegions.forEach((region) => {
        const regionStartBeat = region.getStartBar() * timeSignature.numerator;
        if (regionStartBeat <= renderStartBeat || regionStartBeat >= renderEndBeat) {
          return;
        }

        context.transport.schedule((time) => {
          context.transport.bpm.setValueAtTime(region.getBpm(), time);
        }, beatsToOfflineTransportTime(regionStartBeat, renderStartBeat));
      });

      // ---- Create MIDI track samplers ----
      const samplerPromises: Promise<void>[] = [];

      for (const trackInfo of midiTrackData) {
        if (!shouldPlay(trackInfo, hasSoloedTracks)) continue;

        const promise = (async () => {
          try {
            // Get cached buffers from pool
            const audioBuffers = await KGToneBuffersPool.instance().getToneAudioBuffers(String(trackInfo.instrumentName));
            const pitchRange = FLUIDR3_INSTRUMENT_MAP[trackInfo.instrumentName]?.pitchRange || [21, 108];
            const urlMap = KGToneSamplerFactory.instance().convertBuffersToUrls(audioBuffers, pitchRange);

            // Create sampler inside offline context
            const sampler = await new Promise<Tone.Sampler>((resolve, reject) => {
              const timeout = setTimeout(() => reject(new Error(`Offline sampler timeout: ${trackInfo.instrumentName}`)), 30000);
              const s = new Tone.Sampler({
                urls: urlMap,
                onload: () => { clearTimeout(timeout); resolve(s); },
                onerror: (err) => { clearTimeout(timeout); reject(err); },
              });
            });

            // Track volumes are stored in dB across the app, with 0 meaning unity gain.
            sampler.volume.value = 0;
            const trackGain = new Tone.Gain(getOfflineTrackGain(trackInfo.volume, trackInfo.muted));
            const trackPanner = createStereoTrackPanner(0);
            sampler.connect(trackGain);
            trackGain.connect(trackPanner);
            trackPanner.connect(masterGain);
            applyOfflineTrackAutomation(
              trackGain,
              trackPanner,
              trackInfo.volumeAutomation,
              trackInfo.panAutomation,
              trackInfo.volume,
              project,
              renderStartBeat,
              renderEndBeat,
              interpolationIntervalMs,
              bpm
            );
            const mergedExpressionEvents = normalizeMidiAutomationPoints(
              [1, 2, 7, 11].flatMap(controller => trackInfo.controllerEventsByType[controller])
            );
            const bakedTrackPitchBends = bakeMidiAutomationPointsInWindow(
              trackInfo.pitchBends,
              renderStartBeat,
              renderEndBeat,
              {
                maxIntervalMs: interpolationIntervalMs,
                bpm: getEffectiveBpmAtBeat(project, renderStartBeat),
                defaultValue: MIDI_PITCH_BEND_CENTER,
              }
            );
            const bakedExpressionEvents = bakeMidiAutomationPointsInWindow(
              mergedExpressionEvents,
              renderStartBeat,
              renderEndBeat,
              {
                maxIntervalMs: interpolationIntervalMs,
                bpm: getEffectiveBpmAtBeat(project, renderStartBeat),
                defaultValue: 127,
                interpolationMode: 'linear',
                quantizeValue: clampMidiControllerValue,
              }
            );

            // Schedule all notes for this track
            for (const regionInfo of trackInfo.regions) {
              for (const note of regionInfo.notes) {
                // Skip notes outside render range
                if (note.startBeat >= renderEndBeat || note.endBeat <= renderStartBeat) continue;

                const sustainedEndBeat = resolveSustainExtendedEndBeat(
                  trackInfo.controllerEventsByType[64],
                  note.endBeat,
                  0
                );
                const noteDuration = beatRangeToSeconds(project, note.startBeat, sustainedEndBeat);
                const velocity = note.velocity / 127;
                const initialNormalizedPitchBend = midiPitchBendToNormalized(
                  resolveMidiAutomationValueAtBeat(trackInfo.pitchBends, note.startBeat, MIDI_PITCH_BEND_CENTER)
                );
                const initialExpression = clampMidiControllerValue(
                  resolveMidiAutomationValueAtBeat(mergedExpressionEvents, note.startBeat, 127, 'linear')
                ) / 127;
                const offlineSource = createOfflinePitchBendAwareSource(
                  sampler,
                  audioBuffers,
                  trackInfo.instrumentName,
                  note.pitch,
                  initialNormalizedPitchBend,
                  initialExpression
                );
                if (!offlineSource) {
                  continue;
                }

                const { source, basePlaybackRate, gainNode } = offlineSource;
                applyOfflinePitchBendAutomation(
                  source,
                  basePlaybackRate,
                  bakedTrackPitchBends.filter(point => point.beat > note.startBeat && point.beat < sustainedEndBeat),
                  project,
                  renderStartBeat,
                );
                applyOfflineExpressionAutomation(
                  gainNode,
                  bakedExpressionEvents.filter(point => point.beat > note.startBeat && point.beat < sustainedEndBeat),
                  project,
                  renderStartBeat,
                );

                context.transport.schedule((time) => {
                  source.start(time, 0, noteDuration, velocity);
                }, beatsToOfflineTransportTime(note.startBeat, renderStartBeat));
              }
            }
          } catch (error) {
            console.error(`Offline render: failed to create sampler for ${trackInfo.instrumentName}:`, error);
          }
        })();

        samplerPromises.push(promise);
      }

      // ---- Create audio track gain nodes and schedule regions ----
      for (const trackInfo of audioTrackData) {
        if (!shouldPlay(trackInfo, hasSoloedTracks)) continue;

        const trackGain = new Tone.Gain(getOfflineTrackGain(trackInfo.volume, trackInfo.muted));
        const trackPanner = createStereoTrackPanner(0);
        trackGain.connect(trackPanner);
        trackPanner.connect(masterGain);
        applyOfflineTrackAutomation(
          trackGain,
          trackPanner,
          trackInfo.volumeAutomation,
          trackInfo.panAutomation,
          trackInfo.volume,
          project,
          renderStartBeat,
          renderEndBeat,
          interpolationIntervalMs,
          bpm
        );

        for (const regionInfo of trackInfo.regions) {
          const regionStartBeat = regionInfo.startBeat;
          const regionEndBeat = regionStartBeat + regionInfo.lengthBeats;

          // Skip regions outside render range
          if (regionStartBeat >= renderEndBeat || regionEndBeat <= renderStartBeat) continue;

          const clipStartOffsetSeconds = regionInfo.clipStartOffsetSeconds;
          const audioDurationSeconds = regionInfo.audioDurationSeconds;
          const regionLengthSeconds = beatRangeToSeconds(project, regionStartBeat, regionEndBeat);
          const effectiveDurationSeconds = Math.min(regionLengthSeconds, audioDurationSeconds - clipStartOffsetSeconds);

          if (effectiveDurationSeconds <= 0) continue;

          const regionStartTime = beatsToOfflineTransportTime(regionStartBeat, renderStartBeat);

          // Create buffer source NOW while the offline context is still active.
          // Schedule callbacks fire during rendering after Tone.js restores the
          // main context, so creating nodes there would bind them to the wrong context.
          const toneBuffer = new Tone.ToneAudioBuffer(regionInfo.rawBuffer);
          const source = new Tone.ToneBufferSource(toneBuffer);
          source.connect(trackGain);

          context.transport.schedule((time) => {
            source.start(time, clipStartOffsetSeconds, effectiveDurationSeconds);
          }, regionStartTime);
        }
      }

      // Wait for all samplers to load
      await Promise.all(samplerPromises);

      // Start offline transport
      context.transport.start(0);
    }, durationSeconds, channels, sampleRate);

    console.log(`Offline render complete: ${buffer.duration}s, ${buffer.numberOfChannels}ch`);
    return buffer;
  }

  /**
   * Render the project and download as a WAV file.
   */
  public async bounceToWav(project: KGProject, fileName?: string, options?: RenderOptions): Promise<void> {
    if (this._isRendering) {
      console.warn('Already rendering, ignoring bounce request');
      return;
    }

    this._isRendering = true;
    this.emitRenderingEvent({ type: 'start', message: 'Bouncing to WAV...' });

    try {
      const toneBuffer = await this.renderToBuffer(project, options);
      const audioBuffer = toneBuffer.get() as AudioBuffer;
      const wavData = encodeWav(audioBuffer);

      // Trigger download
      const blob = new Blob([wavData], { type: 'audio/wav' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${fileName ?? 'bounce'}.wav`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      this.emitRenderingEvent({ type: 'end', message: 'Bounce complete' });
      console.log('WAV bounce complete');
    } catch (error) {
      console.error('Bounce to WAV failed:', error);
      this.emitRenderingEvent({ type: 'error', message: String(error) });
      throw error;
    } finally {
      this._isRendering = false;
    }
  }
  /**
   * Render the project and download as an MP3 file.
   */
  public async bounceToMp3(project: KGProject, fileName?: string, options?: RenderOptions): Promise<void> {
    if (this._isRendering) {
      console.warn('Already rendering, ignoring bounce request');
      return;
    }

    this._isRendering = true;
    this.emitRenderingEvent({ type: 'start', message: 'Bouncing to MP3...' });

    try {
      const toneBuffer = await this.renderToBuffer(project, options);
      const audioBuffer = toneBuffer.get() as AudioBuffer;
      const mp3Data = encodeMp3(audioBuffer, options?.mp3Kbps ?? 192);

      // Trigger download
      const blob = new Blob(mp3Data, { type: 'audio/mp3' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${fileName ?? 'bounce'}.mp3`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      this.emitRenderingEvent({ type: 'end', message: 'Bounce complete' });
      console.log('MP3 bounce complete');
    } catch (error) {
      console.error('Bounce to MP3 failed:', error);
      this.emitRenderingEvent({ type: 'error', message: String(error) });
      throw error;
    } finally {
      this._isRendering = false;
    }
  }
}

// ===== HELPERS =====

function shouldPlay(trackInfo: { muted: boolean; solo: boolean }, hasSoloedTracks: boolean): boolean {
  if (trackInfo.muted) return false;
  if (hasSoloedTracks) return trackInfo.solo;
  return true;
}

function setOfflinePlaybackRate(
  source: Tone.ToneBufferSource,
  value: number,
  time: number
): void {
  const playbackRate = source.playbackRate as unknown as {
    value: number;
    setValueAtTime?: (nextValue: number, nextTime: number) => void;
  };

  if (typeof playbackRate.setValueAtTime === 'function') {
    playbackRate.setValueAtTime(value, time);
    return;
  }

  playbackRate.value = value;
}

function setOfflineGainValue(gainNode: Tone.Gain, value: number, time: number): void {
  if (typeof gainNode.gain.setValueAtTime === 'function') {
    gainNode.gain.setValueAtTime(value, time);
    return;
  }

  gainNode.gain.value = value;
}

function setOfflinePanValue(panner: Tone.Panner, value: number, time: number): void {
  if (typeof panner.pan.setValueAtTime === 'function') {
    panner.pan.setValueAtTime(value, time);
    return;
  }

  panner.pan.value = value;
}

function createOfflinePitchBendAwareSource(
  sampler: Tone.Sampler,
  audioBuffers: Tone.ToneAudioBuffers,
  instrumentName: InstrumentType,
  pitch: number,
  initialNormalizedPitchBend: number,
  initialExpression: number
): { source: Tone.ToneBufferSource; gainNode: Tone.Gain; basePlaybackRate: number } | null {
  const closestPitch = KGAudioBus.findClosestBufferedPitch(instrumentName, audioBuffers, pitch);
  if (closestPitch === null) {
    return null;
  }

  const bufferKey = KGAudioBus.midiPitchToBufferKey(closestPitch);
  const buffer = audioBuffers.get(bufferKey);
  if (!buffer) {
    return null;
  }

  const basePlaybackRate = Math.pow(2, (pitch - closestPitch) / 12);
  const gainNode = new Tone.Gain(initialExpression).connect(sampler.output);
  const source = new Tone.ToneBufferSource({
    url: buffer,
    fadeIn: sampler.attack,
    fadeOut: sampler.release,
    curve: sampler.curve,
    playbackRate: KGAudioBus.applyNormalizedPitchBendToPlaybackRate(basePlaybackRate, initialNormalizedPitchBend),
  }).connect(gainNode);
  setOfflinePlaybackRate(
    source,
    KGAudioBus.applyNormalizedPitchBendToPlaybackRate(basePlaybackRate, initialNormalizedPitchBend),
    0
  );
  setOfflineGainValue(gainNode, initialExpression, 0);

  return { source, gainNode, basePlaybackRate };
}

export function applyOfflinePitchBendAutomation(
  source: Tone.ToneBufferSource,
  basePlaybackRate: number,
  bakedPitchBends: BakedMidiAutomationPoint[],
  project: KGProject,
  renderStartBeat: number,
): void {
  bakedPitchBends.forEach(point => {
    const automationTime = beatToSeconds(project, point.beat) - beatToSeconds(project, renderStartBeat);
    setOfflinePlaybackRate(
      source,
      KGAudioBus.applyNormalizedPitchBendToPlaybackRate(basePlaybackRate, midiPitchBendToNormalized(point.value)),
      automationTime
    );
  });
}

export function applyOfflineExpressionAutomation(
  gainNode: Tone.Gain,
  bakedExpressionEvents: BakedMidiAutomationPoint[],
  project: KGProject,
  renderStartBeat: number,
): void {
  bakedExpressionEvents.forEach(point => {
    const automationTime = beatToSeconds(project, point.beat) - beatToSeconds(project, renderStartBeat);
    setOfflineGainValue(gainNode, clampMidiControllerValue(point.value) / 127, automationTime);
  });
}

function applyOfflineTrackAutomation(
  gainNode: Tone.Gain,
  pannerNode: Tone.Panner,
  volumeAutomation: MidiAutomationPoint[],
  panAutomation: MidiAutomationPoint[],
  baseVolume: number,
  project: KGProject,
  renderStartBeat: number,
  renderEndBeat: number,
  interpolationIntervalMs: number,
  bpm: number
): void {
  if (volumeAutomation.length > 0) {
    const initialVolume = resolveTrackAutomationValueAtBeat(
      volumeAutomation,
      'volume',
      renderStartBeat,
      getTrackAutomationDefaultValue('volume')
    );
    setOfflineGainValue(gainNode, getOfflineTrackGain(initialVolume, false), 0);
    bakeTrackAutomationPointsInWindow(
      volumeAutomation,
      'volume',
      renderStartBeat,
      renderEndBeat,
      interpolationIntervalMs,
      bpm
    ).forEach(point => {
      if (point.beat <= renderStartBeat) {
        return;
      }

      const automationTime = beatToSeconds(project, point.beat) - beatToSeconds(project, renderStartBeat);
      setOfflineGainValue(gainNode, getOfflineTrackGain(point.value, false), automationTime);
    });
  } else {
    setOfflineGainValue(gainNode, getOfflineTrackGain(baseVolume, false), 0);
  }

  if (panAutomation.length > 0) {
    const initialPan = resolveTrackAutomationValueAtBeat(
      panAutomation,
      'pan',
      renderStartBeat,
      getTrackAutomationDefaultValue('pan')
    );
    setOfflinePanValue(pannerNode, initialPan, 0);
    bakeTrackAutomationPointsInWindow(
      panAutomation,
      'pan',
      renderStartBeat,
      renderEndBeat,
      interpolationIntervalMs,
      bpm
    ).forEach(point => {
      if (point.beat <= renderStartBeat) {
        return;
      }

      const automationTime = beatToSeconds(project, point.beat) - beatToSeconds(project, renderStartBeat);
      setOfflinePanValue(pannerNode, point.value, automationTime);
    });
  } else {
    setOfflinePanValue(pannerNode, 0, 0);
  }
}

function beatsToOfflineTransportTime(beat: number, renderStartBeat: number): Tone.Unit.Time {
  const transportBeats = Math.max(0, beat - renderStartBeat);
  const transportTicks = Math.round(transportBeats * Tone.Transport.PPQ);
  return transportTicks === 0 ? 0 : `${transportTicks}i` as Tone.Unit.Time;
}

export function getOfflineTrackVolumeDb(volumeDb: number, muted: boolean): number {
  const isSilent = muted || volumeDb <= AUDIO_INTERFACE_CONSTANTS.MIN_TRACK_VOLUME_DB;
  return isSilent ? -Infinity : volumeDb;
}

export function getOfflineTrackGain(volumeDb: number, muted: boolean): number {
  const effectiveVolumeDb = getOfflineTrackVolumeDb(volumeDb, muted);
  return Number.isFinite(effectiveVolumeDb) ? Math.pow(10, effectiveVolumeDb / 20) : 0;
}

// ===== WAV ENCODER =====

/**
 * Encode an AudioBuffer as a 16-bit PCM WAV file.
 * Returns the complete WAV file as an ArrayBuffer.
 */
export function encodeWav(audioBuffer: AudioBuffer): ArrayBuffer {
  const numChannels = audioBuffer.numberOfChannels;
  const sampleRate = audioBuffer.sampleRate;
  const numFrames = audioBuffer.length;
  const bitsPerSample = 16;
  const bytesPerSample = bitsPerSample / 8;
  const blockAlign = numChannels * bytesPerSample;
  const dataSize = numFrames * blockAlign;
  const headerSize = 44;
  const totalSize = headerSize + dataSize;

  const buffer = new ArrayBuffer(totalSize);
  const view = new DataView(buffer);

  // Collect channel data
  const channels: Float32Array[] = [];
  for (let ch = 0; ch < numChannels; ch++) {
    channels.push(audioBuffer.getChannelData(ch));
  }

  // RIFF header
  writeString(view, 0, 'RIFF');
  view.setUint32(4, totalSize - 8, true); // file size - 8
  writeString(view, 8, 'WAVE');

  // fmt sub-chunk
  writeString(view, 12, 'fmt ');
  view.setUint32(16, 16, true); // sub-chunk size (16 for PCM)
  view.setUint16(20, 1, true);  // audio format (1 = PCM)
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * blockAlign, true); // byte rate
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bitsPerSample, true);

  // data sub-chunk
  writeString(view, 36, 'data');
  view.setUint32(40, dataSize, true);

  // Interleave and convert float32 [-1, 1] to int16
  let offset = headerSize;
  for (let i = 0; i < numFrames; i++) {
    for (let ch = 0; ch < numChannels; ch++) {
      const sample = channels[ch][i];
      // Clamp to [-1, 1] then scale to int16 range
      const clamped = Math.max(-1, Math.min(1, sample));
      const int16 = clamped < 0 ? clamped * 0x8000 : clamped * 0x7FFF;
      view.setInt16(offset, int16, true);
      offset += bytesPerSample;
    }
  }

  return buffer;
}

function writeString(view: DataView, offset: number, str: string): void {
  for (let i = 0; i < str.length; i++) {
    view.setUint8(offset + i, str.charCodeAt(i));
  }
}

// ===== MP3 ENCODER =====

/**
 * Convert float32 sample to Int16.
 */
function floatToInt16(sample: number): number {
  const clamped = Math.max(-1, Math.min(1, sample));
  return clamped < 0 ? clamped * 0x8000 : clamped * 0x7FFF;
}

/**
 * Encode an AudioBuffer as MP3 using lamejs.
 * Returns an array of Int8Array chunks (suitable for Blob constructor).
 */
export function encodeMp3(audioBuffer: AudioBuffer, kbps: number = 192): Uint8Array[] {
  const numChannels = audioBuffer.numberOfChannels;
  const sampleRate = audioBuffer.sampleRate;
  const numFrames = audioBuffer.length;
  const encoder = new Mp3Encoder(numChannels, sampleRate, kbps);

  const chunkSize = 1152; // MPEG frame size
  const mp3Chunks: Uint8Array[] = [];

  const leftFloat = audioBuffer.getChannelData(0);
  const rightFloat = numChannels > 1 ? audioBuffer.getChannelData(1) : leftFloat;

  for (let i = 0; i < numFrames; i += chunkSize) {
    const end = Math.min(i + chunkSize, numFrames);
    const leftChunk = new Int16Array(end - i);
    const rightChunk = new Int16Array(end - i);

    for (let j = 0; j < leftChunk.length; j++) {
      leftChunk[j] = floatToInt16(leftFloat[i + j]);
      rightChunk[j] = floatToInt16(rightFloat[i + j]);
    }

    const mp3buf = encoder.encodeBuffer(leftChunk, rightChunk);
    if (mp3buf.length > 0) {
      mp3Chunks.push(mp3buf);
    }
  }

  // Flush remaining data
  const tail = encoder.flush();
  if (tail.length > 0) {
    mp3Chunks.push(tail);
  }

  return mp3Chunks;
}
