import type { KGProject } from '../KGProject';
import { KGMidiTrack } from '../track/KGMidiTrack';
import { getInstVelaInstrument } from '../../util/instvela/instruments';
import { convertInstVelaKeyswitches } from '../../util/instvela/keyswitches';

export function upgradeToV23(project: KGProject): KGProject {
  if (project.getProjectStructureVersion() >= 23) return project;
  for (const track of project.getTracks()) {
    if (!(track instanceof KGMidiTrack)) continue;
    const instrument = getInstVelaInstrument(track.getInstrument());
    if (!instrument) continue;

    for (const region of track.getRegions()) {
      region.setNotes(convertInstVelaKeyswitches(region.getNotes(), instrument.keyswitch));
    }
  }
  project.setProjectStructureVersion(23);
  return project;
}
