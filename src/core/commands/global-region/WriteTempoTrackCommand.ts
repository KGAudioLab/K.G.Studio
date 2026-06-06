import { KGCommand } from '../KGCommand';
import { KGCore } from '../../KGCore';
import { GlobalTrackType } from '../../global-track';
import { KGTempoRegion } from '../../region/KGTempoRegion';
import {
  cloneTempoRegions,
  findGlobalTrackByType,
  getSongEndBar,
  getSortedTempoRegions,
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
  private nextRegions: KGTempoRegion[] | null = null;

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
      return;
    }

    const currentRegions = getSortedTempoRegions(track, beatsPerBar);
    this.previousProjectBpm = project.getBpm();
    this.previousRegions = cloneRegions(currentRegions, beatsPerBar);
    project.setBpm(this.baseBpm);

    if (this.replacements.length === 0) {
      this.nextRegions = [];
      track.setRegions([]);
      return;
    }

    const songEndBar = getSongEndBar(project);
    if (songEndBar <= 0) {
      this.nextRegions = [];
      track.setRegions([]);
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
  }

  undo(): void {
    if (!this.previousRegions || this.previousProjectBpm === null) {
      throw new Error('Cannot undo tempo write without original state');
    }

    const project = KGCore.instance().getCurrentProject();
    const beatsPerBar = project.getTimeSignature().numerator;
    const track = findGlobalTrackByType(project, GlobalTrackType.Tempo);
    if (!track) {
      throw new Error('Tempo global track not found during undo');
    }

    project.setBpm(this.previousProjectBpm);
    track.setRegions(cloneRegions(this.previousRegions, beatsPerBar));
  }

  getDescription(): string {
    return 'Write tempo track';
  }
}
