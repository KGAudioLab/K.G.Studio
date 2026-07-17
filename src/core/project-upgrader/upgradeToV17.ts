import { KGProject } from '../KGProject';
import { KGMidiTrack } from '../track/KGMidiTrack';
import { isPercussionInstrument } from '../instruments/instrumentResolver';

export function upgradeToV17(project: KGProject): KGProject {
  try {
    for (const track of project.getTracks()) {
      if (!(track instanceof KGMidiTrack)) continue;
      track.setTransposeSettings(track.getTransposeSettings());
      track.setNoTranspose(isPercussionInstrument(String(track.getInstrument())));
      for (const region of track.getRegions()) {
        region.setTransposeSettingsOverride(region.getTransposeSettingsOverride());
      }
    }
  } finally {
    project.setProjectStructureVersion(17);
  }
  return project;
}
