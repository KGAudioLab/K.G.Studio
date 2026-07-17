import { beforeEach, describe, expect, it, vi } from 'vitest';
import { KGCore } from '../KGCore';
import { KGProject } from '../KGProject';
import { KGMidiTrack } from '../track/KGMidiTrack';
import { KGMidiRegion } from '../region/KGMidiRegion';
import { KGMidiNote } from '../midi/KGMidiNote';
import { KGKeySignatureRegion } from '../region/KGKeySignatureRegion';
import { GlobalTrackType } from '../global-track';
import { UpdateMidiTrackTransposeCommand } from './track/UpdateMidiTrackTransposeCommand';
import { UpdateMidiRegionTransposeCommand } from './region/UpdateMidiRegionTransposeCommand';
import { UpdateKeySignatureRegionCommand } from './global-region/UpdateKeySignatureRegionCommand';
import { ChangeProjectPropertyCommand } from './project/ChangeProjectPropertyCommand';
import { UpdateTrackCommand } from './track/UpdateTrackCommand';
import { KGAudioInterface } from '../audio-interface/KGAudioInterface';
import { KGChordRegion } from '../region/KGChordRegion';

function note(id: string, start: number, pitch: number): KGMidiNote {
  return new KGMidiNote(id, start, start + 1, pitch, 100);
}

function setupProject(): { project: KGProject; track: KGMidiTrack; first: KGMidiRegion; second: KGMidiRegion } {
  const project = new KGProject('Transpose');
  const track = new KGMidiTrack('Lead', 1);
  const first = new KGMidiRegion('first', '1', 0, 'First', 0, 8);
  const second = new KGMidiRegion('second', '1', 0, 'Second', 8, 8);
  first.setNotes([note('a', 1, 60), note('b', 5, 64)]);
  second.setNotes([note('c', 1, 67)]);
  track.setRegions([first, second]);
  project.setTracks([track]);
  vi.spyOn(KGCore, 'instance').mockReturnValue({ getCurrentProject: () => project } as unknown as KGCore);
  return { project, track, first, second };
}

