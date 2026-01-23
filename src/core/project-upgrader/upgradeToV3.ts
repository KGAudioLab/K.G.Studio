import { KGProject } from '../KGProject';

/**
 * Upgrade a project from structure version 2 to 3.
 * Adds the isLooping and loopingRange fields with default values.
 */
export function upgradeToV3(project: KGProject): KGProject {
  try {
    // Set default isLooping to false if not already set
    const currentIsLooping = project.getIsLooping?.();
    if (currentIsLooping === undefined) {
      project.setIsLooping(false);
    }

    // Set default loopingRange to [0, 0] if not already set
    const currentLoopingRange = project.getLoopingRange?.();
    if (!currentLoopingRange) {
      project.setLoopingRange([0, 0]);
    }
  } finally {
    // Always set the project structure version to 3 to mark migration complete
    project.setProjectStructureVersion(3);
  }

  return project;
}
