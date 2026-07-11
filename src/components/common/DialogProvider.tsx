import React, { useState, useCallback, useRef } from 'react';
import './DialogProvider.css';
import { FaTimes } from 'react-icons/fa';
import { ConfigManager } from '../../core/config/ConfigManager';
import { KGPianoRollState } from '../../core/state/KGPianoRollState';
import { useI18n } from '../../i18n/useI18n';
import { registerDialogFns } from '../../util/dialogUtil';
import type {
  AudioToMidiOptionsResult,
  ChoiceOption,
  ChordDetectionOptionsResult,
  ConfirmOptions,
  MidiChordDetectionOptionsResult,
  NoteRankSelectionOptionsResult,
  IntelligentArpeggiatorOptionsResult,
  PromptOptions,
  TempoApplyResult,
  TempoDetectionOptionsResult,
  TimeSigResult,
} from '../../util/dialogUtil';

interface DialogInfo {
  type: 'alert' | 'confirm' | 'prompt' | 'timesig' | 'choice' | 'chord-detection' | 'midi-chord-detection' | 'tempo-detection' | 'tempo-apply' | 'audio-to-midi' | 'note-rank-selection' | 'intelligent-arpeggiator';
  message: string;
  options?: ConfirmOptions | PromptOptions;
  defaultValue?: string;
  defaultTimeSig?: TimeSigResult;
  choices?: ChoiceOption[];
  defaultChordDetectionOptions?: ChordDetectionOptionsResult;
  defaultMidiChordDetectionOptions?: MidiChordDetectionOptionsResult;
  defaultTempoDetectionOptions?: TempoDetectionOptionsResult;
  defaultAudioToMidiOptions?: AudioToMidiOptionsResult;
  audioToMidiTargetTracks?: ChoiceOption[];
  audioToMidiLoopModeEnabled?: boolean;
  defaultNoteRankSelectionOptions?: NoteRankSelectionOptionsResult;
  intelligentArpeggiatorSources?: ChoiceOption[];
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

const DEFAULT_AUDIO_TO_MIDI_OPTIONS: AudioToMidiOptionsResult = {
  monophonic: true,
  useCurrentFloorDb: true,
  manualFloorDb: -25,
  pitchRangeStart: 12,
  pitchRangeEnd: 107,
  quantizeNoteStart: '1/16',
  quantizeNoteLength: '1/16',
  convertLoopRangeOnly: true,
  groupAdjacentPitchesToHighest: true,
  targetTrackId: '',
};

const DEFAULT_NOTE_RANK_SELECTION_OPTIONS: NoteRankSelectionOptionsResult = {
  direction: 'bottom-to-top',
  rank: 1,
  interval: '1/16',
  range: 'selected-only',
};
const DEFAULT_INTELLIGENT_ARPEGGIATOR_OPTIONS: IntelligentArpeggiatorOptionsResult = { sourceId: 'chord', exampleBars: 1, generateBars: 4, tieBreak: 'higher' };

const DialogProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { t } = useI18n();
  const [dialog, setDialog] = useState<DialogInfo | null>(null);
  const [isClosing, setIsClosing] = useState(false);
  const [inputValue, setInputValue] = useState('');
  const [timeSigNumerator, setTimeSigNumerator] = useState('');
  const [timeSigDenominator, setTimeSigDenominator] = useState('');
  const [chordDetectionOptions, setChordDetectionOptions] = useState<ChordDetectionOptionsResult>(DEFAULT_AUDIO_CHORD_DETECTION_OPTIONS);
  const [midiChordDetectionOptions, setMidiChordDetectionOptions] = useState<MidiChordDetectionOptionsResult>(DEFAULT_MIDI_CHORD_DETECTION_OPTIONS);
  const [tempoDetectionOptions, setTempoDetectionOptions] = useState<TempoDetectionOptionsResult>(DEFAULT_TEMPO_DETECTION_OPTIONS);
  const [audioToMidiOptions, setAudioToMidiOptions] = useState<AudioToMidiOptionsResult>(DEFAULT_AUDIO_TO_MIDI_OPTIONS);
  const [noteRankSelectionOptions, setNoteRankSelectionOptions] = useState<NoteRankSelectionOptionsResult>(DEFAULT_NOTE_RANK_SELECTION_OPTIONS);
  const [intelligentArpeggiatorOptions, setIntelligentArpeggiatorOptions] = useState<IntelligentArpeggiatorOptionsResult>(DEFAULT_INTELLIGENT_ARPEGGIATOR_OPTIONS);
  const [audioToMidiTargetTracks, setAudioToMidiTargetTracks] = useState<ChoiceOption[]>([]);
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

