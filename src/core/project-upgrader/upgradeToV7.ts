import { KGProject } from '../KGProject';
import { AUDIO_INTERFACE_CONSTANTS } from '../../constants/coreConstants';

export function upgradeToV7(project: KGProject): KGProject {
  try {
    // Convert track volumes from 0–1 linear scale to dB
    for (const track of project.getTracks()) {
      const linear = track.getVolume();
      let db: number;
      if (linear <= 0) {
        db = AUDIO_INTERFACE_CONSTANTS.MIN_TRACK_VOLUME_DB;
      } else {
        db = 20 * Math.log10(linear);
        db = Math.max(AUDIO_INTERFACE_CONSTANTS.MIN_TRACK_VOLUME_DB,
             Math.min(AUDIO_INTERFACE_CONSTANTS.MAX_TRACK_VOLUME_DB, db));
      }
      track.setVolume(db);
    }
  } finally {
    project.setProjectStructureVersion(7);
  }
  return project;
}
