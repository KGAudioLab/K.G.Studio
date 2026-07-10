import { create } from 'zustand';
import { KGCore } from '../core/KGCore';
import { KGTrack } from '../core/track/KGTrack';
import { KGProject, type KeySignature } from '../core/KGProject';
import { KGGlobalTrack } from '../core/global-track';
import type { TimeSignature } from '../types/projectTypes';
import { KGMidiTrack, type InstrumentType } from '../core/track/KGMidiTrack';
import { beatsToTimeString } from '../util/timeUtil';
import { KGAudioInterface } from '../core/audio-interface/KGAudioInterface';
import { KGPianoRollState } from '../core/state/KGPianoRollState';
import { KGMidiNote } from '../core/midi/KGMidiNote';
import { KGMidiControllerEvent } from '../core/midi/KGMidiControllerEvent';
import { KGRegion } from '../core/region/KGRegion';
import { AddTrackCommand, AddAudioTrackCommand, RemoveTrackCommand, ReorderTracksCommand, UpdateTrackCommand, type TrackUpdateProperties, PasteRegionsCommand, PasteNotesCommand, ChangeProjectPropertyCommand, ImportAudioCommand, UpdateRegionCommand, type RegionUpdateProperties } from '../core/commands';
import { KGAudioTrack } from '../core/track/KGAudioTrack';
import { KGAudioRegion } from '../core/region/KGAudioRegion';
import { KGAudioFileStorage } from '../core/io/KGAudioFileStorage';
import { ConfigManager } from '../core/config/ConfigManager';
import { upgradeProjectToLatest } from '../core/project-upgrader/KGProjectUpgrader';
import { toggleLoop } from '../util/loopUtil';
import { TOOLBAR_CONSTANTS } from '../constants/uiConstants';
import * as Tone from 'tone';
import { KGMidiInput } from '../core/midi-input/KGMidiInput';
import { KGMidiRegion } from '../core/region/KGMidiRegion';
import { KGMidiPitchBend } from '../core/midi/KGMidiPitchBend';
import { CreateMidiEventsCommand, type NoteCreationData, type PitchBendCreationData, type ControllerEventCreationData } from '../core/commands/note/CreateMidiEventsCommand';
import { MIDI_PITCH_BEND_CENTER } from '../util/midiUtil';
import { KGTrackAutomationPoint, type TrackAutomationType } from '../core/track/KGTrackAutomationPoint';
import type { AudioRecordingPeak } from '../core/audio-interface/KGAudioRecorder';
import { getAudioImportDecodeFailureMessage } from '../util/audioImportUtil';
import { beatToSeconds } from '../util/globalTrackUtil';

/**
 * Update CSS custom property for time signature numerator
 * This ensures UI calculations are synchronized with project settings
 */
function updateTimeSignatureCSS(timeSignature: TimeSignature): void {
  document.documentElement.style.setProperty('--time-signature-numerator', timeSignature.numerator.toString());
}

/**
 * Update CSS custom property for max number of bars
 * Keeps layout widths in sync with project max bars
 */
function updateMaxBarsCSS(maxBars: number): void {
  document.documentElement.style.setProperty('--max-number-of-bars', maxBars.toString());
}

/**
 * Update CSS custom property for track grid bar width based on multiplier
 */
function updateBarWidthMultiplierCSS(multiplier: number): void {
  document.documentElement.style.setProperty(
    '--track-grid-bar-width',
    `${TOOLBAR_CONSTANTS.BASE_BAR_WIDTH * multiplier}px`
  );
}

function formatCurrentTime(project: KGProject, beat: number): string {
  const seconds = beatToSeconds(project, beat);
  const bpmForLegacyFormatting = seconds > 0 ? (beat / seconds) * 60 : project.getBpm();
  return beatsToTimeString(beat, bpmForLegacyFormatting, project.getTimeSignature());
}

function clampPlayheadPosition(project: KGProject, position: number): number {
  const maxBeat = project.getMaxBars() * project.getTimeSignature().numerator;
  return Math.max(0, Math.min(position, maxBeat));
}

function getProjectGlobalTracks(project: KGProject): KGGlobalTrack[] {
  return (project.getGlobalTracks?.() ?? []) as KGGlobalTrack[];
}

function resolveTrackInsertionIndex(project: KGProject, selectedTrackId: string | null): number {
  const tracks = project.getTracks();
  if (!selectedTrackId) {
    return tracks.length;
  }

  const selectedTrack = tracks.find(track => track.getId().toString() === selectedTrackId);
  if (!selectedTrack) {
    return tracks.length;
  }

  return Math.min(selectedTrack.getTrackIndex() + 1, tracks.length);
}

type SidePanelType = 'kgone' | 'chat' | 'eventList';

function getSidePanelVisibilityState(activePanel: SidePanelType | null) {
  return {
    showKGOnePanel: activePanel === 'kgone',
    showChatBox: activePanel === 'chat',
    showEventListPanel: activePanel === 'eventList',
  };
}

// Define the store state interface
interface ProjectState {
  // State
  projectName: string;
  savedProjectName: string; // OPFS folder name where the project is currently saved
  tracks: KGTrack[];
  globalTracks: KGGlobalTrack[];
  currentStatus: string;
  maxBars: number;
  barWidthMultiplier: number;
  timeSignature: TimeSignature;
  bpm: number;
  keySignature: KeySignature;
  selectedMode: string;
  isLooping: boolean;
  isMetronomeEnabled: boolean;
  showGlobalTracks: boolean;
  loopingRange: [number, number]; // [startBar, endBar] - bar indices (0-based)
  playheadPosition: number; // in beats
  isPlaying: boolean;
  isPreparingPlayback: boolean;
  autoScrollEnabled: boolean;
  currentTime: string; // formatted time string

  // Selection state for UI reactivity
  selectedNoteIds: string[];
  selectedPitchBendIds: string[];
  selectedControllerEventIds: string[];
  selectedTrackAutomationPointIds: string[];
  selectedRegionIds: string[];
  selectedTrackId: string | null;

  // Piano roll state
  showPianoRoll: boolean;
  activeRegionId: string | null;
  pianoRollMode: 'midi-edit' | 'audio-waveform' | 'spectrogram' | 'hybrid';
  hybridAudioRegionId: string | null;
  requestedSheetMusicViewEnabled: boolean;
  pianoRollViewRequestVersion: number;
  automationRedrawVersion: number;
  activeTrackAutomationTrackId: string | null;
  activeTrackAutomationType: TrackAutomationType | null;
  trackAutomationRedrawVersion: number;
  audioWaveformRedrawVersion: number;

  // ChatBox state
  showChatBox: boolean;
  toolFastForwardEnabled: boolean;

  // K.G.One panel state
  showKGOnePanel: boolean;

  // Event list panel state
  showEventListPanel: boolean;
  lastActiveSidePanel: SidePanelType | null;
  settingsReturnSidePanel: SidePanelType | null;

  // Instrument selection panel state
  showInstrumentSelection: boolean;
  // instrumentSelectionTrackId removed; panel now follows selectedTrackId

  // Audio import modal state
  showAudioImportModal: boolean;
  audioImportTargetTrackId: string | null;

  // Settings state
  showSettings: boolean;

  // Recording state
  isRecording: boolean;
  recordingMode: 'midi' | 'audio' | null;
  recordingTargetRegionId: string | null;
  recordingTargetTrackId: string | null;
  recordingTargetTrackIndex: number | null;
  recordingNotes: Array<{ pitch: number; startBeat: number; endBeat: number; velocity: number }>;
  recordingPitchBends: Array<{ beat: number; value: number }>;
  recordingControllerEventsByType: Array<Array<{ beat: number; value: number }>>;
  recordingOriginalPlayhead: number;
  recordingStartBeatAbsolute: number;
  recordingCommitStartBeatAbsolute: number;
  recordingAudioPreviewPeaks: AudioRecordingPeak[];
  recordingAudioPreviewCurrentBeat: number;
  recordingAudioPreviewFileName: string | null;

  // Undo/redo state
  canUndo: boolean;
  canRedo: boolean;
  undoDescription: string | null;
  redoDescription: string | null;

  // Cross-component scroll request state
  requestMainContentScroll: (beatPosition: number) => void;
  requestPianoRollScroll: (beatPosition: number) => void;
  mainContentScrollRequest: number | null;
  pianoRollScrollRequest: number | null;

  // Actions
  setProjectName: (name: string) => void;
  setSavedProjectName: (name: string) => void;
  addTrack: () => Promise<void>;
  addAudioTrack: () => Promise<void>;
  importAudioToTrack: (trackId: string, file: File) => Promise<void>;
  openAudioImportModal: (trackId: string) => void;
  closeAudioImportModal: () => void;
  removeTrack: (id: number) => Promise<void>;
  updateTrack: (track: KGTrack) => Promise<void>;
  updateTrackProperties: (trackId: number, properties: TrackUpdateProperties) => Promise<void>;
  updateRegionProperties: (regionId: string, properties: RegionUpdateProperties) => Promise<void>;
  setTrackInstrument: (trackId: number, instrument: InstrumentType) => Promise<void>;
  reorderTracks: (sourceIndex: number, destinationIndex: number) => void;
  setStatus: (status: string) => void;
  removeStatus: () => void;
  refreshStatus: () => void;
  loadProject: (project: KGProject | null, savedName?: string) => Promise<void>;
  setPlayheadPosition: (position: number) => void;
  setAutoScrollEnabled: (enabled: boolean) => void;
  startPlaying: () => Promise<void>;
  stopPlaying: () => Promise<void>;
  stopTransport: () => Promise<void>;
  toggleLoop: () => void;
  toggleMetronome: () => void;
  setShowGlobalTracks: (show: boolean) => void;
  setBpm: (bpm: number) => void;
  setMaxBars: (maxBars: number) => void;
  setBarWidthMultiplier: (multiplier: number) => void;
  setTimeSignature: (timeSignature: TimeSignature) => void;
  setKeySignature: (keySignature: KeySignature) => void;
  setSelectedMode: (selectedMode: string) => void;

