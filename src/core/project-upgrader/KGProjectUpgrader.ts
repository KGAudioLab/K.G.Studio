import { KGProject } from '../KGProject';
import { upgradeToV1 } from './upgradeToV1';
import { upgradeToV2 } from './upgradeToV2';
import { upgradeToV3 } from './upgradeToV3';
import { upgradeToV4 } from './upgradeToV4';
import { upgradeToV5 } from './upgradeToV5';
import { upgradeToV6 } from './upgradeToV6';
import { upgradeToV7 } from './upgradeToV7';
import { upgradeToV8 } from './upgradeToV8';

/**
 * Upgrade the given project to the latest structure version, one version at a time.
 * This function is safe to call multiple times; it will no-op if up-to-date.
 */
export function upgradeProjectToLatest(project: KGProject): KGProject {
  if (!project) return project;

  const currentVersion = project.getProjectStructureVersion?.() ?? 0;
  const targetVersion = KGProject.CURRENT_PROJECT_STRUCTURE_VERSION;

  if (currentVersion >= targetVersion) {
    return project;
  }

  let workingProject: KGProject = project;

  for (let nextVersion = currentVersion + 1; nextVersion <= targetVersion; nextVersion++) {
    switch (nextVersion) {
      case 1: {
        workingProject = upgradeToV1(workingProject);
        break;
      }
      case 2: {
        workingProject = upgradeToV2(workingProject);
        break;
      }
      case 3: {
        workingProject = upgradeToV3(workingProject);
        break;
      }
      case 4: {
        workingProject = upgradeToV4(workingProject);
        break;
      }
      case 5: {
        workingProject = upgradeToV5(workingProject);
        break;
      }
      case 6: {
        workingProject = upgradeToV6(workingProject);
        break;
      }
      case 7: {
        workingProject = upgradeToV7(workingProject);
        break;
      }
      case 8: {
        workingProject = upgradeToV8(workingProject);
        break;
      }
      default: {
        // If an upgrader is missing, throw to prevent loading incompatible structures
        throw new Error(`No upgrader found for project structure version ${nextVersion}`);
      }
    }
  }

  return workingProject;
}
