import { KGProject } from '../KGProject';

export function upgradeToV10(project: KGProject): KGProject {
  try {
    for (const track of project.getTracks()) {
      const volumeAutomation = (track as unknown as { volumeAutomation?: unknown }).volumeAutomation;
      if (!Array.isArray(volumeAutomation)) {
        track.setVolumeAutomation([]);
      }

      const panAutomation = (track as unknown as { panAutomation?: unknown }).panAutomation;
      if (!Array.isArray(panAutomation)) {
        track.setPanAutomation([]);
      }
    }
  } finally {
    project.setProjectStructureVersion(10);
  }

  return project;
}
