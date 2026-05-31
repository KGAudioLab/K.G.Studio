import type { InstrumentType } from '../core/track/KGMidiTrack';
import { midiPercussionKeyMap } from '../util/midiUtil';
import type { TranslationParams } from './types';

type TranslateFn = (key: string, params?: TranslationParams) => string;

const GM_DRUM_KIT_INSTRUMENTS: ReadonlySet<InstrumentType> = new Set([
  'standard',
  'orchestra_kit',
]);

export function isGmDrumKitInstrument(instrument: InstrumentType): boolean {
  return GM_DRUM_KIT_INSTRUMENTS.has(instrument);
}

export function getPercussionKeyShortLabel(pitch: number, t: TranslateFn): string | null {
  const drumInfo = midiPercussionKeyMap[pitch];
  if (!drumInfo) {
    return null;
  }

  return t(`percussion.short.${pitch}`) || drumInfo.shortName;
}

export function getPercussionKeyFullLabel(pitch: number, t: TranslateFn): string | null {
  const drumInfo = midiPercussionKeyMap[pitch];
  if (!drumInfo) {
    return null;
  }

  return t(`percussion.full.${pitch}`) || drumInfo.fullName;
}
