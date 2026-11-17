import type { KGMidiNote, MidiArticulation } from '../../core/midi/KGMidiNote';

const KEYSWITCH_ARTICULATIONS: readonly MidiArticulation[] = [0, 1, 2, 0];
// Preserve the legacy same-tick priority: sustain, then spiccato, then pizzicato.
const KEYSWITCH_PRIORITIES = [2, 1, 0, 2];

export function convertInstVelaKeyswitches(notes: KGMidiNote[], basePitch: number): KGMidiNote[] {
  const switches: { tick: number; articulation: MidiArticulation; priority: number }[] = [];
  const musicalNotes = notes.filter(note => {
    const index = note.getPitch() - basePitch;
    const articulation = KEYSWITCH_ARTICULATIONS[index];
    if (articulation === undefined) return true;
    switches.push({
      tick: note.getStartTick(),
      articulation,
      priority: KEYSWITCH_PRIORITIES[index],
    });
    return false;
  });
  if (switches.length === 0) return notes;

  switches.sort((a, b) => a.tick - b.tick || a.priority - b.priority);
  let nextSwitch = 0;
  let articulation: MidiArticulation = 0;
  for (const note of [...musicalNotes].sort((a, b) => a.getStartTick() - b.getStartTick())) {
    while (nextSwitch < switches.length && switches[nextSwitch].tick <= note.getStartTick()) {
      articulation = switches[nextSwitch++].articulation;
    }
    note.setArticulation(articulation);
  }
  return musicalNotes;
}
