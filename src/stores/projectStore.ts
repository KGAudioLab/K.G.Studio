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
import { AddTrackCommand, RemoveTrackCommand, ReorderTracksCommand, UpdateTrackCommand, type TrackUpdateProperties, PasteRegionsCommand, PasteNotesCommand, ChangeProjectPropertyCommand } from '../core/commands';
import { ConfigManager } from '../core/config/ConfigManager';
import { upgradeProjectToLatest } from '../core/project-upgrader/KGProjectUpgrader';
import { toggleLoop } from '../util/loopUtil';

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

// Define the store state interface
interface ProjectState {
  // State
  projectName: string;
  tracks: KGTrack[];
  currentStatus: string;
  maxBars: number;
  timeSignature: TimeSignature;
  bpm: number;
  keySignature: KeySignature;
  selectedMode: string;
  isLooping: boolean;
  loopingRange: [number, number]; // [startBar, endBar] - bar indices (0-based)
  playheadPosition: number; // in beats
  isPlaying: boolean;
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

  // Instrument selection panel state
  showInstrumentSelection: boolean;
  // instrumentSelectionTrackId removed; panel now follows selectedTrackId
  
  // Settings state
  showSettings: boolean;
  
  // Undo/redo state
  canUndo: boolean;
  canRedo: boolean;
  undoDescription: string | null;
  redoDescription: string | null;
  
  // Actions
  setProjectName: (name: string) => void;
  addTrack: () => Promise<void>;
  removeTrack: (id: number) => Promise<void>;
  updateTrack: (track: KGTrack) => Promise<void>;
  updateTrackProperties: (trackId: number, properties: TrackUpdateProperties) => Promise<void>;
  setTrackInstrument: (trackId: number, instrument: InstrumentType) => Promise<void>;
  reorderTracks: (sourceIndex: number, destinationIndex: number) => void;
  setStatus: (status: string) => void;
  removeStatus: () => void;
  refreshStatus: () => void;
  loadProject: (project: KGProject | null) => Promise<void>;
  setPlayheadPosition: (position: number) => void;
  startPlaying: () => Promise<void>;
  stopPlaying: () => Promise<void>;
  toggleLoop: () => void;
  setBpm: (bpm: number) => void;
  setMaxBars: (maxBars: number) => void;
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
  
  // Initialization actions
  initializeFromConfig: () => Promise<void>;
}

// Create the store
export const useProjectStore = create<ProjectState>((set, get) => {
  const currentProject = KGCore.instance().getCurrentProject();
  
  // Initialize CSS variable for time signature on store creation
  updateTimeSignatureCSS(currentProject.getTimeSignature());
  // Initialize CSS variable for max bars on store creation
  updateMaxBarsCSS(currentProject.getMaxBars());
  
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
    tracks: currentProject.getTracks() as KGTrack[],
    currentStatus: KGCore.instance().getStatus() || 'Unknown',
    maxBars: currentProject.getMaxBars(),
    timeSignature: currentProject.getTimeSignature(),
    bpm: currentProject.getBpm(),
    keySignature: currentProject.getKeySignature(),
    selectedMode: currentProject.getSelectedMode(),
    isLooping: currentProject.getIsLooping(),
    loopingRange: currentProject.getLoopingRange(),
    playheadPosition: KGCore.instance().getPlayheadPosition(),
    isPlaying: KGCore.instance().getIsPlaying(),
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

    // Initial Instrument Selection panel state
    showInstrumentSelection: initialShowInstrumentSelection,
    
    // Initial Settings state
    showSettings: false,
    
    // Initial undo/redo state
    canUndo: false,
    canRedo: false,
    undoDescription: null,
    redoDescription: null,
    
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
    
    loadProject: async (project: KGProject | null = null) => {
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
        
        // Clear any existing synths first
        tracks.forEach(track => {
          audioInterface.removeTrackSynth(track.getId().toString());
        });
        
        // Create synths for all tracks (with their stored volumes)
        tracks.forEach(track => {
          const trackId = track.getId().toString();
          // Get instrument from track model if it's a MIDI track
          let instrument: InstrumentType = 'acoustic_grand_piano'; // Default fallback
          if (track.getCurrentType() === 'KGMidiTrack' && 'getInstrument' in track) {
            instrument = (track as KGMidiTrack).getInstrument();
          }
          audioInterface.createTrackSynth(trackId, instrument);
          // Volume is applied during bus creation; ensure sync if bus already existed
          audioInterface.setTrackVolume(trackId, track.getVolume());
        });
        
        // Update CSS variable for time signature numerator
        updateTimeSignatureCSS(timeSignature);
        // Update CSS variable for max bars
        updateMaxBarsCSS(maxBars);
        
        // Log project loading info
        console.log(`Project max bars: ${maxBars}`);
        console.log(`Setup audio synths for ${tracks.length} tracks`);
        
        // Update the store state to reflect the loaded project
        // Force a new array reference for tracks to trigger React/Zustand re-render
        set({
          projectName: projectToLoad.getName(),
          tracks: [...tracks],
          maxBars,
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

    startPlaying: async () => {
      await KGCore.instance().startPlaying();
      set({ isPlaying: true });
    },

    stopPlaying: async () => {
      await KGCore.instance().stopPlaying();
      set({ isPlaying: false });
    },

    toggleLoop: () => {
      const { isLooping, loopingRange, maxBars } = get();
      toggleLoop(isLooping, loopingRange, maxBars);
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
      set({ showChatBox: !showChatBox });
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
        timeSignature: project.getTimeSignature(),
        bpm: project.getBpm(),
        keySignature: project.getKeySignature(),
        selectedMode: project.getSelectedMode()
      });
      
      // Sync CSS variables that affect layout
      updateTimeSignatureCSS(project.getTimeSignature());
      updateMaxBarsCSS(project.getMaxBars());

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








