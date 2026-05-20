import { KGProject } from '../KGProject';

function isValidZoomLevel(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

export function upgradeToV12(project: KGProject): KGProject {
  try {
    const barWidthMultiplier = project.getBarWidthMultiplier?.();
    if (!isValidZoomLevel(barWidthMultiplier)) {
      project.setBarWidthMultiplier(1);
    }

    const pianoRollZoom = project.getPianoRollZoom?.();
    if (!isValidZoomLevel(pianoRollZoom)) {
      project.setPianoRollZoom(1);
    }
  } finally {
    project.setProjectStructureVersion(12);
  }

  return project;
}
