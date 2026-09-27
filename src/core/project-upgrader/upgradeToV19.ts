import { KGProject } from '../KGProject';

export function upgradeToV19(project: KGProject): KGProject {
  try {
    project.setRightPanel('musicAssistant');
    project.setPianoRollSnapping('none');
  } finally {
    project.setProjectStructureVersion(19);
  }

  return project;
}
