import { Expose } from 'class-transformer';
import { KGRegion } from './KGRegion';
import { WithDefault } from '../../types/projectTypes';

/**
 * KGAudioRegion - Class representing an audio region in the DAW
 * Contains a reference to an audio file stored in OPFS and inherits position/length from KGRegion
 */
export class KGAudioRegion extends KGRegion {
  @Expose()
  protected override __type: string = 'KGAudioRegion';

  @Expose()
  @WithDefault('')
  protected audioFileId: string = '';

  @Expose()
  @WithDefault('')
  protected audioFileName: string = '';

  @Expose()
  @WithDefault(0)
  protected audioDurationSeconds: number = 0;

  @Expose()
  @WithDefault(0)
  protected clipStartOffsetSeconds: number = 0;

  // Optional source-file end boundary for split/trimmed clips. Older projects
  // without this field continue to play through the end of the source file.
  @Expose()
  protected clipEndOffsetSeconds?: number;

  constructor(
    id: string,
    trackId: string,
    trackIndex: number,
    name: string,
    startTick: number = 0,
    length: number = 0,
    audioFileId: string = '',
    audioFileName: string = '',
    audioDurationSeconds: number = 0,
    clipStartOffsetSeconds: number = 0,
    clipEndOffsetSeconds?: number
  ) {
    super(id, trackId, trackIndex, name, startTick, length);
    this.__type = 'KGAudioRegion';
    this.audioFileId = audioFileId;
    this.audioFileName = audioFileName;
    this.audioDurationSeconds = audioDurationSeconds;
    this.clipStartOffsetSeconds = clipStartOffsetSeconds;
    this.clipEndOffsetSeconds = clipEndOffsetSeconds;
  }

  // Getters
  public getAudioFileId(): string {
    return this.audioFileId;
  }

  public getAudioFileName(): string {
    return this.audioFileName;
  }

  public getAudioDurationSeconds(): number {
    return this.audioDurationSeconds;
  }

  // Setters
  public setAudioFileId(audioFileId: string): void {
    this.audioFileId = audioFileId;
  }

  public setAudioFileName(audioFileName: string): void {
    this.audioFileName = audioFileName;
  }

  public setAudioDurationSeconds(audioDurationSeconds: number): void {
    this.audioDurationSeconds = audioDurationSeconds;
  }

  public getClipStartOffsetSeconds(): number {
    return this.clipStartOffsetSeconds;
  }

  public setClipStartOffsetSeconds(clipStartOffsetSeconds: number): void {
    this.clipStartOffsetSeconds = clipStartOffsetSeconds;
  }

  public getClipEndOffsetSeconds(): number | undefined {
    return this.clipEndOffsetSeconds;
  }

  public setClipEndOffsetSeconds(clipEndOffsetSeconds: number | undefined): void {
    this.clipEndOffsetSeconds = clipEndOffsetSeconds;
  }

  public getPlayableDurationSeconds(): number {
    const endSeconds = Math.min(this.audioDurationSeconds, this.clipEndOffsetSeconds ?? this.audioDurationSeconds);
    return Math.max(0, endSeconds - this.clipStartOffsetSeconds);
  }

  // Override getCurrentType to return specific subclass type
  public override getCurrentType(): string {
    return 'KGAudioRegion';
  }
}