  const openAudioToMidiOptions = useCallback((
    message: string,
    targetTracks: ChoiceOption[],
    loopModeEnabled: boolean,
    defaultValue?: AudioToMidiOptionsResult,
  ): Promise<AudioToMidiOptionsResult | null> => {
    return new Promise<AudioToMidiOptionsResult | null>((resolve) => {
      resolveRef.current = resolve;
      const fallbackTrackId = targetTracks[0]?.value ?? '';
      setAudioToMidiTargetTracks(targetTracks);
      setAudioToMidiOptions({
        ...(defaultValue ?? DEFAULT_AUDIO_TO_MIDI_OPTIONS),
        targetTrackId: defaultValue?.targetTrackId || fallbackTrackId,
      });
      setDialog({
        type: 'audio-to-midi',
        message,
        defaultAudioToMidiOptions: defaultValue,
        audioToMidiTargetTracks: targetTracks,
        audioToMidiLoopModeEnabled: loopModeEnabled,
      });
    });
  }, []);

  const openNoteRankSelectionOptions = useCallback((
    message: string,
    defaultValue?: NoteRankSelectionOptionsResult,
  ): Promise<NoteRankSelectionOptionsResult | null> => new Promise((resolve) => {
    resolveRef.current = resolve;
    setNoteRankSelectionOptions(defaultValue ?? DEFAULT_NOTE_RANK_SELECTION_OPTIONS);
    setDialog({ type: 'note-rank-selection', message, defaultNoteRankSelectionOptions: defaultValue });
  }), []);
  const openIntelligentArpeggiatorOptions = useCallback((message: string, sources: ChoiceOption[], defaultValue?: IntelligentArpeggiatorOptionsResult): Promise<IntelligentArpeggiatorOptionsResult | null> => new Promise((resolve) => {
    resolveRef.current = resolve;
    setIntelligentArpeggiatorOptions(defaultValue ?? { ...DEFAULT_INTELLIGENT_ARPEGGIATOR_OPTIONS, sourceId: sources[0]?.value ?? 'chord' });
    setDialog({ type: 'intelligent-arpeggiator', message, intelligentArpeggiatorSources: sources });
  }), []);

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
    setAudioToMidiOptions(DEFAULT_AUDIO_TO_MIDI_OPTIONS);
    setNoteRankSelectionOptions(DEFAULT_NOTE_RANK_SELECTION_OPTIONS);
    setIntelligentArpeggiatorOptions(DEFAULT_INTELLIGENT_ARPEGGIATOR_OPTIONS);
    setAudioToMidiTargetTracks([]);
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
      openAudioToMidiOptions,
      openNoteRankSelectionOptions,
      openIntelligentArpeggiatorOptions,
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
  const isAudioToMidi = dialog.type === 'audio-to-midi';
  const isNoteRankSelection = dialog.type === 'note-rank-selection';
  const isIntelligentArpeggiator = dialog.type === 'intelligent-arpeggiator';
  const promptOptions = isPrompt ? (dialog.options as PromptOptions | undefined) : undefined;
  const isKGOneEnabled = (ConfigManager.instance().get('general.kgone.enabled') as boolean | undefined) ?? false;

  const title = isAlert
    ? t('dialog.title.notice')
    : isTimeSig
      ? t('dialog.title.timeSignature')
      : isTempoDetection
      ? t('dialog.title.tempoDetection')
      : isTempoApply
        ? t('dialog.title.applyTempo')
        : isAudioToMidi
          ? t('dialog.title.audioToMidi')
        : isNoteRankSelection
          ? t('dialog.title.selectNoteByRank')
        : isIntelligentArpeggiator
          ? t('dialog.title.intelligentArpeggiator')
        : (isChordDetection || isMidiChordDetection)
        ? t('dialog.title.chordDetection')
        : isPrompt
          ? t('dialog.title.input')
          : t('dialog.title.confirm');

