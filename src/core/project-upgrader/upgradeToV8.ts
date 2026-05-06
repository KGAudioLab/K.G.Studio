import { KGProject } from '../KGProject';
import { KGMidiRegion } from '../region/KGMidiRegion';

export function upgradeToV8(project: KGProject): KGProject {
  try {
    for (const track of project.getTracks()) {
      for (const region of track.getRegions()) {
        if (region instanceof KGMidiRegion) {
          const candidate = (region as unknown as { pitchBends?: unknown }).pitchBends;
          if (!Array.isArray(candidate)) {
            region.setPitchBends([]);
          }
        }
      }
    }
  } finally {
    project.setProjectStructureVersion(8);
  }

  return project;
}
