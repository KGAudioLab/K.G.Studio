import { KGProject } from '../KGProject';
import { ensureDefaultGlobalTracks } from '../../util/globalTrackUtil';

export function upgradeToV13(project: KGProject): KGProject {
  try {
    ensureDefaultGlobalTracks(project);
  } finally {
    project.setProjectStructureVersion(13);
  }

  return project;
}
