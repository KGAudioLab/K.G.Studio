import { KGProject } from '../KGProject';
import { GlobalTrackType } from '../global-track';
import { ensureDefaultGlobalTracks, getSortedKeySignatureRegions } from '../../util/globalTrackUtil';

export function upgradeToV14(project: KGProject): KGProject {
  try {
    ensureDefaultGlobalTracks(project);

    const signatureTrack = project.getGlobalTracks().find(track => track.getType() === GlobalTrackType.Signature);
    if (signatureTrack) {
      const projectTimeSignature = project.getTimeSignature();
  const ticksPerBar = projectTimeSignature.numerator * 960 * (4 / projectTimeSignature.denominator);
      const regions = getSortedKeySignatureRegions(signatureTrack, ticksPerBar);
      signatureTrack.setRegions(regions);
    }
  } finally {
    project.setProjectStructureVersion(14);
  }

  return project;
}
