export interface ConfirmOptions {
  confirmLabel?: string;
  cancelLabel?: string;
}

export interface PromptOptions {
  confirmLabel?: string;
  cancelLabel?: string;
  placeholder?: string;
}

export interface TimeSigResult {
  numerator: number;
  denominator: number;
}

export interface ChordDetectionOptionsResult {
  sensitivity: number;
  stability: number;
  noChordThreshold: number;
  enableSevenths: boolean;
}

export interface ChoiceOption {
  label: string;
  value: string;
}

let _showAlertFn: ((message: string) => Promise<void>) | null = null;
let _showConfirmFn: ((message: string, options?: ConfirmOptions) => Promise<boolean>) | null = null;
let _showPromptFn: ((message: string, defaultValue?: string, options?: PromptOptions) => Promise<string | null>) | null = null;
let _showTimeSigFn: ((message: string, defaultValue?: TimeSigResult) => Promise<TimeSigResult | null>) | null = null;
let _showChoiceFn: ((message: string, choices: ChoiceOption[]) => Promise<string | null>) | null = null;
let _showChordDetectionOptionsFn: ((message: string, defaultValue?: ChordDetectionOptionsResult) => Promise<ChordDetectionOptionsResult | null>) | null = null;

export function registerDialogFns(
  alertFn: (message: string) => Promise<void>,
  confirmFn: (message: string, options?: ConfirmOptions) => Promise<boolean>,
  promptFn: (message: string, defaultValue?: string, options?: PromptOptions) => Promise<string | null>,
  timeSigFn: (message: string, defaultValue?: TimeSigResult) => Promise<TimeSigResult | null>,
  choiceFn?: (message: string, choices: ChoiceOption[]) => Promise<string | null>,
  chordDetectionOptionsFn?: (message: string, defaultValue?: ChordDetectionOptionsResult) => Promise<ChordDetectionOptionsResult | null>,
) {
  _showAlertFn = alertFn;
  _showConfirmFn = confirmFn;
  _showPromptFn = promptFn;
  _showTimeSigFn = timeSigFn;
  if (choiceFn) _showChoiceFn = choiceFn;
  if (chordDetectionOptionsFn) _showChordDetectionOptionsFn = chordDetectionOptionsFn;
}

export function showAlert(message: string): Promise<void> {
  if (!_showAlertFn) {
    window.alert(message);
    return Promise.resolve();
  }
  return _showAlertFn(message);
}

export function showConfirm(message: string, options?: ConfirmOptions): Promise<boolean> {
  if (!_showConfirmFn) {
    return Promise.resolve(window.confirm(message));
  }
  return _showConfirmFn(message, options);
}

export function showPrompt(message: string, defaultValue?: string, options?: PromptOptions): Promise<string | null> {
  if (!_showPromptFn) {
    return Promise.resolve(window.prompt(message, defaultValue));
  }
  return _showPromptFn(message, defaultValue, options);
}

export function showChoice(message: string, choices: ChoiceOption[]): Promise<string | null> {
  if (!_showChoiceFn) {
    return Promise.resolve(window.confirm(message) ? choices[0]?.value ?? null : null);
  }
  return _showChoiceFn(message, choices);
}

export function showTimeSigPrompt(message: string, defaultValue?: TimeSigResult): Promise<TimeSigResult | null> {
  if (!_showTimeSigFn) {
    const raw = window.prompt(message, defaultValue ? `${defaultValue.numerator}/${defaultValue.denominator}` : '4/4');
    if (!raw) return Promise.resolve(null);
    const [n, d] = raw.split('/').map(Number);
    if (!n || !d) return Promise.resolve(null);
    return Promise.resolve({ numerator: n, denominator: d });
  }
  return _showTimeSigFn(message, defaultValue);
}

export function showChordDetectionOptions(
  message: string,
  defaultValue?: ChordDetectionOptionsResult,
): Promise<ChordDetectionOptionsResult | null> {
  if (!_showChordDetectionOptionsFn) {
    return Promise.resolve(defaultValue ?? {
      sensitivity: 50,
      stability: 50,
      noChordThreshold: 0,
      enableSevenths: false,
    });
  }
  return _showChordDetectionOptionsFn(message, defaultValue);
}
