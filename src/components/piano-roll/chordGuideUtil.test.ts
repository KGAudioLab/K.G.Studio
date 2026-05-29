import { describe, expect, it } from 'vitest';
import { KGProject } from '../../core/KGProject';
import { GlobalTrackType } from '../../core/global-track';
import { KGKeySignatureRegion } from '../../core/region/KGKeySignatureRegion';
import { getNextChordCandidateIndex, getNextChordGuideSelection, resolveChordGuideContext } from './chordGuideUtil';

describe('chordGuideUtil', () => {
  it('cycles chord guide selection in the expected order', () => {
    expect(getNextChordGuideSelection('N')).toBe('T');
    expect(getNextChordGuideSelection('T')).toBe('S');
    expect(getNextChordGuideSelection('S')).toBe('D');
    expect(getNextChordGuideSelection('D')).toBe('N');
  });

  it('cycles candidate indices forward and backward with wraparound', () => {
    expect(getNextChordCandidateIndex(0, 4, 1)).toBe(1);
    expect(getNextChordCandidateIndex(3, 4, 1)).toBe(0);
    expect(getNextChordCandidateIndex(0, 4, -1)).toBe(3);
    expect(getNextChordCandidateIndex(2, 4, -1)).toBe(1);
  });

  it('leaves candidate index unchanged for empty or single-candidate lists', () => {
    expect(getNextChordCandidateIndex(0, 0, 1)).toBe(0);
    expect(getNextChordCandidateIndex(0, 1, 1)).toBe(0);
    expect(getNextChordCandidateIndex(0, 1, -1)).toBe(0);
  });

  it('resolves ionian from the effective major key signature at the playhead beat', () => {
    const project = new KGProject('test', 16, 0, 120, { numerator: 4, denominator: 4 }, 'C major', 'dorian');
    const signatureTrack = project.getGlobalTracks().find((track) => track.getType() === GlobalTrackType.Signature);
    signatureTrack?.setRegions([
      new KGKeySignatureRegion('sig-0', signatureTrack.getId(), signatureTrack.getTrackIndex(), 'C major', 0, 2, 4),
      new KGKeySignatureRegion('sig-1', signatureTrack.getId(), signatureTrack.getTrackIndex(), 'G major', 2, 2, 4),
    ]);

    expect(resolveChordGuideContext(project, 8)).toEqual({
      keySignature: 'G major',
      mode: 'ionian',
    });
  });

  it('resolves aeolian from the effective minor key signature at the playhead beat', () => {
    const project = new KGProject('test', 16, 0, 120, { numerator: 4, denominator: 4 }, 'C major', 'ionian');
    const signatureTrack = project.getGlobalTracks().find((track) => track.getType() === GlobalTrackType.Signature);
    signatureTrack?.setRegions([
      new KGKeySignatureRegion('sig-0', signatureTrack.getId(), signatureTrack.getTrackIndex(), 'C major', 0, 1, 4),
      new KGKeySignatureRegion('sig-1', signatureTrack.getId(), signatureTrack.getTrackIndex(), 'A minor', 1, 2, 4),
    ]);

    expect(resolveChordGuideContext(project, 4)).toEqual({
      keySignature: 'A minor',
      mode: 'aeolian',
    });
  });
});
