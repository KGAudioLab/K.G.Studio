import { KGProject } from '../KGProject';

/**
 * Upgrade a project from structure version 1 to 2.
 * Adds the selectedMode field with default value "ionian".
 */
export function upgradeToV2(project: KGProject): KGProject {
  try {
    // Set default selectedMode to "ionian" if not already set
    const currentMode = project.getSelectedMode?.();
    if (!currentMode) {
      project.setSelectedMode("ionian");
    }
  } finally {
    // Always set the project structure version to 2 to mark migration complete
    project.setProjectStructureVersion(2);
  }

  return project;
}
