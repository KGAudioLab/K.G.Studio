import React, { useRef, useEffect, useState, useCallback, useLayoutEffect, useMemo } from 'react';
import './PianoRoll.css';
import * as Tone from 'tone';
import { useProjectStore } from '../../stores/projectStore';
import { FaGripLines } from 'react-icons/fa';
import { KGMidiRegion } from '../../core/region/KGMidiRegion';
import type { KGAudioRegion } from '../../core/region/KGAudioRegion';
import { DEBUG_MODE, PIANO_ROLL_CONSTANTS, TOOLBAR_CONSTANTS } from '../../constants';
import PianoRollHeader from './PianoRollHeader';
import PianoRollToolbar from './PianoRollToolbar';
import NoteAttributeBar from './NoteAttributeBar';
import PianoRollContent from './PianoRollContent';
import { KGCore } from '../../core/KGCore';
import { KGMidiNote } from '../../core/midi/KGMidiNote';
import { KGMidiTrack, type InstrumentType } from '../../core/track/KGMidiTrack';
import { KGPianoRollState } from '../../core/state/KGPianoRollState';
import { ConfigManager } from '../../core/config/ConfigManager';
import { beatsToBar } from '../../util/midiUtil';
import { ReplaceChordRegionsInRangeCommand, UpdateRegionCommand } from '../../core/commands';
import { KGAudioInterface } from '../../core/audio-interface/KGAudioInterface';
import { KGAudioFileStorage } from '../../core/io/KGAudioFileStorage';
import { showAlert, showChordDetectionOptions, showMidiChordDetectionOptions, showTempoApply, showTempoDetectionOptions } from '../../util/dialogUtil';
import { matchesKeyboardShortcut } from '../../util/osUtil';
import { resolveChordGuideItems } from '../../util/chordGuideDataUtil';
import {
  normalizeSpectrogramHeightResolution,
  type SpectrogramHeightResolution,
} from '../../util/spectrogramUtil';
import {
  DEFAULT_AUDIO_CHORD_DETECTION_OPTIONS,
  buildAudioChordWindowsForRegion,
  type AudioChordDetectionRequest,
  type AudioChordDetectionOptions,
  type DetectedAudioChord,
} from '../../util/audioChordDetection';
import {
  buildAudioTempoAnalysisSpanForRegion,
  DEFAULT_AUDIO_TEMPO_DETECTION_OPTIONS,
  detectTempoFromAudio,
  type AudioTempoDetectionOptions,
} from '../../util/audioTempoDetection';
import {
  applyDetectedTempoAction,
  buildDetectedTempoChoiceMessage,
  DETECTED_TEMPO_ACTION_INSERT_REGION,
  DETECTED_TEMPO_ACTION_UPDATE_CURRENT,
} from '../../util/audioTempoDetectionActions';
import {
  DEFAULT_MIDI_CHORD_DETECTION_OPTIONS,
  buildMidiChordWindowsForRegion,
  detectChordsFromMidi,
  type DetectedMidiChord,
  type MidiChordDetectionOptions,
} from '../../util/midiChordDetection';
import type { AudioChordDetectionWorkerMessage } from '../../workers/audioChordDetectionWorker';
import type { PianoRollAutomationType } from './pianoRollAutomation';
import type { SheetMeasureMetric } from './sheetNotationTypes';
import { getSheetPlayheadPixel, getSheetQuantizationOptions, parseSheetQuantization } from './sheetNotation';
import {
  createPendingModeSwitchRequest,
  getRegionStartScrollLeft,
  getScrollLeftForViewportRequest,
  type PendingModeSwitchRequest,
} from './pianoRollViewport';
import { getNextChordGuideSelection, resolveChordGuideContext, type ChordGuideFunction } from './chordGuideUtil';

interface PianoRollProps {
  onClose: () => void;
  regionId: string | null;
  initialPosition?: { x: number; y: number };
  initialSize?: { width: number; height: number };
  mode?: 'midi-edit' | 'audio-waveform' | 'spectrogram' | 'hybrid';
  requestedSheetMusicViewEnabled?: boolean;
  pianoRollViewRequestVersion?: number;
  audioRegion?: KGAudioRegion;
  trackId?: string;
  projectName?: string;
}

