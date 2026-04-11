import { KGProject } from '../KGProject';

export function upgradeToV5(project: KGProject): KGProject {
  try {
    const current = project.getBarWidthMultiplier?.();
    if (current === undefined || current === null) {
      project.setBarWidthMultiplier(1);
    }
  } finally {
    project.setProjectStructureVersion(5);
  }
  return project;
}
