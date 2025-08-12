import { Expose, Type, Transform } from 'class-transformer';
import { KGTrack, TrackType } from './KGTrack';
import { KGMidiRegion } from '../region/KGMidiRegion';
import { KGRegion } from '../region/KGRegion';
import { FLUIDR3_INSTRUMENT_MAP } from '../../constants/generalMidiConstants';
import { AUDIO_INTERFACE_CONSTANTS } from '../../constants/coreConstants';

export type InstrumentType = keyof typeof FLUIDR3_INSTRUMENT_MAP;

export class KGMidiTrack extends KGTrack {
  @Expose()
  protected override __type: string = 'KGMidiTrack';
  
  @Expose()
  @Transform(({ value }) => value || 'acoustic_grand_piano', { toClassOnly: true })
  protected instrument: InstrumentType = 'acoustic_grand_piano';
  
  @Expose()
  @Type(() => KGRegion, {
    discriminator: {
      property: '__type',
      subTypes: [
        { value: KGRegion, name: 'KGRegion' },
        { value: KGMidiRegion, name: 'KGMidiRegion' },
      ],
    },
  })
  protected override regions: KGMidiRegion[] = [];

  constructor(name: string = 'Untitled MIDI Track', id: number = 0, instrument: InstrumentType = 'acoustic_grand_piano', volume: number = AUDIO_INTERFACE_CONSTANTS.DEFAULT_TRACK_VOLUME) {
    super(name, id, TrackType.MIDI);
    this.__type = 'KGMidiTrack';
    this.instrument = instrument;
    this.volume = volume;
  }

  // Override parent setRegions to enforce KGMidiRegion type
  public override setRegions(regions: KGMidiRegion[]): void {
    this.regions = regions;
  }

  // Instrument getters and setters
  public getInstrument(): InstrumentType {
    // Backward compatibility: default to acoustic_grand_piano if undefined
    return this.instrument || 'acoustic_grand_piano';
  }

  public setInstrument(instrument: InstrumentType): void {
    this.instrument = instrument;
  }

  // Override getCurrentType to return specific subclass type
  public override getCurrentType(): string {
    return 'KGMidiTrack';
  }
}