  const handleOverlayMouseDown = (e: React.MouseEvent) => {
    mouseDownOnOverlay.current = e.target === e.currentTarget;
  };

  const handleOverlayClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget && mouseDownOnOverlay.current) {
      close(isAlert ? undefined : (isPrompt || isTimeSig || isChoice || isChordDetection || isMidiChordDetection || isTempoDetection || isTempoApply || isAudioToMidi || isNoteRankSelection || isIntelligentArpeggiator) ? null : false);
    }
  };

  const handleCancel = () => close(isAlert ? undefined : (isPrompt || isTimeSig || isChoice || isChordDetection || isMidiChordDetection || isTempoDetection || isTempoApply || isAudioToMidi || isNoteRankSelection || isIntelligentArpeggiator) ? null : false);

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
    if (isAudioToMidi) {
      close(audioToMidiOptions);
      return;
    }
    if (isNoteRankSelection) {
      close(noteRankSelectionOptions);
      return;
    }
    if (isIntelligentArpeggiator) { close(intelligentArpeggiatorOptions); return; }
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

  const updateAudioToMidiOption = <K extends keyof AudioToMidiOptionsResult>(
    key: K,
    value: AudioToMidiOptionsResult[K],
  ) => {
    setAudioToMidiOptions(current => ({ ...current, [key]: value }));
  };

  const updateNoteRankSelectionOption = <K extends keyof NoteRankSelectionOptionsResult>(
    key: K,
    value: NoteRankSelectionOptionsResult[K],
  ) => {
    setNoteRankSelectionOptions(current => ({ ...current, [key]: value }));
  };
  const updateIntelligentArpeggiatorOption = <K extends keyof IntelligentArpeggiatorOptionsResult>(key: K, value: IntelligentArpeggiatorOptionsResult[K]) => setIntelligentArpeggiatorOptions(current => ({ ...current, [key]: value }));

  const detectionHintText = isChordDetection
    ? t('dialog.chordHint.audio')
    : isMidiChordDetection
      ? t('dialog.chordHint.midi')
      : isTempoDetection
        ? t('dialog.chordHint.tempo')
        : isAudioToMidi
          ? t('dialog.audioToMidiHint')
        : null;

  const audioToMidiPitchOptions = Array.from({ length: 96 }, (_, index) => {
    const pitch = 12 + index;
    const noteNames = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
    const noteName = `${noteNames[pitch % 12]}${Math.floor(pitch / 12) - 1}`;
    return { value: String(pitch), label: noteName };
  });

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
              aria-label={t('dialog.close')}
            >
              <FaTimes />
            </button>
          </div>
          <div className="dialog-body">
            {(!isAudioToMidi || dialog.message.trim().length > 0) && (
              <p className="dialog-message">{dialog.message}</p>
            )}
            {detectionHintText && (
              <div className="dialog-hint-card">
                <div className="dialog-hint-card-title">{t('dialog.experimentalFeature')}</div>
                <div className="dialog-hint-card-text">{detectionHintText}</div>
              </div>
            )}
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
            {isAudioToMidi && (
              <div className="dialog-chord-detection-form">
                <div className="dialog-two-column-row">
                  <label className="dialog-checkbox-row dialog-compact-checkbox-row" htmlFor="dialog-audio-to-midi-monophonic">
                    <input
                      id="dialog-audio-to-midi-monophonic"
                      type="checkbox"
                      checked={audioToMidiOptions.monophonic}
                      disabled={true}
                      readOnly={true}
                      autoFocus
                    />
                    <span>{t('dialog.label.monophonicOnly')}</span>
                  </label>
                  <label className="dialog-checkbox-row dialog-compact-checkbox-row" htmlFor="dialog-audio-to-midi-current-floor">
                    <input
                      id="dialog-audio-to-midi-current-floor"
                      type="checkbox"
                      checked={audioToMidiOptions.useCurrentFloorDb}
                      onChange={(e) => updateAudioToMidiOption('useCurrentFloorDb', e.target.checked)}
                    />
                    <span>{t('dialog.label.useCurrentFloorDb')}</span>
                  </label>
                </div>
                <div className="dialog-slider-group">
                  <div className="dialog-slider-header">
                    <label className="dialog-slider-label" htmlFor="dialog-audio-to-midi-floor">{t('dialog.label.manualFloorDb')}</label>
                    <span className="dialog-slider-value">{audioToMidiOptions.manualFloorDb} dB</span>
                  </div>
                  <input
                    id="dialog-audio-to-midi-floor"
                    className="dialog-slider"
                    type="range"
                    aria-label={t('dialog.label.manualFloorDb')}
                    min={-50}
                    max={-5}
                    step={1}
                    value={audioToMidiOptions.manualFloorDb}
                    onChange={(e) => updateAudioToMidiOption('manualFloorDb', Number(e.target.value))}
                    disabled={audioToMidiOptions.useCurrentFloorDb}
                  />
                </div>
                <div className="dialog-slider-group">
                  <div className="dialog-slider-header">
                    <label className="dialog-slider-label" htmlFor="dialog-audio-to-midi-pitch-start">{t('dialog.label.pitchRange')}</label>
                  </div>
                  <div className="dialog-timesig-row">
                    <select
                      id="dialog-audio-to-midi-pitch-start"
                      className="dialog-input"
                      aria-label={`${t('dialog.label.pitchRange')} start`}
                      value={String(audioToMidiOptions.pitchRangeStart)}
                      onChange={(e) => {
                        const nextStart = Number(e.target.value);
                        updateAudioToMidiOption('pitchRangeStart', nextStart);
                        if (nextStart > audioToMidiOptions.pitchRangeEnd) {
                          updateAudioToMidiOption('pitchRangeEnd', nextStart);
                        }
                      }}
                    >
                      {audioToMidiPitchOptions.map(option => (
                        <option key={option.value} value={option.value}>{option.label}</option>
                      ))}
                    </select>
                    <span className="dialog-inline-sep">{t('dialog.to')}</span>
                    <select
                      className="dialog-input"
                      aria-label={`${t('dialog.label.pitchRange')} end`}
                      value={String(audioToMidiOptions.pitchRangeEnd)}
                      onChange={(e) => {
                        const nextEnd = Number(e.target.value);
                        updateAudioToMidiOption('pitchRangeEnd', nextEnd);
                        if (nextEnd < audioToMidiOptions.pitchRangeStart) {
                          updateAudioToMidiOption('pitchRangeStart', nextEnd);
                        }
                      }}
                    >
                      {audioToMidiPitchOptions.map(option => (
                        <option key={option.value} value={option.value}>{option.label}</option>
                      ))}
                    </select>
                  </div>
                </div>
                <div className="dialog-two-column-row">
                  <div className="dialog-slider-group dialog-half-width-group">
                    <div className="dialog-slider-header">
                      <label className="dialog-slider-label" htmlFor="dialog-audio-to-midi-quant-start">{t('dialog.label.quantizeNoteStart')}</label>
                    </div>
                    <select
                      id="dialog-audio-to-midi-quant-start"
                      className="dialog-input dialog-compact-input"
                      aria-label={t('dialog.label.quantizeNoteStart')}
                      value={audioToMidiOptions.quantizeNoteStart}
                      onChange={(e) => updateAudioToMidiOption('quantizeNoteStart', e.target.value)}
                    >
                      {KGPianoRollState.QUANT_POS_OPTIONS.map(option => (
                        <option key={option.value} value={option.value}>{t(option.labelKey)}</option>
                      ))}
                    </select>
                  </div>
                  <div className="dialog-slider-group dialog-half-width-group">
                    <div className="dialog-slider-header">
                      <label className="dialog-slider-label" htmlFor="dialog-audio-to-midi-quant-length">{t('dialog.label.quantizeNoteLength')}</label>
                    </div>
                    <select
                      id="dialog-audio-to-midi-quant-length"
                      className="dialog-input dialog-compact-input"
                      aria-label={t('dialog.label.quantizeNoteLength')}
                      value={audioToMidiOptions.quantizeNoteLength}
                      onChange={(e) => updateAudioToMidiOption('quantizeNoteLength', e.target.value)}
                    >
                      {KGPianoRollState.QUANT_LEN_OPTIONS.map(option => (
                        <option key={option.value} value={option.value}>{t(option.labelKey)}</option>
                      ))}
                    </select>
                  </div>
                </div>
                <label className="dialog-checkbox-row" htmlFor="dialog-audio-to-midi-loop-only">
                  <input
                    id="dialog-audio-to-midi-loop-only"
                    type="checkbox"
                    checked={audioToMidiOptions.convertLoopRangeOnly}
                    disabled={!dialog.audioToMidiLoopModeEnabled}
                    onChange={(e) => updateAudioToMidiOption('convertLoopRangeOnly', e.target.checked)}
                  />
                  <span>{t('dialog.label.convertLoopRangeOnly')}</span>
                </label>
                <label className="dialog-checkbox-row" htmlFor="dialog-audio-to-midi-group-adjacent">
                  <input
                    id="dialog-audio-to-midi-group-adjacent"
                    type="checkbox"
                    checked={audioToMidiOptions.groupAdjacentPitchesToHighest}
                    onChange={(e) => updateAudioToMidiOption('groupAdjacentPitchesToHighest', e.target.checked)}
                  />
                  <span>{t('dialog.label.groupAdjacentPitchesToHighest')}</span>
                </label>
                <div className="dialog-slider-group">
                  <div className="dialog-slider-header">
                    <label className="dialog-slider-label" htmlFor="dialog-audio-to-midi-target-track">{t('dialog.label.targetTrack')}</label>
                  </div>
                  <select
                    id="dialog-audio-to-midi-target-track"
                    className="dialog-input"
                    aria-label={t('dialog.label.targetTrack')}
                    value={audioToMidiOptions.targetTrackId}
                    onChange={(e) => updateAudioToMidiOption('targetTrackId', e.target.value)}
                  >
                    {audioToMidiTargetTracks.map(choice => (
                      <option key={choice.value} value={choice.value}>{choice.label}</option>
                    ))}
                  </select>
                </div>
              </div>
            )}
            {isNoteRankSelection && (
              <div className="dialog-chord-detection-form">
                <div className="dialog-slider-group">
                  <label className="dialog-slider-label" htmlFor="dialog-note-rank-direction">{t('dialog.label.noteRankDirection')}</label>
                  <select
                    id="dialog-note-rank-direction"
                    className="dialog-input"
                    value={noteRankSelectionOptions.direction}
                    onChange={(e) => updateNoteRankSelectionOption('direction', e.target.value as NoteRankSelectionOptionsResult['direction'])}
                    autoFocus
                  >
                    <option value="bottom-to-top">{t('dialog.option.bottomToTop')}</option>
                    <option value="top-to-bottom">{t('dialog.option.topToBottom')}</option>
                  </select>
                </div>
                <div className="dialog-two-column-row">
                  <div className="dialog-half-width-group">
                    <label className="dialog-slider-label" htmlFor="dialog-note-rank">{t('dialog.label.noteRank')}</label>
                    <input
                      id="dialog-note-rank"
                      className="dialog-input"
                      type="number"
                      min={1}
                      step={1}
                      value={noteRankSelectionOptions.rank}
                      aria-label={t('dialog.label.noteRank')}
                      onChange={(e) => updateNoteRankSelectionOption('rank', Math.max(1, Math.floor(Number(e.target.value) || 1)))}
                    />
                  </div>
                  <div className="dialog-half-width-group">
                    <label className="dialog-slider-label" htmlFor="dialog-note-rank-interval">{t('dialog.label.noteRankInterval')}</label>
                    <select
                      id="dialog-note-rank-interval"
                      className="dialog-input"
                      value={noteRankSelectionOptions.interval}
                      aria-label={t('dialog.label.noteRankInterval')}
                      onChange={(e) => updateNoteRankSelectionOption('interval', e.target.value)}
                    >
                      {KGPianoRollState.QUANT_LEN_OPTIONS.map(option => (
                        <option key={option.value} value={option.value}>{t(option.labelKey)}</option>
                      ))}
                    </select>
                  </div>
                </div>
                <div className="dialog-slider-group">
                  <label className="dialog-slider-label" htmlFor="dialog-note-rank-range">{t('dialog.label.noteRankRange')}</label>
                  <select
                    id="dialog-note-rank-range"
                    className="dialog-input"
                    value={noteRankSelectionOptions.range}
                    aria-label={t('dialog.label.noteRankRange')}
                    onChange={(e) => updateNoteRankSelectionOption('range', e.target.value as NoteRankSelectionOptionsResult['range'])}
                  >
                    <option value="selected-only">{t('dialog.option.noteRankSelectedOnly')}</option>
                    <option value="selected-and-above">{t('dialog.option.noteRankSelectedAndAbove')}</option>
                    <option value="selected-and-below">{t('dialog.option.noteRankSelectedAndBelow')}</option>
                  </select>
                </div>
              </div>
            )}
            {isIntelligentArpeggiator && (
              <div className="dialog-chord-detection-form">
                <div className="dialog-slider-group"><label className="dialog-slider-label" htmlFor="dialog-intelligent-source">{t('dialog.label.inputSource')}</label><select id="dialog-intelligent-source" className="dialog-input" value={intelligentArpeggiatorOptions.sourceId} onChange={(e) => updateIntelligentArpeggiatorOption('sourceId', e.target.value)} autoFocus>{dialog.intelligentArpeggiatorSources?.map(source => <option key={source.value} value={source.value}>{source.label}</option>)}</select></div>
                <div className="dialog-two-column-row"><div className="dialog-half-width-group"><label className="dialog-slider-label" htmlFor="dialog-intelligent-example">{t('dialog.label.exampleLengthBars')}</label><input id="dialog-intelligent-example" className="dialog-input" type="number" min={1} step={1} value={intelligentArpeggiatorOptions.exampleBars} onChange={(e) => updateIntelligentArpeggiatorOption('exampleBars', Math.max(1, Math.floor(Number(e.target.value) || 1)))} /></div><div className="dialog-half-width-group"><label className="dialog-slider-label" htmlFor="dialog-intelligent-generate">{t('dialog.label.generateForBars')}</label><input id="dialog-intelligent-generate" className="dialog-input" type="number" min={1} step={1} value={intelligentArpeggiatorOptions.generateBars} onChange={(e) => updateIntelligentArpeggiatorOption('generateBars', Math.max(1, Math.floor(Number(e.target.value) || 1)))} /></div></div>
                <div className="dialog-slider-group"><label className="dialog-slider-label" htmlFor="dialog-intelligent-tie">{t('dialog.label.pitchAnchorTieBreak')}</label><select id="dialog-intelligent-tie" className="dialog-input" value={intelligentArpeggiatorOptions.tieBreak} onChange={(e) => updateIntelligentArpeggiatorOption('tieBreak', e.target.value as IntelligentArpeggiatorOptionsResult['tieBreak'])}><option value="higher">{t('dialog.option.preferHigher')}</option><option value="lower">{t('dialog.option.preferLower')}</option></select></div>
              </div>
            )}
            {isChordDetection && (
              <div className="dialog-chord-detection-form">
                <div className="dialog-hint-card">
                  <div className="dialog-hint-card-title">{t('dialog.recommendedSource')}</div>
                  <div className="dialog-hint-card-text">
                    {isKGOneEnabled ? t('dialog.sourceHint.kgone') : t('dialog.sourceHint.local')}
                  </div>
                </div>
                <div className="dialog-slider-group">
                  <div className="dialog-slider-header">
                    <label className="dialog-slider-label" htmlFor="dialog-chord-sensitivity">{t('dialog.label.sensitivity')}</label>
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
                    <label className="dialog-slider-label" htmlFor="dialog-chord-stability">{t('dialog.label.stability')}</label>
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
                    <label className="dialog-slider-label" htmlFor="dialog-chord-no-chord-threshold">{t('dialog.label.noChordThreshold')}</label>
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
                  <span>{t('dialog.label.enableSevenths')}</span>
                </label>
              </div>
            )}
            {isMidiChordDetection && (
              <div className="dialog-chord-detection-form">
                <div className="dialog-slider-group">
                  <div className="dialog-slider-header">
                    <label className="dialog-slider-label" htmlFor="dialog-midi-short-note-suppression">{t('dialog.label.shortNotes')}</label>
                  </div>
                  <select
                    id="dialog-midi-short-note-suppression"
                    className="dialog-input"
                    value={midiChordDetectionOptions.shortNoteSuppression}
                    onChange={(e) => updateMidiChordDetectionOption('shortNoteSuppression', e.target.value as MidiChordDetectionOptionsResult['shortNoteSuppression'])}
                    autoFocus
                  >
                    <option value="low">{t('dialog.option.suppressionLow')}</option>
                    <option value="medium">{t('dialog.option.suppressionMedium')}</option>
                    <option value="high">{t('dialog.option.suppressionHigh')}</option>
                  </select>
                </div>
                <div className="dialog-slider-group">
                  <div className="dialog-slider-header">
                    <label className="dialog-slider-label" htmlFor="dialog-midi-harmonic-focus">{t('dialog.label.harmonicFocus')}</label>
                  </div>
                  <select
                    id="dialog-midi-harmonic-focus"
                    className="dialog-input"
                    value={midiChordDetectionOptions.harmonicFocus}
                    onChange={(e) => updateMidiChordDetectionOption('harmonicFocus', e.target.value as MidiChordDetectionOptionsResult['harmonicFocus'])}
                  >
                    <option value="balanced">{t('dialog.option.harmonicBalanced')}</option>
                    <option value="favor-sustained-notes">{t('dialog.option.harmonicSustained')}</option>
                  </select>
                </div>
                <label className="dialog-checkbox-row" htmlFor="dialog-midi-enable-sevenths">
                  <input
                    id="dialog-midi-enable-sevenths"
                    type="checkbox"
                    checked={midiChordDetectionOptions.enableSevenths}
                    onChange={(e) => updateMidiChordDetectionOption('enableSevenths', e.target.checked)}
                  />
                  <span>{t('dialog.label.enableSevenths')}</span>
                </label>
              </div>
            )}
            {isTempoDetection && (
              <div className="dialog-chord-detection-form">
                <div className="dialog-slider-group">
                  <div className="dialog-slider-header">
                    <label className="dialog-slider-label" htmlFor="dialog-tempo-min-tempo">{t('dialog.label.minimumBpm')}</label>
                    <span className="dialog-slider-value">{tempoDetectionOptions.minTempo}</span>
                  </div>
                  <input
                    id="dialog-tempo-min-tempo"
                    className="dialog-slider"
                    type="range"
                    min={60}
                    max={200}
                    step={1}
                    value={tempoDetectionOptions.minTempo}
                    onChange={(e) => updateTempoDetectionOption('minTempo', Number(e.target.value))}
                    autoFocus
                  />
                </div>
                <div className="dialog-slider-group">
                  <div className="dialog-slider-header">
                    <label className="dialog-slider-label" htmlFor="dialog-tempo-max-tempo">{t('dialog.label.maximumBpm')}</label>
                    <span className="dialog-slider-value">{tempoDetectionOptions.maxTempo}</span>
                  </div>
                  <input
                    id="dialog-tempo-max-tempo"
                    className="dialog-slider"
                    type="range"
                    min={60}
                    max={200}
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
                  <span>{t('dialog.label.autoAlignRegionToBeat')}</span>
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
                {(dialog.options as ConfirmOptions | PromptOptions | undefined)?.cancelLabel ?? t('dialog.cancel')}
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
                autoFocus={!isPrompt && !isTimeSig && !isChordDetection && !isMidiChordDetection && !isTempoDetection && !isTempoApply && !isAudioToMidi && !isNoteRankSelection && !isIntelligentArpeggiator}
              >
                {isAlert
                  ? t('dialog.ok')
                  : ((dialog.options as ConfirmOptions | PromptOptions | undefined)?.confirmLabel
                    ?? (isPrompt || isTimeSig
                      ? t('dialog.ok')
                      : (isChordDetection || isMidiChordDetection || isTempoDetection || isAudioToMidi)
                        ? t('dialog.ok')
                        : (isNoteRankSelection ? t('dialog.apply') : isIntelligentArpeggiator ? t('dialog.generate') : t('settings.yes'))))}
              </button>
            )}
          </div>
        </div>
      </div>
    </>
  );
};

export default DialogProvider;
