import { KGCommand } from '../KGCommand';
import { KGCore } from '../../KGCore';
import { KGAudioTrack } from '../../track/KGAudioTrack';
import { KGAudioInterface } from '../../audio-interface/KGAudioInterface';
import { generateNewTrackName } from '../../../util/miscUtil';

/**
 * Command to add a new audio track to the project.
 * Handles both the core model update and audio player bus setup.
 */
export class AddAudioTrackCommand extends KGCommand {
  private trackId: number;
  private trackName: string;
  private trackIndex: number;
  private insertionIndex?: number;
  private createdTrack: KGAudioTrack | null = null;

  constructor(trackId?: number, trackName?: string, insertionIndex?: number) {
    super();

    if (trackId === undefined) {
      const currentProject = KGCore.instance().getCurrentProject();
      const tracks = currentProject.getTracks();
      this.trackId = tracks.length > 0
        ? Math.max(...tracks.map(track => track.getId())) + 1
        : 1;
    } else {
      this.trackId = trackId;
    }

    this.trackName = trackName || generateNewTrackName();
    this.trackIndex = 0;
    this.insertionIndex = insertionIndex;
  }

  execute(): void {
    const core = KGCore.instance();
    const currentProject = core.getCurrentProject();
    const tracks = currentProject.getTracks();

    const targetInsertionIndex = typeof this.insertionIndex === 'number'
      ? Math.max(0, Math.min(this.insertionIndex, tracks.length))
      : tracks.length;
    this.trackIndex = targetInsertionIndex;

    this.createdTrack = new KGAudioTrack(this.trackName, this.trackId);
    this.createdTrack.setTrackIndex(this.trackIndex);

    const updatedTracks = [...tracks];
    updatedTracks.splice(targetInsertionIndex, 0, this.createdTrack);
    updatedTracks.forEach((track, index) => {
      track.setTrackIndex(index);
    });
    currentProject.setTracks(updatedTracks);

    // Create audio player bus for the new track
    const audioInterface = KGAudioInterface.instance();
    audioInterface.createTrackAudioPlayerBus(this.trackId.toString());

    console.log(`Added audio track ${this.trackId}`);
  }

  undo(): void {
    if (!this.createdTrack) {
      throw new Error('Cannot undo: no track was created');
    }

    const core = KGCore.instance();
    const currentProject = core.getCurrentProject();
    const tracks = currentProject.getTracks();

    const updatedTracks = tracks.filter(track => track.getId() !== this.trackId);
    updatedTracks.forEach((track, index) => {
      track.setTrackIndex(index);
    });
    currentProject.setTracks(updatedTracks);

    const audioInterface = KGAudioInterface.instance();
    audioInterface.removeTrackAudioPlayerBus(this.trackId.toString());

    console.log(`Removed audio track ${this.trackId}`);
  }

  getDescription(): string {
    return `Add audio track "${this.trackName}"`;
  }

  public getTrackId(): number {
    return this.trackId;
  }

  public getCreatedTrack(): KGAudioTrack | null {
    return this.createdTrack;
  }
}
