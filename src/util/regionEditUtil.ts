import { KGCore } from '../core/KGCore';
import { SplitSelectedNotesCommand } from '../core/commands/note/SplitSelectedNotesCommand';
import { SplitRegionCommand } from '../core/commands/region/SplitRegionCommand';
import { MergeMidiRegionsCommand } from '../core/commands/region/MergeMidiRegionsCommand';
import { KGMidiRegion } from '../core/region/KGMidiRegion';
import { KGPianoRollState } from '../core/state/KGPianoRollState';
import { useProjectStore } from '../stores/projectStore';
import { showAlert, showConfirm } from './dialogUtil';

interface SplitSelectedRegionParams {
  selectedRegionIds: string[];
  playheadTick: number;
  refreshProjectState: () => void;
}

interface MergeSelectedMidiRegionsParams {
  selectedRegionIds: string[];
  refreshProjectState: () => void;
}

export const splitSelectedRegionAtPlayhead = async ({
  selectedRegionIds,
  playheadTick,
  refreshProjectState,
}: SplitSelectedRegionParams): Promise<string | null> => {
  const {
    activeRegionId,
    pianoRollMode,
    selectedNoteIds,
    showPianoRoll,
  } = useProjectStore.getState();
  const sheetMusicViewEnabled = KGPianoRollState.instance().getSheetMusicViewEnabled();

  if (
    showPianoRoll &&
    (pianoRollMode === 'midi-edit' || pianoRollMode === 'midi-reference') &&
    !sheetMusicViewEnabled &&
    activeRegionId &&
    selectedNoteIds.length > 0
  ) {
    return splitSelectedNotesAtPlayhead({
      activeRegionId,
      selectedNoteIds,
      playheadTick,
      refreshProjectState,
    });
  }

  return splitSingleSelectedRegionAtPlayhead({
    selectedRegionIds,
    playheadTick,
    refreshProjectState,
  });
};

const splitSelectedNotesAtPlayhead = async ({
  activeRegionId,
  selectedNoteIds,
  playheadTick,
  refreshProjectState,
}: {
  activeRegionId: string;
  selectedNoteIds: string[];
  playheadTick: number;
  refreshProjectState: () => void;
}): Promise<string | null> => {
  const tracks = KGCore.instance().getCurrentProject().getTracks();
  let activeRegion: KGMidiRegion | null = null;

  for (const track of tracks) {
    const region = track.getRegions().find(candidate => candidate.getId() === activeRegionId);
    if (region instanceof KGMidiRegion) {
      activeRegion = region;
      break;
    }
  }

  if (!activeRegion) {
    await showAlert('The active MIDI region could not be found. Please reopen the piano roll and try again.');
    return null;
  }

  const selectedNoteIdSet = new Set(selectedNoteIds);
  const selectedNotes = activeRegion.getNotes().filter(note => selectedNoteIdSet.has(note.getId()));
  if (selectedNotes.length === 0) {
    await showAlert('The selected notes could not be found in the active MIDI region. Please reselect the notes and try again.');
    return null;
  }

  const regionRelativePlayhead = playheadTick - activeRegion.getStartTick();
  const splitCount = selectedNotes.filter(note => (
    note.getStartTick() < regionRelativePlayhead && regionRelativePlayhead < note.getEndTick()
  )).length;
  if (splitCount === 0) {
    await showAlert('The playhead is not inside any selected note. Move the playhead inside a selected note before splitting.');
    return null;
  }

  try {
    const command = new SplitSelectedNotesCommand(activeRegionId, selectedNoteIds, regionRelativePlayhead);
    KGCore.instance().executeCommand(command, { rethrow: true });
    refreshProjectState();
    return `Split ${splitCount} note${splitCount === 1 ? '' : 's'} at tick ${Math.round(playheadTick)}`;
  } catch (error) {
    await showAlert(error instanceof Error ? error.message : 'Unable to split the selected notes.');
    return null;
  }
};

