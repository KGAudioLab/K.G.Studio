import { describe, expect, it, vi } from 'vitest';
import { KGProject } from '../../core/KGProject';
import { KGMidiRegion } from '../../core/region/KGMidiRegion';
import { KGMidiTrack } from '../../core/track/KGMidiTrack';
import { KGMidiNote } from '../../core/midi/KGMidiNote';
import { KGMidiControllerEvent } from '../../core/midi/KGMidiControllerEvent';
import { KGTempoRegion } from '../../core/region/KGTempoRegion';
import { KGCore } from '../../core/KGCore';
import { HumanizeMidiRegionCommand } from '../../core/commands/region/HumanizeMidiRegionCommand';
import { resolveMidiAutomationValueAtTick } from '../midiAutomationUtil';
import { aireInputSnapshot, buildAireTarget } from './target';
import { instanceToPlain, plainToInstance } from 'class-transformer';
function fixture() {
  const project = new KGProject();
  const track = new KGMidiTrack('track', 0, 'Strings');
  const region = new KGMidiRegion('region', 'track', 0, 'Phrase', 0, 15360);
  region.setNotes([new KGMidiNote('note', 960, 12000, 60, 64)]);
  track.addRegion(region); project.setTracks([track]);
  return { project, track, region };
}
describe('AIRE region targeting and undo', () => {
  it('intersects enabled loops and preserves crossing-note context', () => {
    const { project, region } = fixture();
    project.setIsLooping(true); project.setLoopingRange([1, 1]);
    const target = buildAireTarget(project, region)!;
    expect(target.startTick).toBe(3840); expect(target.endTick).toBe(7680);
    expect(target.sections[0].notes[0]).toMatchObject({ start: -3, end: 8.5 });
    expect(target.sections[0].originBeat).toBe(4);
    project.setLoopingRange([8, 9]); expect(buildAireTarget(project, region)).toBeNull();
    region.setNotes([]); project.setIsLooping(false); expect(buildAireTarget(project, region)).toBeNull();
  });
  it('splits at effective tempo-region entry and exit', () => {
    const { project, region } = fixture();
    const tempoTrack = project.getGlobalTracks().find(t => t.getType() === 'tempo')!;
    tempoTrack.addRegion(new KGTempoRegion('tempo', tempoTrack.getId(), 0, 90, 1, 1));
    const target = buildAireTarget(project, region)!;
    expect(target.sections.map(s => [s.originBeat, s.duration, s.tempo])).toEqual([[0, 4, 120], [4, 4, 90], [8, 8, 120]]);
    const old = aireInputSnapshot(project, region); region.getNotes()[0].setVelocity(80);
    expect(aireInputSnapshot(project, region)).not.toBe(old);
  });
  it('replaces only CC1 and preserves surrounding interpolation through undo/redo and serialization', () => {
    const { project, region } = fixture();
    vi.mocked(KGCore.instance().getCurrentProject).mockReturnValue(project);
    region.setControllerEvents(1, [new KGMidiControllerEvent('before', 0, 0), new KGMidiControllerEvent('inside', 5000, 100), new KGMidiControllerEvent('after', 10000, 50)]);
    region.setControllerEvents(11, [new KGMidiControllerEvent('other', 5000, 70)]);
    const original = instanceToPlain(region);
    const old = region.getControllerEvents(1).map(e => ({ tick: e.getTick(), value: e.getValue() }));
    const cmd = new HumanizeMidiRegionCommand(region, 3840, 7680, [{ tick: 3840, value: 20 }, { tick: 7620, value: 90 }]);
    cmd.execute();
    const changed = instanceToPlain(region);
    expect(region.getNotes()[0].getVelocity()).toBe(64); expect(region.getControllerEvents(11)[0].getValue()).toBe(70);
    expect(region.getControllerEvents(1).some(e => e.getId() === 'inside')).toBe(false);
    const next = region.getControllerEvents(1).map(e => ({ tick: e.getTick(), value: e.getValue() }));
    for (const tick of [0, 1000, 3839, 7680, 8000, 10000, 14000]) expect(resolveMidiAutomationValueAtTick(next, tick, 0)).toBeCloseTo(resolveMidiAutomationValueAtTick(old, tick, 0), 10);
    const restored = plainToInstance(KGMidiRegion, changed);
    expect(instanceToPlain(restored)).toEqual(changed);
    cmd.undo(); expect(instanceToPlain(region)).toEqual(original);
    cmd.execute(); expect(instanceToPlain(region)).toEqual(changed);
  });
});
