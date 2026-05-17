import { KGProject } from '../KGProject';

export function upgradeToV11(project: KGProject): KGProject {
  try {
    for (const track of project.getTracks()) {
      const muted = (track as unknown as { muted?: unknown }).muted;
      if (typeof muted !== 'boolean') {
        track.setMuted(false);
      }

      const solo = (track as unknown as { solo?: unknown }).solo;
      if (typeof solo !== 'boolean') {
        track.setSolo(false);
      }
    }
  } finally {
    project.setProjectStructureVersion(11);
  }

  return project;
}
