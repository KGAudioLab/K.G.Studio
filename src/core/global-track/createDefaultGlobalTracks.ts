import { KGChordTrack } from './KGChordTrack';
import { KGGlobalTrack } from './KGGlobalTrack';
import { KGMarkerTrack } from './KGMarkerTrack';
import { KGSignatureTrack } from './KGSignatureTrack';
import { KGTempoTrack } from './KGTempoTrack';

export function createDefaultGlobalTracks(): KGGlobalTrack[] {
  return [
    new KGMarkerTrack(),
    new KGTempoTrack(),
    new KGSignatureTrack(),
    new KGChordTrack(),
  ];
}
