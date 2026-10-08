import { AUDIO_INTERFACE_CONSTANTS } from '../../constants/coreConstants';
import { UpdateTrackMixTool } from './UpdateTrackMixTool';

export class UpdateTrackVolumeTool extends UpdateTrackMixTool {
  constructor() {
    super('volume', AUDIO_INTERFACE_CONSTANTS.MIN_TRACK_VOLUME_DB, AUDIO_INTERFACE_CONSTANTS.MAX_TRACK_VOLUME_DB);
  }
}
