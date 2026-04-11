import { KGProject } from '../KGProject';

/**
 * Upgrade a project from structure version 3 to 4.
 * Adds audio track support. No data migration needed — existing projects have no audio tracks.
 */
export function upgradeToV4(project: KGProject): KGProject {
  try {
    // No data migration needed for audio track support.
    // The new KGAudioTrack and KGAudioRegion subtypes are registered in
    // the class-transformer discriminators and will be deserialized automatically.
  } finally {
    project.setProjectStructureVersion(4);
  }

  return project;
}
