import { beforeEach, describe, expect, it, vi } from 'vitest';
import { KGCore } from '../../KGCore';
import { KGProject } from '../../KGProject';
import { GlobalTrackType } from '../../global-track';
import { KGKeySignatureRegion } from '../../region/KGKeySignatureRegion';
import { WriteKeySignatureTrackCommand } from './WriteKeySignatureTrackCommand';

describe('WriteKeySignatureTrackCommand', () => {
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

  it('rebuilds the full signature track from explicit entries', () => {
    const command = new WriteKeySignatureTrackCommand('C major', [
      { startBeat: 8, keySignature: 'G major' },
      { startBeat: 16, keySignature: 'D major' },
    ]);
    command.execute();

    const regions = getSignatureTrack().getRegions() as KGKeySignatureRegion[];
    expect(regions.map(region => ({
      keySignature: region.getKeySignature(),
      startBar: region.getStartBar(),
      lengthBars: region.getLengthBars(),
    }))).toEqual([
      { keySignature: 'C major', startBar: 0, lengthBars: 2 },
      { keySignature: 'G major', startBar: 2, lengthBars: 2 },
      { keySignature: 'D major', startBar: 4, lengthBars: 4 },
    ]);
  });

  it('replaces an existing multi-region track and restores it on undo', () => {
    const signatureTrack = getSignatureTrack();
    signatureTrack.setRegions([
      new KGKeySignatureRegion('existing-1', signatureTrack.getId(), signatureTrack.getTrackIndex(), 'F major', 0, 3, 4),
      new KGKeySignatureRegion('existing-2', signatureTrack.getId(), signatureTrack.getTrackIndex(), 'Bb major', 3, 5, 4),
    ]);

    const command = new WriteKeySignatureTrackCommand('A minor', [
      { startBeat: 12, keySignature: 'E minor' },
    ]);
    command.execute();

    expect((signatureTrack.getRegions() as KGKeySignatureRegion[]).map(region => region.getKeySignature()))
      .toEqual(['A minor', 'E minor']);

    command.undo();

    expect((signatureTrack.getRegions() as KGKeySignatureRegion[]).map(region => ({
      keySignature: region.getKeySignature(),
      startBar: region.getStartBar(),
      lengthBars: region.getLengthBars(),
    }))).toEqual([
      { keySignature: 'F major', startBar: 0, lengthBars: 3 },
      { keySignature: 'Bb major', startBar: 3, lengthBars: 5 },
    ]);
  });

  it('uses only the base key signature when no explicit entries are provided', () => {
    const command = new WriteKeySignatureTrackCommand('E minor', []);
    command.execute();

    const regions = getSignatureTrack().getRegions() as KGKeySignatureRegion[];
    expect(regions).toHaveLength(1);
    expect(regions[0].getKeySignature()).toBe('E minor');
    expect(regions[0].getStartBar()).toBe(0);
    expect(regions[0].getLengthBars()).toBe(8);
  });
});
