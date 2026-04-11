import { KGCommand } from '../KGCommand';
import { KGCore } from '../../KGCore';
import { KGAudioRegion } from '../../region/KGAudioRegion';

/**
 * Command to import an audio file into an audio track as a region.
 * Async work (file decode, OPFS storage, buffer loading) must be done
 * before execute() is called — this command is synchronous.
 */
export class ImportAudioCommand extends KGCommand {
  private trackId: number;
  private trackIndex: number;
  private audioFileId: string;
  private audioFileName: string;
  private audioDurationSeconds: number;
  private insertBeat: number;
  private durationInBeats: number;
  private previousMaxBars: number;
  private newMaxBars: number;
  private regionId: string;
  private createdRegion: KGAudioRegion | null = null;

  constructor(
    trackId: number,
    trackIndex: number,
    audioFileId: string,
    audioFileName: string,
    audioDurationSeconds: number,
    insertBeat: number,
    durationInBeats: number,
    previousMaxBars: number,
    newMaxBars: number
  ) {
    super();
    this.trackId = trackId;
    this.trackIndex = trackIndex;
    this.audioFileId = audioFileId;
    this.audioFileName = audioFileName;
    this.audioDurationSeconds = audioDurationSeconds;
    this.insertBeat = insertBeat;
    this.durationInBeats = durationInBeats;
    this.previousMaxBars = previousMaxBars;
    this.newMaxBars = newMaxBars;
    this.regionId = `audio_region_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
  }

  execute(): void {
    const core = KGCore.instance();
    const currentProject = core.getCurrentProject();

    // Create the audio region
    this.createdRegion = new KGAudioRegion(
      this.regionId,
      this.trackId.toString(),
      this.trackIndex,
      this.audioFileName,
      this.insertBeat,
      this.durationInBeats,
      this.audioFileId,
      this.audioFileName,
      this.audioDurationSeconds
    );

    // Add region to the track
    const track = currentProject.getTracks().find(t => t.getId() === this.trackId);
    if (!track) {
      throw new Error(`Track ${this.trackId} not found`);
    }
    track.addRegion(this.createdRegion);

    // Expand maxBars if needed
    if (this.newMaxBars > this.previousMaxBars) {
      currentProject.setMaxBars(this.newMaxBars);
    }

    console.log(`Imported audio "${this.audioFileName}" at beat ${this.insertBeat}, duration: ${this.durationInBeats} beats`);
  }

  undo(): void {
    const core = KGCore.instance();
    const currentProject = core.getCurrentProject();

    // Remove the region from the track
    const track = currentProject.getTracks().find(t => t.getId() === this.trackId);
    if (track) {
      track.removeRegion(this.regionId);
    }

    // Revert maxBars if we expanded it
    if (this.newMaxBars > this.previousMaxBars) {
      currentProject.setMaxBars(this.previousMaxBars);
    }

    console.log(`Undid audio import "${this.audioFileName}"`);
  }

  getDescription(): string {
    return `Import audio "${this.audioFileName}"`;
  }

  public getCreatedRegion(): KGAudioRegion | null {
    return this.createdRegion;
  }
}
