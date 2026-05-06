import { KGCommand } from '../KGCommand';
import { KGCore } from '../../KGCore';
import { KGMidiRegion } from '../../region/KGMidiRegion';
import { KGMidiNote } from '../../midi/KGMidiNote';
import { KGMidiPitchBend } from '../../midi/KGMidiPitchBend';
import { KGTrack } from '../../track/KGTrack';
import { useProjectStore } from '../../../stores/projectStore';

interface RegionSnapshot {
  regionId: string;
  startFromBeat: number;
  length: number;
  notes: Array<{
    id: string;
    startBeat: number;
    endBeat: number;
    pitch: number;
    velocity: number;
  }>;
  pitchBends: Array<{
    id: string;
    beat: number;
    value: number;
  }>;
}

interface ResolvedRegion {
  region: KGMidiRegion;
  index: number;
}

function cloneNote(note: KGMidiNote, startBeat: number, endBeat: number): KGMidiNote {
  return new KGMidiNote(
    note.getId(),
    startBeat,
    endBeat,
    note.getPitch(),
    note.getVelocity()
  );
}

function clonePitchBend(pitchBend: KGMidiPitchBend, beat: number): KGMidiPitchBend {
  return new KGMidiPitchBend(
    pitchBend.getId(),
    beat,
    pitchBend.getValue()
  );
}

export class MergeMidiRegionsCommand extends KGCommand {
  private readonly regionIdsToMerge: string[];
  private targetTrack: KGTrack | null = null;
  private survivingRegion: KGMidiRegion | null = null;
  private removedRegions: Array<{ region: KGMidiRegion; index: number }> = [];
  private originalRegionSnapshots = new Map<string, RegionSnapshot>();
  private originalSelectedItems = [] as ReturnType<KGCore['getSelectedItems']>;
  private originalPianoRollState: { showPianoRoll: boolean; activeRegionId: string | null } | null = null;

  constructor(regionIdsToMerge: string[]) {
    super();
    this.regionIdsToMerge = [...regionIdsToMerge];
  }

  execute(): void {
    if (this.regionIdsToMerge.length < 2) {
      throw new Error('At least two MIDI regions are required to merge.');
    }

    const core = KGCore.instance();
    const tracks = core.getCurrentProject().getTracks();
    const regionIdSet = new Set(this.regionIdsToMerge);

    const resolvedRegions: ResolvedRegion[] = [];
    let targetTrack: KGTrack | null = null;

    for (const track of tracks) {
      track.getRegions().forEach((region, index) => {
        if (!regionIdSet.has(region.getId())) {
          return;
        }
        if (!(region instanceof KGMidiRegion)) {
          throw new Error('Only MIDI regions can be merged.');
        }
        if (targetTrack && targetTrack !== track) {
          throw new Error('All MIDI regions must be on the same track to merge.');
        }
        targetTrack = track;
        resolvedRegions.push({ region, index });
      });
    }

    if (!targetTrack || resolvedRegions.length !== regionIdSet.size) {
      throw new Error('One or more MIDI regions could not be found.');
    }

    resolvedRegions.sort((a, b) => {
      const startDelta = a.region.getStartFromBeat() - b.region.getStartFromBeat();
      if (startDelta !== 0) return startDelta;
      return a.index - b.index;
    });

    this.targetTrack = targetTrack;
    this.survivingRegion = resolvedRegions[0].region;
    this.removedRegions = resolvedRegions.slice(1).map(({ region, index }) => ({ region, index }));
    this.originalRegionSnapshots.clear();

    resolvedRegions.forEach(({ region }) => {
      this.originalRegionSnapshots.set(region.getId(), {
        regionId: region.getId(),
        startFromBeat: region.getStartFromBeat(),
        length: region.getLength(),
        notes: region.getNotes().map(note => ({
          id: note.getId(),
          startBeat: note.getStartBeat(),
          endBeat: note.getEndBeat(),
          pitch: note.getPitch(),
          velocity: note.getVelocity(),
        })),
        pitchBends: region.getPitchBends().map(pitchBend => ({
          id: pitchBend.getId(),
          beat: pitchBend.getBeat(),
          value: pitchBend.getValue(),
        })),
      });
    });

    this.originalSelectedItems = [...core.getSelectedItems()];
    const { showPianoRoll, activeRegionId } = useProjectStore.getState();
    this.originalPianoRollState = { showPianoRoll, activeRegionId };
    const resolvedTargetTrack: KGTrack = this.targetTrack;

    const survivingRegionStart = this.survivingRegion.getStartFromBeat();
    const mergedEndBeat = resolvedRegions.reduce((maxEndBeat, { region }) => (
      Math.max(maxEndBeat, region.getStartFromBeat() + region.getLength())
    ), survivingRegionStart + this.survivingRegion.getLength());

    const mergedNotes = [...this.survivingRegion.getNotes()];
    const mergedPitchBends = [...this.survivingRegion.getPitchBends()];
    for (const { region } of resolvedRegions.slice(1)) {
      const regionStart = region.getStartFromBeat();
      region.getNotes().forEach(note => {
        const absoluteStart = regionStart + note.getStartBeat();
        const absoluteEnd = regionStart + note.getEndBeat();
        mergedNotes.push(cloneNote(
          note,
          absoluteStart - survivingRegionStart,
          absoluteEnd - survivingRegionStart
        ));
      });
      region.getPitchBends().forEach(pitchBend => {
        mergedPitchBends.push(clonePitchBend(
          pitchBend,
          regionStart + pitchBend.getBeat() - survivingRegionStart
        ));
      });
    }

    this.survivingRegion.setLength(mergedEndBeat - survivingRegionStart);
    this.survivingRegion.setNotes(mergedNotes);
    this.survivingRegion.setPitchBends(mergedPitchBends);

    const removedRegionIds = new Set(this.removedRegions.map(({ region }) => region.getId()));
    const nextRegions = resolvedTargetTrack.getRegions().filter(region => !removedRegionIds.has(region.getId()));
    resolvedTargetTrack.setRegions(nextRegions);

    core.clearSelectedItems();
    core.addSelectedItem(this.survivingRegion);

    if (showPianoRoll && activeRegionId && removedRegionIds.has(activeRegionId)) {
      const { setActiveRegionId, setShowPianoRoll } = useProjectStore.getState();
      setActiveRegionId(this.survivingRegion.getId());
      setShowPianoRoll(true);
    }
  }