  // Selection actions
  syncSelectionFromCore: () => void;
  clearAllSelections: () => void;
  setSelectedTrack: (trackId: string | null) => void;
  setTrackAutomationView: (trackId: string | null, automationType: TrackAutomationType | null) => void;

  // Piano roll actions
  setShowPianoRoll: (show: boolean) => void;
  setActiveRegionId: (regionId: string | null) => void;
  openMidiPianoRoll: (regionId: string) => void;
  openMidiPianoRollWithSheetMusicView: (regionId: string, sheetMusicViewEnabled: boolean) => void;
  openAudioWaveformViewer: (regionId: string) => void;
  openSpectrogramViewer: (regionId: string) => void;
  openHybridMode: (midiRegionId: string, audioRegionId: string) => void;
  bumpAutomationRedrawVersion: () => void;
  bumpTrackAutomationRedrawVersion: () => void;
  bumpAudioWaveformRedrawVersion: () => void;

  // Project state cleanup
  cleanupProjectState: () => void;

  // ChatBox actions
  setShowChatBox: (show: boolean) => void;
  toggleChatBox: () => void;
  setToolFastForwardEnabled: (enabled: boolean) => void;
  toggleToolFastForwardEnabled: () => void;

  // K.G.One panel actions
  toggleKGOnePanel: () => void;

  // Event List panel actions
  toggleEventListPanel: () => void;
  activateSidePanel: (panel: SidePanelType) => void;

  // Instrument selection panel actions
  openInstrumentSelectionForTrack: () => void;
  toggleInstrumentSelectionForTrack: () => void;
  closeInstrumentSelection: () => void;

  // Settings actions
  setShowSettings: (show: boolean) => void;
  toggleSettings: () => void;

  // Copy/paste actions
  pasteRegionsAtTrack: (trackId: string, position: number) => void;
  pasteNotesToActiveRegion: (regionId: string, position: number) => void;

  // Undo/redo actions
  undo: () => void;
  redo: () => void;
  syncUndoRedoState: () => void;

  // Project state refresh actions
  refreshProjectState: () => void;

  // Recording actions
  startRecording: () => Promise<void>;
  stopRecording: () => Promise<void>;

  // Initialization actions
  initializeFromConfig: () => Promise<void>;
}

// Module-level recording state (not reactive — only used for timing during active recording)
let _recordingActiveNotes: Map<number, { startBeat: number; velocity: number }> = new Map(); // pitch → note-on data
let _recordingRegionStartBeat: number = 0;
let _lastRecordedPitchBendValue: number | null = null;
let _lastRecordedControllerValues: Map<number, number> = new Map();
let _audioRecordingStartTimeoutId: number | null = null;
let _audioRecordingForcedStopBeatAbsolute: number | null = null;
let _audioRecordingHasStarted: boolean = false;

function createEmptyRecordedControllerBuckets(): Array<Array<{ beat: number; value: number }>> {
  return Array.from({ length: 128 }, () => []);
}

function getRecordingLoopEndBeatRelative(): number | null {
  const project = KGCore.instance().getCurrentProject();
  if (!project.getIsLooping()) {
    return null;
  }

  const [startBar, endBarOriginal] = project.getLoopingRange();
  const beatsPerBar = project.getTimeSignature().numerator;
  const endBar = (startBar === 0 && endBarOriginal === 0) ? project.getMaxBars() : endBarOriginal;
  const loopEndBeatAbsolute = (endBar + 1) * beatsPerBar;

  return loopEndBeatAbsolute - _recordingRegionStartBeat;
}

function finalizeRecordedNote(startBeat: number, candidateEndBeat: number): number {
  const loopEndBeatRelative = getRecordingLoopEndBeatRelative();
  if (loopEndBeatRelative !== null && candidateEndBeat < startBeat) {
    return loopEndBeatRelative;
  }

  return candidateEndBeat;
}

function clearPendingAudioRecordingStart(): void {
  if (_audioRecordingStartTimeoutId !== null) {
    window.clearTimeout(_audioRecordingStartTimeoutId);
    _audioRecordingStartTimeoutId = null;
  }
}

function getAudioRecordingExtension(mimeType: string): string {
  if (mimeType.includes('ogg')) return 'ogg';
  if (mimeType.includes('mp4')) return 'm4a';
  if (mimeType.includes('wav')) return 'wav';
  return 'webm';
}

const pendingAudioBufferHydrations = new Set<string>();

async function decodeStoredAudioFile(arrayBuffer: ArrayBuffer): Promise<Tone.ToneAudioBuffer> {
  const audioContext = Tone.getContext().rawContext as AudioContext;
  const decoded = await audioContext.decodeAudioData(arrayBuffer);
  const toneBuffer = new Tone.ToneAudioBuffer();
  toneBuffer.set(decoded);
  return toneBuffer;
}

async function hydrateAudioTrackBuffers(project: KGProject): Promise<boolean> {
  const audioInterface = KGAudioInterface.instance();
  const projectName = project.getName();
  let hydratedAnyBuffer = false;

  for (const track of project.getTracks()) {
    if (track.getCurrentType() !== 'KGAudioTrack') {
      continue;
    }

    const audioTrack = track as KGAudioTrack;
    const trackId = audioTrack.getId().toString();

    if (!audioInterface.hasTrackAudioPlayerBus(trackId)) {
      await audioInterface.createTrackAudioPlayerBus(trackId, audioTrack.getVolume());
    }

    for (const region of audioTrack.getRegions()) {
      if (region.getCurrentType() !== 'KGAudioRegion') {
        continue;
      }

      const audioRegion = region as KGAudioRegion;
      const audioFileId = audioRegion.getAudioFileId();
      if (!audioFileId || audioInterface.hasAudioBufferForTrack(trackId, audioFileId)) {
        continue;
      }

      const hydrationKey = `${projectName}:${trackId}:${audioFileId}`;
      if (pendingAudioBufferHydrations.has(hydrationKey)) {
        continue;
      }

      pendingAudioBufferHydrations.add(hydrationKey);
      try {
        const arrayBuffer = await KGAudioFileStorage.loadAudioFile(projectName, audioFileId);
        const toneBuffer = await decodeStoredAudioFile(arrayBuffer);
        audioInterface.loadAudioBufferForTrack(trackId, audioFileId, toneBuffer);
        hydratedAnyBuffer = true;
      } catch (err) {
        console.error(`Failed to load audio file ${audioFileId}:`, err);
      } finally {
        pendingAudioBufferHydrations.delete(hydrationKey);
      }
    }
  }

  return hydratedAnyBuffer;
}

