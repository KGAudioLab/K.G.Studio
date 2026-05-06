import { KGCommand } from '../KGCommand';
import { KGCore } from '../../KGCore';
import { KGRegion } from '../../region/KGRegion';
import { KGMidiRegion } from '../../region/KGMidiRegion';
import { KGAudioRegion } from '../../region/KGAudioRegion';
import { KGMidiNote } from '../../midi/KGMidiNote';
import { KGMidiPitchBend } from '../../midi/KGMidiPitchBend';
import { KGTrack } from '../../track/KGTrack';
import { generateUniqueId } from '../../../util/miscUtil';
import { useProjectStore } from '../../../stores/projectStore';

/**
 * Command to split a region into two at the given beat position.
 *
 * MIDI regions: notes whose startBeat is before the split stay in region 1
 * (endBeat is NOT clamped even if it crosses the boundary). Notes whose
 * startBeat is at or after the split go to region 2 with their beat
 * positions shifted so they are relative to the new region start.
 *
 * Audio regions: both halves share the same audioFileId / audioFileName /
 * audioDurationSeconds (no file copy). Region 2 gets a new
 * clipStartOffsetSeconds = original + splitOffsetSeconds.
 */
export class SplitRegionCommand extends KGCommand {
  private regionId: string;
  private splitAtBeat: number; // absolute beat position of the playhead

  // Stored during execute(), used during undo()
  private originalRegion: KGRegion | null = null;
  private region1: KGRegion | null = null;
  private region2: KGRegion | null = null;
  private targetTrack: KGTrack | null = null;
  private originalRegionIndex: number = -1;

  constructor(regionId: string, splitAtBeat: number) {
    super();
    this.regionId = regionId;
    this.splitAtBeat = splitAtBeat;
  }

