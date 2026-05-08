import { KGProject } from '../KGProject';
import { KGMidiRegion } from '../region/KGMidiRegion';

export function upgradeToV9(project: KGProject): KGProject {
  try {
    for (const track of project.getTracks()) {
      for (const region of track.getRegions()) {
        if (region instanceof KGMidiRegion) {
          const candidate = (region as unknown as { controllerEventsByType?: unknown }).controllerEventsByType;
          if (!Array.isArray(candidate) || candidate.length !== 128) {
            region.setControllerEventsByType([]);
          } else {
            region.setControllerEventsByType(candidate as never);
          }
        }
      }
    }
  } finally {
    project.setProjectStructureVersion(9);
  }

  return project;
}