// Create the store
export const useProjectStore = create<ProjectState>((set, get) => {
  const currentProject = KGCore.instance().getCurrentProject();

  // Initialize CSS variable for time signature on store creation
  updateTimeSignatureCSS(currentProject.getTimeSignature());
  // Initialize CSS variable for max bars on store creation
  updateMaxBarsCSS(currentProject.getMaxBars());
  // Initialize CSS variable for bar width multiplier on store creation
  updateBarWidthMultiplierCSS(currentProject.getBarWidthMultiplier());

  // Get initial ChatBox state from config
  const configManager = ConfigManager.instance();
  KGPianoRollState.instance().setPianoRollZoom(currentProject.getPianoRollZoom());
  const initialChatBoxState = configManager.getIsInitialized()
    ? (configManager.get('chatbox.default_open') as boolean) ?? false
    : false;

  // Set up playhead update callback to keep store in sync during playback
  KGCore.instance().setPlayheadUpdateCallback((position: number) => {
    const { bpm, timeSignature } = get();
    const project = KGCore.instance().getCurrentProject();
    set(state => ({
      playheadPosition: position,
      currentTime: formatCurrentTime(project, position),
      recordingAudioPreviewCurrentBeat: state.recordingMode === 'audio'
        ? Math.max(state.recordingCommitStartBeatAbsolute, position)
        : state.recordingAudioPreviewCurrentBeat,
    }));
  });

  // Keep store isPlaying in sync when core auto-stops (e.g., at maxBars)
  KGCore.instance().setPlaybackStateChangeCallback((isPlaying: boolean) => {
    set({ isPlaying });
  });

  // Set up selection sync callback
  const syncSelectionFromCore = () => {
    const core = KGCore.instance();
    const selectedItems = core.getSelectedItems();

    const noteIds = selectedItems
      .filter(item => item instanceof KGMidiNote)
      .map(item => item.getId());
    const pitchBendIds = selectedItems
      .filter(item => item instanceof KGMidiPitchBend)
      .map(item => item.getId());
    const controllerEventIds = selectedItems
      .filter(item => item instanceof KGMidiControllerEvent)
      .map(item => item.getId());
    const trackAutomationPointIds = selectedItems
      .filter(item => item instanceof KGTrackAutomationPoint)
      .map(item => item.getId());
    const regionIds = selectedItems
      .filter(item => item instanceof KGRegion)
      .map(item => item.getId());

    set({
      selectedNoteIds: noteIds,
      selectedPitchBendIds: pitchBendIds,
      selectedControllerEventIds: controllerEventIds,
      selectedTrackAutomationPointIds: trackAutomationPointIds,
      selectedRegionIds: regionIds
    });
  };

  // Register the sync callback with KGCore
  KGCore.instance().onSelectionChanged(syncSelectionFromCore);

  // Initial selection sync
  syncSelectionFromCore();

  // Set up command history sync callback
  const syncUndoRedoState = () => {
    const core = KGCore.instance();
    set({
      canUndo: core.canUndo(),
      canRedo: core.canRedo(),
      undoDescription: core.getUndoDescription(),
      redoDescription: core.getRedoDescription()
    });
  };

  // Register the undo/redo sync callback with KGCore
  KGCore.instance().setOnCommandHistoryChanged(syncUndoRedoState);

  // Initial undo/redo state sync
  syncUndoRedoState();

  // Ensure a default track exists on initial app start
  // Also auto-select it and open instrument selection panel
  let initialSelectedTrackId: string | null = null;
  let initialShowInstrumentSelection = false;
  try {
    const project = KGCore.instance().getCurrentProject();
    if (project.getTracks().length === 0) {
      const addDefaultTrackCommand = new AddTrackCommand(undefined, 'Melody');
      KGCore.instance().executeCommand(addDefaultTrackCommand);
      const createdId = String(addDefaultTrackCommand.getTrackId());
      initialSelectedTrackId = createdId;
      initialShowInstrumentSelection = true;
    }
  } catch (error) {
    console.error('Error creating default track on startup:', error);
  }

  return {
    // Initial state
    projectName: currentProject.getName(),
    savedProjectName: currentProject.getName(),
    tracks: currentProject.getTracks() as KGTrack[],
    globalTracks: getProjectGlobalTracks(currentProject),
    currentStatus: KGCore.instance().getStatus() || 'Unknown',
    maxBars: currentProject.getMaxBars(),
    barWidthMultiplier: currentProject.getBarWidthMultiplier(),
    timeSignature: currentProject.getTimeSignature(),
    bpm: currentProject.getBpm(),
    keySignature: currentProject.getKeySignature(),
    selectedMode: currentProject.getSelectedMode(),
    isLooping: currentProject.getIsLooping(),
    isMetronomeEnabled: currentProject.getIsMetronomeEnabled(),
    showGlobalTracks: currentProject.getShowGlobalTracks(),
    loopingRange: currentProject.getLoopingRange(),
    playheadPosition: KGCore.instance().getPlayheadPosition(),
    isPlaying: KGCore.instance().getIsPlaying(),
    isPreparingPlayback: false,
    autoScrollEnabled: true,
    currentTime: formatCurrentTime(currentProject, KGCore.instance().getPlayheadPosition()),

    // Initial selection state
    selectedNoteIds: [],
    selectedPitchBendIds: [],
    selectedControllerEventIds: [],
    selectedTrackAutomationPointIds: [],
    selectedRegionIds: [],
    selectedTrackId: initialSelectedTrackId,

    // Initial piano roll state
    showPianoRoll: false,
    activeRegionId: null,
    pianoRollMode: 'midi-edit' as const,
    hybridAudioRegionId: null,
    requestedSheetMusicViewEnabled: false,
    pianoRollViewRequestVersion: 0,
    automationRedrawVersion: 0,
    activeTrackAutomationTrackId: null,
    activeTrackAutomationType: null,
    trackAutomationRedrawVersion: 0,
    audioWaveformRedrawVersion: 0,

    // Initial ChatBox state
    showChatBox: initialChatBoxState,
    toolFastForwardEnabled: false,

    // Initial K.G.One panel state
    showKGOnePanel: false,

    // Initial Event List panel state
    showEventListPanel: false,
    lastActiveSidePanel: initialChatBoxState ? 'chat' : null,
    settingsReturnSidePanel: null,

    // Initial Instrument Selection panel state
    showInstrumentSelection: initialShowInstrumentSelection,

    // Initial audio import modal state
    showAudioImportModal: false,
    audioImportTargetTrackId: null,

    // Initial Settings state
    showSettings: false,

    // Initial undo/redo state
    canUndo: false,
    canRedo: false,
    undoDescription: null,
    redoDescription: null,

    // Initial recording state
    isRecording: false,
    recordingMode: null,
    recordingTargetRegionId: null,
    recordingTargetTrackId: null,
    recordingTargetTrackIndex: null,
    recordingNotes: [],
    recordingPitchBends: [],
    recordingControllerEventsByType: createEmptyRecordedControllerBuckets(),
    recordingOriginalPlayhead: 0,
    recordingStartBeatAbsolute: 0,
    recordingCommitStartBeatAbsolute: 0,
    recordingAudioPreviewPeaks: [],
    recordingAudioPreviewCurrentBeat: 0,
    recordingAudioPreviewFileName: null,

    // Initial cross-component scroll request state
    mainContentScrollRequest: null,
    pianoRollScrollRequest: null,

    // Actions
    setProjectName: (name: string) => {
      try {
        // Create and execute the change project property command
        const command = new ChangeProjectPropertyCommand({ name });
        KGCore.instance().executeCommand(command);

        // Update the store state
        set({ projectName: name });

        console.log(`Set project name to "${name}"`);
      } catch (error) {
        console.error('Error setting project name:', error);
        get().setStatus('Failed to set project name');
      }
    },

    setSavedProjectName: (name: string) => {
      set({ savedProjectName: name });
    },

    addTrack: async () => {
      try {
        const project = KGCore.instance().getCurrentProject();
        const insertionIndex = resolveTrackInsertionIndex(project, get().selectedTrackId);

        // Create and execute the add track command
        const command = new AddTrackCommand(undefined, undefined, 'acoustic_grand_piano', insertionIndex);
        KGCore.instance().executeCommand(command);

        // Update the store state with a new array reference to trigger re-render
        const updatedProject = KGCore.instance().getCurrentProject();
        set({
          tracks: [...updatedProject.getTracks()] as KGTrack[],
          globalTracks: [...getProjectGlobalTracks(updatedProject)],
        });

        // Auto-select the newly created track and open instrument selection panel
        const newTrackId = command.getTrackId().toString();
        set({
          selectedTrackId: newTrackId,
          showInstrumentSelection: true,
        });

        console.log(`Added track ${command.getTrackId()}`);
      } catch (error) {
        console.error('Error adding track:', error);
        get().setStatus('Failed to add track');
      }
    },

    addAudioTrack: async () => {
      try {
        const project = KGCore.instance().getCurrentProject();
        const insertionIndex = resolveTrackInsertionIndex(project, get().selectedTrackId);
        const command = new AddAudioTrackCommand(undefined, undefined, insertionIndex);
        KGCore.instance().executeCommand(command);

        const updatedProject = KGCore.instance().getCurrentProject();
        set({
          tracks: [...updatedProject.getTracks()] as KGTrack[],
          globalTracks: [...getProjectGlobalTracks(updatedProject)],
        });

        const newTrackId = command.getTrackId().toString();
        set({
          selectedTrackId: newTrackId,
          showAudioImportModal: true,
          audioImportTargetTrackId: newTrackId,
        });

        console.log(`Added audio track ${command.getTrackId()}`);
      } catch (error) {
        console.error('Error adding audio track:', error);
        get().setStatus('Failed to add audio track');
      }
    },

    importAudioToTrack: async (trackId: string, file: File) => {
      try {
        get().setStatus(`Importing "${file.name}"...`);

        // Decode the audio file to get duration
        const arrayBuffer = await file.arrayBuffer();
        const toneBuffer = new Tone.ToneAudioBuffer();
        try {
          await new Promise<void>((resolve, reject) => {
            toneBuffer.onload = () => resolve();
            // Set buffer from array buffer
            const audioContext = Tone.getContext().rawContext as AudioContext;
            audioContext.decodeAudioData(
              arrayBuffer.slice(0),  // slice to avoid detached buffer
              (decoded) => {
                toneBuffer.set(decoded);
                resolve();
              },
              (err) => reject(err)
            );
          });
        } catch {
          throw new Error(getAudioImportDecodeFailureMessage(file.name));
        }

        const audioDurationSeconds = toneBuffer.duration;
        const { bpm, timeSignature, playheadPosition, maxBars } = get();

        // Calculate duration in beats
        const durationInBeats = audioDurationSeconds * (bpm / 60);

        // Calculate if we need to expand maxBars
        const beatsPerBar = timeSignature.numerator;
        const endBeat = playheadPosition + durationInBeats;
        const requiredBars = Math.ceil(endBeat / beatsPerBar);
        const newMaxBars = Math.max(maxBars, requiredBars);

        // Store audio file in OPFS
        const projectName = get().projectName;
        const audioFileId = KGAudioFileStorage.generateAudioFileId(file.name);
        await KGAudioFileStorage.storeAudioFile(projectName, audioFileId, file);

        // Load buffer into the audio player bus
        const audioInterface = KGAudioInterface.instance();
        audioInterface.loadAudioBufferForTrack(trackId, audioFileId, toneBuffer);

        // Find the track to get trackIndex
        const project = KGCore.instance().getCurrentProject();
        const track = project.getTracks().find(t => t.getId().toString() === trackId);
        if (!track) {
          throw new Error(`Track ${trackId} not found`);
        }

        // Execute the import command
        const command = new ImportAudioCommand(
          track.getId(),
          track.getTrackIndex(),
          audioFileId,
          file.name,
          audioDurationSeconds,
          playheadPosition,
          durationInBeats,
          maxBars,
          newMaxBars
        );
        KGCore.instance().executeCommand(command);

        // Update store state
        const updatedState: Partial<ProjectState> = {
          tracks: [...project.getTracks()] as KGTrack[],
        };
        if (newMaxBars > maxBars) {
          updatedState.maxBars = newMaxBars;
          updateMaxBarsCSS(newMaxBars);
        }
        set(updatedState);

        get().setStatus(`Imported "${file.name}" successfully`);
        console.log(`Imported audio "${file.name}" to track ${trackId}`);
      } catch (error) {
        console.error('Error importing audio:', error);
        get().setStatus(error instanceof Error ? error.message : `Failed to import "${file.name}".`);
      }
    },

    openAudioImportModal: (trackId: string) => {
      set({ showAudioImportModal: true, audioImportTargetTrackId: trackId });
    },

    closeAudioImportModal: () => {
      set({ showAudioImportModal: false, audioImportTargetTrackId: null });
    },

    removeTrack: async (id: number) => {
      try {
        // Get the current tracks and find the index of the track being deleted
        const currentTracks = KGCore.instance().getCurrentProject().getTracks();
        const deletedTrackIndex = currentTracks.findIndex(track => track.getId() === id);
        const { selectedTrackId } = get();
        const isCurrentTrackSelected = selectedTrackId === id.toString();

        // Create and execute the remove track command
        const command = new RemoveTrackCommand(id);
        KGCore.instance().executeCommand(command);

        // Update the store state with a new array reference to trigger re-render
        const project = KGCore.instance().getCurrentProject();
        const remainingTracks = [...project.getTracks()] as KGTrack[];
        set({
          tracks: remainingTracks,
          globalTracks: [...getProjectGlobalTracks(project)],
        });

        // Auto-select another track if any remain
        if (remainingTracks.length > 0) {
          // Prefer previous track, fallback to next track
          const newSelectedIndex = deletedTrackIndex > 0
            ? deletedTrackIndex - 1  // Select previous track
            : 0;                     // Select first remaining track (was next)

          const newSelectedTrack = remainingTracks[newSelectedIndex];
          const newSelectedTrackId = newSelectedTrack.getId().toString();

          setTimeout(() => {
            set({
              selectedTrackId: isCurrentTrackSelected ? newSelectedTrackId : selectedTrackId,
            });
          }, 0);
        } else {
          // No tracks left, clear selection and close instrument panel
          set({
            selectedTrackId: null,
            showInstrumentSelection: false,
          });
        }

        console.log(`Removed track ${id}`);
      } catch (error) {
        console.error('Error removing track:', error);
        get().setStatus('Failed to remove track');
      }
    },

    updateTrack: async (updatedTrack: KGTrack) => {
      const { tracks } = get();

      try {
        // Find the old track to compare instruments
        const oldTrack = tracks.find(track => track.getId() === updatedTrack.getId());

        // Type guard to check if track is KGMidiTrack
        const isMidiTrack = (track: KGTrack): track is KGMidiTrack => {
          return track.getCurrentType() === 'KGMidiTrack' && 'getInstrument' in track;
        };

        // Check if instrument changed (only for MIDI tracks)
        const shouldUpdateInstrument =
          isMidiTrack(updatedTrack) &&
          oldTrack &&
          isMidiTrack(oldTrack) &&
          updatedTrack.getInstrument() !== oldTrack.getInstrument();

        // Update instrument in audio interface if changed
        if (shouldUpdateInstrument && isMidiTrack(updatedTrack)) {
          const audioInterface = KGAudioInterface.instance();
          const newInstrument = updatedTrack.getInstrument();
          audioInterface.setTrackInstrument(updatedTrack.getId().toString(), newInstrument);
          console.log(`Updated track ${updatedTrack.getId()} instrument to ${newInstrument}`);
        }

        // Find and update the track
        const updatedTracks = tracks.map(track =>
          track.getId() === updatedTrack.getId() ? updatedTrack : track
        );

        // Update the core model
        KGCore.instance().getCurrentProject().setTracks(updatedTracks);

        // Update the store
        set({ tracks: updatedTracks });

        console.log(`Updated track ${updatedTrack.getId()}`);
      } catch (error) {
        console.error('Error updating track:', error);
        get().setStatus('Failed to update track');
      }
    },

    updateTrackProperties: async (trackId: number, properties: TrackUpdateProperties) => {
      try {
        // Create and execute the update track command
        const command = new UpdateTrackCommand(trackId, properties);
        KGCore.instance().executeCommand(command);

        // Update the store state with the current project state
        const project = KGCore.instance().getCurrentProject();
        set({
          tracks: [...project.getTracks()] as KGTrack[],
          globalTracks: [...getProjectGlobalTracks(project)],
        });

        console.log(`Updated track ${trackId} properties`);
      } catch (error) {
        console.error('Error updating track properties:', error);
        get().setStatus('Failed to update track properties');
      }
    },

    updateRegionProperties: async (regionId: string, properties: RegionUpdateProperties) => {
      try {
        const command = new UpdateRegionCommand(regionId, properties);
        KGCore.instance().executeCommand(command);

        const project = KGCore.instance().getCurrentProject();
        set({
          tracks: [...project.getTracks()] as KGTrack[],
          globalTracks: [...getProjectGlobalTracks(project)],
        });

        console.log(`Updated region ${regionId} properties`);
      } catch (error) {
        console.error('Error updating region properties:', error);
        get().setStatus('Failed to update region properties');
      }
    },

    setTrackInstrument: async (trackId: number, instrument: InstrumentType) => {
      try {
        // Use the new updateTrackProperties method with command pattern
        await get().updateTrackProperties(trackId, { instrument });

        console.log(`Set track ${trackId} instrument to ${instrument}`);
      } catch (error) {
        console.error('Error setting track instrument:', error);
        get().setStatus('Failed to change instrument');
      }
    },

    reorderTracks: (sourceIndex: number, destinationIndex: number) => {
      try {
        // Create and execute the reorder tracks command
        const command = new ReorderTracksCommand(sourceIndex, destinationIndex);
        KGCore.instance().executeCommand(command);

        // Update the store state with the current project state
        const project = KGCore.instance().getCurrentProject();
        set({
          tracks: [...project.getTracks()] as KGTrack[],
          globalTracks: [...getProjectGlobalTracks(project)],
        });

        console.log(`Reordered track from index ${sourceIndex} to ${destinationIndex}`);
      } catch (error) {
        console.error('Error reordering tracks:', error);
        get().setStatus('Failed to reorder tracks');
      }
    },

    setStatus: (status: string) => {
      KGCore.instance().setStatus(status);
      set({ currentStatus: status });
    },

    removeStatus: () => {
      KGCore.instance().setStatus('');
      set({ currentStatus: '' });
    },

    refreshStatus: () => {
      set({ currentStatus: KGCore.instance().getStatus() || 'Unknown' });
    },

    loadProject: async (project: KGProject | null = null, savedName?: string) => {
      try {
        // Upgrade incoming project data to latest structure version (only when provided explicitly)
        if (project) {
          project = upgradeProjectToLatest(project);
        }

        // Get project from KGCore if null
        const projectToLoad = project || KGCore.instance().getCurrentProject();

        // Set the project in KGCore if one was provided
        if (project) {
          KGCore.instance().setCurrentProject(projectToLoad);
        }

        // Ensure a default "Melody" track exists for empty projects
        if (projectToLoad.getTracks().length === 0) {
          const addDefaultTrackCommand = new AddTrackCommand(undefined, 'Melody');
          KGCore.instance().executeCommand(addDefaultTrackCommand);
        }

        // Get project properties
        const maxBars = projectToLoad.getMaxBars();
        const timeSignature = projectToLoad.getTimeSignature();
        const bpm = projectToLoad.getBpm();
        const keySignature = projectToLoad.getKeySignature();
        const tracks = projectToLoad.getTracks();
        const restoredPlayheadPosition = clampPlayheadPosition(projectToLoad, projectToLoad.getPlayheadPosition());
        projectToLoad.setPlayheadPosition(restoredPlayheadPosition);
        KGCore.instance().setPlayheadPosition(restoredPlayheadPosition);

        // Setup audio synths for all tracks
        const audioInterface = KGAudioInterface.instance();
        audioInterface.setMetronomeEnabled(projectToLoad.getIsMetronomeEnabled());

        // Clear any existing synths/buses first
        tracks.forEach(track => {
          const trackId = track.getId().toString();
          audioInterface.removeTrackSynth(trackId);
          audioInterface.removeTrackAudioPlayerBus(trackId);
        });

        // Create synths/buses for all tracks (with their stored volumes)
        for (const track of tracks) {
          const trackId = track.getId().toString();

          if (track.getCurrentType() === 'KGAudioTrack') {
            // Audio track: create player bus; buffers are hydrated in a shared pass below
            await audioInterface.createTrackAudioPlayerBus(trackId, track.getVolume());
          } else {
            // MIDI track: create sampler-based audio bus
            let instrument: InstrumentType = 'acoustic_grand_piano';
            if (track.getCurrentType() === 'KGMidiTrack' && 'getInstrument' in track) {
              instrument = (track as KGMidiTrack).getInstrument();
            }
            audioInterface.createTrackSynth(trackId, instrument);
            audioInterface.setTrackVolume(trackId, track.getVolume());
          }
        }

        await hydrateAudioTrackBuffers(projectToLoad);

        // Reapply restored mute/solo state after all buses exist so solo logic can be
        // computed against the full track set.
        for (const track of tracks) {
          const trackId = track.getId().toString();
          audioInterface.setTrackMute(trackId, track.getMuted());
          audioInterface.setTrackSolo(trackId, track.getSolo());
        }

        // Update CSS variables
        updateTimeSignatureCSS(timeSignature);
        updateMaxBarsCSS(maxBars);
        updateBarWidthMultiplierCSS(projectToLoad.getBarWidthMultiplier());

        // Log project loading info
        console.log(`Project max bars: ${maxBars}`);
        console.log(`Setup audio synths for ${tracks.length} tracks`);

        // Update the store state to reflect the loaded project
        // Force a new array reference for tracks to trigger React/Zustand re-render
        set({
          projectName: projectToLoad.getName(),
          savedProjectName: savedName ?? projectToLoad.getName(),
          tracks: [...tracks],
          globalTracks: [...getProjectGlobalTracks(projectToLoad)],
          maxBars,
          barWidthMultiplier: projectToLoad.getBarWidthMultiplier(),
          timeSignature,
          bpm,
          keySignature,
          selectedMode: projectToLoad.getSelectedMode(),
          isLooping: projectToLoad.getIsLooping(),
          isMetronomeEnabled: projectToLoad.getIsMetronomeEnabled(),
          showGlobalTracks: projectToLoad.getShowGlobalTracks(),
          loopingRange: projectToLoad.getLoopingRange(),
          activeTrackAutomationTrackId: null,
          activeTrackAutomationType: null,
          trackAutomationRedrawVersion: 0,
          isRecording: false,
          recordingMode: null,
          recordingTargetRegionId: null,
          recordingTargetTrackId: null,
          recordingTargetTrackIndex: null,
          recordingNotes: [],
          recordingPitchBends: [],
          recordingControllerEventsByType: createEmptyRecordedControllerBuckets(),
          recordingOriginalPlayhead: 0,
          recordingStartBeatAbsolute: 0,
          recordingCommitStartBeatAbsolute: 0,
          recordingAudioPreviewPeaks: [],
          recordingAudioPreviewCurrentBeat: 0,
          recordingAudioPreviewFileName: null,
          playheadPosition: restoredPlayheadPosition,
          currentTime: formatCurrentTime(projectToLoad, restoredPlayheadPosition),
          mainContentScrollRequest: restoredPlayheadPosition,
        });

        // After loading a project, auto-select the first track and open Instrument Selection
        const firstTrack = tracks[0];
        if (firstTrack) {
          const firstTrackIdStr = firstTrack.getId().toString();
          set({
            selectedTrackId: firstTrackIdStr,
            showInstrumentSelection: true,
          });
        }

        // Reset piano roll state for new/loaded project
        KGPianoRollState.instance().setLastEditedNoteLength(1);
        KGPianoRollState.instance().setLastEditedNoteVelocity(127);
        KGPianoRollState.instance().setPianoRollZoom(projectToLoad.getPianoRollZoom());

        // Add a status message
        KGCore.instance().setStatus(`Project "${projectToLoad.getName()}" loaded with audio setup`);
        set({ currentStatus: KGCore.instance().getStatus() || 'Unknown' });
      } catch (error) {
        console.error('Error loading project:', error);
        get().setStatus('Failed to load project');
      }
    },

    setPlayheadPosition: (position: number) => {
      const project = KGCore.instance().getCurrentProject();
      const clampedPosition = clampPlayheadPosition(project, position);
      project.setPlayheadPosition(clampedPosition);
      KGCore.instance().setPlayheadPosition(clampedPosition);
      set({
        playheadPosition: clampedPosition,
        currentTime: formatCurrentTime(project, clampedPosition)
      });
    },

    setAutoScrollEnabled: (enabled: boolean) => {
      set({ autoScrollEnabled: enabled });
    },

    requestMainContentScroll: (beatPosition: number) => {
      set({ mainContentScrollRequest: beatPosition });
    },

    requestPianoRollScroll: (beatPosition: number) => {
      set({ pianoRollScrollRequest: beatPosition });
    },

    startPlaying: async () => {
      if (get().isPreparingPlayback) {
        return;
      }

      set({ isPreparingPlayback: true });
      try {
        await KGCore.instance().startPlaying();
        set({ isPlaying: true, autoScrollEnabled: true });
      } finally {
        set({ isPreparingPlayback: false });
      }
    },

    stopPlaying: async () => {
      try {
        await KGCore.instance().stopPlaying();
        set({ isPlaying: false });
      } finally {
        set({ isPreparingPlayback: false });
      }
    },

    stopTransport: async () => {
      if (get().isRecording) {
        await get().stopRecording();
        return;
      }
      try {
        await get().stopPlaying();
      } finally {
        set({ isPreparingPlayback: false });
      }
    },

    startRecording: async () => {
      const {
        activeRegionId,
        timeSignature,
        playheadPosition,
        setPlayheadPosition,
        selectedTrackId,
        tracks,
      } = get();

      const selectedTrack = tracks.find(track => track.getId().toString() === selectedTrackId) ?? null;
      if (selectedTrack instanceof KGAudioTrack) {
        const project = KGCore.instance().getCurrentProject();
        const beatsPerBar = timeSignature.numerator;
        const projectLooping = project.getIsLooping();
        const [loopStartBar] = project.getLoopingRange();
        const loopStartBeat = loopStartBar * beatsPerBar;
        const recordingCommitStartBeatAbsolute = projectLooping ? loopStartBeat : playheadPosition;
        const recordingStartBeatAbsolute = recordingCommitStartBeatAbsolute - beatsPerBar;
        const previewFileName = `Recording_${new Date().toISOString().replace(/[:.]/g, '-')}`;

        clearPendingAudioRecordingStart();
        _audioRecordingForcedStopBeatAbsolute = null;
        _audioRecordingHasStarted = false;

        set({
          isRecording: true,
          recordingMode: 'audio',
          recordingTargetRegionId: null,
          recordingTargetTrackId: selectedTrack.getId().toString(),
          recordingTargetTrackIndex: selectedTrack.getTrackIndex(),
          recordingNotes: [],
          recordingPitchBends: [],
          recordingControllerEventsByType: createEmptyRecordedControllerBuckets(),
          recordingOriginalPlayhead: playheadPosition,
          recordingStartBeatAbsolute,
          recordingCommitStartBeatAbsolute,
          recordingAudioPreviewPeaks: [],
          recordingAudioPreviewCurrentBeat: recordingCommitStartBeatAbsolute,
          recordingAudioPreviewFileName: previewFileName,
        });

        KGCore.instance().setLoopBoundaryReachedCallback(projectLooping
          ? (loopEndBeat: number) => {
            _audioRecordingForcedStopBeatAbsolute = loopEndBeat;
            void get().stopRecording();
          }
          : null);

        setPlayheadPosition(recordingStartBeatAbsolute);
        set({ isPreparingPlayback: true });
        try {
          await KGCore.instance().startPlaying({
            preserveLoopPreroll: projectLooping,
          });
          set({ isPlaying: true, autoScrollEnabled: true });

          const prerollMs = Math.max(0, ((recordingCommitStartBeatAbsolute - recordingStartBeatAbsolute) * (60 / project.getBpm())) * 1000);
          _audioRecordingStartTimeoutId = window.setTimeout(() => {
            _audioRecordingStartTimeoutId = null;
            const inputDeviceId = (ConfigManager.instance().get('audio.input_device_id') as string | undefined) ?? 'default';
            void KGAudioInterface.instance().startAudioRecording(inputDeviceId, (peaks) => {
              set({ recordingAudioPreviewPeaks: peaks });
            }).then((startResult) => {
              _audioRecordingHasStarted = true;
              if (startResult.fellBackToDefault) {
                void ConfigManager.instance().set('audio.input_device_id', 'default');
                get().setStatus('Previously selected audio input device is unavailable; using System Default.');
              }
            }).catch(async (error) => {
              console.error('Failed to start audio recording:', error);
              await KGAudioInterface.instance().cancelAudioRecording();
              KGCore.instance().setLoopBoundaryReachedCallback(null);
              await get().stopPlaying();
              setPlayheadPosition(playheadPosition);
              set({
                isRecording: false,
                recordingMode: null,
                recordingTargetTrackId: null,
                recordingTargetTrackIndex: null,
                recordingStartBeatAbsolute: 0,
                recordingCommitStartBeatAbsolute: 0,
                recordingAudioPreviewPeaks: [],
                recordingAudioPreviewCurrentBeat: 0,
                recordingAudioPreviewFileName: null,
              });
              get().setStatus(error instanceof Error ? error.message : 'Unable to start audio recording.');
            });
          }, prerollMs);
        } finally {
          set({ isPreparingPlayback: false });
        }
        return;
      }

      const project = KGCore.instance().getCurrentProject();
      let targetRegion: KGMidiRegion | null = null;
      for (const track of project.getTracks()) {
        const found = track.getRegions().find(r => r.getId() === activeRegionId);
        if (found instanceof KGMidiRegion) { targetRegion = found; break; }
      }
      if (!targetRegion) return;

      _recordingRegionStartBeat = targetRegion.getStartFromBeat();
      _recordingActiveNotes = new Map();
      _lastRecordedPitchBendValue = null;
      _lastRecordedControllerValues = new Map();

      const projectLooping = project.getIsLooping();
      const [loopStartBar] = project.getLoopingRange();
      const loopStartBeat = loopStartBar * timeSignature.numerator;
      const recordingStartBeat = projectLooping
        ? loopStartBeat - timeSignature.numerator
        : playheadPosition - timeSignature.numerator;

      set({
        isRecording: true,
        recordingMode: 'midi',
        recordingNotes: [],
        recordingPitchBends: [],
        recordingControllerEventsByType: createEmptyRecordedControllerBuckets(),
        recordingTargetRegionId: activeRegionId,
        recordingTargetTrackId: null,
        recordingTargetTrackIndex: null,
        recordingOriginalPlayhead: playheadPosition,
        recordingStartBeatAbsolute: recordingStartBeat,
        recordingCommitStartBeatAbsolute: targetRegion.getStartFromBeat(),
        recordingAudioPreviewPeaks: [],
        recordingAudioPreviewCurrentBeat: 0,
        recordingAudioPreviewFileName: null,
      });

      const buildCorrectedBeat = (): number => {
        const bpm = get().bpm;
        const playbackDelaySec = (ConfigManager.instance().get('audio.playback_delay') as number) ?? 0.2;
        const recordingOffsetSec = (ConfigManager.instance().get('audio.recording_offset') as number) ?? 0;
        const correctionBeats = (playbackDelaySec + recordingOffsetSec) * (bpm / 60);
        return KGAudioInterface.instance().getTransportPosition() - correctionBeats - _recordingRegionStartBeat;
      };

      KGMidiInput.instance().setRecordingCallbacks(
        (pitch: number, velocity: number) => {
          const beat = buildCorrectedBeat();
          _recordingActiveNotes.set(pitch, { startBeat: beat, velocity });
        },
        (pitch: number) => {
          const endBeat = buildCorrectedBeat();
          const activeNote = _recordingActiveNotes.get(pitch);
          if (activeNote !== undefined) {
            _recordingActiveNotes.delete(pitch);
            const finalizedEndBeat = finalizeRecordedNote(activeNote.startBeat, endBeat);
            set(state => ({
              recordingNotes: [...state.recordingNotes, {
                pitch,
                startBeat: activeNote.startBeat,
                endBeat: finalizedEndBeat,
                velocity: activeNote.velocity,
              }],
            }));
          }
        },
        (value: number) => {
          if (_lastRecordedPitchBendValue === value) {
            return;
          }

          _lastRecordedPitchBendValue = value;
          const beat = buildCorrectedBeat();
          set(state => ({
            recordingPitchBends: [...state.recordingPitchBends, { beat, value }],
          }));
        },
        (controller: number, value: number) => {
          if (_lastRecordedControllerValues.get(controller) === value) {
            return;
          }

          _lastRecordedControllerValues.set(controller, value);
          const beat = buildCorrectedBeat();
          set(state => {
            const nextRecordingControllerEventsByType = state.recordingControllerEventsByType.map(events => [...events]);
            nextRecordingControllerEventsByType[controller].push({ beat, value });
            return { recordingControllerEventsByType: nextRecordingControllerEventsByType };
          });
        }
      );

      setPlayheadPosition(recordingStartBeat);
      set({ isPreparingPlayback: true });
      try {
        await KGCore.instance().startPlaying({
          preserveLoopPreroll: projectLooping,
        });
        set({ isPlaying: true, autoScrollEnabled: true });
      } finally {
        set({ isPreparingPlayback: false });
      }
    },

    stopRecording: async () => {
      const {
        recordingMode,
        recordingNotes,
        recordingPitchBends,
        recordingControllerEventsByType,
        recordingTargetRegionId,
        recordingTargetTrackId,
        recordingTargetTrackIndex,
        recordingOriginalPlayhead,
        recordingCommitStartBeatAbsolute,
        recordingAudioPreviewFileName,
        stopPlaying,
        setPlayheadPosition,
        refreshProjectState,
        projectName,
        maxBars,
      } = get();

      if (recordingMode === 'audio') {
        clearPendingAudioRecordingStart();
        KGCore.instance().setLoopBoundaryReachedCallback(null);

        const stopBeatAbsolute = _audioRecordingForcedStopBeatAbsolute
          ?? Math.max(recordingCommitStartBeatAbsolute, KGAudioInterface.instance().getTransportPosition());
        _audioRecordingForcedStopBeatAbsolute = null;

        const recordingResult = _audioRecordingHasStarted
          ? await KGAudioInterface.instance().stopAudioRecording()
          : (await KGAudioInterface.instance().cancelAudioRecording(), null);
        _audioRecordingHasStarted = false;

        if (
          recordingResult &&
          recordingTargetTrackId &&
          recordingTargetTrackIndex !== null &&
          stopBeatAbsolute > recordingCommitStartBeatAbsolute
        ) {
          try {
            const extension = getAudioRecordingExtension(recordingResult.mimeType);
            const fileName = `${recordingAudioPreviewFileName ?? 'Recording'}.${extension}`;
            const audioFile = new File([recordingResult.blob], fileName, { type: recordingResult.mimeType });
            const fileId = KGAudioFileStorage.generateAudioFileId(fileName);
            const arrayBuffer = await audioFile.arrayBuffer();
            const toneBuffer = new Tone.ToneAudioBuffer();
            await new Promise<void>((resolve, reject) => {
              const audioContext = Tone.getContext().rawContext as AudioContext;
              audioContext.decodeAudioData(
                arrayBuffer.slice(0),
                (decoded) => { toneBuffer.set(decoded); resolve(); },
                (err) => reject(err)
              );
            });

            const track = KGCore.instance().getCurrentProject().getTracks().find(candidate => candidate.getId().toString() === recordingTargetTrackId);
            if (track) {
              await KGAudioFileStorage.storeAudioFile(projectName, fileId, audioFile);
              KGAudioInterface.instance().loadAudioBufferForTrack(recordingTargetTrackId, fileId, toneBuffer);

              const prevMaxBars = maxBars;
              const durationInBeats = stopBeatAbsolute - recordingCommitStartBeatAbsolute;
              const beatsPerBar = KGCore.instance().getCurrentProject().getTimeSignature().numerator;
              const endBarNumber = Math.ceil((recordingCommitStartBeatAbsolute + durationInBeats) / beatsPerBar);
              const newMaxBars = Math.max(prevMaxBars, endBarNumber);

              const command = new ImportAudioCommand(
                track.getId(),
                recordingTargetTrackIndex,
                fileId,
                fileName,
                toneBuffer.duration,
                recordingCommitStartBeatAbsolute,
                durationInBeats,
                prevMaxBars,
                newMaxBars
              );
              KGCore.instance().executeCommand(command);
              refreshProjectState();
            }
          } catch (error) {
            console.error('Failed to finalize audio recording:', error);
          }
        }

        await stopPlaying();
        setPlayheadPosition(recordingOriginalPlayhead);
        set({
          isRecording: false,
          recordingMode: null,
          isPreparingPlayback: false,
          recordingTargetRegionId: null,
          recordingTargetTrackId: null,
          recordingTargetTrackIndex: null,
          recordingNotes: [],
          recordingPitchBends: [],
          recordingControllerEventsByType: createEmptyRecordedControllerBuckets(),
          recordingStartBeatAbsolute: 0,
          recordingCommitStartBeatAbsolute: 0,
          recordingAudioPreviewPeaks: [],
          recordingAudioPreviewCurrentBeat: 0,
          recordingAudioPreviewFileName: null,
        });
        return;
      }

      // Finalize any held keys
      const finalNotes = [...recordingNotes];
      const finalPitchBends = [...recordingPitchBends];
      const finalControllerEventsByType = recordingControllerEventsByType.map(events => [...events]);
      const bpm = get().bpm;
      const playbackDelaySec = (ConfigManager.instance().get('audio.playback_delay') as number) ?? 0.2;
      const recordingOffsetSec = (ConfigManager.instance().get('audio.recording_offset') as number) ?? 0;
      const correctionBeats = (playbackDelaySec + recordingOffsetSec) * (bpm / 60);
      const endBeatForHeld = KGAudioInterface.instance().getTransportPosition() - correctionBeats - _recordingRegionStartBeat;

      _recordingActiveNotes.forEach((activeNote, pitch) => {
        finalNotes.push({
          pitch,
          startBeat: activeNote.startBeat,
          endBeat: finalizeRecordedNote(activeNote.startBeat, endBeatForHeld),
          velocity: activeNote.velocity,
        });
      });
      _recordingActiveNotes.clear();

      if (_lastRecordedPitchBendValue !== null && _lastRecordedPitchBendValue !== MIDI_PITCH_BEND_CENTER) {
        finalPitchBends.push({
          beat: endBeatForHeld,
          value: MIDI_PITCH_BEND_CENTER,
        });
        _lastRecordedPitchBendValue = MIDI_PITCH_BEND_CENTER;
      }

      if (_lastRecordedControllerValues.get(64) === 127) {
        finalControllerEventsByType[64].push({
          beat: endBeatForHeld,
          value: 0,
        });
        _lastRecordedControllerValues.set(64, 0);
      }

      KGMidiInput.instance().setRecordingCallbacks(null, null, null, null);

      const hasControllerEvents = finalControllerEventsByType.some(events => events.length > 0);
      if ((finalNotes.length > 0 || finalPitchBends.length > 0 || hasControllerEvents) && recordingTargetRegionId) {
        const noteData: NoteCreationData[] = finalNotes.map(n => ({
          regionId: recordingTargetRegionId,
          startBeat: n.startBeat,
          endBeat: n.endBeat,
          pitch: n.pitch,
          velocity: n.velocity,
        }));
        const pitchBendData: PitchBendCreationData[] = finalPitchBends.map(event => ({
          regionId: recordingTargetRegionId,
          beat: event.beat,
          value: event.value,
        }));
        const controllerEventData: ControllerEventCreationData[] = finalControllerEventsByType.flatMap((events, controller) => (
          events.map(event => ({
            regionId: recordingTargetRegionId,
            controller,
            beat: event.beat,
            value: event.value,
          }))
        ));
        const command = new CreateMidiEventsCommand(noteData, pitchBendData, controllerEventData);
        KGCore.instance().executeCommand(command);
        refreshProjectState();
      }

      await stopPlaying();
      setPlayheadPosition(recordingOriginalPlayhead);
      set({
        isRecording: false,
        recordingMode: null,
        isPreparingPlayback: false,
        recordingNotes: [],
        recordingPitchBends: [],
        recordingControllerEventsByType: createEmptyRecordedControllerBuckets(),
        recordingTargetRegionId: null,
        recordingTargetTrackId: null,
        recordingTargetTrackIndex: null,
        recordingStartBeatAbsolute: 0,
        recordingCommitStartBeatAbsolute: 0,
        recordingAudioPreviewPeaks: [],
        recordingAudioPreviewCurrentBeat: 0,
        recordingAudioPreviewFileName: null,
      });
      _lastRecordedPitchBendValue = null;
      _lastRecordedControllerValues = new Map();
    },

    toggleLoop: () => {
      const { isLooping, loopingRange, maxBars, isPlaying, stopPlaying } = get();

      // Stop playback if currently playing
      if (isPlaying) {
        stopPlaying();
      }

      toggleLoop(isLooping, loopingRange, maxBars);
    },

    toggleMetronome: () => {
      const { isMetronomeEnabled, isPlaying, timeSignature } = get();
      const newValue = !isMetronomeEnabled;
      const project = KGCore.instance().getCurrentProject();
      project.setIsMetronomeEnabled(newValue);
      set({ isMetronomeEnabled: newValue });

      const audio = KGAudioInterface.instance();
      audio.setMetronomeEnabled(newValue);

      if (isPlaying) {
        if (newValue) {
          const currentBeat = KGCore.instance().getPlayheadPosition();
          audio.startMetronomeDuringPlayback(currentBeat, timeSignature.numerator);
        } else {
          audio.stopMetronomeDuringPlayback();
        }
      }
    },

    setShowGlobalTracks: (show: boolean) => {
      const project = KGCore.instance().getCurrentProject();
      project.setShowGlobalTracks(show);
      set({ showGlobalTracks: show });
    },

    setBpm: (bpm: number) => {
      try {
        // Create and execute the change project property command
        const command = new ChangeProjectPropertyCommand({ bpm });
        KGCore.instance().executeCommand(command);

        get().refreshProjectState();
        get().bumpAudioWaveformRedrawVersion();

        console.log(`Set BPM to ${bpm}`);
      } catch (error) {
        console.error('Error setting BPM:', error);
        get().setStatus('Failed to set BPM');
      }
    },

    setMaxBars: (maxBars: number) => {
      try {
        // Create and execute the change project property command
        const command = new ChangeProjectPropertyCommand({ maxBars });
        KGCore.instance().executeCommand(command);

        get().refreshProjectState();

        console.log(`Set max bars to ${maxBars}`);
      } catch (error) {
        console.error('Error setting max bars:', error);
        get().setStatus('Failed to set max bars');
      }
    },

    setBarWidthMultiplier: (multiplier: number) => {
      const project = KGCore.instance().getCurrentProject();
      project.setBarWidthMultiplier(multiplier);
      set({ barWidthMultiplier: multiplier });
      updateBarWidthMultiplierCSS(multiplier);
    },

    setTimeSignature: (timeSignature: TimeSignature) => {
      try {
        // Create and execute the change project property command
        const command = new ChangeProjectPropertyCommand({ timeSignature });
        KGCore.instance().executeCommand(command);

        // Update the store state
        set({ timeSignature });
        updateTimeSignatureCSS(timeSignature);

        console.log(`Set time signature to ${timeSignature.numerator}/${timeSignature.denominator}`);
      } catch (error) {
        console.error('Error setting time signature:', error);
        get().setStatus('Failed to set time signature');
      }
    },

    setKeySignature: (keySignature: KeySignature) => {
      try {
        // Create and execute the change project property command
        const command = new ChangeProjectPropertyCommand({ keySignature });
        KGCore.instance().executeCommand(command);

        // Update the store state
        set({ keySignature });

        console.log(`Set key signature to ${keySignature}`);
      } catch (error) {
        console.error('Error setting key signature:', error);
        get().setStatus('Failed to set key signature');
      }
    },

    setSelectedMode: (selectedMode: string) => {
      try {
        // Create and execute the change project property command
        const command = new ChangeProjectPropertyCommand({ selectedMode });
        KGCore.instance().executeCommand(command);

        // Update the store state
        set({ selectedMode });

        console.log(`Set selected mode to ${selectedMode}`);
      } catch (error) {
        console.error('Error setting selected mode:', error);
        get().setStatus('Failed to set selected mode');
      }
    },

    // Selection actions
    syncSelectionFromCore,

    clearAllSelections: () => {
      KGCore.instance().clearSelectedItems();
      // Note: syncSelectionFromCore will be called automatically via callback
    },

    setSelectedTrack: (trackId: string | null) => {
      // Update selected track id
      set({ selectedTrackId: trackId });
    },

    setTrackAutomationView: (trackId: string | null, automationType: TrackAutomationType | null) => {
      const core = KGCore.instance();
      core.getSelectedItems()
        .filter(item => item instanceof KGTrackAutomationPoint)
        .forEach(item => core.removeSelectedItem(item));

      if (trackId && automationType === null) {
        set({
          activeTrackAutomationTrackId: null,
          activeTrackAutomationType: null,
          selectedTrackAutomationPointIds: [],
          selectedTrackId: trackId,
        });
        return;
      }

      set({
        activeTrackAutomationTrackId: trackId,
        activeTrackAutomationType: trackId ? automationType : null,
        selectedTrackAutomationPointIds: [],
        selectedTrackId: trackId,
      });
    },

    // Piano roll actions
    setShowPianoRoll: (show: boolean) => {
      set({ showPianoRoll: show });
    },

    setActiveRegionId: (regionId: string | null) => {
      set({ activeRegionId: regionId });
    },

    openMidiPianoRoll: (regionId: string) => {
      KGPianoRollState.instance().setSheetMusicViewEnabled(false);
      set(state => ({
        showPianoRoll: true,
        activeRegionId: regionId,
        pianoRollMode: 'midi-edit',
        hybridAudioRegionId: null,
        requestedSheetMusicViewEnabled: false,
        pianoRollViewRequestVersion: state.pianoRollViewRequestVersion + 1,
      }));
    },

    openMidiPianoRollWithSheetMusicView: (regionId: string, sheetMusicViewEnabled: boolean) => {
      KGPianoRollState.instance().setSheetMusicViewEnabled(sheetMusicViewEnabled);
      set(state => ({
        showPianoRoll: true,
        activeRegionId: regionId,
        pianoRollMode: 'midi-edit',
        hybridAudioRegionId: null,
        requestedSheetMusicViewEnabled: sheetMusicViewEnabled,
        pianoRollViewRequestVersion: state.pianoRollViewRequestVersion + 1,
      }));
    },

    openAudioWaveformViewer: (regionId: string) => {
      set({
        showPianoRoll: true,
        activeRegionId: regionId,
        pianoRollMode: 'audio-waveform',
        hybridAudioRegionId: null,
        requestedSheetMusicViewEnabled: false,
      });
    },

    openSpectrogramViewer: (regionId: string) => {
      set({
        showPianoRoll: true,
        activeRegionId: regionId,
        pianoRollMode: 'spectrogram',
        hybridAudioRegionId: null,
        requestedSheetMusicViewEnabled: false,
      });
    },

    openHybridMode: (midiRegionId: string, audioRegionId: string) => {
      set({
        showPianoRoll: true,
        activeRegionId: midiRegionId,
        hybridAudioRegionId: audioRegionId,
        pianoRollMode: 'hybrid',
        requestedSheetMusicViewEnabled: false,
      });
    },
    bumpAutomationRedrawVersion: () => {
      set(state => ({ automationRedrawVersion: state.automationRedrawVersion + 1 }));
    },
    bumpTrackAutomationRedrawVersion: () => {
      set(state => ({ trackAutomationRedrawVersion: state.trackAutomationRedrawVersion + 1 }));
    },
    bumpAudioWaveformRedrawVersion: () => {
      set(state => ({ audioWaveformRedrawVersion: state.audioWaveformRedrawVersion + 1 }));
    },

    // Project state cleanup - used when starting new/loading projects
    cleanupProjectState: () => {
      // Close piano roll if it's visible
      set({ showPianoRoll: false });

      // Clear active region and hybrid state
      set({
        activeRegionId: null,
        hybridAudioRegionId: null,
        pianoRollMode: 'midi-edit',
        requestedSheetMusicViewEnabled: false,
        pianoRollViewRequestVersion: 0,
        activeTrackAutomationTrackId: null,
        activeTrackAutomationType: null,
        trackAutomationRedrawVersion: 0,
        audioWaveformRedrawVersion: 0,
        recordingAudioPreviewPeaks: [],
        recordingAudioPreviewCurrentBeat: 0,
      });

      // Clear any selected items
      KGCore.instance().clearSelectedItems();
      // Note: syncSelectionFromCore will be called automatically via callback

      console.log("Cleaned up project state: closed piano roll, cleared active region, cleared selections");
    },

    // ChatBox action implementations
    activateSidePanel: (panel: SidePanelType) => {
      set({
        ...getSidePanelVisibilityState(panel),
        lastActiveSidePanel: panel,
        showSettings: false,
        settingsReturnSidePanel: null,
      });
    },

    setShowChatBox: (show: boolean) => {
      if (show) {
        get().activateSidePanel('chat');
        return;
      }

      set({ showChatBox: false });
    },

    toggleChatBox: () => {
      const { showChatBox, showSettings } = get();
      if (showSettings || !showChatBox) {
        get().activateSidePanel('chat');
        return;
      }

      set({ showChatBox: false });
    },

    setToolFastForwardEnabled: (enabled: boolean) => {
      set({ toolFastForwardEnabled: enabled });
    },

    toggleToolFastForwardEnabled: () => {
      set((state) => ({ toolFastForwardEnabled: !state.toolFastForwardEnabled }));
    },

    toggleKGOnePanel: () => {
      const { showKGOnePanel, showSettings } = get();
      if (showSettings || !showKGOnePanel) {
        get().activateSidePanel('kgone');
        return;
      }

      set({ showKGOnePanel: false });
    },

    toggleEventListPanel: () => {
      const { showEventListPanel, showSettings } = get();
      if (showSettings || !showEventListPanel) {
        get().activateSidePanel('eventList');
        return;
      }

      set({ showEventListPanel: false });
    },

    // Instrument selection panel actions
    openInstrumentSelectionForTrack: () => {
      set({ showInstrumentSelection: true });
    },
    toggleInstrumentSelectionForTrack: () => {
      set({ showInstrumentSelection: true });
    },
    closeInstrumentSelection: () => {
      set({ showInstrumentSelection: false });
    },

    // Settings action implementations
    setShowSettings: (show: boolean) => {
      if (show) {
        const { showKGOnePanel, showChatBox, showEventListPanel } = get();
        const activePanel = showKGOnePanel
          ? 'kgone'
          : showChatBox
            ? 'chat'
            : showEventListPanel
              ? 'eventList'
              : null;

        set({
          showSettings: true,
          settingsReturnSidePanel: activePanel,
        });
        return;
      }

      const { settingsReturnSidePanel } = get();
      set({
        showSettings: false,
        settingsReturnSidePanel: null,
        ...getSidePanelVisibilityState(settingsReturnSidePanel),
      });
    },

    toggleSettings: () => {
      const { showSettings } = get();
      set({ showSettings: !showSettings });
    },

    // Copy/paste actions
    pasteRegionsAtTrack: (trackId: string, position: number) => {
      // Use command pattern for region pasting with undo support
      const command = PasteRegionsCommand.fromClipboard(trackId, position);

      if (!command) {
        console.log('No regions to paste');
        return;
      }

      try {
        const core = KGCore.instance();
        core.executeCommand(command);

        const pastedRegionEnd = command.getCreatedRegions().reduce((maxEnd, region) => (
          Math.max(maxEnd, region.getStartFromBeat() + region.getLength())
        ), position);
        get().setPlayheadPosition(pastedRegionEnd);

        // Update the store to trigger re-render
        const { tracks } = get();
        const updatedTracks = [...tracks];
        set({ tracks: updatedTracks });

        console.log(`Executed PasteRegionsCommand: pasted regions to track ${trackId} using command pattern`);
      } catch (error) {
        console.error('Error pasting regions:', error);
      }
    },

    pasteNotesToActiveRegion: (regionId: string, position: number) => {
      // Use command pattern for note pasting with undo support
      const command = PasteNotesCommand.fromClipboard(regionId, position);

      if (!command) {
        console.log('No notes to paste');
        return;
      }

      try {
        const core = KGCore.instance();
        core.executeCommand(command);

        const createdNoteIds = new Set(command.getCreatedNotes().map(note => note.noteId));
        const targetRegion = command.getTargetRegion();
        const createdNotes = targetRegion
          ? targetRegion.getNotes().filter(note => createdNoteIds.has(note.getId()))
          : [];
        const pastedNoteEnd = targetRegion
          ? command.getCreatedNotes().reduce((maxEnd, note) => (
            Math.max(maxEnd, targetRegion.getStartFromBeat() + note.endBeat)
          ), position)
          : position;

        if (createdNotes.length > 0) {
          core.getSelectedItems().forEach(item => {
            item.deselect();
          });
          core.clearSelectedItems();

          createdNotes.forEach(note => {
            note.select();
          });
          core.addSelectedItems(createdNotes);
        }

        get().setPlayheadPosition(pastedNoteEnd);

        // Update the store to trigger re-render
        const { tracks } = get();
        const updatedTracks = [...tracks];
        set({ tracks: updatedTracks });

        console.log(`Executed PasteNotesCommand: pasted notes to region ${regionId} using command pattern`);
      } catch (error) {
        console.error('Error pasting notes:', error);
      }
    },

    // Undo/redo actions
    undo: () => {
      const core = KGCore.instance();
      if (core.undo()) {
        // Use centralized refresh method
        get().refreshProjectState();
        get().bumpTrackAutomationRedrawVersion();
        get().bumpAudioWaveformRedrawVersion();
        console.log('Undo completed');
      }
    },

    redo: () => {
      const core = KGCore.instance();
      if (core.redo()) {
        // Use centralized refresh method
        get().refreshProjectState();
        get().bumpTrackAutomationRedrawVersion();
        get().bumpAudioWaveformRedrawVersion();
        console.log('Redo completed');
      }
    },

    syncUndoRedoState: () => {
      const core = KGCore.instance();
      set({
        canUndo: core.canUndo(),
        canRedo: core.canRedo(),
        undoDescription: core.getUndoDescription(),
        redoDescription: core.getRedoDescription()
      });
    },

    // Centralized project state refresh method
    // Used by undo/redo and external operations (like XML tools) to sync UI with core model
    refreshProjectState: () => {
      const core = KGCore.instance();
      const project = core.getCurrentProject();

      // Force new array reference to trigger React re-renders
      set({
        projectName: project.getName(),
        tracks: [...project.getTracks()] as KGTrack[], // Force new array reference - key for re-rendering!
        globalTracks: [...getProjectGlobalTracks(project)],
        maxBars: project.getMaxBars(),
        barWidthMultiplier: project.getBarWidthMultiplier(),
        timeSignature: project.getTimeSignature(),
        bpm: project.getBpm(),
        keySignature: project.getKeySignature(),
        selectedMode: project.getSelectedMode(),
        isMetronomeEnabled: project.getIsMetronomeEnabled(),
        showGlobalTracks: project.getShowGlobalTracks(),
        playheadPosition: core.getPlayheadPosition(),
        currentTime: formatCurrentTime(project, core.getPlayheadPosition()),
      });

      // Sync CSS variables that affect layout
      updateTimeSignatureCSS(project.getTimeSignature());
      updateMaxBarsCSS(project.getMaxBars());
      updateBarWidthMultiplierCSS(project.getBarWidthMultiplier());

      // Sync all related state
      const actions = get();
      actions.syncUndoRedoState();
      actions.syncSelectionFromCore();

      void hydrateAudioTrackBuffers(project).then((hydratedAnyBuffer) => {
        if (!hydratedAnyBuffer) {
          return;
        }

        set(state => ({
          tracks: [...project.getTracks()] as KGTrack[],
          audioWaveformRedrawVersion: state.audioWaveformRedrawVersion + 1,
        }));
      });
    },

    // Initialize store with configuration values
    initializeFromConfig: async () => {
      const configManager = ConfigManager.instance();
      if (configManager.getIsInitialized()) {
        const defaultChatBoxOpen = (configManager.get('chatbox.default_open') as boolean) ?? false;
        set({ showChatBox: defaultChatBoxOpen });
      }
    }
  };
}); 
