import { KGCore } from '../core/KGCore';
import { useProjectStore } from '../stores/projectStore';
import { KGMidiRegion } from '../core/region/KGMidiRegion';
import { KGTrack } from '../core/track/KGTrack';
import { KGMidiNote } from '../core/midi/KGMidiNote';

/**
 * Select all notes in the active region if the piano roll is visible.
 * Logs the count and region id on success.
 * Returns true if selection was performed; false otherwise.
 */
export const selectAllNotesInActiveRegion = (): boolean => {
  const { showPianoRoll, activeRegionId, updateTrack } = useProjectStore.getState();
  if (!showPianoRoll || !activeRegionId) {
    return false;
  }

  try {
    const core = KGCore.instance();
    const project = core.getCurrentProject();
    const tracks = project.getTracks();

    let parentTrack: KGTrack | null = null;
    let activeRegion: KGMidiRegion | null = null;

    for (const track of tracks) {
      const region = track.getRegions().find(r => r.getId() === activeRegionId);
      if (region && region instanceof KGMidiRegion) {
        parentTrack = track as KGTrack;
        activeRegion = region as KGMidiRegion;
        break;
      }
    }

    if (!activeRegion || !parentTrack) {
      return false;
    }

    // Clear previous selection and select all notes in the region
    core.clearSelectedItems();
    const notes: KGMidiNote[] = activeRegion.getNotes();
    notes.forEach((n: KGMidiNote) => n.select());
    core.addSelectedItems(notes);

    // Update track to persist selection state in model/UI
    updateTrack(parentTrack);

    console.log(`Selected all notes: count=${notes.length}, regionId=${activeRegionId}`);
    return true;
  } catch (error) {
    console.error('Select all notes failed:', error);
    return false;
  }
};


