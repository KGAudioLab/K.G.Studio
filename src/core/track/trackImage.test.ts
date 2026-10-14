import { describe, expect, it } from 'vitest';
import { instanceToPlain, plainToInstance } from 'class-transformer';
import { readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import images from 'virtual:instrument-images';
import { KGProject } from '../KGProject';
import { KGMidiTrack } from './KGMidiTrack';
import { KGAudioTrack } from './KGAudioTrack';
import { UserInstrumentRegistry } from '../instruments/UserInstrumentRegistry';
import { vi } from 'vitest';

describe('track image persistence and defaults', () => {
  it('round-trips saved MIDI and audio images through project serialization', () => {
    const midi = new KGMidiTrack('Strings', 1, 'violin');
    const audio = new KGAudioTrack('Voice', 2);
    midi.setImageName('cello.png'); audio.setImageName('microphone.png');
    const project = new KGProject('Images'); project.setTracks([midi, audio]);
    const loaded = plainToInstance(KGProject, instanceToPlain(project));
    expect(loaded.getTracks().map(track => track.getResolvedImageName())).toEqual(['cello.png', 'microphone.png']);
  });

  it('loads legacy projects without image fields and falls back for unknown names', () => {
    const midi = plainToInstance(KGMidiTrack, { instrument: 'violin' });
    const audio = plainToInstance(KGAudioTrack, {});
    expect(midi.getResolvedImageName()).toBe('violin.png');
    expect(audio.getResolvedImageName()).toBe('speaker.png');
    midi.setImageName('missing.png'); audio.setImageName('../invalid.png');
    expect(midi.getResolvedImageName()).toBe('violin.png');
    expect(audio.getResolvedImageName()).toBe('speaker.png');
  });

  it('retains playback fallback resolution for default images', () => {
    const spy = vi.spyOn(UserInstrumentRegistry, 'resolvePlaybackInstrument').mockReturnValue('violin');
    expect(new KGMidiTrack().getResolvedImageName()).toBe('violin.png');
    spy.mockRestore();
  });

  it('bundles an alphabetical catalog including the existing microphone', () => {
    const folderImages = readdirSync(resolve('public/resources/instruments')).filter(name => /\.png$/i.test(name)).sort();
    expect(images).toEqual(folderImages);
    expect(images).toContain('microphone.png');
    expect(new Set(images).size).toBe(images.length);
  });
  it('includes the full eleven-image singer and choir set', () => {
    const expected = [
      ...['male', 'female'].flatMap(gender => ['fair', 'light_warm', 'medium_brown', 'deep_brown'].map(tone => `singer_${gender}_${tone}.png`)),
      'choir_male.png', 'choir_female.png', 'choir_mixed.png',
    ];
    for (const name of expected) expect(images).toContain(name);
  });

});