  undo(): void {
    if (!this.targetTrack || !this.survivingRegion || !this.originalPianoRollState) {
      throw new Error('Cannot undo: merge was never executed.');
    }

    const survivingSnapshot = this.originalRegionSnapshots.get(this.survivingRegion.getId());
    if (!survivingSnapshot) {
      throw new Error('Cannot undo: missing surviving region snapshot.');
    }

    this.survivingRegion.setStartFromBeat(survivingSnapshot.startFromBeat);
    this.survivingRegion.setLength(survivingSnapshot.length);
    this.survivingRegion.setNotes(survivingSnapshot.notes.map(note => new KGMidiNote(
      note.id,
      note.startBeat,
      note.endBeat,
      note.pitch,
      note.velocity
    )));
    this.survivingRegion.setPitchBends(survivingSnapshot.pitchBends.map(pitchBend => new KGMidiPitchBend(
      pitchBend.id,
      pitchBend.beat,
      pitchBend.value
    )));

    for (const { region } of this.removedRegions) {
      const snapshot = this.originalRegionSnapshots.get(region.getId());
      if (!snapshot) {
        continue;
      }
      region.setStartFromBeat(snapshot.startFromBeat);
      region.setLength(snapshot.length);
      region.setNotes(snapshot.notes.map(note => new KGMidiNote(
        note.id,
        note.startBeat,
        note.endBeat,
        note.pitch,
        note.velocity
      )));
      region.setPitchBends(snapshot.pitchBends.map(pitchBend => new KGMidiPitchBend(
        pitchBend.id,
        pitchBend.beat,
        pitchBend.value
      )));
    }

    const regions = [...this.targetTrack.getRegions()];
    const survivingIndex = regions.findIndex(region => region.getId() === this.survivingRegion!.getId());
    if (survivingIndex === -1) {
      throw new Error('Cannot undo: surviving region is missing from the track.');
    }

    for (const { region, index } of [...this.removedRegions].sort((a, b) => a.index - b.index)) {
      const insertIndex = Math.min(index, regions.length);
      regions.splice(insertIndex, 0, region);
    }
    this.targetTrack.setRegions(regions);

    const core = KGCore.instance();
    core.clearSelectedItems();
    if (this.originalSelectedItems.length > 0) {
      core.addSelectedItems(this.originalSelectedItems);
    }

    const {
      setShowPianoRoll,
      setActiveRegionId,
    } = useProjectStore.getState();
    setShowPianoRoll(this.originalPianoRollState.showPianoRoll);
    setActiveRegionId(this.originalPianoRollState.activeRegionId);
  }

  getDescription(): string {
    return this.regionIdsToMerge.length === 2
      ? 'Merge 2 MIDI regions'
      : `Merge ${this.regionIdsToMerge.length} MIDI regions`;
  }
}
