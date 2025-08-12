import { KGProject } from '../KGProject';
import { KGTrack } from '../track/KGTrack';
import { KGMidiTrack, type InstrumentType } from '../track/KGMidiTrack';

/**
 * Upgrade a project from structure version 0 to 1.
 * Keep logic minimal for now; future migrations should extend this.
 */
export function upgradeToV1(project: KGProject): KGProject {
  try {
    const tracks: KGTrack[] = project.getTracks();

    const legacyToNewInstrumentMap: Record<string, InstrumentType> = {
      PIANO: 'acoustic_grand_piano',
      GUITAR: 'acoustic_guitar_nylon',
      BASS: 'electric_bass_finger',
      DRUMS: 'standard',
    } as const;

    const isMidiTrack = (track: KGTrack): track is KGMidiTrack => {
      return track.getCurrentType() === 'KGMidiTrack';
    };

    tracks.forEach(track => {
      if (!isMidiTrack(track)) return;

      const currentInstrument = (track as KGMidiTrack).getInstrument() as unknown as string;
      const mapped = legacyToNewInstrumentMap[currentInstrument];
      if (mapped) {
        (track as KGMidiTrack).setInstrument(mapped);
      }
    });
  } finally {
    // Always set the project structure version to 1 to mark migration complete
    project.setProjectStructureVersion(1);
  }

  return project;
}


