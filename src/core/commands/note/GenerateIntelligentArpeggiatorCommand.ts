import { KGCommand } from '../KGCommand';
import { KGCore } from '../../KGCore';
import { KGMidiRegion } from '../../region/KGMidiRegion';
import { KGMidiNote } from '../../midi/KGMidiNote';
import { generateUniqueId } from '../../../util/miscUtil';
import type { GeneratedArpeggiatorNote } from '../../../util/intelligentArpeggiator';

export class GenerateIntelligentArpeggiatorCommand extends KGCommand {
  private readonly created: KGMidiNote[] = [];
  private originalLength = 0;
  constructor(private readonly regionId: string, private readonly notes: GeneratedArpeggiatorNote[], private readonly endTick: number) { super(); }
  private region(): KGMidiRegion {
    const region = KGCore.instance().getCurrentProject().getTracks().flatMap(track => track.getRegions()).find(item => item.getId() === this.regionId);
    if (!(region instanceof KGMidiRegion)) throw new Error('Target MIDI region was not found.');
    return region;
  }
  execute(): void {
    const region = this.region();
    this.originalLength = region.getLengthTicks();
    this.created.splice(0, this.created.length, ...this.notes.map(note => new KGMidiNote(generateUniqueId('KGMidiNote'), note.startTick - region.getStartTick(), note.endTick - region.getStartTick(), note.pitch, note.velocity)));
    this.created.forEach(note => region.addNote(note));
    region.setLengthTicks(Math.max(region.getLengthTicks(), this.endTick - region.getStartTick()));
  }
  undo(): void { const region = this.region(); this.created.forEach(note => region.removeNote(note.getId())); region.setLengthTicks(this.originalLength); }
  getDescription(): string { return `Generate ${this.notes.length} intelligent arpeggiator notes`; }
}
