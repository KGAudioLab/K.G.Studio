import { KGProject } from '../KGProject';

export function upgradeToV21(project: KGProject): KGProject {
  if (project.getProjectStructureVersion() >= 21) return project;
  for (const track of project.getTracks()) {
    const pan = track.getPan();
    if (typeof pan !== 'number' || !Number.isFinite(pan) || pan < -1 || pan > 1) {
      track.setPan(0);
    }
  }
  project.setProjectStructureVersion(21);
  return project;
}
