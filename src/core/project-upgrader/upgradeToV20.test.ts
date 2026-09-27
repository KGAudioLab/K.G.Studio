import { describe, expect, it } from 'vitest';
import { instanceToPlain, plainToInstance } from 'class-transformer';
import { KGProject } from '../KGProject';
import { KGMidiTrack } from '../track/KGMidiTrack';
import { KGAudioTrack } from '../track/KGAudioTrack';
import { KGMidiRegion } from '../region/KGMidiRegion';
import { KGMidiNote } from '../midi/KGMidiNote';
import { KGAudioRegion } from '../region/KGAudioRegion';
import { KGTrackAutomationPoint } from '../track/KGTrackAutomationPoint';
import { upgradeProjectToLatest } from './KGProjectUpgrader';
import { tickToSeconds } from '../../util/globalTrackUtil';

function attachLegacyNumber(target: object, key: string, value: number): void {
  (target as Record<string, unknown>)[key] = value;
}

describe('upgradeToV20', () => {
  it.each([
    { signature: { numerator: 4, denominator: 4 }, oldBpm: 120, expectedBpm: 120, scale: 960 },
    { signature: { numerator: 6, denominator: 8 }, oldBpm: 120, expectedBpm: 60, scale: 480 },
  ])('preserves layout and elapsed time for $signature.numerator/$signature.denominator', ({ signature, oldBpm, expectedBpm, scale }) => {
    const midiTrack = new KGMidiTrack('MIDI', 1, 'acoustic_grand_piano');
    const midiRegion = new KGMidiRegion('midi', '1', 0, 'MIDI', 0, 0);
    const note = new KGMidiNote('note', 0, 0, 60, 100);
    attachLegacyNumber(midiRegion, 'startFromBeat', signature.numerator);
    attachLegacyNumber(midiRegion, 'length', 2);
    attachLegacyNumber(note, 'startBeat', 0.5);
    attachLegacyNumber(note, 'endBeat', 1.5);
    midiRegion.addNote(note);
    midiTrack.addRegion(midiRegion);
    const automation = new KGTrackAutomationPoint('volume', 0, -3);
    attachLegacyNumber(automation, 'beat', 1.25);
    midiTrack.setVolumeAutomation([automation]);

    const audioTrack = new KGAudioTrack('Audio', 2);
    const audioRegion = new KGAudioRegion('audio', '2', 1, 'Audio', 0, 0, 'file', 'file.wav', 12.5, 1.75);
    attachLegacyNumber(audioRegion, 'startFromBeat', 2);
    attachLegacyNumber(audioRegion, 'length', 4);
    audioTrack.addRegion(audioRegion);

    const project = new KGProject('Legacy', 8, 0, oldBpm, signature, 'C major', 'ionian', false, [0, 0], 2, [midiTrack, audioTrack], 19);
    attachLegacyNumber(project, 'playheadPosition', signature.numerator);
    const oldElapsedSeconds = signature.numerator * 60 / oldBpm;

    upgradeProjectToLatest(project);

    expect(project.getProjectStructureVersion()).toBe(20);
    expect(project.getBpm()).toBe(expectedBpm);
    expect(project.getPlayheadTick()).toBe(signature.numerator * scale);
    expect(midiRegion.getStartTick()).toBe(signature.numerator * scale);
    expect(midiRegion.getLengthTicks()).toBe(2 * scale);
    expect(note.getStartTick()).toBe(Math.round(0.5 * scale));
    expect(note.getEndTick()).toBe(Math.round(1.5 * scale));
    expect(automation.getTick()).toBe(Math.round(1.25 * scale));
    expect(tickToSeconds(project, project.getPlayheadTick())).toBeCloseTo(oldElapsedSeconds);
    expect(audioRegion.getAudioDurationSeconds()).toBe(12.5);
    expect(audioRegion.getClipStartOffsetSeconds()).toBe(1.75);

    const once = instanceToPlain(project);
    upgradeProjectToLatest(project);
    expect(instanceToPlain(project)).toEqual(once);
    expect(once).not.toHaveProperty('playheadPosition');
    expect(instanceToPlain(midiRegion)).not.toHaveProperty('startFromBeat');
    expect(instanceToPlain(note)).not.toHaveProperty('startBeat');

    const restored = plainToInstance(KGProject, once);
    upgradeProjectToLatest(restored);
    expect(restored.getProjectStructureVersion()).toBe(20);
    expect(restored.getPlayheadTick()).toBe(signature.numerator * scale);
  });
});
