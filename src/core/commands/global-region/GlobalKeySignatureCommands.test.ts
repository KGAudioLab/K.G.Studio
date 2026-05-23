import { beforeEach, describe, expect, it, vi } from 'vitest';
import { KGCore } from '../../KGCore';
import { KGProject } from '../../KGProject';
import { GlobalTrackType } from '../../global-track';
import { KGKeySignatureRegion } from '../../region/KGKeySignatureRegion';
import { CreateKeySignatureRegionCommand } from './CreateKeySignatureRegionCommand';
import { DeleteKeySignatureRegionCommand } from './DeleteKeySignatureRegionCommand';
import { ResizeKeySignatureRegionCommand } from './ResizeKeySignatureRegionCommand';
import { UpdateKeySignatureRegionCommand } from './UpdateKeySignatureRegionCommand';

describe('global key signature region commands', () => {
  beforeEach(() => {
    const project = new KGProject('Signatures', 8, 0, 120);
    const mockCore = KGCore.instance() as unknown as {
      getCurrentProject: ReturnType<typeof vi.fn>;
    };

    mockCore.getCurrentProject.mockReturnValue(project);
  });

  const getSignatureTrack = () => {
    const signatureTrack = KGCore.instance().getCurrentProject().getGlobalTracks()
      .find(track => track.getType() === GlobalTrackType.Signature);

    if (!signatureTrack) {
      throw new Error('Signature track missing in test setup');
    }

    return signatureTrack;
  };

  it('creates the first explicit region by splitting the project default coverage', () => {
    const command = new CreateKeySignatureRegionCommand(3);
    command.execute();

    const signatureTrack = getSignatureTrack();
    const regions = signatureTrack.getRegions() as KGKeySignatureRegion[];

    expect(regions).toHaveLength(2);
    expect(regions[0].getStartBar()).toBe(0);
    expect(regions[0].getLengthBars()).toBe(3);
    expect(regions[0].getKeySignature()).toBe('C major');
    expect(regions[1].getStartBar()).toBe(3);
    expect(regions[1].getLengthBars()).toBe(5);
    expect(regions[1].getKeySignature()).toBe('C major');
  });

  it('creates additional regions by splitting the covered span and inheriting the key', () => {
    const signatureTrack = getSignatureTrack();
    signatureTrack.setRegions([
      new KGKeySignatureRegion('left', signatureTrack.getId(), signatureTrack.getTrackIndex(), 'C major', 0, 8, 4),
    ]);

    const command = new CreateKeySignatureRegionCommand(5);
    command.execute();

    const regions = signatureTrack.getRegions() as KGKeySignatureRegion[];
    expect(regions).toHaveLength(2);
    expect(regions[0].getLengthBars()).toBe(5);
    expect(regions[1].getStartBar()).toBe(5);
    expect(regions[1].getLengthBars()).toBe(3);
    expect(regions[1].getKeySignature()).toBe('C major');
  });

  it('resizes a shared boundary and keeps the track gapless', () => {
    const signatureTrack = getSignatureTrack();
    signatureTrack.setRegions([
      new KGKeySignatureRegion('left', signatureTrack.getId(), signatureTrack.getTrackIndex(), 'C major', 0, 4, 4),
      new KGKeySignatureRegion('right', signatureTrack.getId(), signatureTrack.getTrackIndex(), 'G major', 4, 4, 4),
    ]);

    const command = new ResizeKeySignatureRegionCommand('left', 'end', 6);
    command.execute();

    const regions = signatureTrack.getRegions() as KGKeySignatureRegion[];
    expect(regions[0].getLengthBars()).toBe(6);
    expect(regions[1].getStartBar()).toBe(6);
    expect(regions[1].getLengthBars()).toBe(2);
  });

  it('deletes a middle region by extending the previous region', () => {
    const signatureTrack = getSignatureTrack();
    signatureTrack.setRegions([
      new KGKeySignatureRegion('first', signatureTrack.getId(), signatureTrack.getTrackIndex(), 'C major', 0, 2, 4),
      new KGKeySignatureRegion('middle', signatureTrack.getId(), signatureTrack.getTrackIndex(), 'G major', 2, 3, 4),
      new KGKeySignatureRegion('last', signatureTrack.getId(), signatureTrack.getTrackIndex(), 'D major', 5, 3, 4),
    ]);

    const command = new DeleteKeySignatureRegionCommand('middle');
    command.execute();

    const regions = signatureTrack.getRegions() as KGKeySignatureRegion[];
    expect(regions).toHaveLength(2);
    expect(regions[0].getLengthBars()).toBe(5);
    expect(regions[1].getStartBar()).toBe(5);
  });

  it('deletes the first region by extending the next region leftward', () => {
    const signatureTrack = getSignatureTrack();
    signatureTrack.setRegions([
      new KGKeySignatureRegion('first', signatureTrack.getId(), signatureTrack.getTrackIndex(), 'C major', 0, 2, 4),
      new KGKeySignatureRegion('next', signatureTrack.getId(), signatureTrack.getTrackIndex(), 'G major', 2, 6, 4),
    ]);

    const command = new DeleteKeySignatureRegionCommand('first');
    command.execute();

    const regions = signatureTrack.getRegions() as KGKeySignatureRegion[];
    expect(regions).toHaveLength(1);
    expect(regions[0].getStartBar()).toBe(0);
    expect(regions[0].getLengthBars()).toBe(8);
  });

  it('allows deleting the last remaining region', () => {
    const signatureTrack = getSignatureTrack();
    signatureTrack.setRegions([
      new KGKeySignatureRegion('only', signatureTrack.getId(), signatureTrack.getTrackIndex(), 'C major', 0, 8, 4),
    ]);

    const command = new DeleteKeySignatureRegionCommand('only');
    command.execute();

    expect(signatureTrack.getRegions()).toHaveLength(0);
    command.undo();
    expect(signatureTrack.getRegions()).toHaveLength(1);
  });

  it('updates the region key signature with undo support', () => {
    const signatureTrack = getSignatureTrack();
    signatureTrack.setRegions([
      new KGKeySignatureRegion('region', signatureTrack.getId(), signatureTrack.getTrackIndex(), 'C major', 0, 8, 4),
    ]);

    const command = new UpdateKeySignatureRegionCommand('region', 'G major');
    command.execute();
    expect((signatureTrack.getRegions()[0] as KGKeySignatureRegion).getKeySignature()).toBe('G major');
    command.undo();
    expect((signatureTrack.getRegions()[0] as KGKeySignatureRegion).getKeySignature()).toBe('C major');
  });
});