  execute(): void {
    const tracks = KGCore.instance().getCurrentProject().getTracks();
    let targetTrack: KGTrack | null = null;
    let originalRegion: KGRegion | null = null;

    for (const track of tracks) {
      const regions = track.getRegions();
      const idx = regions.findIndex(r => r.getId() === this.regionId);
      if (idx !== -1) {
        targetTrack = track;
        originalRegion = regions[idx];
        this.originalRegionIndex = idx;
        break;
      }
    }

    if (!targetTrack || !originalRegion) {
      throw new Error(`Region with ID ${this.regionId} not found`);
    }

    this.targetTrack = targetTrack;
    this.originalRegion = originalRegion;

    const regionStart = originalRegion.getStartFromBeat();
    const regionLength = originalRegion.getLength();
    const splitOffsetBeats = this.splitAtBeat - regionStart;

    if (splitOffsetBeats <= 0 || splitOffsetBeats >= regionLength) {
      throw new Error(
        `Split point ${this.splitAtBeat} is not within region range [${regionStart}, ${regionStart + regionLength})`
      );
    }

    const trackId = targetTrack.getId().toString();
    const trackIdx = targetTrack.getTrackIndex();

    if (originalRegion instanceof KGMidiRegion) {
      const region1 = new KGMidiRegion(
        generateUniqueId('KGMidiRegion'),
        trackId,
        trackIdx,
        originalRegion.getName(),
        regionStart,
        splitOffsetBeats
      );

      const region2 = new KGMidiRegion(
        generateUniqueId('KGMidiRegion'),
        trackId,
        trackIdx,
        originalRegion.getName() + ' (2)',
        this.splitAtBeat,
        regionLength - splitOffsetBeats
      );

      for (const note of originalRegion.getNotes()) {
        if (note.getStartBeat() < splitOffsetBeats) {
          // Stays in region 1 — copy as-is, do not clamp endBeat
          region1.addNote(new KGMidiNote(
            generateUniqueId('KGMidiNote'),
            note.getStartBeat(),
            note.getEndBeat(),
            note.getPitch(),
            note.getVelocity()
          ));
        } else {
          // Goes into region 2 — shift both beats relative to new region start
          region2.addNote(new KGMidiNote(
            generateUniqueId('KGMidiNote'),
            note.getStartBeat() - splitOffsetBeats,
            note.getEndBeat() - splitOffsetBeats,
            note.getPitch(),
            note.getVelocity()
          ));
        }
      }

      for (const pitchBend of originalRegion.getPitchBends()) {
        if (pitchBend.getBeat() < splitOffsetBeats) {
          region1.addPitchBend(new KGMidiPitchBend(
            generateUniqueId('KGMidiPitchBend'),
            pitchBend.getBeat(),
            pitchBend.getValue()
          ));
        } else {
          region2.addPitchBend(new KGMidiPitchBend(
            generateUniqueId('KGMidiPitchBend'),
            pitchBend.getBeat() - splitOffsetBeats,
            pitchBend.getValue()
          ));
        }
      }

      this.region1 = region1;
      this.region2 = region2;

    } else if (originalRegion instanceof KGAudioRegion) {
      const bpm = KGCore.instance().getCurrentProject().getBpm();
      const splitOffsetSeconds = splitOffsetBeats * (60 / bpm);

      this.region1 = new KGAudioRegion(
        generateUniqueId('KGAudioRegion'),
        trackId,
        trackIdx,
        originalRegion.getName(),
        regionStart,
        splitOffsetBeats,
        originalRegion.getAudioFileId(),
        originalRegion.getAudioFileName(),
        originalRegion.getAudioDurationSeconds(),
        originalRegion.getClipStartOffsetSeconds()
      );

      this.region2 = new KGAudioRegion(
        generateUniqueId('KGAudioRegion'),
        trackId,
        trackIdx,
        originalRegion.getName() + ' (2)',
        this.splitAtBeat,
        regionLength - splitOffsetBeats,
        originalRegion.getAudioFileId(),
        originalRegion.getAudioFileName(),
        originalRegion.getAudioDurationSeconds(),
        originalRegion.getClipStartOffsetSeconds() + splitOffsetSeconds
      );

    } else {
      throw new Error(`Unsupported region type for splitting: ${originalRegion.getCurrentType()}`);
    }

    // Replace original region with the two new regions
    const regions = targetTrack.getRegions();
    regions.splice(this.originalRegionIndex, 1, this.region1!, this.region2!);
    targetTrack.setRegions(regions);

    // Close piano roll if it is open for the region being split
    const { activeRegionId, showPianoRoll, setShowPianoRoll, setActiveRegionId } = useProjectStore.getState();
    if (showPianoRoll && activeRegionId === this.regionId) {
      setShowPianoRoll(false);
      setActiveRegionId(null);
      console.log(`Closed piano roll because active region ${this.regionId} is being split`);
    }

    console.log(`Split region "${originalRegion.getName()}" at beat ${this.splitAtBeat} (offset ${splitOffsetBeats} beats)`);
  }

  undo(): void {
    if (!this.targetTrack || !this.originalRegion || !this.region1 || !this.region2) {
      throw new Error('Cannot undo: split was never executed');
    }

    // Find region1 by ID (robust to any reordering)
    const regions = this.targetTrack.getRegions();
    const idx1 = regions.findIndex(r => r.getId() === this.region1!.getId());
    if (idx1 === -1) {
      throw new Error('Cannot undo: split regions not found in track');
    }

    // Remove the two produced regions and restore the original
    regions.splice(idx1, 2, this.originalRegion);
    this.targetTrack.setRegions(regions);

    console.log(`Restored region "${this.originalRegion.getName()}" (undo split)`);
  }

  getDescription(): string {
    const name = this.originalRegion ? this.originalRegion.getName() : `Region ${this.regionId}`;
    return `Split region "${name}"`;
  }

  public getRegionId(): string {
    return this.regionId;
  }

  public getCreatedRegion1(): KGRegion | null {
    return this.region1;
  }

  public getCreatedRegion2(): KGRegion | null {
    return this.region2;
  }
}
