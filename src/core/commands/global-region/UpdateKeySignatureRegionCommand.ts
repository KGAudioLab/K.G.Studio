import { KGCommand } from '../KGCommand';
import { KGCore } from '../../KGCore';
import type { KeySignature } from '../../KGProject';
import { findGlobalTrackContainingRegion } from '../../../util/globalTrackUtil';
import { KGKeySignatureRegion } from '../../region/KGKeySignatureRegion';
import { buildFollowKeyTransposePlan, type FollowKeyTransposePlan } from '../../../util/midiTransposeUtil';
import { buildChordTransposePlan, type ChordTransposePlan } from '../../../util/chordTransposeUtil';
import { getKeySignatureTransposeDelta } from '../../../util/midiTransposeUtil';

export class UpdateKeySignatureRegionCommand extends KGCommand {
  private readonly regionId: string;
  private readonly nextKeySignature: KeySignature;
  private previousKeySignature: KeySignature | null = null;
  private transposePlan: FollowKeyTransposePlan | null = null;
  private chordTransposePlan: ChordTransposePlan | null = null;
  private readonly transposeChords: boolean;

  constructor(regionId: string, nextKeySignature: KeySignature, transposeChords = false) {
    super();
    this.regionId = regionId;
    this.nextKeySignature = nextKeySignature;
    this.transposeChords = transposeChords;
  }

  execute(): void {
    const project = KGCore.instance().getCurrentProject();
    const result = findGlobalTrackContainingRegion(project, this.regionId);
    if (!result || !(result.region instanceof KGKeySignatureRegion)) {
      throw new Error(`Key signature region with ID ${this.regionId} not found`);
    }

    this.previousKeySignature = result.region.getKeySignature();
    const scope = {
      startBeat: result.region.getStartFromBeat(),
      endBeat: result.region.getStartFromBeat() + result.region.getLength(),
    };
    this.transposePlan = buildFollowKeyTransposePlan(project, this.previousKeySignature, this.nextKeySignature, scope);
    this.chordTransposePlan = this.transposeChords
      ? buildChordTransposePlan(
        project,
        getKeySignatureTransposeDelta(this.previousKeySignature, this.nextKeySignature),
        this.nextKeySignature,
        scope,
      )
      : null;
    this.transposePlan.apply();
    this.chordTransposePlan?.apply();
    result.region.setKeySignature(this.nextKeySignature);
  }

  undo(): void {
    const result = findGlobalTrackContainingRegion(KGCore.instance().getCurrentProject(), this.regionId);
    if (!result || !(result.region instanceof KGKeySignatureRegion) || !this.previousKeySignature) {
      throw new Error(`Key signature region with ID ${this.regionId} not found during undo`);
    }

    result.region.setKeySignature(this.previousKeySignature);
    this.chordTransposePlan?.undo();
    this.transposePlan?.undo();
  }

  getDescription(): string {
    return `Change key signature to "${this.nextKeySignature}"`;
  }
}
