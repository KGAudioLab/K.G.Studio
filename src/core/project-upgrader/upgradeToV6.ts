import { KGProject } from '../KGProject';
import { KGAudioRegion } from '../region/KGAudioRegion';

export function upgradeToV6(project: KGProject): KGProject {
  try {
    // Ensure all audio regions have clipStartOffsetSeconds initialized
    for (const track of project.getTracks()) {
      for (const region of track.getRegions()) {
        if (region instanceof KGAudioRegion) {
          const current = region.getClipStartOffsetSeconds?.();
          if (current === undefined || current === null) {
            region.setClipStartOffsetSeconds(0);
          }
        }
      }
    }
  } finally {
    project.setProjectStructureVersion(6);
  }
  return project;
}
