import * as Tone from 'tone';
import { KGCommand } from '../KGCommand';
import { KGCore } from '../../KGCore';
import { KGAudioTrack } from '../../track/KGAudioTrack';
import { KGAudioRegion } from '../../region/KGAudioRegion';
import { KGAudioInterface } from '../../audio-interface/KGAudioInterface';

/**
 * Per-stem data passed to ImportStemsCommand.
 * All async work (OPFS storage, audio decode) must be completed before
 * constructing the command — execute() is synchronous.
 */
export interface StemImportEntry {
  trackName: string;
  regionName: string;
  audioFileId: string;
  audioFileName: string;
  audioDurationSeconds: number;
  toneBuffer: Tone.ToneAudioBuffer;
}

/**
 * Composite command that atomically:
 *  1. Creates one KGAudioTrack per stem (appended to end)
 *  2. Reorders each new track to sit immediately below the original source track
 *  3. Creates one KGAudioRegion per stem, all starting at the same beat
 *  4. Expands maxBars if needed
 *
 * This is a single undo/redo step.
 */
export class ImportStemsCommand extends KGCommand {
  private readonly originalTrackCount: number;
  private readonly originalTrackIndex: number;
  private readonly insertBeat: number;
  private readonly stems: StemImportEntry[];
  private readonly originalMaxBars: number;

  private createdTrackIds: number[] = [];
  private createdRegionIds: string[] = [];
  private finalMaxBars: number;

  constructor(
    originalTrackCount: number,
    originalTrackIndex: number,
    insertBeat: number,
    stems: StemImportEntry[],
    originalMaxBars: number,
  ) {
    super();
    this.originalTrackCount = originalTrackCount;
    this.originalTrackIndex = originalTrackIndex;
    this.insertBeat = insertBeat;
    this.stems = stems;
    this.originalMaxBars = originalMaxBars;
    this.finalMaxBars = originalMaxBars;
  }

  execute(): void {
    const core = KGCore.instance();
    const project = core.getCurrentProject();
    const audioInterface = KGAudioInterface.instance();

    this.createdTrackIds = [];
    this.createdRegionIds = [];

    // ── 1. Compute starting track ID ──────────────────────────────────────
    const existingTracks = project.getTracks();
    let nextId = existingTracks.length > 0
      ? Math.max(...existingTracks.map(t => t.getId())) + 1
      : 1;

    // ── 2. Append one audio track per stem ────────────────────────────────
    for (const stem of this.stems) {
      const trackId = nextId++;
      this.createdTrackIds.push(trackId);

      const track = new KGAudioTrack(stem.trackName, trackId);
      track.setTrackIndex(project.getTracks().length);
      project.setTracks([...project.getTracks(), track]);

      // Bus creation is async; chain buffer load so it runs once the bus is ready
      audioInterface.createTrackAudioPlayerBus(trackId.toString()).then(() => {
        audioInterface.loadAudioBufferForTrack(trackId.toString(), stem.audioFileId, stem.toneBuffer);
      }).catch(err => {
        console.error(`[ImportStemsCommand] Failed to create bus for track ${trackId}:`, err);
      });
    }

    // ── 3. Reorder each stem track to sit just below the original ─────────
    // For stem i: sourceIndex = originalTrackCount + i, destIndex = originalTrackIndex + 1 + i
    // Each reorder shifts the remaining appended stems left by 1 in the tail, but their
    // absolute indices stay at originalTrackCount + i because each move keeps them packed.
    for (let i = 0; i < this.stems.length; i++) {
      const srcIdx  = this.originalTrackCount + i;
      const destIdx = this.originalTrackIndex + 1 + i;

      if (srcIdx === destIdx) continue; // no-op when original is the last track

      const tracks = project.getTracks();
      const updated = [...tracks];
      const [moved] = updated.splice(srcIdx, 1);
      updated.splice(destIdx, 0, moved);
      updated.forEach((t, idx) => t.setTrackIndex(idx));
      project.setTracks(updated);
    }

    // ── 4. Create one audio region per stem ───────────────────────────────
    const bpm         = project.getBpm();
    const beatsPerBar = project.getTimeSignature().numerator;
    let currentMaxBars = this.originalMaxBars;

    for (let i = 0; i < this.stems.length; i++) {
      const stem    = this.stems[i];
      const trackId = this.createdTrackIds[i];

      // Look up the track by ID so we use the post-reorder trackIndex
      const track = project.getTracks().find(t => t.getId() === trackId);
      if (!track) continue;

      const durationInBeats = stem.audioDurationSeconds * (bpm / 60);
      const endBeat         = this.insertBeat + durationInBeats;
      const requiredBars    = Math.ceil(endBeat / beatsPerBar);
      const newMaxBars      = Math.max(currentMaxBars, requiredBars);

      const regionId = `audio_region_${Date.now()}_${Math.random().toString(36).substring(2, 8)}_${i}`;
      this.createdRegionIds.push(regionId);

      const region = new KGAudioRegion(
        regionId,
        trackId.toString(),
        track.getTrackIndex(),
        stem.regionName,
        this.insertBeat,
        durationInBeats,
        stem.audioFileId,
        stem.audioFileName,
        stem.audioDurationSeconds,
      );
      track.addRegion(region);
      currentMaxBars = newMaxBars;
    }

    // ── 5. Expand project maxBars if needed ───────────────────────────────
    this.finalMaxBars = currentMaxBars;
    if (this.finalMaxBars > this.originalMaxBars) {
      project.setMaxBars(this.finalMaxBars);
    }
  }

  undo(): void {
    const core = KGCore.instance();
    const project = core.getCurrentProject();
    const audioInterface = KGAudioInterface.instance();

    // Remove all created tracks and their audio buses
    const remaining = project.getTracks().filter(t => !this.createdTrackIds.includes(t.getId()));
    remaining.forEach((t, idx) => t.setTrackIndex(idx));
    project.setTracks(remaining);

    for (const trackId of this.createdTrackIds) {
      audioInterface.removeTrackAudioPlayerBus(trackId.toString());
    }

    // Revert maxBars if it was expanded
    if (this.finalMaxBars > this.originalMaxBars) {
      project.setMaxBars(this.originalMaxBars);
    }
  }

  getDescription(): string {
    const n = this.stems.length;
    return `Import ${n} stem${n !== 1 ? 's' : ''} to timeline`;
  }
}
