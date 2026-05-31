import { FLUIDR3_INSTRUMENT_MAP, INSTRUMENT_GROUPS } from '../constants/generalMidiConstants';
import type { InstrumentType } from '../core/track/KGMidiTrack';
import type { TranslationParams } from './types';

type TranslateFn = (key: string, params?: TranslationParams) => string;

export type InstrumentGroupKey = keyof typeof INSTRUMENT_GROUPS;

export function getInstrumentDisplayName(instrumentKey: InstrumentType, t: TranslateFn): string {
  const instrument = FLUIDR3_INSTRUMENT_MAP[instrumentKey];
  if (!instrument) {
    return String(instrumentKey);
  }

  return t(`instrument.name.${instrumentKey}`) || instrument.displayName;
}

export function getInstrumentGroupLabel(groupKey: InstrumentGroupKey, t: TranslateFn): string {
  const englishLabel = INSTRUMENT_GROUPS[groupKey];
  return t(`instrument.group.${groupKey}`) || englishLabel;
}

export function getEnglishInstrumentDisplayName(instrumentKey: InstrumentType): string {
  return FLUIDR3_INSTRUMENT_MAP[instrumentKey]?.displayName || String(instrumentKey);
}
