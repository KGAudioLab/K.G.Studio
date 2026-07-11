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

export interface MidiChordDetectionOptionsResult {
  enableSevenths: boolean;
  shortNoteSuppression: 'low' | 'medium' | 'high';
  harmonicFocus: 'balanced' | 'favor-sustained-notes';
}

export interface TempoDetectionOptionsResult {
  minTempo: number;
  maxTempo: number;
}

export interface TempoApplyResult {
  action: string;
  autoAlignRegionToBeat: boolean;
}

export interface AudioToMidiOptionsResult {
  monophonic: boolean;
  useCurrentFloorDb: boolean;
  manualFloorDb: number;
  pitchRangeStart: number;
  pitchRangeEnd: number;
  quantizeNoteStart: string;
  quantizeNoteLength: string;
  convertLoopRangeOnly: boolean;
  groupAdjacentPitchesToHighest: boolean;
  targetTrackId: string;
}

export interface NoteRankSelectionOptionsResult {
  direction: 'bottom-to-top' | 'top-to-bottom';
  rank: number;
  interval: string;
  range: 'selected-only' | 'selected-and-above' | 'selected-and-below';
}
export interface IntelligentArpeggiatorOptionsResult {
  sourceId: string;
  exampleBars: number;
  generateBars: number;
  tieBreak: 'higher' | 'lower';
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
let _showMidiChordDetectionOptionsFn: ((message: string, defaultValue?: MidiChordDetectionOptionsResult) => Promise<MidiChordDetectionOptionsResult | null>) | null = null;
let _showTempoDetectionOptionsFn: ((message: string, defaultValue?: TempoDetectionOptionsResult) => Promise<TempoDetectionOptionsResult | null>) | null = null;
let _showTempoApplyFn: ((message: string, choices: ChoiceOption[]) => Promise<TempoApplyResult | null>) | null = null;
let _showAudioToMidiOptionsFn: ((
  message: string,
  targetTracks: ChoiceOption[],
  loopModeEnabled: boolean,
  defaultValue?: AudioToMidiOptionsResult,
) => Promise<AudioToMidiOptionsResult | null>) | null = null;
let _showNoteRankSelectionOptionsFn: ((
  message: string,
  defaultValue?: NoteRankSelectionOptionsResult,
) => Promise<NoteRankSelectionOptionsResult | null>) | null = null;
let _showIntelligentArpeggiatorOptionsFn: ((message: string, sources: ChoiceOption[], defaultValue?: IntelligentArpeggiatorOptionsResult) => Promise<IntelligentArpeggiatorOptionsResult | null>) | null = null;

export function registerDialogFns(
  alertFn: (message: string) => Promise<void>,
  confirmFn: (message: string, options?: ConfirmOptions) => Promise<boolean>,
  promptFn: (message: string, defaultValue?: string, options?: PromptOptions) => Promise<string | null>,
  timeSigFn: (message: string, defaultValue?: TimeSigResult) => Promise<TimeSigResult | null>,
  choiceFn?: (message: string, choices: ChoiceOption[]) => Promise<string | null>,
  chordDetectionOptionsFn?: (message: string, defaultValue?: ChordDetectionOptionsResult) => Promise<ChordDetectionOptionsResult | null>,
  midiChordDetectionOptionsFn?: (message: string, defaultValue?: MidiChordDetectionOptionsResult) => Promise<MidiChordDetectionOptionsResult | null>,
  tempoDetectionOptionsFn?: (message: string, defaultValue?: TempoDetectionOptionsResult) => Promise<TempoDetectionOptionsResult | null>,
  tempoApplyFn?: (message: string, choices: ChoiceOption[]) => Promise<TempoApplyResult | null>,
  audioToMidiOptionsFn?: (
    message: string,
    targetTracks: ChoiceOption[],
    loopModeEnabled: boolean,
    defaultValue?: AudioToMidiOptionsResult,
  ) => Promise<AudioToMidiOptionsResult | null>,
  noteRankSelectionOptionsFn?: (
    message: string,
    defaultValue?: NoteRankSelectionOptionsResult,
  ) => Promise<NoteRankSelectionOptionsResult | null>,
  intelligentArpeggiatorOptionsFn?: (message: string, sources: ChoiceOption[], defaultValue?: IntelligentArpeggiatorOptionsResult) => Promise<IntelligentArpeggiatorOptionsResult | null>,
) {
  _showAlertFn = alertFn;
  _showConfirmFn = confirmFn;
  _showPromptFn = promptFn;
  _showTimeSigFn = timeSigFn;
  if (choiceFn) _showChoiceFn = choiceFn;
  if (chordDetectionOptionsFn) _showChordDetectionOptionsFn = chordDetectionOptionsFn;
  if (midiChordDetectionOptionsFn) _showMidiChordDetectionOptionsFn = midiChordDetectionOptionsFn;
  if (tempoDetectionOptionsFn) _showTempoDetectionOptionsFn = tempoDetectionOptionsFn;
  if (tempoApplyFn) _showTempoApplyFn = tempoApplyFn;
  if (audioToMidiOptionsFn) _showAudioToMidiOptionsFn = audioToMidiOptionsFn;
  if (noteRankSelectionOptionsFn) _showNoteRankSelectionOptionsFn = noteRankSelectionOptionsFn;
  if (intelligentArpeggiatorOptionsFn) _showIntelligentArpeggiatorOptionsFn = intelligentArpeggiatorOptionsFn;
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

export function showMidiChordDetectionOptions(
  message: string,
  defaultValue?: MidiChordDetectionOptionsResult,
): Promise<MidiChordDetectionOptionsResult | null> {
  if (!_showMidiChordDetectionOptionsFn) {
    return Promise.resolve(defaultValue ?? {
      enableSevenths: false,
      shortNoteSuppression: 'medium',
      harmonicFocus: 'favor-sustained-notes',
    });
  }
  return _showMidiChordDetectionOptionsFn(message, defaultValue);
}

export function showTempoDetectionOptions(
  message: string,
  defaultValue?: TempoDetectionOptionsResult,
): Promise<TempoDetectionOptionsResult | null> {
  if (!_showTempoDetectionOptionsFn) {
    return Promise.resolve(defaultValue ?? {
      minTempo: 80,
      maxTempo: 180,
    });
  }
  return _showTempoDetectionOptionsFn(message, defaultValue);
}

export function showTempoApply(message: string, choices: ChoiceOption[]): Promise<TempoApplyResult | null> {
  if (!_showTempoApplyFn) {
    return Promise.resolve(
      window.confirm(message)
        ? { action: choices[0]?.value ?? '', autoAlignRegionToBeat: false }
        : null,
    );
  }
  return _showTempoApplyFn(message, choices);
}

export function showAudioToMidiOptions(
  message: string,
  targetTracks: ChoiceOption[],
  loopModeEnabled: boolean,
  defaultValue?: AudioToMidiOptionsResult,
): Promise<AudioToMidiOptionsResult | null> {
  if (!_showAudioToMidiOptionsFn) {
    return Promise.resolve(defaultValue ?? {
      monophonic: true,
      useCurrentFloorDb: true,
      manualFloorDb: -25,
      pitchRangeStart: 12,
      pitchRangeEnd: 107,
      quantizeNoteStart: '1/16',
      quantizeNoteLength: '1/16',
      convertLoopRangeOnly: true,
      groupAdjacentPitchesToHighest: true,
      targetTrackId: targetTracks[0]?.value ?? '',
    });
  }
  return _showAudioToMidiOptionsFn(message, targetTracks, loopModeEnabled, defaultValue);
}

export function showNoteRankSelectionOptions(
  message: string,
  defaultValue?: NoteRankSelectionOptionsResult,
): Promise<NoteRankSelectionOptionsResult | null> {
  const fallback = defaultValue ?? {
    direction: 'bottom-to-top' as const,
    rank: 1,
    interval: '1/16',
    range: 'selected-only' as const,
  };
  return _showNoteRankSelectionOptionsFn
    ? _showNoteRankSelectionOptionsFn(message, fallback)
    : Promise.resolve(fallback);
}

export function showIntelligentArpeggiatorOptions(message: string, sources: ChoiceOption[], defaultValue?: IntelligentArpeggiatorOptionsResult): Promise<IntelligentArpeggiatorOptionsResult | null> {
  const fallback = defaultValue ?? { sourceId: 'chord', exampleBars: 1, generateBars: 4, tieBreak: 'higher' as const };
  return _showIntelligentArpeggiatorOptionsFn ? _showIntelligentArpeggiatorOptionsFn(message, sources, fallback) : Promise.resolve(fallback);
}
