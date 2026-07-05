import { KGCommand } from '../KGCommand';
import { KGCore } from '../../KGCore';
import { GlobalTrackType } from '../../global-track';
import { KGTempoRegion } from '../../region/KGTempoRegion';
import {
  cloneTempoRegions,
  findGlobalTrackByType,
  getRequiredMaxBarsForAudioRegions,
  getSongEndBar,
  getSortedTempoRegions,
  normalizeTempoRegionsForProject,
  restoreAudioRegionLengths,
  syncAudioRegionLengthsToPlaybackDuration,
  type AudioRegionLengthSnapshot,
} from '../../../util/globalTrackUtil';
import { generateUniqueId } from '../../../util/miscUtil';

export interface WriteTempoEntry {
  startBeat: number;
  bpm: number;
}

function cloneRegions(regions: KGTempoRegion[], beatsPerBar: number): KGTempoRegion[] {
  return cloneTempoRegions(regions, beatsPerBar);
}

export class WriteTempoTrackCommand extends KGCommand {
  private readonly baseBpm: number;
  private readonly replacements: WriteTempoEntry[];
  private previousRegions: KGTempoRegion[] | null = null;
  private previousProjectBpm: number | null = null;
  private previousMaxBars: number | null = null;
  private nextRegions: KGTempoRegion[] | null = null;
  private nextMaxBars: number | null = null;
  private audioRegionLengthSnapshots: AudioRegionLengthSnapshot[] = [];

  constructor(baseBpm: number, replacements: WriteTempoEntry[]) {
    super();
    this.baseBpm = baseBpm;
    this.replacements = replacements.map(replacement => ({
      startBeat: replacement.startBeat,
      bpm: replacement.bpm,
    }));
  }

  execute(): void {
    const project = KGCore.instance().getCurrentProject();
    const beatsPerBar = project.getTimeSignature().numerator;
    const track = findGlobalTrackByType(project, GlobalTrackType.Tempo);
    if (!track) {
      throw new Error('Tempo global track not found');
    }

    if (this.nextRegions) {
      project.setBpm(this.baseBpm);
      track.setRegions(cloneRegions(this.nextRegions, beatsPerBar));
      syncAudioRegionLengthsToPlaybackDuration(project);
      if (this.nextMaxBars !== null) {
        project.setMaxBars(this.nextMaxBars);
        normalizeTempoRegionsForProject(project);
      }
      return;
    }

    const currentRegions = getSortedTempoRegions(track, beatsPerBar);
    this.previousProjectBpm = project.getBpm();
    this.previousMaxBars = project.getMaxBars();
    this.previousRegions = cloneRegions(currentRegions, beatsPerBar);
    project.setBpm(this.baseBpm);

    if (this.replacements.length === 0) {
      this.nextRegions = [];
      track.setRegions([]);
      this.audioRegionLengthSnapshots = syncAudioRegionLengthsToPlaybackDuration(project);
      this.nextMaxBars = getRequiredMaxBarsForAudioRegions(project);
      if (this.nextMaxBars > project.getMaxBars()) {
        project.setMaxBars(this.nextMaxBars);
        normalizeTempoRegionsForProject(project);
      }
      return;
    }

    const songEndBar = getSongEndBar(project);
    if (songEndBar <= 0) {
      this.nextRegions = [];
      track.setRegions([]);
      this.nextMaxBars = getRequiredMaxBarsForAudioRegions(project);
      return;
    }

    const normalizedReplacements = this.replacements
      .map(replacement => ({
        startBar: Math.floor(replacement.startBeat / beatsPerBar),
        bpm: replacement.bpm,
      }))
      .sort((left, right) => left.startBar - right.startBar);

    for (let index = 1; index < normalizedReplacements.length; index += 1) {
      const previous = normalizedReplacements[index - 1];
      const current = normalizedReplacements[index];
      if (current.startBar <= previous.startBar) {
        throw new Error(
          `Tempo entry ${index + 1} overlaps with or collapses into entry ${index} after bar alignment. Entry ${index} normalizes to bar ${previous.startBar + 1}, and entry ${index + 1} normalizes to bar ${current.startBar + 1}.`,
        );
      }
    }

    const nextRegions: KGTempoRegion[] = [];
    let currentStartBar = 0;
    let currentBpm = this.baseBpm;

    for (const replacement of normalizedReplacements) {
      if (replacement.startBar > currentStartBar) {
        nextRegions.push(new KGTempoRegion(
          generateUniqueId('KGTempoRegion'),
          track.getId(),
          track.getTrackIndex(),
          currentBpm,
          currentStartBar,
          replacement.startBar - currentStartBar,
          beatsPerBar,
        ));
      }

      currentStartBar = replacement.startBar;
      currentBpm = replacement.bpm;
    }

    if (currentStartBar < songEndBar) {
      nextRegions.push(new KGTempoRegion(
        generateUniqueId('KGTempoRegion'),
        track.getId(),
        track.getTrackIndex(),
        currentBpm,
        currentStartBar,
        songEndBar - currentStartBar,
        beatsPerBar,
      ));
    }

    this.nextRegions = nextRegions;
    track.setRegions(cloneRegions(this.nextRegions, beatsPerBar));
    this.audioRegionLengthSnapshots = syncAudioRegionLengthsToPlaybackDuration(project);
    this.nextMaxBars = getRequiredMaxBarsForAudioRegions(project);
    if (this.nextMaxBars > project.getMaxBars()) {
      project.setMaxBars(this.nextMaxBars);
      normalizeTempoRegionsForProject(project);
    }
  }

  undo(): void {
    if (!this.previousRegions || this.previousProjectBpm === null || this.previousMaxBars === null) {
      throw new Error('Cannot undo tempo write without original state');
    }

    const project = KGCore.instance().getCurrentProject();
    const beatsPerBar = project.getTimeSignature().numerator;
    const track = findGlobalTrackByType(project, GlobalTrackType.Tempo);
    if (!track) {
      throw new Error('Tempo global track not found during undo');
    }

    project.setBpm(this.previousProjectBpm);
    project.setMaxBars(this.previousMaxBars);
    track.setRegions(cloneRegions(this.previousRegions, beatsPerBar));
    normalizeTempoRegionsForProject(project);
    if (this.audioRegionLengthSnapshots.length > 0) {
      restoreAudioRegionLengths(this.audioRegionLengthSnapshots);
    }
  }

  getDescription(): string {
    return 'Write tempo track';
  }
}
