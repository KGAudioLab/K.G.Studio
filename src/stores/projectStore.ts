import { create } from 'zustand';
import { KGCore } from '../core/KGCore';
import { KGTrack } from '../core/track/KGTrack';
import { KGProject, type KeySignature } from '../core/KGProject';
import type { TimeSignature } from '../types/projectTypes';
import { KGMidiTrack, type InstrumentType } from '../core/track/KGMidiTrack';
import { beatsToTimeString } from '../util/timeUtil';
import { KGAudioInterface } from '../core/audio-interface/KGAudioInterface';
import { KGPianoRollState } from '../core/state/KGPianoRollState';
import { KGMidiNote } from '../core/midi/KGMidiNote';
import { KGRegion } from '../core/region/KGRegion';
import { AddTrackCommand, AddAudioTrackCommand, RemoveTrackCommand, ReorderTracksCommand, UpdateTrackCommand, type TrackUpdateProperties, PasteRegionsCommand, PasteNotesCommand, ChangeProjectPropertyCommand, ImportAudioCommand } from '../core/commands';
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
import { CreateNotesCommand } from '../core/commands/note/CreateNotesCommand';
import type { NoteCreationData } from '../core/commands/note/CreateNotesCommand';

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

// Define the store state interface
interface ProjectState {
  // State
  projectName: string;
  savedProjectName: string; // OPFS folder name where the project is currently saved
  tracks: KGTrack[];
  currentStatus: string;
  maxBars: number;
  barWidthMultiplier: number;
  timeSignature: TimeSignature;
  bpm: number;
  keySignature: KeySignature;
  selectedMode: string;
  isLooping: boolean;
  isMetronomeEnabled: boolean;
  loopingRange: [number, number]; // [startBar, endBar] - bar indices (0-based)
  playheadPosition: number; // in beats
  isPlaying: boolean;
  autoScrollEnabled: boolean;
  currentTime: string; // formatted time string
  
  // Selection state for UI reactivity
  selectedNoteIds: string[];
  selectedRegionIds: string[];
  selectedTrackId: string | null;
  
  // Piano roll state
  showPianoRoll: boolean;
  activeRegionId: string | null;
  
  // ChatBox state
  showChatBox: boolean;

  // K.G.One panel state
  showKGOnePanel: boolean;

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
  recordingTargetRegionId: string | null;
  recordingNotes: Array<{ pitch: number; startBeat: number; endBeat: number }>;
  recordingOriginalPlayhead: number;

  // Undo/redo state
  canUndo: boolean;
  canRedo: boolean;
  undoDescription: string | null;
  redoDescription: string | null;
  
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
  toggleLoop: () => void;
  toggleMetronome: () => void;
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
  
  // Piano roll actions
  setShowPianoRoll: (show: boolean) => void;
  setActiveRegionId: (regionId: string | null) => void;
  
  // Project state cleanup
  cleanupProjectState: () => void;
  
  // ChatBox actions
  setShowChatBox: (show: boolean) => void;
  toggleChatBox: () => void;

  // K.G.One panel actions
  toggleKGOnePanel: () => void;

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
let _recordingActiveNotes: Map<number, number> = new Map(); // pitch → region-relative startBeat
let _recordingRegionStartBeat: number = 0;

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
  const initialChatBoxState = configManager.getIsInitialized() 
    ? (configManager.get('chatbox.default_open') as boolean) ?? false
    : false;
  