const splitSingleSelectedRegionAtPlayhead = async ({
  selectedRegionIds,
  playheadTick,
  refreshProjectState,
}: SplitSelectedRegionParams): Promise<string | null> => {
  if (selectedRegionIds.length === 0) {
    await showAlert('Please select a region to split.');
    return null;
  }

  if (selectedRegionIds.length > 1) {
    await showAlert('Please select exactly one region to split.');
    return null;
  }

  const regionId = selectedRegionIds[selectedRegionIds.length - 1];
  const tracks = KGCore.instance().getCurrentProject().getTracks();
  let targetRegion = null;

  for (const track of tracks) {
    const foundRegion = track.getRegions().find(region => region.getId() === regionId);
    if (foundRegion) {
      targetRegion = foundRegion;
      break;
    }
  }

  if (!targetRegion) {
    await showAlert('Selected region not found.');
    return null;
  }

  const regionStart = targetRegion.getStartTick();
  const regionEnd = regionStart + targetRegion.getLengthTicks();

  if (playheadTick <= regionStart || playheadTick >= regionEnd) {
    await showAlert('The playhead is not inside the selected region. Move the playhead inside the region before splitting.');
    return null;
  }

  const command = new SplitRegionCommand(regionId, playheadTick);
  KGCore.instance().executeCommand(command);
  refreshProjectState();

  return `Split region at tick ${Math.round(playheadTick)}`;
};

export const mergeSelectedMidiRegions = async ({
  selectedRegionIds,
  refreshProjectState,
}: MergeSelectedMidiRegionsParams): Promise<string | null> => {
  if (selectedRegionIds.length < 2) {
    await showAlert('Please select at least two MIDI regions on the same track to merge.');
    return null;
  }

  const tracks = KGCore.instance().getCurrentProject().getTracks();
  const selectedRegionIdSet = new Set(selectedRegionIds);
  const selectedMidiRegions: KGMidiRegion[] = [];
  let targetTrackId: string | null = null;

  for (const track of tracks) {
    for (const region of track.getRegions()) {
      if (!selectedRegionIdSet.has(region.getId())) {
        continue;
      }

      if (!(region instanceof KGMidiRegion)) {
        await showAlert('Only MIDI regions can be merged. Please adjust your selection and try again.');
        return null;
      }

      const regionTrackId = track.getId().toString();
      if (targetTrackId && targetTrackId !== regionTrackId) {
        await showAlert('Please select only MIDI regions from a single track before merging.');
        return null;
      }

      targetTrackId = regionTrackId;
      selectedMidiRegions.push(region);
    }
  }

  if (selectedMidiRegions.length !== selectedRegionIds.length || !targetTrackId) {
    await showAlert('Some selected regions could not be found. Please reselect the MIDI regions and try again.');
    return null;
  }

  const sortedSelectedRegions = [...selectedMidiRegions].sort((a, b) => {
    const startDelta = a.getStartTick() - b.getStartTick();
    if (startDelta !== 0) {
      return startDelta;
    }
    return a.getLengthTicks() - b.getLengthTicks();
  });

  let regionIdsToMerge = selectedRegionIds;
  const firstSelectedRegion = sortedSelectedRegions[0];
  const lastSelectedRegion = sortedSelectedRegions[sortedSelectedRegions.length - 1];
  const spanStart = firstSelectedRegion.getStartTick();
  const spanEnd = lastSelectedRegion.getStartTick() + lastSelectedRegion.getLengthTicks();

  const targetTrack = tracks.find(track => track.getId().toString() === targetTrackId);
  const inBetweenRegions = targetTrack
    ?.getRegions()
    .filter(region => (
      region instanceof KGMidiRegion &&
      !selectedRegionIdSet.has(region.getId()) &&
      region.getStartTick() >= spanStart &&
      region.getStartTick() <= spanEnd
    )) ?? [];

  if (inBetweenRegions.length > 0) {
    const shouldIncludeInBetweenRegions = await showConfirm(
      'There are additional MIDI regions between the first and last selected regions on this track. Would you like KGStudio to merge those as well?',
      {
        confirmLabel: 'Merge All In Between',
        cancelLabel: 'Stop',
      }
    );

    if (!shouldIncludeInBetweenRegions) {
      return null;
    }

    regionIdsToMerge = Array.from(new Set([
      ...selectedRegionIds,
      ...inBetweenRegions.map(region => region.getId()),
    ]));
  }

  try {
    const command = new MergeMidiRegionsCommand(regionIdsToMerge);
    KGCore.instance().executeCommand(command, { rethrow: true });
    refreshProjectState();
    return `Merged ${regionIdsToMerge.length} MIDI regions`;
  } catch (error) {
    await showAlert(error instanceof Error ? error.message : 'Unable to merge the selected MIDI regions.');
    return null;
  }
};
