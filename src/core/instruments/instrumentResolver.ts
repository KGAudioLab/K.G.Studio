import { FLUIDR3_INSTRUMENT_MAP } from '../../constants/generalMidiConstants';
import { UserInstrumentRegistry } from './UserInstrumentRegistry';

export interface ResolvedInstrumentDefinition {
  displayName: string;
  midiInstrument: number;
  image: string;
  group: string;
  pitchRange: [number, number];
  percussion: boolean;
  fallbackInstrument: string;
  custom: boolean;
}

export function resolveInstrumentDefinition(id: string): ResolvedInstrumentDefinition | undefined {
  const builtIn = FLUIDR3_INSTRUMENT_MAP[id];
  if (builtIn) return { ...builtIn, percussion: id === 'standard' || id === 'orchestra_kit', fallbackInstrument: id, custom: false };
  const custom = UserInstrumentRegistry.get(id);
  if (!custom) return undefined;
  return { ...custom, group: 'CUSTOM', custom: true };
}

export function resolvePlaybackInstrument(id: string): string {
  return UserInstrumentRegistry.resolvePlaybackInstrument(id);
}

export function getInstrumentDisplayName(id: string): string {
  return resolveInstrumentDefinition(id)?.displayName ?? id;
}

export function isPercussionInstrument(id: string): boolean {
  return resolveInstrumentDefinition(id)?.percussion ?? false;
}
