import { KGProject } from '../KGProject';

export function upgradeToV22(project: KGProject): KGProject {
  if (project.getProjectStructureVersion() >= 22) return project;
  for (const track of project.getTracks()) track.setFX(track.getFX() ?? []);
  project.setProjectStructureVersion(22);
  return project;
}
