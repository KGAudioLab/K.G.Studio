import { KGProject } from '../KGProject';
import { ensureDefaultGlobalTracks } from '../../util/globalTrackUtil';

export function upgradeToV15(project: KGProject): KGProject {
  try {
    ensureDefaultGlobalTracks(project);
  } finally {
    project.setProjectStructureVersion(15);
  }

  return project;
}