describe('MIDI transpose commands', () => {
  beforeEach(() => vi.restoreAllMocks());

  it('applies only the track transpose delta to inheriting regions and undoes atomically', () => {
    const { track, first, second } = setupProject();
    track.setTransposeSettings({ followKeySignature: false, transpose: 2 });
    second.setTransposeSettingsOverride({ followKeySignature: false, transpose: -1 });

    const command = new UpdateMidiTrackTransposeCommand(1, { followKeySignature: true, transpose: 5 }, false);
    command.execute();

    expect(first.getNotes().map(item => item.getPitch())).toEqual([63, 67]);
    expect(second.getNotes()[0].getPitch()).toBe(67);
    expect(track.getTransposeSettings()).toEqual({ followKeySignature: true, transpose: 5 });

    command.undo();
    expect(first.getNotes().map(item => item.getPitch())).toEqual([60, 64]);
    expect(track.getTransposeSettings()).toEqual({ followKeySignature: false, transpose: 2 });
  });

  it('reconciles a region when switching from override to inheritance', () => {
    const { track, first } = setupProject();
    track.setTransposeSettings({ followKeySignature: true, transpose: 5 });
    first.setTransposeSettingsOverride({ followKeySignature: false, transpose: 2 });

    const command = new UpdateMidiRegionTransposeCommand(first.getId(), null);
    command.execute();
    expect(first.getNotes().map(item => item.getPitch())).toEqual([63, 67]);
    expect(first.getTransposeSettingsOverride()).toBeNull();
    command.undo();
    expect(first.getNotes().map(item => item.getPitch())).toEqual([60, 64]);
    expect(first.getTransposeSettingsOverride()).toEqual({ followKeySignature: false, transpose: 2 });
  });

  it('rejects a whole track operation when any pitch would overflow', () => {
    const { track, first } = setupProject();
    first.getNotes()[0].setPitch(127);
    const command = new UpdateMidiTrackTransposeCommand(1, { followKeySignature: false, transpose: 1 }, false);
    expect(() => command.execute()).toThrow(/outside 0-127/);
    expect(first.getNotes()[0].getPitch()).toBe(127);
    expect(track.getTransposeSettings().transpose).toBe(0);
  });

  it('transposes only note starts in a changed key region and increments each effective owner once', () => {
    const { project, track, first } = setupProject();
    track.setTransposeSettings({ followKeySignature: true, transpose: 0 });
    const signatureTrack = project.getGlobalTracks().find(item => item.getType() === GlobalTrackType.Signature)!;
    const keyRegion = new KGKeySignatureRegion('key', signatureTrack.getId(), signatureTrack.getTrackIndex(), 'C major', 0, 1, 4);
    signatureTrack.setRegions([keyRegion]);

    const command = new UpdateKeySignatureRegionCommand('key', 'D major');
    command.execute();
    expect(first.getNotes().map(item => item.getPitch())).toEqual([62, 64]);
    expect(track.getTransposeSettings().transpose).toBe(2);
    command.undo();
    expect(first.getNotes().map(item => item.getPitch())).toEqual([60, 64]);
    expect(track.getTransposeSettings().transpose).toBe(0);
  });

  it('transposes and splits overlapping chords with a scoped key change in the same undo', () => {
    const { project } = setupProject();
    const signatureTrack = project.getGlobalTracks().find(item => item.getType() === GlobalTrackType.Signature)!;
    const chordTrack = project.getGlobalTracks().find(item => item.getType() === GlobalTrackType.Chord)!;
    signatureTrack.setRegions([
      new KGKeySignatureRegion('key', signatureTrack.getId(), signatureTrack.getTrackIndex(), 'C major', 0, 1, 4),
    ]);
    chordTrack.setRegions([
      new KGChordRegion('chord', chordTrack.getId(), chordTrack.getTrackIndex(), 'C7', 2, 4),
    ]);

    const command = new UpdateKeySignatureRegionCommand('key', 'D major', true);
    command.execute();
    expect((chordTrack.getRegions() as KGChordRegion[]).map(region => [
      region.getSymbol(), region.getStartFromBeat(), region.getLength(),
    ])).toEqual([['D7', 2, 2], ['C7', 4, 2]]);

    command.undo();
    expect((chordTrack.getRegions() as KGChordRegion[]).map(region => [
      region.getId(), region.getSymbol(), region.getStartFromBeat(), region.getLength(),
    ])).toEqual([['chord', 'C7', 2, 4]]);
    expect((signatureTrack.getRegions()[0] as KGKeySignatureRegion).getKeySignature()).toBe('C major');
  });

  it('transposes every eligible note for a project fallback-key change', () => {
    const { project, track, first, second } = setupProject();
    track.setTransposeSettings({ followKeySignature: true, transpose: 2 });
    const command = new ChangeProjectPropertyCommand({ keySignature: 'A minor' });
    command.execute();
    expect([...first.getNotes(), ...second.getNotes()].map(item => item.getPitch())).toEqual([57, 61, 64]);
    expect(track.getTransposeSettings().transpose).toBe(-1);
    expect(project.getKeySignature()).toBe('A minor');
  });

  it('optionally transposes every chord for a project fallback-key change', () => {
    const { project } = setupProject();
    const chordTrack = project.getGlobalTracks().find(item => item.getType() === GlobalTrackType.Chord)!;
    chordTrack.setRegions([
      new KGChordRegion('first-chord', chordTrack.getId(), chordTrack.getTrackIndex(), 'C', 0, 4),
      new KGChordRegion('second-chord', chordTrack.getId(), chordTrack.getTrackIndex(), 'Am7', 4, 4),
    ]);
    const command = new ChangeProjectPropertyCommand(
      { keySignature: 'D major' },
      { transposeChords: true },
    );

    command.execute();
    expect((chordTrack.getRegions() as KGChordRegion[]).map(region => region.getSymbol())).toEqual(['D', 'Bm7']);
    command.undo();
    expect((chordTrack.getRegions() as KGChordRegion[]).map(region => region.getSymbol())).toEqual(['C', 'Am7']);
    expect(project.getKeySignature()).toBe('C major');
  });

  it('rejects a key update atomically when its transpose counter would overflow', () => {
    const { project, track, first } = setupProject();
    track.setTransposeSettings({ followKeySignature: true, transpose: 36 });
    const command = new ChangeProjectPropertyCommand({ keySignature: 'D major' });
    expect(() => command.execute()).toThrow(/between -36 and 36/);
    expect(project.getKeySignature()).toBe('C major');
    expect(first.getNotes()[0].getPitch()).toBe(60);
    expect(track.getTransposeSettings().transpose).toBe(36);
  });

  it('forces percussion no-transpose and restores it with the instrument in one undo', () => {
    const { track } = setupProject();
    track.setNoTranspose(false);
    vi.spyOn(KGAudioInterface, 'instance').mockReturnValue({ setTrackInstrument: vi.fn() } as unknown as KGAudioInterface);
    const command = new UpdateTrackCommand(1, { instrument: 'standard' });
    command.execute();
    expect(track.getInstrument()).toBe('standard');
    expect(track.getNoTranspose()).toBe(true);
    command.undo();
    expect(track.getInstrument()).toBe('acoustic_grand_piano');
    expect(track.getNoTranspose()).toBe(false);
  });
});