const PianoRoll: React.FC<PianoRollProps> = ({
  onClose,
  regionId,
  initialPosition,
  initialSize,
  mode = 'midi-edit',
  requestedSheetMusicViewEnabled = false,
  pianoRollViewRequestVersion = 0,
  audioRegion,
  trackId,
  projectName,
}) => {
  const [currentMode, setCurrentMode] = useState<'midi-edit' | 'audio-waveform' | 'spectrogram' | 'hybrid'>(mode);
  const isSpectrogram = currentMode === 'spectrogram';
  const isAudioWaveform = currentMode === 'audio-waveform';
  const isAudioOnly = isAudioWaveform || isSpectrogram;
  const isHybrid = currentMode === 'hybrid';
  const { maxBars, tracks, updateTrack, timeSignature, showChatBox, showKGOnePanel, showEventListPanel, showInstrumentSelection, keySignature, selectedMode, setSelectedMode, playheadPosition, isPlaying, autoScrollEnabled, bpm, pianoRollScrollRequest, selectedNoteIds, automationRedrawVersion, refreshProjectState, setBpm } = useProjectStore();

  // Tool state for piano roll
  const [activeTool, setActiveTool] = useState<'pointer' | 'pencil'>('pointer');

  // Spectrogram controls (only used in spectrogram mode)
  const [spectrogramThresholdDb, setSpectrogramThresholdDb] = useState<number>(-25);
  const [spectrogramPower, setSpectrogramPower] = useState<number>(0.5);
  const [spectrogramHeightResolution, setSpectrogramHeightResolution] =
    useState<SpectrogramHeightResolution>(3);
  const [isDetectingChords, setIsDetectingChords] = useState(false);
  const [detectChordProgressPercent, setDetectChordProgressPercent] = useState(0);
  const [isDetectingTempo, setIsDetectingTempo] = useState(false);

  // Piano roll zoom (1x–8x); updates --region-grid-beat-width CSS variable
  const [pianoRollZoom, setPianoRollZoom] = useState<number>(() => KGPianoRollState.instance().getPianoRollZoom());
  const [automationEnabled, setAutomationEnabled] = useState(false);
  const [automationType, setAutomationType] = useState<PianoRollAutomationType>('pitch-bend');
  const [sheetMusicViewEnabled, setSheetMusicViewEnabled] = useState(false);
  const [sheetMusicTrackScopeEnabled, setSheetMusicTrackScopeEnabled] = useState(false);
  const [sheetQuantization, setSheetQuantization] = useState('16,48');
  const [sheetMeasureMetrics, setSheetMeasureMetrics] = useState<SheetMeasureMetric[]>([]);
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [titleInputValue, setTitleInputValue] = useState('');
  const titleInputRef = useRef<HTMLInputElement>(null);

  // Quantization state
  const [quantPosition, setQuantPosition] = useState<string>('1/8');
  const [quantLength, setQuantLength] = useState<string>('1/8');

  // Snapping state
  const [snapping, setSnapping] = useState<string>('NO SNAP');

  // Chord guide state
  const [chordGuide, setChordGuide] = useState<ChordGuideFunction>('N');

  // Piano roll state with temporary initial values
  const [position, setPosition] = useState(initialPosition || { x: 0, y: 0 });

  // Blink effect state for toolbar button feedback
  const [blinkButton, setBlinkButton] = useState<string | null>(null);
  const [size, setSize] = useState(initialSize || { width: 800, height: PIANO_ROLL_CONSTANTS.PIANO_ROLL_HEIGHT });
  const [isDragging, setIsDragging] = useState(false);
  const [isResizing, setIsResizing] = useState(false);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [activeRegion, setActiveRegion] = useState<KGMidiRegion | null>(null);

  useEffect(() => {
    setCurrentMode(mode);
  }, [mode]);

  const selectedNotes = useMemo(
    () => activeRegion?.getNotes().filter(n => selectedNoteIds.includes(n.getId())) ?? [],
    [activeRegion, selectedNoteIds]
  );
  const parentMidiTrack = useMemo(() => {
    if (!activeRegion) {
      return null;
    }

    return tracks.find(track => track.getId().toString() === activeRegion.getTrackId()) ?? null;
  }, [activeRegion, tracks]);
  const activeInstrument = useMemo<InstrumentType>(() => (
    parentMidiTrack instanceof KGMidiTrack ? parentMidiTrack.getInstrument() : 'acoustic_grand_piano'
  ), [parentMidiTrack]);
  const parsedSheetQuantization = useMemo(
    () => parseSheetQuantization(sheetQuantization),
    [sheetQuantization]
  );
  const chordGuideContext = useMemo(() => {
    const project = KGCore.instance().getCurrentProject();
    return resolveChordGuideContext(project, playheadPosition);
  }, [playheadPosition]);
  const effectiveChordGuideKeySignature = chordGuideContext.keySignature;
  const chordGuideMode = chordGuideContext.mode;

  const pianoRollRef = useRef<HTMLDivElement>(null);
  const pianoRollContentRef = useRef<HTMLDivElement>(null);
  const pianoRollNoteScrollRef = useRef<HTMLDivElement>(null);
  const pianoGridRef = useRef<HTMLDivElement>(null);
  const wasDraggingRef = useRef<boolean>(false);

  // Refs for auto-scroll during playback
  const pianoRollExpectedScrollLeftRef = useRef<number>(-1);
  const pianoRollIsPlayingRef = useRef(false);
  const pendingZoomAnchorBeatRef = useRef<number | null>(null);
  const pendingModeSwitchRequestRef = useRef<PendingModeSwitchRequest | null>(null);
  const previousSheetMusicViewEnabledRef = useRef<boolean>(false);
  const previousActiveRegionIdRef = useRef<string | null>(null);
  const lastAppliedViewRequestVersionRef = useRef<number>(0);

  // Ref for storing the setNoteUpdateCounter function
  const triggerNoteUpdateRef = useRef<React.Dispatch<React.SetStateAction<number>> | null>(null);

  // Ref for storing the deleteSelectedNotes function
  const deleteSelectedNotesRef = useRef<(() => boolean) | null>(null);

  // Calculate initial position and size once on mount
  useEffect(() => {
    // Skip if initialPosition or initialSize were provided as props
    if (!initialPosition || !initialSize) {
      // Calculate initial position based on window dimensions
      const calculateInitialPosition = () => {
        // Dynamically get heights from CSS computed styles
        const statusBarElement = document.querySelector('.status-bar');

        // Get actual heights from DOM elements, or use fallback values if elements don't exist yet
        const statusBarHeight = statusBarElement ? statusBarElement.clientHeight : 30;
        const pianoRollHeight = PIANO_ROLL_CONSTANTS.PIANO_ROLL_HEIGHT;

        // Compute left offset when instrument selection panel is open
        const rootStyles = getComputedStyle(document.documentElement);
        const instrumentPanelWidthStr = rootStyles.getPropertyValue('--instrument-selection-width') || '300px';
        const instrumentPanelWidth = parseInt(instrumentPanelWidthStr, 10) || 300;

        if (DEBUG_MODE.PIANO_ROLL) {
          console.log(`Positioning piano roll with heights - statusBar: ${statusBarHeight}px, pianoRoll: ${pianoRollHeight}px`);
        }

        return {
          x: showInstrumentSelection ? instrumentPanelWidth : 0,
          y: window.innerHeight - statusBarHeight - pianoRollHeight
        };
      };

      const calculateInitialSize = () => {
        const rootStyles = getComputedStyle(document.documentElement);
        const chatBoxWidthStr = rootStyles.getPropertyValue('--chat-box-width') || '350px';
        const instrumentPanelWidthStr = rootStyles.getPropertyValue('--instrument-selection-width') || '300px';
        const chatBoxWidth = parseInt(chatBoxWidthStr, 10) || 350;
        const instrumentPanelWidth = parseInt(instrumentPanelWidthStr, 10) || 300;

        let availableWidth = window.innerWidth;
        if (showChatBox || showKGOnePanel || showEventListPanel) availableWidth -= chatBoxWidth;
        if (showInstrumentSelection) availableWidth -= instrumentPanelWidth;

        // Ensure a sensible minimum starting width
        const clampedWidth = Math.max(400, availableWidth);

        return {
          width: clampedWidth,
          height: PIANO_ROLL_CONSTANTS.PIANO_ROLL_HEIGHT
        };
      };

      // Set position and size only if not provided as props
      if (!initialPosition) {
        setPosition(calculateInitialPosition());
      }

      if (!initialSize) {
        setSize(calculateInitialSize());
      }
    }
    // Intentionally run once on mount to capture layout at open time
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Empty dependency array means this runs once on mount

  // Find and set the active region when regionId changes
  useEffect(() => {
    if (!regionId) {
      setActiveRegion(null);
      return;
    }

    let found: KGMidiRegion | null = null;
    for (const track of tracks) {
      const region = track.getRegions().find(r => r.getId() === regionId);
      if (region && region instanceof KGMidiRegion) {
        found = region;
        break;
      }
    }

    // Always update — clears stale MIDI region when switching to an audio region
    setActiveRegion(found);

    if (found && DEBUG_MODE.PIANO_ROLL) {
      console.log(`Active region set in PianoRoll: ${found.getId()}`);
      console.log(`Region details: name=${found.getName()}, trackId=${found.getTrackId()}, trackIndex=${found.getTrackIndex()}`);
    }
  }, [regionId, tracks]);

  // Sync local state with KGPianoRollState on mount
  useEffect(() => {
    const pianoRollState = KGPianoRollState.instance();

    // Sync snapping state
    const currentSnap = pianoRollState.getCurrentSnap();
    setSnapping(currentSnap);

    // Sync tool state
    const currentTool = pianoRollState.getActiveTool() as 'pointer' | 'pencil';
    setActiveTool(currentTool);
    setAutomationEnabled(pianoRollState.getAutomationViewEnabled());
    setAutomationType(pianoRollState.getCurrentAutomationType() as PianoRollAutomationType);
    setSheetMusicViewEnabled(pianoRollState.getSheetMusicViewEnabled());
    setSheetMusicTrackScopeEnabled(pianoRollState.getSheetMusicTrackScopeEnabled());
    setSheetQuantization(pianoRollState.getSheetQuantization());

    if (DEBUG_MODE.PIANO_ROLL) {
      console.log(`Synced piano roll state on mount - snap: ${currentSnap}, tool: ${currentTool}`);
    }
  }, []); // Empty dependency array means this runs once on mount

  useEffect(() => {
    if (isAudioOnly) {
      return;
    }

    if (pianoRollViewRequestVersion === 0 || lastAppliedViewRequestVersionRef.current === pianoRollViewRequestVersion) {
      return;
    }

    lastAppliedViewRequestVersionRef.current = pianoRollViewRequestVersion;

    if (activeRegion) {
      pendingModeSwitchRequestRef.current = createPendingModeSwitchRequest({
        playheadBeat: playheadPosition,
        regionStartBeat: activeRegion.getStartFromBeat(),
        regionEndBeat: activeRegion.getStartFromBeat() + activeRegion.getLength(),
        sourceSheetMusicViewEnabled: sheetMusicViewEnabled,
        destinationSheetMusicViewEnabled: requestedSheetMusicViewEnabled,
        destinationSheetMusicTrackScopeEnabled: requestedSheetMusicViewEnabled && sheetMusicTrackScopeEnabled,
      });
    } else {
      pendingModeSwitchRequestRef.current = null;
    }

    setSheetMusicViewEnabled(requestedSheetMusicViewEnabled);
    KGPianoRollState.instance().setSheetMusicViewEnabled(requestedSheetMusicViewEnabled);
  }, [
    activeRegion,
    isAudioOnly,
    pianoRollViewRequestVersion,
    playheadPosition,
    requestedSheetMusicViewEnabled,
    sheetMusicTrackScopeEnabled,
    sheetMusicViewEnabled,
  ]);

  useEffect(() => {
    let unsubscribe: (() => void) | undefined;

    const initializeSpectrogramHeightResolution = async () => {
      const configManager = ConfigManager.instance();
      if (!configManager.getIsInitialized()) {
        await configManager.initialize();
      }

      const applyResolutionFromConfig = () => {
        setSpectrogramHeightResolution(
          normalizeSpectrogramHeightResolution(
            configManager.get('editor.spectrogram_height_resolution')
          )
        );
      };

      applyResolutionFromConfig();
      unsubscribe = configManager.addChangeListener((changedKeys) => {
        if (
          changedKeys.includes('__all__') ||
          changedKeys.includes('editor.spectrogram_height_resolution')
        ) {
          applyResolutionFromConfig();
        }
      });
    };

    void initializeSpectrogramHeightResolution();

    return () => {
      unsubscribe?.();
    };
  }, []);

  // Add keyboard event listener for Escape
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      // Close on Escape key
      if (event.key === 'Escape') {
        if (DEBUG_MODE.PIANO_ROLL) {
          console.log('Closing piano roll with ESC key');
        }
        onClose();
      }
    };

    // Add event listener
    window.addEventListener('keydown', handleKeyDown);

    // Remove event listener on cleanup
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [onClose]);

  // Handle mouse events for dragging and resizing
  const handleMouseDown = (e: React.MouseEvent, action: 'drag' | 'resize') => {
    if (action === 'drag') {
      setIsDragging(true);
      wasDraggingRef.current = false; // Reset the dragging flag
      if (pianoRollRef.current) {
        const rect = pianoRollRef.current.getBoundingClientRect();
        setDragOffset({
          x: e.clientX - rect.left,
          y: e.clientY - rect.top
        });
      }
    } else if (action === 'resize') {
      setIsResizing(true);
      e.preventDefault();
    }
  };

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (isDragging) {
        // Set the flag to true as soon as any movement happens
        wasDraggingRef.current = true;

        setPosition({
          x: e.clientX - dragOffset.x,
          y: e.clientY - dragOffset.y
        });
      } else if (isResizing) {
        setSize({
          width: Math.max(400, e.clientX - position.x),
          height: Math.max(300, e.clientY - position.y)
        });
      }
    };

    const handleMouseUp = () => {
      setIsDragging(false);
      setIsResizing(false);
      // We keep wasDraggingRef.current as is - it will be used in handleTitleClick
      // and reset on the next mousedown
    };

    if (isDragging || isResizing) {
      document.addEventListener('mousemove', handleMouseMove as unknown as EventListener);
      document.addEventListener('mouseup', handleMouseUp);
    }

    return () => {
      document.removeEventListener('mousemove', handleMouseMove as unknown as EventListener);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, isResizing, dragOffset, position]);

  useEffect(() => {
    if (!isEditingTitle && activeRegion) {
      setTitleInputValue(activeRegion.getName());
    }
  }, [activeRegion, isEditingTitle]);

  const cancelTitleEdit = () => {
    setTitleInputValue(activeRegion?.getName() ?? '');
    setIsEditingTitle(false);
  };

  const commitTitleEdit = async () => {
    if (!activeRegion) {
      setIsEditingTitle(false);
      return;
    }

    const newName = titleInputValue.trim();
    setIsEditingTitle(false);
    setTitleInputValue(activeRegion.getName());

    if (!newName || newName === activeRegion.getName()) return;

    try {
      const command = new UpdateRegionCommand(activeRegion.getId(), { name: newName });
      KGCore.instance().executeCommand(command);

      if (DEBUG_MODE.PIANO_ROLL) {
        console.log(`Executed UpdateRegionCommand: renamed region ${activeRegion.getId()} to "${newName}" using command pattern`);
      }

      const updatedTracks = [...tracks];
      useProjectStore.setState({ tracks: updatedTracks });
    } catch (error) {
      console.error('Error renaming region:', error);
      await showAlert('Failed to rename region. Please try again.');
    }
  };

  const handleDetectChords = useCallback(async () => {
    if (!audioRegion && !activeRegion) {
      await showAlert('Open a MIDI or audio region before detecting chords.');
      return;
    }

    const project = KGCore.instance().getCurrentProject();
    const audioWindows = audioRegion ? buildAudioChordWindowsForRegion(project, audioRegion) : null;
    const midiWindows = !audioRegion && activeRegion ? buildMidiChordWindowsForRegion(project, activeRegion) : null;
    const chordWindows = audioWindows ?? midiWindows ?? [];
    if (chordWindows.length === 0) {
      await showAlert(audioRegion
        ? 'The selected audio region has no audible span to analyze.'
        : 'The selected MIDI region has no bars to analyze.'
      );
      return;
    }

    const detectionOptions = audioRegion
      ? await showChordDetectionOptions(
        'Tune audio chord detection settings before processing.',
        DEFAULT_AUDIO_CHORD_DETECTION_OPTIONS,
      )
      : await showMidiChordDetectionOptions(
        'Tune MIDI chord detection settings before processing.',
        DEFAULT_MIDI_CHORD_DETECTION_OPTIONS,
      );
    if (!detectionOptions) {
      return;
    }

    setIsDetectingChords(true);
    setDetectChordProgressPercent(0);
    let worker: Worker | null = null;

    try {
      let detectedChords: DetectedAudioChord[] | DetectedMidiChord[];
      if (audioRegion) {
        if (!projectName || !trackId) {
      await showAlert('Open an audio region in spectrogram mode before detecting chords.');
          return;
        }

        let audioBuffer = KGAudioInterface.instance().getAudioBuffer(trackId, audioRegion.getAudioFileId());
        if (!audioBuffer) {
          const rawBuffer = await KGAudioFileStorage.loadAudioFile(projectName, audioRegion.getAudioFileId());
          const actx = Tone.getContext().rawContext as AudioContext;
          audioBuffer = await actx.decodeAudioData(rawBuffer);
        }

        const monoPcm = new Float32Array(audioBuffer.length);
        for (let channelIndex = 0; channelIndex < audioBuffer.numberOfChannels; channelIndex++) {
          const channelData = audioBuffer.getChannelData(channelIndex);
          for (let sampleIndex = 0; sampleIndex < audioBuffer.length; sampleIndex++) {
            monoPcm[sampleIndex] += channelData[sampleIndex] / audioBuffer.numberOfChannels;
          }
        }

        const request: AudioChordDetectionRequest = {
          pcm: monoPcm,
          sampleRate: audioBuffer.sampleRate,
          clipStartOffsetSeconds: audioRegion.getClipStartOffsetSeconds(),
          windows: audioWindows ?? [],
          options: detectionOptions as AudioChordDetectionOptions,
        };

        detectedChords = await new Promise<DetectedAudioChord[]>((resolve, reject) => {
          worker = new Worker(
            new URL('../../workers/audioChordDetectionWorker.ts', import.meta.url),
            { type: 'module' },
          );

          worker.onmessage = (event: MessageEvent<AudioChordDetectionWorkerMessage>) => {
            if (event.data.type === 'progress') {
              setDetectChordProgressPercent(event.data.progress.percent);
              return;
            }

            resolve(event.data.results);
          };
          worker.onerror = () => {
            reject(new Error('Chord detection worker failed.'));
          };
          worker.postMessage(request, [request.pcm.buffer]);
        });
      } else {
        setDetectChordProgressPercent(100);
        detectedChords = detectChordsFromMidi({
          project,
          region: activeRegion as KGMidiRegion,
          windows: midiWindows ?? [],
          options: detectionOptions as MidiChordDetectionOptions,
        });
      }

      const replacements = detectedChords
        .filter(result => result.symbol !== 'N' && result.endBeat > result.startBeat)
        .map(result => ({
          startBeat: result.startBeat,
          length: result.endBeat - result.startBeat,
          symbol: result.symbol,
        }));

      const spanStartBeat = chordWindows[0].startBeat;
      const spanEndBeat = chordWindows[chordWindows.length - 1].endBeat;
      KGCore.instance().executeCommand(
        new ReplaceChordRegionsInRangeCommand(spanStartBeat, spanEndBeat, replacements),
      );
      refreshProjectState();
    } catch (error) {
      console.error('Error detecting chords:', error);
      await showAlert(audioRegion
        ? 'Failed to detect chords from this audio region.'
        : 'Failed to detect chords from this MIDI region.'
      );
    } finally {
      if (worker) {
        worker.terminate();
      }
      setIsDetectingChords(false);
      setDetectChordProgressPercent(0);
    }
  }, [activeRegion, audioRegion, projectName, refreshProjectState, trackId]);

  const handleDetectTempo = useCallback(async () => {
    if (!audioRegion) {
      await showAlert('Open an audio region before detecting tempo.');
      return;
    }

    const project = KGCore.instance().getCurrentProject();
    const analysisSpan = buildAudioTempoAnalysisSpanForRegion(project, audioRegion);
    if (!analysisSpan) {
      await showAlert('The selected audio region has no audible span to analyze.');
      return;
    }

    const detectionOptions = await showTempoDetectionOptions(
      'Tune audio tempo detection settings before processing.',
      DEFAULT_AUDIO_TEMPO_DETECTION_OPTIONS,
    );
    if (!detectionOptions) {
      return;
    }

    if (!projectName || !trackId) {
      await showAlert('Open an audio region in spectrogram mode before detecting tempo.');
      return;
    }

    setIsDetectingTempo(true);

    try {
      let audioBuffer = KGAudioInterface.instance().getAudioBuffer(trackId, audioRegion.getAudioFileId());
      if (!audioBuffer) {
        const rawBuffer = await KGAudioFileStorage.loadAudioFile(projectName, audioRegion.getAudioFileId());
        const actx = Tone.getContext().rawContext as AudioContext;
        audioBuffer = await actx.decodeAudioData(rawBuffer);
      }

      const result = await detectTempoFromAudio(
        audioBuffer,
        analysisSpan,
        detectionOptions as AudioTempoDetectionOptions,
      );

      const applyResult = await showTempoApply(
        buildDetectedTempoChoiceMessage(result.bpm),
        [
          { label: 'Update Current Tempo', value: DETECTED_TEMPO_ACTION_UPDATE_CURRENT },
          { label: 'Insert Tempo Change', value: DETECTED_TEMPO_ACTION_INSERT_REGION },
        ],
      );
      if (!applyResult) {
        return;
      }

      applyDetectedTempoAction({
        action: applyResult.action as typeof DETECTED_TEMPO_ACTION_UPDATE_CURRENT | typeof DETECTED_TEMPO_ACTION_INSERT_REGION,
        detectedBpm: result.bpm,
        detectedTempo: result.tempo,
        detectedOffsetSeconds: result.offsetSeconds,
        autoAlignRegionToBeat: applyResult.autoAlignRegionToBeat,
        project,
        regionId: audioRegion.getId(),
        regionStartBeat: audioRegion.getStartFromBeat(),
        regionTrackId: audioRegion.getTrackId(),
        regionTrackIndex: audioRegion.getTrackIndex(),
        refreshProjectState,
        setBpm,
      });
    } catch (error) {
      console.error('Error detecting tempo:', error);
      await showAlert('Failed to detect tempo from this audio region.');
    } finally {
      setIsDetectingTempo(false);
    }
  }, [audioRegion, projectName, refreshProjectState, setBpm, trackId]);

  // Handle title click to rename the region
  const handleTitleClick = () => {
    // If we were just dragging, don't show the rename dialog
    if (wasDraggingRef.current) {
      if (DEBUG_MODE.PIANO_ROLL) {
        console.log("Skipping inline rename because the window was just dragged");
      }
      return;
    }

    if (!activeRegion) return;
    setTitleInputValue(activeRegion.getName());
    setIsEditingTitle(true);
    window.setTimeout(() => {
      titleInputRef.current?.focus();
      titleInputRef.current?.select();
    }, 0);
  };

  // Handle tool selection
  const handleToolSelect = (tool: 'pointer' | 'pencil') => {
    setActiveTool(tool);
    KGPianoRollState.instance().setActiveTool(tool);
    if (DEBUG_MODE.PIANO_ROLL) {
      console.log(`Selected tool: ${tool}`);
    }
  };

  // Handle snapping selection
  const handleSnappingSelect = useCallback((value: string) => {
    setSnapping(value);
    KGPianoRollState.instance().setCurrentSnap(value);
    if (DEBUG_MODE.PIANO_ROLL) {
      console.log(`Selected snapping: ${value}`);
    }
  }, []);

  // Handle mode selection
  const handleModeSelect = useCallback((value: string) => {
    setSelectedMode(value);
    if (DEBUG_MODE.PIANO_ROLL) {
      console.log(`Selected mode: ${value}`);
    }
  }, [setSelectedMode]);

  // Handle chord guide selection
  const handleChordGuideSelect = useCallback((value: ChordGuideFunction) => {
    setChordGuide(value);
  }, []);

  // Update suitable chords whenever chord guide selection or effective key signature changes
  useEffect(() => {
    const pianoRollState = KGPianoRollState.instance();

    if (chordGuide === 'N') {
      // Disabled - clear chord data
      pianoRollState.setCurrentSuitableChords([]);
      pianoRollState.setCurrentSuitableChordsPitchClasses({});
      pianoRollState.setCurrentHoveredChordGuideCandidate(null);

      if (DEBUG_MODE.PIANO_ROLL) {
        console.log(`Chord guide disabled - cleared suitable chords`);
      }
    } else {
      // Get suitable chords for the selected function (T/S/D)
      const functionType = chordGuide as 'T' | 'S' | 'D';
      const suitableChords = resolveChordGuideItems(effectiveChordGuideKeySignature, chordGuideMode, functionType);
      const chordsPitchClasses = Object.fromEntries(
        suitableChords.map((item) => [item.name, item.pitchClasses])
      );

      // Update piano roll state
      pianoRollState.setCurrentSuitableChords(suitableChords);
      pianoRollState.setCurrentSuitableChordsPitchClasses(chordsPitchClasses);
      pianoRollState.setCurrentHoveredChordGuideCandidate(null);

      if (DEBUG_MODE.PIANO_ROLL) {
        console.log(`Chord guide updated: ${chordGuide} (${functionType})`);
        console.log(`Suitable chords for ${effectiveChordGuideKeySignature} in ${chordGuideMode} mode:`, suitableChords);
        console.log(`Pitch classes:`, chordsPitchClasses);
      }
    }
  }, [chordGuide, chordGuideMode, effectiveChordGuideKeySignature]);

  // Handler for receiving the setNoteUpdateCounter function from PianoRollContent
  const handleSetNoteUpdateTrigger = (setNoteFn: React.Dispatch<React.SetStateAction<number>>) => {
    triggerNoteUpdateRef.current = setNoteFn;
  };

  // Handler for receiving the deleteSelectedNotes function from PianoRollContent
  const handleSetDeleteNotesTrigger = (deleteFn: () => boolean) => {
    deleteSelectedNotesRef.current = deleteFn;
  };

  // Quantize selected notes based on the selected quantization value
  const quantizeSelectedNotes = useCallback((quantValue: string) => {
    if (!activeRegion) return;

    // Get the KGCore instance
    const core = KGCore.instance();

    // Get all selected notes
    const selectedItems = core.getSelectedItems();
    const selectedNotes = selectedItems.filter(item =>
      item instanceof KGMidiNote &&
      activeRegion.getNotes().some(note => note.getId() === item.getId())
    ) as KGMidiNote[];

    if (selectedNotes.length === 0) {
      if (DEBUG_MODE.PIANO_ROLL) {
        console.log('No notes selected for quantization');
      }
      return;
    }

    if (DEBUG_MODE.PIANO_ROLL) {
      console.log(`Quantizing ${selectedNotes.length} selected notes with value: ${quantValue}`);
    }

    // Parse the quantization value (e.g., "1/4", "1/8", "1/16", "1/32")
    const denominator = parseInt(quantValue.split('/')[1]);
    if (isNaN(denominator)) {
      console.error(`Invalid quantization value: ${quantValue}`);
      return;
    }

    // Calculate the quantization step in beats
    // In a 4/4 time signature, a quarter note (1/4) is 1 beat
    // In a 6/8 time signature, an eighth note (1/8) is 1 beat
    const { numerator, denominator: timeSigDenominator } = timeSignature;

    // Calculate beats per whole note based on time signature
    // In 4/4, a whole note is 4 beats
    // In 6/8, a whole note is 6 beats (because each beat is an eighth note)
    const beatsPerWholeNote = numerator * (4 / timeSigDenominator);

    // Calculate the quantization step in beats
    // quantizationStep should ALWAYS be 4 / denominator regardless of time signature
    const quantizationStep = 4 / denominator;

    if (DEBUG_MODE.PIANO_ROLL) {
      console.log(`Time signature: ${numerator}/${timeSigDenominator}`);
      console.log(`Beats per whole note: ${beatsPerWholeNote}`);
      console.log(`Quantization step: ${quantizationStep} beats`);
    }

    // Apply quantization to each selected note
    selectedNotes.forEach(note => {
      // Get the current start beat
      const currentStartBeat = note.getStartBeat();

      // Calculate the quantized start beat
      const quantizedStartBeat = Math.round(currentStartBeat / quantizationStep) * quantizationStep;

      // Calculate the duration of the note
      const duration = note.getEndBeat() - currentStartBeat;

      // Set the new start beat and maintain the duration
      note.setStartBeat(quantizedStartBeat);
      note.setEndBeat(quantizedStartBeat + duration);

      if (DEBUG_MODE.PIANO_ROLL) {
        console.log(`Quantized note ${note.getId()}: ${currentStartBeat} -> ${quantizedStartBeat}`);
      }
    });

    // Find the track that contains this region and update it
    const track = tracks.find(t => t.getId().toString() === activeRegion.getTrackId());
    if (track) {
      updateTrack(track);
    }

    // Trigger a re-render by incrementing the note update counter
    if (triggerNoteUpdateRef.current) {
      triggerNoteUpdateRef.current(prev => prev + 1);

      if (DEBUG_MODE.PIANO_ROLL) {
        console.log('Triggered note update to re-render quantized notes');
      }
    }
  }, [activeRegion, timeSignature, updateTrack, tracks]);

  // Quantize selected notes length based on the selected quantization value
  const quantizeNoteLength = useCallback((quantValue: string) => {
    if (!activeRegion) return;

    // Get the KGCore instance
    const core = KGCore.instance();

    // Get all selected notes
    const selectedItems = core.getSelectedItems();
    const selectedNotes = selectedItems.filter(item =>
      item instanceof KGMidiNote &&
      activeRegion.getNotes().some(note => note.getId() === item.getId())
    ) as KGMidiNote[];

    if (selectedNotes.length === 0) {
      if (DEBUG_MODE.PIANO_ROLL) {
        console.log('No notes selected for length quantization');
      }
      return;
    }

    if (DEBUG_MODE.PIANO_ROLL) {
      console.log(`Quantizing length of ${selectedNotes.length} selected notes with value: ${quantValue}`);
    }

    // Parse the quantization value (e.g., "1/1", "1/2", "1/4", "1/8", "1/16", "1/32")
    const denominator = parseInt(quantValue.split('/')[1]);
    if (isNaN(denominator)) {
      console.error(`Invalid quantization value: ${quantValue}`);
      return;
    }

    // Calculate the quantization step in beats
    // In a 4/4 time signature, a quarter note (1/4) is 1 beat
    // In a 6/8 time signature, an eighth note (1/8) is 1 beat
    const { numerator, denominator: timeSigDenominator } = timeSignature;

    // Calculate beats per whole note based on time signature
    // In 4/4, a whole note is 4 beats
    // In 6/8, a whole note is 6 beats (because each beat is an eighth note)
    const beatsPerWholeNote = numerator * (4 / timeSigDenominator);

    // Calculate the quantization step in beats
    // quantizationStep should ALWAYS be 4 / denominator regardless of time signature
    const quantizationStep = 4 / denominator;

    if (DEBUG_MODE.PIANO_ROLL) {
      console.log(`Time signature: ${numerator}/${timeSigDenominator}`);
      console.log(`Beats per whole note: ${beatsPerWholeNote}`);
      console.log(`Length quantization step: ${quantizationStep} beats`);
    }

    // Apply quantization to each selected note
    selectedNotes.forEach(note => {
      // Get the current start and end beats
      const startBeat = note.getStartBeat();
      const currentEndBeat = note.getEndBeat();

      // Calculate the current duration
      const currentDuration = currentEndBeat - startBeat;

      // Calculate the quantized duration
      // If the current duration is less than the quantization step,
      // extend it to match the quantization step exactly
      // Otherwise, round to the nearest multiple of quantizationStep
      let quantizedDuration;

      if (currentDuration < quantizationStep) {
        // For notes shorter than the quantization step, extend to exactly one step
        quantizedDuration = quantizationStep;

        if (DEBUG_MODE.PIANO_ROLL) {
          console.log(`Extending short note ${note.getId()} from ${currentDuration} to ${quantizedDuration}`);
        }
      } else {
        // For longer notes, round to nearest multiple of quantizationStep
        quantizedDuration = Math.round(currentDuration / quantizationStep) * quantizationStep;
      }

      // Ensure minimum note length
      quantizedDuration = Math.max(PIANO_ROLL_CONSTANTS.MIN_NOTE_LENGTH, quantizedDuration);

      // Set the new end beat while maintaining the start beat
      note.setEndBeat(startBeat + quantizedDuration);

      if (DEBUG_MODE.PIANO_ROLL) {
        console.log(`Quantized note length ${note.getId()}: ${currentDuration} -> ${quantizedDuration}`);
      }
    });

    // Find the track that contains this region and update it
    const track = tracks.find(t => t.getId().toString() === activeRegion.getTrackId());
    if (track) {
      updateTrack(track);
    }

    // Trigger a re-render by incrementing the note update counter
    if (triggerNoteUpdateRef.current) {
      triggerNoteUpdateRef.current(prev => prev + 1);

      if (DEBUG_MODE.PIANO_ROLL) {
        console.log('Triggered note update to re-render quantized note lengths');
      }
    }
  }, [activeRegion, timeSignature, updateTrack, tracks]);

  // Handle quantization selection
  const handleQuantSelect = useCallback((type: 'position' | 'length', value: string) => {
    if (type === 'position') {
      setQuantPosition(value);

      // Apply quantization immediately when position quantization is changed
      quantizeSelectedNotes(value);

      if (DEBUG_MODE.PIANO_ROLL) {
        console.log(`quant-position selected: ${value}`);
      }
    } else {
      setQuantLength(value);

      // Apply length quantization immediately when length quantization is changed
      quantizeNoteLength(value);

      if (DEBUG_MODE.PIANO_ROLL) {
        console.log(`quant-length selected: ${value}`);
      }
    }
  }, [quantizeSelectedNotes, quantizeNoteLength]);

  const handleZoomChange = useCallback((nextZoom: number) => {
    if (nextZoom === pianoRollZoom) return;

    const container = pianoRollNoteScrollRef.current;
    pendingZoomAnchorBeatRef.current = null;
    if (container) {
      const keysWidth = parseInt(
        getComputedStyle(document.documentElement).getPropertyValue('--region-piano-key-width')
      ) || 60;
      const visibleMusicWidth = Math.max(0, container.clientWidth - keysWidth);
      const beatWidth = parseInt(
        getComputedStyle(document.documentElement).getPropertyValue('--region-grid-beat-width')
      ) || TOOLBAR_CONSTANTS.BASE_BAR_WIDTH;

      if (visibleMusicWidth > 0 && beatWidth > 0) {
        pendingZoomAnchorBeatRef.current = (container.scrollLeft + visibleMusicWidth / 2) / beatWidth;
      } else {
        pendingZoomAnchorBeatRef.current = null;
      }
    }

    KGPianoRollState.instance().setPianoRollZoom(nextZoom);
    KGCore.instance().getCurrentProject().setPianoRollZoom(nextZoom);
    setPianoRollZoom(nextZoom);
  }, [pianoRollZoom]);

  const handleAutomationToggle = useCallback(() => {
    setAutomationEnabled(current => {
      const next = !current;
      KGPianoRollState.instance().setAutomationViewEnabled(next);
      return next;
    });
  }, []);

  const handleAutomationTypeChange = useCallback((value: PianoRollAutomationType) => {
    setAutomationType(value);
    KGPianoRollState.instance().setCurrentAutomationType(value);
  }, []);

  const handleSheetMusicViewToggle = useCallback(() => {
    if (activeRegion) {
      pendingModeSwitchRequestRef.current = createPendingModeSwitchRequest({
        playheadBeat: playheadPosition,
        regionStartBeat: activeRegion.getStartFromBeat(),
        regionEndBeat: activeRegion.getStartFromBeat() + activeRegion.getLength(),
        sourceSheetMusicViewEnabled: sheetMusicViewEnabled,
        destinationSheetMusicViewEnabled: !sheetMusicViewEnabled,
        destinationSheetMusicTrackScopeEnabled: !sheetMusicViewEnabled && sheetMusicTrackScopeEnabled,
      });
    } else {
      pendingModeSwitchRequestRef.current = null;
    }

    setSheetMusicViewEnabled(current => {
      const next = !current;
      KGPianoRollState.instance().setSheetMusicViewEnabled(next);
      return next;
    });
  }, [activeRegion, playheadPosition, sheetMusicTrackScopeEnabled, sheetMusicViewEnabled]);

  const handleSheetQuantizationChange = useCallback((value: string) => {
    setSheetQuantization(value);
    KGPianoRollState.instance().setSheetQuantization(value);
  }, []);

  const handleSheetMusicTrackScopeToggle = useCallback(() => {
    if (activeRegion) {
      pendingModeSwitchRequestRef.current = createPendingModeSwitchRequest({
        playheadBeat: playheadPosition,
        regionStartBeat: activeRegion.getStartFromBeat(),
        regionEndBeat: activeRegion.getStartFromBeat() + activeRegion.getLength(),
        sourceSheetMusicViewEnabled: sheetMusicViewEnabled,
        destinationSheetMusicViewEnabled: sheetMusicViewEnabled,
        destinationSheetMusicTrackScopeEnabled: !sheetMusicTrackScopeEnabled,
      });
    } else {
      pendingModeSwitchRequestRef.current = null;
    }

    setSheetMusicTrackScopeEnabled(current => {
      const next = !current;
      KGPianoRollState.instance().setSheetMusicTrackScopeEnabled(next);
      return next;
    });
  }, [activeRegion, playheadPosition, sheetMusicTrackScopeEnabled, sheetMusicViewEnabled]);

  const handleAudioSpectrogramToggle = useCallback(() => {
    if (isHybrid || !audioRegion) {
      return;
    }

    setCurrentMode(current => current === 'spectrogram' ? 'audio-waveform' : 'spectrogram');
  }, [audioRegion, isHybrid]);

  const handleSheetMeasureMetricsChange = useCallback((metrics: SheetMeasureMetric[]) => {
    setSheetMeasureMetrics((current) => {
      if (
        current.length === metrics.length &&
        current.every((metric, index) => (
          metric.barIndex === metrics[index].barIndex &&
          metric.startBeat === metrics[index].startBeat &&
          metric.endBeat === metrics[index].endBeat &&
          metric.leftPx === metrics[index].leftPx &&
          metric.widthPx === metrics[index].widthPx
        ))
      ) {
        return current;
      }

      return metrics;
    });
  }, []);

  const centerPianoRollOnDefaultVerticalPosition = useCallback(() => {
    const container = pianoRollNoteScrollRef.current;
    if (!container) {
      return;
    }

    if (isAudioWaveform) {
      container.scrollTop = 0;
      return;
    }

    const keyHeight = parseInt(getComputedStyle(document.documentElement).getPropertyValue('--region-piano-key-height')) || 20;
    const c4Position = 4 * 12 * keyHeight;
    const totalHeight = 8 * 12 * keyHeight;
    const viewportHeight = container.clientHeight;
    const scrollPosition = (totalHeight - c4Position) - (viewportHeight / 2);

    container.scrollTop = Math.max(0, scrollPosition);
  }, [isAudioWaveform]);

  // Calculate C4 position and scroll to it when piano roll opens
  useEffect(() => {
    centerPianoRollOnDefaultVerticalPosition();
  }, [centerPianoRollOnDefaultVerticalPosition]);

  useEffect(() => {
    const previous = previousSheetMusicViewEnabledRef.current;

    if (previous !== sheetMusicViewEnabled && !sheetMusicViewEnabled) {
      centerPianoRollOnDefaultVerticalPosition();
    }

    previousSheetMusicViewEnabledRef.current = sheetMusicViewEnabled;
  }, [centerPianoRollOnDefaultVerticalPosition, sheetMusicViewEnabled]);

  // Sync isPlayingRef for use inside scroll event closure
  useEffect(() => {
    pianoRollIsPlayingRef.current = isPlaying;
  }, [isPlaying]);

  // Detect manual horizontal scroll during playback
  useEffect(() => {
    const container = pianoRollNoteScrollRef.current;
    if (!container) return;

    const handleScroll = () => {
      if (!pianoRollIsPlayingRef.current) return;
      if (Math.abs(container.scrollLeft - pianoRollExpectedScrollLeftRef.current) < 1) return;
      useProjectStore.getState().setAutoScrollEnabled(false);
    };

    container.addEventListener('scroll', handleScroll);
    return () => {
      container.removeEventListener('scroll', handleScroll);
    };
  }, []);

  // Auto-scroll to keep playhead centered during playback
  useEffect(() => {
    if (!isPlaying || !autoScrollEnabled) return;

    const container = pianoRollNoteScrollRef.current;
    if (!container) return;

    const playheadPixel = sheetMusicViewEnabled && activeRegion
      ? getSheetPlayheadPixel(
          sheetMusicTrackScopeEnabled
            ? Math.max(0, playheadPosition)
            : Math.max(0, playheadPosition - activeRegion.getStartFromBeat()),
          sheetMeasureMetrics
        )
      : (() => {
          const beatWidth = parseInt(
            getComputedStyle(document.documentElement).getPropertyValue('--region-grid-beat-width')
          ) || 40;
          return playheadPosition * beatWidth;
        })();

    // Center the playhead in the visible grid area (excluding the 60px sticky piano keys panel)
    const keysWidth = sheetMusicViewEnabled
      ? 0
      : (parseInt(
          getComputedStyle(document.documentElement).getPropertyValue('--region-piano-key-width')
        ) || 60);
    const targetScrollLeft = playheadPixel - (container.clientWidth - keysWidth) / 2;
    const clampedScrollLeft = Math.max(
      0,
      Math.min(targetScrollLeft, container.scrollWidth - container.clientWidth)
    );

    pianoRollExpectedScrollLeftRef.current = clampedScrollLeft;
    container.scrollLeft = clampedScrollLeft;
  }, [playheadPosition, isPlaying, autoScrollEnabled, sheetMusicViewEnabled, sheetMusicTrackScopeEnabled, sheetMeasureMetrics, activeRegion]);

  // Handle scroll requests from main content bar numbers clicks
  useEffect(() => {
    if (pianoRollScrollRequest === null) return;

    const container = pianoRollNoteScrollRef.current;
    if (!container) return;

    const playheadPixel = sheetMusicViewEnabled && activeRegion
      ? getSheetPlayheadPixel(
          sheetMusicTrackScopeEnabled
            ? Math.max(0, pianoRollScrollRequest)
            : Math.max(0, pianoRollScrollRequest - activeRegion.getStartFromBeat()),
          sheetMeasureMetrics
        )
      : (() => {
          const beatWidth = parseInt(
            getComputedStyle(document.documentElement).getPropertyValue('--region-grid-beat-width')
          ) || 40;
          return pianoRollScrollRequest * beatWidth;
        })();

    // Center the playhead in the visible grid area (excluding the 60px sticky piano keys panel)
    const keysWidth = sheetMusicViewEnabled
      ? 0
      : (parseInt(
          getComputedStyle(document.documentElement).getPropertyValue('--region-piano-key-width')
        ) || 60);
    const targetScrollLeft = playheadPixel - (container.clientWidth - keysWidth) / 2;
    const clampedScrollLeft = Math.max(
      0,
      Math.min(targetScrollLeft, container.scrollWidth - container.clientWidth)
    );

    container.scrollLeft = clampedScrollLeft;

    // Clear the request after handling
    useProjectStore.setState({ pianoRollScrollRequest: null });
  }, [pianoRollScrollRequest, sheetMusicViewEnabled, sheetMusicTrackScopeEnabled, sheetMeasureMetrics, activeRegion]);

  // Update --region-grid-beat-width when zoom changes and preserve the centered beat position.
  useLayoutEffect(() => {
    const beatWidth = TOOLBAR_CONSTANTS.BASE_BAR_WIDTH * pianoRollZoom;
    document.documentElement.style.setProperty('--region-grid-beat-width', `${beatWidth}px`);
    if (triggerNoteUpdateRef.current) {
      triggerNoteUpdateRef.current(prev => prev + 1);
    }

    const anchorBeat = pendingZoomAnchorBeatRef.current;
    const container = pianoRollNoteScrollRef.current;
    if (anchorBeat !== null && container) {
      const keysWidth = parseInt(
        getComputedStyle(document.documentElement).getPropertyValue('--region-piano-key-width')
      ) || 60;
      const visibleMusicWidth = Math.max(0, container.clientWidth - keysWidth);
      const targetPixel = anchorBeat * beatWidth;
      const targetScrollLeft = targetPixel - visibleMusicWidth / 2;
      const clampedScrollLeft = Math.max(
        0,
        Math.min(targetScrollLeft, container.scrollWidth - container.clientWidth)
      );

      pianoRollExpectedScrollLeftRef.current = clampedScrollLeft;
      container.scrollLeft = clampedScrollLeft;
      pendingZoomAnchorBeatRef.current = null;
    }

    return () => {
      document.documentElement.style.setProperty('--region-grid-beat-width', '40px');
    };
  }, [pianoRollZoom]);

  // Scroll horizontally to the active region's starting position
  useEffect(() => {
    if (!pianoRollNoteScrollRef.current || !activeRegion) {
      previousActiveRegionIdRef.current = activeRegion?.getId() ?? null;
      return;
    }

    if (pendingModeSwitchRequestRef.current !== null) {
      previousActiveRegionIdRef.current = activeRegion.getId();
      return;
    }

    if (previousActiveRegionIdRef.current !== activeRegion.getId()) {
      // Get the starting beat of the region
      const startBeat = activeRegion.getStartFromBeat();

      if (DEBUG_MODE.PIANO_ROLL) {
        console.log(`Scrolling to region's starting position: startBeat=${startBeat}`);
      }

      const scrollPosition = getRegionStartScrollLeft(startBeat);

      // Scroll to the calculated position
      pianoRollNoteScrollRef.current.scrollLeft = Math.max(0, scrollPosition);
      previousActiveRegionIdRef.current = activeRegion.getId();
    }
  }, [activeRegion]);

  useLayoutEffect(() => {
    const request = pendingModeSwitchRequestRef.current;
    const container = pianoRollNoteScrollRef.current;
    if (!request || !container || !activeRegion) {
      return;
    }

    if (request.destinationSheetMusicViewEnabled && sheetMeasureMetrics.length === 0) {
      return;
    }

    const targetScrollLeft = getScrollLeftForViewportRequest({
      request,
      container,
      sheetMeasureMetrics,
      activeRegionStartBeat: activeRegion.getStartFromBeat(),
      activeRegionEndBeat: activeRegion.getStartFromBeat() + activeRegion.getLength(),
      songEndBeat: maxBars * timeSignature.numerator,
    });

    pianoRollExpectedScrollLeftRef.current = targetScrollLeft;
    container.scrollLeft = targetScrollLeft;
    pendingModeSwitchRequestRef.current = null;
  }, [activeRegion, maxBars, sheetMeasureMetrics, sheetMusicTrackScopeEnabled, sheetMusicViewEnabled, timeSignature.numerator]);

  // Add keyboard event listener for piano roll hotkeys (snapping and quantization)
  useEffect(() => {
    const handlePianoRollKeyDown = (event: KeyboardEvent) => {
      // Skip if user is typing in an input field (including ChatBox)
      const target = event.target as HTMLElement;
      if (target && (
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.contentEditable === 'true' ||
        target.hasAttribute('data-chatbox-input') ||
        target.closest('.chatbox-input')
      )) {
        return;
      }

      // Handle delete key for selected notes
      if (event.key === 'Backspace' || event.key === 'Delete') {
        if (deleteSelectedNotesRef.current) {
          const deleted = deleteSelectedNotesRef.current();
          if (deleted) {
            // Prevent default behavior only if notes were actually deleted
            event.preventDefault();
          }
        }
        return;
      }

      // Handle piano roll hotkeys
      const configManager = ConfigManager.instance();
      if (configManager.getIsInitialized()) {
        const chordGuideSwitchShortcut = configManager.get('hotkeys.piano_roll.switch') as string;
        const chordGuideSwitchVoicingShortcut = configManager.get('hotkeys.piano_roll.switch_voicing') as string;

        if (chordGuideSwitchShortcut && matchesKeyboardShortcut(event, chordGuideSwitchShortcut)) {
          event.preventDefault();
          setChordGuide((current) => getNextChordGuideSelection(current));
          return;
        }

        if (chordGuide !== 'N' && matchesKeyboardShortcut(event, 'tab')) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const switchChord = (window as any).__pianoGridSwitchChord;
          if (typeof switchChord === 'function') {
            switchChord(1);
            event.preventDefault();
          }
          return;
        }

        if (chordGuide !== 'N' && chordGuideSwitchVoicingShortcut && matchesKeyboardShortcut(event, chordGuideSwitchVoicingShortcut)) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const switchChord = (window as any).__pianoGridSwitchChord;
          if (typeof switchChord === 'function') {
            switchChord(-1);
            event.preventDefault();
          }
          return;
        }

        // Snapping hotkeys
        const snap_none_key = configManager.get('hotkeys.piano_roll.snap_none') as string;
        const snap_1_4_key = configManager.get('hotkeys.piano_roll.snap_1_4') as string;
        const snap_1_8_key = configManager.get('hotkeys.piano_roll.snap_1_8') as string;
        const snap_1_16_key = configManager.get('hotkeys.piano_roll.snap_1_16') as string;

        // Quantize position hotkeys
        const qua_pos_1_4_key = configManager.get('hotkeys.piano_roll.qua_pos_1_4') as string;
        const qua_pos_1_8_key = configManager.get('hotkeys.piano_roll.qua_pos_1_8') as string;
        const qua_pos_1_16_key = configManager.get('hotkeys.piano_roll.qua_pos_1_16') as string;

        // Quantize length hotkeys
        const qua_len_1_4_key = configManager.get('hotkeys.piano_roll.qua_len_1_4') as string;
        const qua_len_1_8_key = configManager.get('hotkeys.piano_roll.qua_len_1_8') as string;
        const qua_len_1_16_key = configManager.get('hotkeys.piano_roll.qua_len_1_16') as string;

        let actionType: 'snap' | 'quantize' | null = null;
        let actionValue: string | null = null;
        let quantType: 'position' | 'length' | null = null;

        // Check snapping hotkeys
        if (event.key === snap_none_key) {
          actionType = 'snap';
          actionValue = 'NO SNAP';
        } else if (event.key === snap_1_4_key) {
          actionType = 'snap';
          actionValue = '1/4';
        } else if (event.key === snap_1_8_key) {
          actionType = 'snap';
          actionValue = '1/8';
        } else if (event.key === snap_1_16_key) {
          actionType = 'snap';
          actionValue = '1/16';
        }
        // Check quantize position hotkeys
        else if (event.key === qua_pos_1_4_key) {
          actionType = 'quantize';
          actionValue = '1/4';
          quantType = 'position';
        } else if (event.key === qua_pos_1_8_key) {
          actionType = 'quantize';
          actionValue = '1/8';
          quantType = 'position';
        } else if (event.key === qua_pos_1_16_key) {
          actionType = 'quantize';
          actionValue = '1/16';
          quantType = 'position';
        }
        // Check quantize length hotkeys
        else if (event.key === qua_len_1_4_key) {
          actionType = 'quantize';
          actionValue = '1/4';
          quantType = 'length';
        } else if (event.key === qua_len_1_8_key) {
          actionType = 'quantize';
          actionValue = '1/8';
          quantType = 'length';
        } else if (event.key === qua_len_1_16_key) {
          actionType = 'quantize';
          actionValue = '1/16';
          quantType = 'length';
        }

        if (actionType && actionValue) {
          // Prevent default behavior
          event.preventDefault();

          if (actionType === 'snap') {
            // Validate the snap value exists in snap options
            if (KGPianoRollState.SNAP_OPTIONS.includes(actionValue)) {
              // Change snapping value
              handleSnappingSelect(actionValue);

              // Trigger blink effect for visual feedback
              setBlinkButton('snapping');
              setTimeout(() => setBlinkButton(null), 200);

              if (DEBUG_MODE.PIANO_ROLL) {
                console.log(`Snap hotkey triggered: ${event.key} → ${actionValue}`);
              }
            }
          } else if (actionType === 'quantize' && quantType) {
            // Validate the quantValue exists in the appropriate options
            const validOptions = quantType === 'length' ? KGPianoRollState.QUANT_LEN_OPTIONS : KGPianoRollState.QUANT_POS_OPTIONS;

            if (validOptions.includes(actionValue)) {
              // Apply quantization
              handleQuantSelect(quantType, actionValue);

              // Trigger blink effect for visual feedback
              const buttonName = quantType === 'length' ? 'quant-length' : 'quant-position';
              setBlinkButton(buttonName);
              setTimeout(() => setBlinkButton(null), 200);

              if (DEBUG_MODE.PIANO_ROLL) {
                console.log(`Quantize ${quantType} hotkey triggered: ${event.key} → ${actionValue}`);
              }
            }
          }
        }
      }
    };

    // Add event listener
    window.addEventListener('keydown', handlePianoRollKeyDown);

    // Remove event listener on cleanup
    return () => {
      window.removeEventListener('keydown', handlePianoRollKeyDown);
    };
  }, [chordGuide, handleQuantSelect, handleSnappingSelect]);

  // Get the title for the piano roll based on the active region
  const getPianoRollTitle = () => {
    if (currentMode === 'spectrogram') return audioRegion ? `SPECTROGRAM — ${audioRegion.getName()}` : 'SPECTROGRAM';
    if (currentMode === 'audio-waveform') return audioRegion ? `WAVEFORM — ${audioRegion.getName()}` : 'WAVEFORM';
    if (isHybrid) {
      const midiName = activeRegion?.getName() ?? 'MIDI';
      const audioName = audioRegion?.getName() ?? 'Audio';
      return `${midiName} + ${audioName}`;
    }
    if (!activeRegion) return "EDIT NOTE CLIP";

    // Calculate the bar and beat position of the region
    const startBeat = activeRegion.getStartFromBeat();
    const { bar, beatInBar } = beatsToBar(startBeat, timeSignature);

    // Format as 1-indexed bar and beat (bar + 1, beatInBar + 1)
    const barNumber = bar + 1;
    const beatNumber = beatInBar + 1;

    return `${activeRegion.getName()} (at ${barNumber}:${beatNumber})`;
  };

  return (
    <div
      className="piano-roll-panel"
      style={{
        position: 'fixed',
        left: `${position.x}px`,
        top: `${position.y}px`,
        width: `${size.width}px`,
        height: `${size.height}px`,
        zIndex: 2000
      }}
      ref={pianoRollRef}
    >
      <PianoRollHeader
        onClose={onClose}
        title={getPianoRollTitle()}
        isEditingTitle={isEditingTitle}
        titleInputValue={titleInputValue}
        onTitleClick={handleTitleClick}
        onTitleInputChange={setTitleInputValue}
        onTitleCommit={() => { void commitTitleEdit(); }}
        onTitleCancel={cancelTitleEdit}
        onMouseDown={(e) => handleMouseDown(e, 'drag')}
        titleInputRef={titleInputRef}
      />

      <PianoRollToolbar
        sheetMusicViewEnabled={sheetMusicViewEnabled}
        onSheetMusicViewToggle={handleSheetMusicViewToggle}
        sheetMusicTrackScopeEnabled={sheetMusicTrackScopeEnabled}
        onSheetMusicTrackScopeToggle={handleSheetMusicTrackScopeToggle}
        sheetQuantization={sheetQuantization}
        onSheetQuantizationChange={handleSheetQuantizationChange}
        sheetQuantizationOptions={getSheetQuantizationOptions()}
        showAudioSpectrogramToggle={!!audioRegion && !isHybrid}
        audioSpectrogramEnabled={currentMode === 'spectrogram'}
        onAudioSpectrogramToggle={handleAudioSpectrogramToggle}
        sheetMusicToggleDisabled={!activeRegion}
        activeTool={activeTool}
        onToolSelect={handleToolSelect}
        quantPosition={quantPosition}
        quantLength={quantLength}
        onQuantSelect={handleQuantSelect}
        snapping={snapping}
        onSnappingSelect={handleSnappingSelect}
        selectedMode={selectedMode}
        onModeChange={handleModeSelect}
        chordGuide={chordGuide}
        onChordGuideChange={handleChordGuideSelect}
        blinkButton={blinkButton}
        mode={currentMode}
        thresholdDb={spectrogramThresholdDb}
        onThresholdChange={setSpectrogramThresholdDb}
        power={spectrogramPower}
        onPowerChange={setSpectrogramPower}
        zoom={pianoRollZoom}
        onZoomChange={handleZoomChange}
        showAutomationControls={!isAudioOnly}
        automationEnabled={automationEnabled}
        automationType={automationType}
        onAutomationToggle={handleAutomationToggle}
        onAutomationTypeChange={handleAutomationTypeChange}
        onDetectChords={handleDetectChords}
        detectingChords={isDetectingChords}
        onDetectTempo={audioRegion ? handleDetectTempo : undefined}
        detectingTempo={isDetectingTempo}
      />

      <NoteAttributeBar selectedNotes={selectedNotes} isSpectrogram={isAudioOnly} activeRegion={activeRegion} />

      <PianoRollContent
        contentRef={pianoRollContentRef}
        noteScrollRef={pianoRollNoteScrollRef}
        pianoGridRef={pianoGridRef}
        maxBars={maxBars}
        timeSignature={timeSignature}
        activeRegion={activeRegion}
        updateTrack={updateTrack}
        tracks={tracks}
        onSetNoteUpdateTrigger={handleSetNoteUpdateTrigger}
        onSetDeleteNotesTrigger={handleSetDeleteNotesTrigger}
        selectedMode={selectedMode}
        keySignature={keySignature}
        chordGuide={chordGuide}
        chordGuideKeySignature={effectiveChordGuideKeySignature}
        chordGuideMode={chordGuideMode}
        mode={currentMode}
        audioRegion={audioRegion}
        trackId={trackId}
        projectName={projectName}
        bpm={bpm}
        spectrogramThresholdDb={spectrogramThresholdDb}
        spectrogramPower={spectrogramPower}
        spectrogramHeightResolution={spectrogramHeightResolution}
        pianoRollZoom={pianoRollZoom}
        automationEnabled={automationEnabled}
        automationType={automationType}
        automationRedrawVersion={automationRedrawVersion}
        sheetMusicViewEnabled={sheetMusicViewEnabled}
        sheetMusicTrackScopeEnabled={sheetMusicTrackScopeEnabled}
        sheetQuantization={parsedSheetQuantization}
        sheetKeySignature={keySignature}
        sheetInstrument={activeInstrument}
        onSheetMeasureMetricsChange={handleSheetMeasureMetricsChange}
        overlayMessage={isDetectingChords ? `Detecting chords… (${detectChordProgressPercent.toString().padStart(2, '0')}% completed)` : null}
        overlayProgressPercent={isDetectingChords ? detectChordProgressPercent : null}
      />

      <div
        className="resize-handle"
        onMouseDown={(e) => handleMouseDown(e, 'resize')}
      >
        <FaGripLines />
      </div>
    </div>
  );
};

export default PianoRoll; 
