export type PianoRollAutomationType =
  | 'pitch-bend'
  | 'cc-1'
  | 'cc-2'
  | 'cc-7'
  | 'cc-11'
  | 'cc-64';

export interface PianoRollAutomationOption {
  label: string;
  value: PianoRollAutomationType;
  interpolationMode: 'linear' | 'step';
}

export const PIANO_ROLL_AUTOMATION_OPTIONS: PianoRollAutomationOption[] = [
  { label: 'Pitch Bend', value: 'pitch-bend', interpolationMode: 'linear' },
  { label: 'CC1', value: 'cc-1', interpolationMode: 'linear' },
  { label: 'CC2', value: 'cc-2', interpolationMode: 'linear' },
  { label: 'CC7', value: 'cc-7', interpolationMode: 'linear' },
  { label: 'CC11', value: 'cc-11', interpolationMode: 'linear' },
  { label: 'CC64', value: 'cc-64', interpolationMode: 'step' },
];

export function getControllerNumberForAutomationType(type: PianoRollAutomationType): number | null {
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

export function getAutomationInterpolationMode(type: PianoRollAutomationType): 'linear' | 'step' {
  return PIANO_ROLL_AUTOMATION_OPTIONS.find(option => option.value === type)?.interpolationMode ?? 'linear';
}
