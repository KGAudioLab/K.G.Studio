import { KGProject } from '../KGProject';

export function upgradeToV16(project: KGProject): KGProject {
  try {
    if (typeof project.getShowGlobalTracks() !== 'boolean') {
      project.setShowGlobalTracks(false);
    }

    if (typeof project.getIsMetronomeEnabled() !== 'boolean') {
      project.setIsMetronomeEnabled(false);
    }
  } finally {
    project.setProjectStructureVersion(16);
  }

  return project;
}
