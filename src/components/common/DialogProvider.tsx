import React, { useState, useCallback, useRef } from 'react';
import './DialogProvider.css';
import { FaTimes } from 'react-icons/fa';
import { registerDialogFns } from '../../util/dialogUtil';
import type {
  ChoiceOption,
  ChordDetectionOptionsResult,
  ConfirmOptions,
  MidiChordDetectionOptionsResult,
  PromptOptions,
  TempoApplyResult,
  TempoDetectionOptionsResult,
  TimeSigResult,
} from '../../util/dialogUtil';

interface DialogInfo {
  type: 'alert' | 'confirm' | 'prompt' | 'timesig' | 'choice' | 'chord-detection' | 'midi-chord-detection' | 'tempo-detection' | 'tempo-apply';
  message: string;
  options?: ConfirmOptions | PromptOptions;
  defaultValue?: string;
  defaultTimeSig?: TimeSigResult;
  choices?: ChoiceOption[];
  defaultChordDetectionOptions?: ChordDetectionOptionsResult;
  defaultMidiChordDetectionOptions?: MidiChordDetectionOptionsResult;
  defaultTempoDetectionOptions?: TempoDetectionOptionsResult;
}

const DEFAULT_AUDIO_CHORD_DETECTION_OPTIONS: ChordDetectionOptionsResult = {
  sensitivity: 50,
  stability: 50,
  noChordThreshold: 0,
  enableSevenths: false,
};

const DEFAULT_MIDI_CHORD_DETECTION_OPTIONS: MidiChordDetectionOptionsResult = {
  enableSevenths: false,
  shortNoteSuppression: 'medium',
  harmonicFocus: 'favor-sustained-notes',
};

const DEFAULT_TEMPO_DETECTION_OPTIONS: TempoDetectionOptionsResult = {
  minTempo: 80,
  maxTempo: 180,
};

const DialogProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [dialog, setDialog] = useState<DialogInfo | null>(null);
  const [isClosing, setIsClosing] = useState(false);
  const [inputValue, setInputValue] = useState('');
  const [timeSigNumerator, setTimeSigNumerator] = useState('');
  const [timeSigDenominator, setTimeSigDenominator] = useState('');
  const [chordDetectionOptions, setChordDetectionOptions] = useState<ChordDetectionOptionsResult>(DEFAULT_AUDIO_CHORD_DETECTION_OPTIONS);
  const [midiChordDetectionOptions, setMidiChordDetectionOptions] = useState<MidiChordDetectionOptionsResult>(DEFAULT_MIDI_CHORD_DETECTION_OPTIONS);
  const [tempoDetectionOptions, setTempoDetectionOptions] = useState<TempoDetectionOptionsResult>(DEFAULT_TEMPO_DETECTION_OPTIONS);
  const [autoAlignRegionToBeat, setAutoAlignRegionToBeat] = useState(false);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const resolveRef = useRef<((value: any) => void) | null>(null);
  const pendingValueRef = useRef<unknown>(undefined);

  const openAlert = useCallback((message: string): Promise<void> => {
    return new Promise<void>((resolve) => {
      resolveRef.current = resolve;
      setDialog({ type: 'alert', message });
    });
  }, []);

  const openConfirm = useCallback((message: string, options?: ConfirmOptions): Promise<boolean> => {
    return new Promise<boolean>((resolve) => {
      resolveRef.current = resolve;
      setDialog({ type: 'confirm', message, options });
    });
  }, []);

  const openPrompt = useCallback((message: string, defaultValue?: string, options?: PromptOptions): Promise<string | null> => {
    return new Promise<string | null>((resolve) => {
      resolveRef.current = resolve;
      setInputValue(defaultValue ?? '');
      setDialog({ type: 'prompt', message, options, defaultValue });
    });
  }, []);

  const openTimeSig = useCallback((message: string, defaultValue?: TimeSigResult): Promise<TimeSigResult | null> => {
    return new Promise<TimeSigResult | null>((resolve) => {
      resolveRef.current = resolve;
      setTimeSigNumerator(String(defaultValue?.numerator ?? 4));
      setTimeSigDenominator(String(defaultValue?.denominator ?? 4));
      setDialog({ type: 'timesig', message, defaultTimeSig: defaultValue });
    });
  }, []);

  const openChoice = useCallback((message: string, choices: ChoiceOption[]): Promise<string | null> => {
    return new Promise<string | null>((resolve) => {
      resolveRef.current = resolve;
      setDialog({ type: 'choice', message, choices });
    });
  }, []);

  const openChordDetectionOptions = useCallback((
    message: string,
    defaultValue?: ChordDetectionOptionsResult,
  ): Promise<ChordDetectionOptionsResult | null> => {
    return new Promise<ChordDetectionOptionsResult | null>((resolve) => {
      resolveRef.current = resolve;
      setChordDetectionOptions(defaultValue ?? DEFAULT_AUDIO_CHORD_DETECTION_OPTIONS);
      setDialog({ type: 'chord-detection', message, defaultChordDetectionOptions: defaultValue });
    });
  }, []);

  const openMidiChordDetectionOptions = useCallback((
    message: string,
    defaultValue?: MidiChordDetectionOptionsResult,
  ): Promise<MidiChordDetectionOptionsResult | null> => {
    return new Promise<MidiChordDetectionOptionsResult | null>((resolve) => {
      resolveRef.current = resolve;
      setMidiChordDetectionOptions(defaultValue ?? DEFAULT_MIDI_CHORD_DETECTION_OPTIONS);
      setDialog({ type: 'midi-chord-detection', message, defaultMidiChordDetectionOptions: defaultValue });
    });
  }, []);

  const openTempoDetectionOptions = useCallback((
    message: string,
    defaultValue?: TempoDetectionOptionsResult,
  ): Promise<TempoDetectionOptionsResult | null> => {
    return new Promise<TempoDetectionOptionsResult | null>((resolve) => {
      resolveRef.current = resolve;
      setTempoDetectionOptions(defaultValue ?? DEFAULT_TEMPO_DETECTION_OPTIONS);
      setDialog({ type: 'tempo-detection', message, defaultTempoDetectionOptions: defaultValue });
    });
  }, []);

  const openTempoApply = useCallback((
    message: string,
    choices: ChoiceOption[],
  ): Promise<TempoApplyResult | null> => {
    return new Promise<TempoApplyResult | null>((resolve) => {
      resolveRef.current = resolve;
      setAutoAlignRegionToBeat(false);
      setDialog({ type: 'tempo-apply', message, choices });
    });
  }, []);

  const close = useCallback((value: unknown) => {
    pendingValueRef.current = value;
    setIsClosing(true);
  }, []);

  const handleAnimationEnd = useCallback((e: React.AnimationEvent) => {
    if (e.target !== e.currentTarget) return;
    if (!isClosing) return;
    setIsClosing(false);
    setDialog(null);
    setInputValue('');
    setTimeSigNumerator('');
    setTimeSigDenominator('');
    setChordDetectionOptions(DEFAULT_AUDIO_CHORD_DETECTION_OPTIONS);
    setMidiChordDetectionOptions(DEFAULT_MIDI_CHORD_DETECTION_OPTIONS);
    setTempoDetectionOptions(DEFAULT_TEMPO_DETECTION_OPTIONS);
    setAutoAlignRegionToBeat(false);
    if (resolveRef.current) {
      resolveRef.current(pendingValueRef.current);
      resolveRef.current = null;
    }
  }, [isClosing]);

  const mouseDownOnOverlay = useRef(false);

  const registered = useRef(false);
  if (!registered.current) {
    registered.current = true;
    registerDialogFns(
      openAlert,
      openConfirm,
      openPrompt,
      openTimeSig,
      openChoice,
      openChordDetectionOptions,
      openMidiChordDetectionOptions,
      openTempoDetectionOptions,
      openTempoApply,
    );
  }

  if (!dialog) {
    return <>{children}</>;
  }

  const isAlert = dialog.type === 'alert';
  const isPrompt = dialog.type === 'prompt';
  const isTimeSig = dialog.type === 'timesig';
  const isChoice = dialog.type === 'choice';
  const isChordDetection = dialog.type === 'chord-detection';
  const isMidiChordDetection = dialog.type === 'midi-chord-detection';
  const isTempoDetection = dialog.type === 'tempo-detection';
  const isTempoApply = dialog.type === 'tempo-apply';
  const promptOptions = isPrompt ? (dialog.options as PromptOptions | undefined) : undefined;

  const title = isAlert
    ? 'Notice'
    : isTimeSig
      ? 'Time Signature'
      : isTempoDetection
        ? 'Tempo Detection'
        : isTempoApply
          ? 'Apply Tempo'
        : (isChordDetection || isMidiChordDetection)
        ? 'Chord Detection'
        : isPrompt
          ? 'Input'
          : 'Confirm';

  const handleOverlayMouseDown = (e: React.MouseEvent) => {
    mouseDownOnOverlay.current = e.target === e.currentTarget;
  };

  const handleOverlayClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget && mouseDownOnOverlay.current) {
      close(isAlert ? undefined : (isPrompt || isTimeSig || isChoice || isChordDetection || isTempoDetection || isTempoApply) ? null : false);
    }
  };

  const handleCancel = () => close(isAlert ? undefined : (isPrompt || isTimeSig || isChoice || isChordDetection || isTempoDetection || isTempoApply) ? null : false);

  const handleConfirm = () => {
    if (isAlert) { close(undefined); return; }
    if (isPrompt) { close(inputValue); return; }
    if (isTimeSig) {
      close({ numerator: Number(timeSigNumerator), denominator: Number(timeSigDenominator) });
      return;
    }
    if (isChordDetection) {
      close(chordDetectionOptions);
      return;
    }
    if (isMidiChordDetection) {
      close(midiChordDetectionOptions);
      return;
    }
    if (isTempoDetection) {
      close(tempoDetectionOptions);
      return;
    }
    if (isTempoApply) {
      close({
        action: dialog.choices?.[dialog.choices.length - 1]?.value ?? '',
        autoAlignRegionToBeat,
      } satisfies TempoApplyResult);
      return;
    }
    close(true);
  };

  const updateChordDetectionOption = <K extends keyof ChordDetectionOptionsResult>(
    key: K,
    value: ChordDetectionOptionsResult[K],
  ) => {
    setChordDetectionOptions(current => ({ ...current, [key]: value }));
  };

  const updateMidiChordDetectionOption = <K extends keyof MidiChordDetectionOptionsResult>(
    key: K,
    value: MidiChordDetectionOptionsResult[K],
  ) => {
    setMidiChordDetectionOptions(current => ({ ...current, [key]: value }));
  };

  const updateTempoDetectionOption = <K extends keyof TempoDetectionOptionsResult>(
    key: K,
    value: TempoDetectionOptionsResult[K],
  ) => {
    setTempoDetectionOptions(current => ({ ...current, [key]: value }));
  };

  return (
    <>
      {children}
      <div className={`dialog-overlay${isClosing ? ' dialog-overlay-closing' : ''}`} onMouseDown={handleOverlayMouseDown} onClick={handleOverlayClick} onAnimationEnd={handleAnimationEnd}>
        <div className={`dialog-modal${isClosing ? ' dialog-modal-closing' : ''}`}>
          <div className="dialog-header">
            <h3 className="dialog-title">{title}</h3>
            <button
              className="dialog-close-btn"
              onClick={handleCancel}
              aria-label="Close dialog"
            >
              <FaTimes />
            </button>
          </div>
          <div className="dialog-body">
            <p className="dialog-message">{dialog.message}</p>
            {isPrompt && (
              <input
                className="dialog-input"
                type="text"
                value={inputValue}
                placeholder={promptOptions?.placeholder}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleConfirm();
                  if (e.key === 'Escape') handleCancel();
                }}
                autoFocus
              />
            )}
            {isTimeSig && (
              <div className="dialog-timesig-row">
                <input
                  className="dialog-input dialog-timesig-input"
                  type="number"
                  min={1}
                  value={timeSigNumerator}
                  onChange={(e) => setTimeSigNumerator(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleConfirm();
                    if (e.key === 'Escape') handleCancel();
                  }}
                  autoFocus
                />
                <span className="dialog-timesig-sep">/</span>
                <input
                  className="dialog-input dialog-timesig-input"
                  type="number"
                  min={1}
                  value={timeSigDenominator}
                  onChange={(e) => setTimeSigDenominator(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleConfirm();
                    if (e.key === 'Escape') handleCancel();
                  }}
                />
              </div>
            )}
            {isChordDetection && (
              <div className="dialog-chord-detection-form">
                <div className="dialog-slider-group">
                  <div className="dialog-slider-header">
                    <label className="dialog-slider-label" htmlFor="dialog-chord-sensitivity">Sensitivity</label>
                    <span className="dialog-slider-value">{chordDetectionOptions.sensitivity}</span>
                  </div>
                  <input
                    id="dialog-chord-sensitivity"
                    className="dialog-slider"
                    type="range"
                    min={0}
                    max={100}
                    step={1}
                    value={chordDetectionOptions.sensitivity}
                    onChange={(e) => updateChordDetectionOption('sensitivity', Number(e.target.value))}
                    autoFocus
                  />
                </div>
                <div className="dialog-slider-group">
                  <div className="dialog-slider-header">
                    <label className="dialog-slider-label" htmlFor="dialog-chord-stability">Stability</label>
                    <span className="dialog-slider-value">{chordDetectionOptions.stability}</span>
                  </div>
                  <input
                    id="dialog-chord-stability"
                    className="dialog-slider"
                    type="range"
                    min={0}
                    max={100}
                    step={1}
                    value={chordDetectionOptions.stability}
                    onChange={(e) => updateChordDetectionOption('stability', Number(e.target.value))}
                  />
                </div>
                <div className="dialog-slider-group">
                  <div className="dialog-slider-header">
                    <label className="dialog-slider-label" htmlFor="dialog-chord-no-chord-threshold">No-Chord Threshold</label>
                    <span className="dialog-slider-value">{chordDetectionOptions.noChordThreshold}</span>
                  </div>
                  <input
                    id="dialog-chord-no-chord-threshold"
                    className="dialog-slider"
                    type="range"
                    min={0}
                    max={100}
                    step={1}
                    value={chordDetectionOptions.noChordThreshold}
                    onChange={(e) => updateChordDetectionOption('noChordThreshold', Number(e.target.value))}
                  />
                </div>
                <label className="dialog-checkbox-row" htmlFor="dialog-enable-sevenths">
                  <input
                    id="dialog-enable-sevenths"
                    type="checkbox"
                    checked={chordDetectionOptions.enableSevenths}
                    onChange={(e) => updateChordDetectionOption('enableSevenths', e.target.checked)}
                  />
                  <span>Chord Detail: Enable sevenths</span>
                </label>
              </div>
            )}
            {isMidiChordDetection && (
              <div className="dialog-chord-detection-form">
                <div className="dialog-slider-group">
                  <div className="dialog-slider-header">
                    <label className="dialog-slider-label" htmlFor="dialog-midi-short-note-suppression">Short Notes</label>
                  </div>
                  <select
                    id="dialog-midi-short-note-suppression"
                    className="dialog-input"
                    value={midiChordDetectionOptions.shortNoteSuppression}
                    onChange={(e) => updateMidiChordDetectionOption('shortNoteSuppression', e.target.value as MidiChordDetectionOptionsResult['shortNoteSuppression'])}
                    autoFocus
                  >
                    <option value="low">Low suppression</option>
                    <option value="medium">Medium suppression</option>
                    <option value="high">High suppression</option>
                  </select>
                </div>
                <div className="dialog-slider-group">
                  <div className="dialog-slider-header">
                    <label className="dialog-slider-label" htmlFor="dialog-midi-harmonic-focus">Harmonic Focus</label>
                  </div>
                  <select
                    id="dialog-midi-harmonic-focus"
                    className="dialog-input"
                    value={midiChordDetectionOptions.harmonicFocus}
                    onChange={(e) => updateMidiChordDetectionOption('harmonicFocus', e.target.value as MidiChordDetectionOptionsResult['harmonicFocus'])}
                  >
                    <option value="balanced">Balanced</option>
                    <option value="favor-sustained-notes">Favor sustained notes</option>
                  </select>
                </div>
                <label className="dialog-checkbox-row" htmlFor="dialog-midi-enable-sevenths">
                  <input
                    id="dialog-midi-enable-sevenths"
                    type="checkbox"
                    checked={midiChordDetectionOptions.enableSevenths}
                    onChange={(e) => updateMidiChordDetectionOption('enableSevenths', e.target.checked)}
                  />
                  <span>Chord Detail: Enable sevenths</span>
                </label>
              </div>
            )}
            {isTempoDetection && (
              <div className="dialog-chord-detection-form">
                <div className="dialog-slider-group">
                  <div className="dialog-slider-header">
                    <label className="dialog-slider-label" htmlFor="dialog-tempo-min-tempo">Minimum BPM</label>
                  </div>
                  <input
                    id="dialog-tempo-min-tempo"
                    className="dialog-input"
                    type="number"
                    min={40}
                    max={240}
                    step={1}
                    value={tempoDetectionOptions.minTempo}
                    onChange={(e) => updateTempoDetectionOption('minTempo', Number(e.target.value))}
                    autoFocus
                  />
                </div>
                <div className="dialog-slider-group">
                  <div className="dialog-slider-header">
                    <label className="dialog-slider-label" htmlFor="dialog-tempo-max-tempo">Maximum BPM</label>
                  </div>
                  <input
                    id="dialog-tempo-max-tempo"
                    className="dialog-input"
                    type="number"
                    min={40}
                    max={240}
                    step={1}
                    value={tempoDetectionOptions.maxTempo}
                    onChange={(e) => updateTempoDetectionOption('maxTempo', Number(e.target.value))}
                  />
                </div>
              </div>
            )}
            {isTempoApply && (
              <div className="dialog-chord-detection-form">
                <label className="dialog-checkbox-row" htmlFor="dialog-tempo-auto-align">
                  <input
                    id="dialog-tempo-auto-align"
                    type="checkbox"
                    checked={autoAlignRegionToBeat}
                    onChange={(e) => setAutoAlignRegionToBeat(e.target.checked)}
                    autoFocus
                  />
                  <span>Auto-align region to beat</span>
                </label>
              </div>
            )}
          </div>
          <div className="dialog-footer">
            {!isAlert && (
              <button
                className="dialog-btn dialog-btn-cancel"
                onClick={handleCancel}
              >
                {(dialog.options as ConfirmOptions | PromptOptions | undefined)?.cancelLabel ?? 'Cancel'}
              </button>
            )}
            {isChoice ? (
              dialog.choices?.map((choice, i) => (
                <button
                  key={choice.value}
                  className={`dialog-btn ${i === (dialog.choices!.length - 1) ? 'dialog-btn-primary' : 'dialog-btn-secondary'}`}
                  onClick={() => close(choice.value)}
                  autoFocus={i === dialog.choices!.length - 1}
                >
                  {choice.label}
                </button>
              ))
            ) : isTempoApply ? (
              dialog.choices?.map((choice, i) => (
                <button
                  key={choice.value}
                  className={`dialog-btn ${i === (dialog.choices!.length - 1) ? 'dialog-btn-primary' : 'dialog-btn-secondary'}`}
                  onClick={() => close({ action: choice.value, autoAlignRegionToBeat } satisfies TempoApplyResult)}
                  autoFocus={i === dialog.choices!.length - 1}
                >
                  {choice.label}
                </button>
              ))
            ) : (
              <button
                className="dialog-btn dialog-btn-primary"
                onClick={handleConfirm}
                autoFocus={!isPrompt && !isTimeSig && !isChordDetection && !isMidiChordDetection && !isTempoDetection && !isTempoApply}
              >
                {isAlert ? 'OK' : ((dialog.options as ConfirmOptions | PromptOptions | undefined)?.confirmLabel ?? (isPrompt || isTimeSig ? 'OK' : (isChordDetection || isMidiChordDetection || isTempoDetection) ? 'Detect' : 'Yes'))}
              </button>
            )}
          </div>
        </div>
      </div>
    </>
  );
};

export default DialogProvider;