  // Set up playhead update callback to keep store in sync during playback
  KGCore.instance().setPlayheadUpdateCallback((position: number) => {
    const { bpm, timeSignature } = get();
    set({ 
      playheadPosition: position,
      currentTime: beatsToTimeString(position, bpm, timeSignature)
    });
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
    const regionIds = selectedItems
      .filter(item => item instanceof KGRegion)
      .map(item => item.getId());
      
    set({ selectedNoteIds: noteIds, selectedRegionIds: regionIds });
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
    currentStatus: KGCore.instance().getStatus() || 'Unknown',
    maxBars: currentProject.getMaxBars(),
    barWidthMultiplier: currentProject.getBarWidthMultiplier(),
    timeSignature: currentProject.getTimeSignature(),
    bpm: currentProject.getBpm(),
    keySignature: currentProject.getKeySignature(),
    selectedMode: currentProject.getSelectedMode(),
    isLooping: currentProject.getIsLooping(),
    isMetronomeEnabled: false,
    loopingRange: currentProject.getLoopingRange(),
    playheadPosition: KGCore.instance().getPlayheadPosition(),
    isPlaying: KGCore.instance().getIsPlaying(),
    autoScrollEnabled: true,
    currentTime: beatsToTimeString(KGCore.instance().getPlayheadPosition(), currentProject.getBpm(), currentProject.getTimeSignature()),
    
    // Initial selection state
    selectedNoteIds: [],
    selectedRegionIds: [],
    selectedTrackId: initialSelectedTrackId,
    
    // Initial piano roll state
    showPianoRoll: false,
    activeRegionId: null,
    
    // Initial ChatBox state
    showChatBox: initialChatBoxState,

    // Initial K.G.One panel state
    showKGOnePanel: false,

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
    recordingTargetRegionId: null,
    recordingNotes: [],
    recordingOriginalPlayhead: 0,

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
        // Create and execute the add track command
        const command = new AddTrackCommand();
        KGCore.instance().executeCommand(command);
        
        // Update the store state with a new array reference to trigger re-render
        const project = KGCore.instance().getCurrentProject();
        set({ tracks: [...project.getTracks()] as KGTrack[] });
        
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
        const command = new AddAudioTrackCommand();
        KGCore.instance().executeCommand(command);

        const project = KGCore.instance().getCurrentProject();
        set({ tracks: [...project.getTracks()] as KGTrack[] });

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
        get().setStatus(`Failed to import audio: ${error}`);
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
        set({ tracks: remainingTracks });
        
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
        set({ tracks: [...project.getTracks()] as KGTrack[] });
        
        console.log(`Updated track ${trackId} properties`);
      } catch (error) {
        console.error('Error updating track properties:', error);
        get().setStatus('Failed to update track properties');
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
        set({ tracks: [...project.getTracks()] as KGTrack[] });
        
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
        const { setPlayheadPosition } = get();
        
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

        // Reset playhead to 0 when loading a project
        setPlayheadPosition(0);
        
        // Get project properties
        const maxBars = projectToLoad.getMaxBars();
        const timeSignature = projectToLoad.getTimeSignature();
        const bpm = projectToLoad.getBpm();
        const keySignature = projectToLoad.getKeySignature();
        const tracks = projectToLoad.getTracks();
        
        // Setup audio synths for all tracks
        const audioInterface = KGAudioInterface.instance();
        
        // Clear any existing synths/buses first
        tracks.forEach(track => {
          const trackId = track.getId().toString();
          audioInterface.removeTrackSynth(trackId);
          audioInterface.removeTrackAudioPlayerBus(trackId);
        });

        // Create synths/buses for all tracks (with their stored volumes)
        const projectName = projectToLoad.getName();
        for (const track of tracks) {
          const trackId = track.getId().toString();

          if (track.getCurrentType() === 'KGAudioTrack') {
            // Audio track: create player bus and load audio buffers
            await audioInterface.createTrackAudioPlayerBus(trackId, track.getVolume());

            // Load audio buffers for all regions in this audio track
            const audioTrack = track as KGAudioTrack;
            for (const region of audioTrack.getRegions()) {
              if (region.getCurrentType() === 'KGAudioRegion') {
                const audioRegion = region as KGAudioRegion;
                const audioFileId = audioRegion.getAudioFileId();
                if (audioFileId) {
                  try {
                    const arrayBuffer = await KGAudioFileStorage.loadAudioFile(projectName, audioFileId);
                    const audioContext = Tone.getContext().rawContext as AudioContext;
                    const decoded = await audioContext.decodeAudioData(arrayBuffer);
                    const toneBuffer = new Tone.ToneAudioBuffer();
                    toneBuffer.set(decoded);
                    audioInterface.loadAudioBufferForTrack(trackId, audioFileId, toneBuffer);
                  } catch (err) {
                    console.error(`Failed to load audio file ${audioFileId}:`, err);
                  }
                }
              }
            }
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
          maxBars,
          barWidthMultiplier: projectToLoad.getBarWidthMultiplier(),
          timeSignature,
          bpm,
          keySignature,
          selectedMode: projectToLoad.getSelectedMode(),
          isLooping: projectToLoad.getIsLooping(),
          loopingRange: projectToLoad.getLoopingRange(),
          playheadPosition: 0, // Ensure store state is also updated
          currentTime: beatsToTimeString(0, bpm, timeSignature) // Reset time display
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
        
        // Add a status message
        KGCore.instance().setStatus(`Project "${projectToLoad.getName()}" loaded with audio setup`);
        set({ currentStatus: KGCore.instance().getStatus() || 'Unknown' });
      } catch (error) {
        console.error('Error loading project:', error);
        get().setStatus('Failed to load project');
      }
    },

    setPlayheadPosition: (position: number) => {
      const { bpm, timeSignature } = get();
      KGCore.instance().setPlayheadPosition(position);
      set({ 
        playheadPosition: position,
        currentTime: beatsToTimeString(position, bpm, timeSignature)
      });
    },

    setAutoScrollEnabled: (enabled: boolean) => {
      set({ autoScrollEnabled: enabled });
    },

    startPlaying: async () => {
      await KGCore.instance().startPlaying();
      set({ isPlaying: true, autoScrollEnabled: true });
    },

    stopPlaying: async () => {
      await KGCore.instance().stopPlaying();
      set({ isPlaying: false });
    },

    startRecording: async () => {
      const { activeRegionId, timeSignature, playheadPosition, startPlaying, setPlayheadPosition } = get();

      const project = KGCore.instance().getCurrentProject();
      let targetRegion: KGMidiRegion | null = null;
      for (const track of project.getTracks()) {
        const found = track.getRegions().find(r => r.getId() === activeRegionId);
        if (found instanceof KGMidiRegion) { targetRegion = found; break; }
      }
      if (!targetRegion) return;

      _recordingRegionStartBeat = targetRegion.getStartFromBeat();
      _recordingActiveNotes = new Map();

      set({
        isRecording: true,
        recordingNotes: [],
        recordingTargetRegionId: activeRegionId,
        recordingOriginalPlayhead: playheadPosition,
      });

      const buildCorrectedBeat = (): number => {
        const bpm = get().bpm;
        const playbackDelaySec = (ConfigManager.instance().get('audio.playback_delay') as number) ?? 0.2;
        const recordingOffsetSec = (ConfigManager.instance().get('audio.recording_offset') as number) ?? 0;
        const correctionBeats = (playbackDelaySec + recordingOffsetSec) * (bpm / 60);
        return KGAudioInterface.instance().getTransportPosition() - correctionBeats - _recordingRegionStartBeat;
      };

      KGMidiInput.instance().setRecordingCallbacks(
        (pitch: number) => {
          const beat = buildCorrectedBeat();
          _recordingActiveNotes.set(pitch, beat);
        },
        (pitch: number) => {
          const endBeat = buildCorrectedBeat();
          const startBeat = _recordingActiveNotes.get(pitch);
          if (startBeat !== undefined) {
            _recordingActiveNotes.delete(pitch);
            set(state => ({
              recordingNotes: [...state.recordingNotes, { pitch, startBeat, endBeat }],
            }));
          }
        }
      );

      setPlayheadPosition(playheadPosition - timeSignature.numerator);
      await startPlaying();
    },

    stopRecording: async () => {
      const { recordingNotes, recordingTargetRegionId, recordingOriginalPlayhead, stopPlaying, setPlayheadPosition, refreshProjectState } = get();

      // Finalize any held keys
      const finalNotes = [...recordingNotes];
      const bpm = get().bpm;
      const playbackDelaySec = (ConfigManager.instance().get('audio.playback_delay') as number) ?? 0.2;
      const recordingOffsetSec = (ConfigManager.instance().get('audio.recording_offset') as number) ?? 0;
      const correctionBeats = (playbackDelaySec + recordingOffsetSec) * (bpm / 60);
      const endBeatForHeld = KGAudioInterface.instance().getTransportPosition() - correctionBeats - _recordingRegionStartBeat;

      _recordingActiveNotes.forEach((startBeat, pitch) => {
        finalNotes.push({ pitch, startBeat, endBeat: endBeatForHeld });
      });
      _recordingActiveNotes.clear();

      KGMidiInput.instance().setRecordingCallbacks(null, null);

      if (finalNotes.length > 0 && recordingTargetRegionId) {
        const noteData: NoteCreationData[] = finalNotes.map(n => ({
          regionId: recordingTargetRegionId,
          startBeat: n.startBeat,
          endBeat: n.endBeat,
          pitch: n.pitch,
          velocity: 127,
        }));
        const command = new CreateNotesCommand(noteData);
        KGCore.instance().executeCommand(command);
        refreshProjectState();
      }

      await stopPlaying();
      setPlayheadPosition(recordingOriginalPlayhead);
      set({ isRecording: false, recordingNotes: [], recordingTargetRegionId: null });
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

    setBpm: (bpm: number) => {
      try {
        // Create and execute the change project property command
        const command = new ChangeProjectPropertyCommand({ bpm });
        KGCore.instance().executeCommand(command);
        
        // Update the store state
        set({ bpm });
        
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
        
        // Update the store state
        set({ maxBars });
        // Sync CSS var so layout adjusts immediately
        updateMaxBarsCSS(maxBars);
        
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
    
    // Piano roll actions
    setShowPianoRoll: (show: boolean) => {
      set({ showPianoRoll: show });
    },
    
    setActiveRegionId: (regionId: string | null) => {
      set({ activeRegionId: regionId });
    },
    
    // Project state cleanup - used when starting new/loading projects
    cleanupProjectState: () => {
      // Close piano roll if it's visible
      set({ showPianoRoll: false });
      
      // Clear active region
      set({ activeRegionId: null });
      
      // Clear any selected items
      KGCore.instance().clearSelectedItems();
      // Note: syncSelectionFromCore will be called automatically via callback
      
      console.log("Cleaned up project state: closed piano roll, cleared active region, cleared selections");
    },
    
    // ChatBox action implementations
    setShowChatBox: (show: boolean) => {
      set({ showChatBox: show });
    },
    
    toggleChatBox: () => {
      const { showChatBox } = get();
      set({ showChatBox: !showChatBox, showKGOnePanel: false });
    },

    toggleKGOnePanel: () => {
      const { showKGOnePanel } = get();
      set({ showKGOnePanel: !showKGOnePanel, showChatBox: false });
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
      set({ showSettings: show });
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
        KGCore.instance().executeCommand(command);
        
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
        KGCore.instance().executeCommand(command);
        
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
        console.log('Undo completed');
      }
    },
    
    redo: () => {
      const core = KGCore.instance();
      if (core.redo()) {
        // Use centralized refresh method
        get().refreshProjectState();
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
        maxBars: project.getMaxBars(),
        barWidthMultiplier: project.getBarWidthMultiplier(),
        timeSignature: project.getTimeSignature(),
        bpm: project.getBpm(),
        keySignature: project.getKeySignature(),
        selectedMode: project.getSelectedMode()
      });

      // Sync CSS variables that affect layout
      updateTimeSignatureCSS(project.getTimeSignature());
      updateMaxBarsCSS(project.getMaxBars());
      updateBarWidthMultiplierCSS(project.getBarWidthMultiplier());

      // Sync all related state
      const actions = get();
      actions.syncUndoRedoState();
      actions.syncSelectionFromCore();
    },
    
    // Initialize store with configuration values
    initializeFromConfig: async () => {
      const configManager = ConfigManager.instance();
      if (configManager.getIsInitialized()) {
        const defaultChatBoxOpen = (configManager.get('chatbox.default_open') as boolean) ?? false;
        set({ showChatBox: defaultChatBoxOpen });
      }
    }
  }
}); 








