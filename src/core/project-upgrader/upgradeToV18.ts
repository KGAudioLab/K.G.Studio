import { KGProject } from '../KGProject';

export function upgradeToV18(project: KGProject): KGProject {
  try {
    // Snapping was always enabled and bar-aligned before v18. Assign these
    // values explicitly because fresh v18 projects intentionally default to beats.
    project.setIsSnappingEnabled(true);
    project.setSnappingMode('bar');
  } finally {
    project.setProjectStructureVersion(18);
  }

  return project;
}
