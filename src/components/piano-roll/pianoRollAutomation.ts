import type { TranslationParams } from '../../i18n/types';

export type MidiEventAutomationType =
  | 'pitch-bend'
  | 'cc-1'
  | 'cc-2'
  | 'cc-7'
  | 'cc-11'
  | 'cc-64';

export type PianoRollAutomationType = 'velocity' | MidiEventAutomationType;

export const DEFAULT_PIANO_ROLL_AUTOMATION_TYPE = 'velocity';

interface MidiEventAutomationOption {
  value: MidiEventAutomationType;
  labelKey: string;
  interpolationMode: 'linear' | 'step';
}

const MIDI_EVENT_AUTOMATION_OPTIONS: MidiEventAutomationOption[] = [
  { value: 'pitch-bend', labelKey: 'pianoRoll.automationType.pitchBend', interpolationMode: 'linear' },
  { value: 'cc-1', labelKey: 'pianoRoll.automationType.cc1', interpolationMode: 'linear' },
  { value: 'cc-2', labelKey: 'pianoRoll.automationType.cc2', interpolationMode: 'linear' },
  { value: 'cc-7', labelKey: 'pianoRoll.automationType.cc7', interpolationMode: 'linear' },
  { value: 'cc-11', labelKey: 'pianoRoll.automationType.cc11', interpolationMode: 'linear' },
  { value: 'cc-64', labelKey: 'pianoRoll.automationType.cc64', interpolationMode: 'step' },
];

const VELOCITY_OPTION = { value: 'velocity', labelKey: 'pianoRoll.automationType.velocity' } as const;
const AUTOMATION_OPTIONS = [VELOCITY_OPTION, ...MIDI_EVENT_AUTOMATION_OPTIONS];

export function isAiInstrumentAutomationType(type: PianoRollAutomationType): boolean {
  return type === 'velocity' || type === 'cc-7';
}

export function getTranslatedAutomationOptions(
  t: (key: string, params?: TranslationParams) => string,
  isAiInstrument = false,
): Array<{ label: string; value: PianoRollAutomationType }> {
  const options = isAiInstrument
    ? AUTOMATION_OPTIONS.filter(option => isAiInstrumentAutomationType(option.value))
    : AUTOMATION_OPTIONS;
  return options.map(option => ({
    label: t(option.labelKey),
    value: option.value,
  }));
}

export function getAutomationLabel(
  type: PianoRollAutomationType,
  t: (key: string, params?: TranslationParams) => string,
): string {
  const controller = type === 'velocity' ? null : getControllerNumberForAutomationType(type);
  if (controller !== null) return `CC${controller}`;

  const option = AUTOMATION_OPTIONS.find(candidate => candidate.value === type);
  return option ? t(option.labelKey) : type;
}

export function getControllerNumberForAutomationType(type: MidiEventAutomationType): number | null {
  switch (type) {
    case 'cc-1':
      return 1;
    case 'cc-2':
      return 2;
    case 'cc-7':
      return 7;
    case 'cc-11':
      return 11;
    case 'cc-64':
      return 64;
    case 'pitch-bend':
    default:
      return null;
  }
}

export function getAutomationInterpolationMode(type: MidiEventAutomationType): 'linear' | 'step' {
  return MIDI_EVENT_AUTOMATION_OPTIONS.find(option => option.value === type)?.interpolationMode ?? 'linear';
}
