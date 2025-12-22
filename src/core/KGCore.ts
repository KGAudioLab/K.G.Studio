import type { Selectable } from '../components/interfaces';
import { KGProject } from './KGProject';
import { PLAYING_CONSTANTS } from '../constants/uiConstants';
import { KGAudioInterface } from './audio-interface/KGAudioInterface';
import { ConfigManager } from './config/ConfigManager';
import { KGMidiRegion } from './region/KGMidiRegion';
import { KGMidiNote } from './midi/KGMidiNote';
import { KGRegion } from './region/KGRegion';
import { generateUniqueId } from '../util/miscUtil';
import { KGCommand, KGCommandHistory } from './commands';

/**
 * KGCore - Main application class for the DAW
 * Implements the singleton pattern for global access
 */
export class KGCore {
  // Private static instance for singleton pattern
  private static _instance: KGCore | null = null;

  // Global music data resources
  public static ORIGINAL_FUNCTIONAL_CHORDS_DATA: Record<string, { name: string; steps: number[]; T: string[]; S: string[]; D: string[]; chords: Record<string, string[]> }> = {}; // Original functional chords loaded from functional_chords.json
  public static FUNCTIONAL_CHORDS_DATA: Record<string, { name: string; steps: number[]; T: string[]; S: string[]; D: string[]; chords: Record<string, string[]> }> = {}; // Active functional chords (either original or custom from user settings)

  private currentProject: KGProject = new KGProject();

  private status: string = "Ready";

  private playheadPosition: number = 0;  // in beats

  private selectedItems: Selectable[] = [];
  private copiedItems: Selectable[] = [];

  private isPlaying: boolean = false;

  // Timer management for playback
  private playbackIntervalId: number | null = null;
  private playbackStartTime: number = 0;
  private playbackStartPosition: number = 0;
  
  // Callback for external state updates (e.g., store)
  private playheadUpdateCallback: ((position: number) => void) | null = null;
  private playbackStateChangeCallback: ((isPlaying: boolean) => void) | null = null;

  // Selection change callbacks for store synchronization
  private selectionChangeCallbacks: (() => void)[] = [];

  // Command history for undo/redo functionality
  private commandHistory: KGCommandHistory = KGCommandHistory.instance();

  // Private constructor to prevent direct instantiation
  private constructor() {
    console.log("KGCore initialized");
    // Initialize core components here
  }
  
  /**
   * Get the singleton instance of KGCore
   * Creates the instance if it doesn't exist yet
   */
  public static instance(): KGCore {
    if (!KGCore._instance) {
      KGCore._instance = new KGCore();
    }
    return KGCore._instance;
  }
  
  /**
   * Initialize the audio engine and core components
   */
  public async initialize(): Promise<void> {
    try {
      // Initialize configuration manager
      const configManager = ConfigManager.instance();
      await configManager.initialize();
      
      // Initialize audio interface
      const audioInterface = KGAudioInterface.instance();
      await audioInterface.initialize();
      
      console.log("KGCore components initialized successfully");
    } catch (error) {
      console.error("Failed to initialize KGCore:", error);
      throw error;
    }
  }
  
  /**
   * Clean up resources when application is closed
   */
  public async dispose(): Promise<void> {
    try {
      // Stop playback if playing
      if (this.isPlaying) {
        await this.stopPlaying();
      }

      // Dispose audio interface
      const audioInterface = KGAudioInterface.instance();
      await audioInterface.dispose();

      // Dispose MIDI input (dynamic import to avoid circular dependency)
      const { KGMidiInput } = await import('./midi-input/KGMidiInput');
      const midiInput = KGMidiInput.instance();
      await midiInput.dispose();

      // Dispose config manager
      const configManager = ConfigManager.instance();
      await configManager.dispose();

      // Clear playback timer
      this.stopPlaybackUpdates();

      console.log("KGCore resources disposed successfully");
    } catch (error) {
      console.error("Error disposing KGCore resources:", error);
    }
  }
  
  // Add more core functionality methods here
  public getCurrentProject(): KGProject {
    return this.currentProject;
  }

  public setCurrentProject(project: KGProject): void {
    this.currentProject = project;
    
    // Sync project settings with audio interface
    try {
      const audioInterface = KGAudioInterface.instance();
      if (audioInterface.getIsInitialized()) {
        audioInterface.setBpm(project.getBpm());
      }
    } catch (error) {
      console.error('Error syncing project with audio interface:', error);
    }
  }

  public setStatus(status: string): void {
    this.status = status;
  }

  public getStatus(): string {
    return this.status;
  }

  public getPlayheadPosition(): number {
    return this.playheadPosition;
  }

  public setPlayheadPosition(position: number): void {
    this.playheadPosition = position;
    
    // Sync with audio interface transport if not playing
    // (During playback, audio interface controls transport position)
    if (!this.isPlaying) {
      try {
        const audioInterface = KGAudioInterface.instance();
        if (audioInterface.getIsInitialized()) {
          audioInterface.setTransportPosition(position);
        }
      } catch (error) {
        console.error('Error syncing playhead position with audio interface:', error);
      }
    }
    
    // Notify external listeners if callback is set
    if (this.playheadUpdateCallback) {
      this.playheadUpdateCallback(position);
    }
  }

  // Method to set external update callback
  public setPlayheadUpdateCallback(callback: (position: number) => void): void {
    this.playheadUpdateCallback = callback;
  }

  // Method to set external playback state change callback
  public setPlaybackStateChangeCallback(callback: (isPlaying: boolean) => void): void {
    this.playbackStateChangeCallback = callback;
  }

  // Selection change callback management
  public onSelectionChanged(callback: () => void): void {
    this.selectionChangeCallbacks.push(callback);
  }

  public removeSelectionChangeCallback(callback: () => void): void {
    const index = this.selectionChangeCallbacks.indexOf(callback);
    if (index > -1) {
      this.selectionChangeCallbacks.splice(index, 1);
    }
  }

  private notifySelectionChanged(): void {
    this.selectionChangeCallbacks.forEach(callback => callback());
  }

  // play 
  public getIsPlaying(): boolean {
    return this.isPlaying;
  }

  public async preparePlay(): Promise<void> {
    try {
      const audioInterface = KGAudioInterface.instance();
      
      // Ensure audio context is started (required for Web Audio)
      await audioInterface.startAudioContext();
      
      // Prepare playback with current project and playhead position
      audioInterface.preparePlayback(this.currentProject, this.playheadPosition);
      
      // Sync BPM and transport settings
      audioInterface.setBpm(this.currentProject.getBpm());
      audioInterface.setTransportPosition(this.playheadPosition);
      
      console.log("Playback prepared successfully");
    } catch (error) {
      console.error("Failed to prepare playback:", error);
      throw error;
    }
  }

  public async play(): Promise<void> {
    try {
      const audioInterface = KGAudioInterface.instance();
      
      // Start audio playback
      audioInterface.startPlayback();
      
      // Update local state
      this.isPlaying = true;
      if (this.playbackStateChangeCallback) {
        this.playbackStateChangeCallback(true);
      }
      
      console.log("Audio playback started successfully");
    } catch (error) {
      console.error("Failed to start playback:", error);
      this.isPlaying = false;
      if (this.playbackStateChangeCallback) {
        this.playbackStateChangeCallback(false);
      }
      throw error;
    }
  }

  public async stop(): Promise<void> {
    try {
      const audioInterface = KGAudioInterface.instance();
      
      // Stop audio playback
      audioInterface.stopPlayback();
      
      // Update local state
      this.isPlaying = false;
      if (this.playbackStateChangeCallback) {
        this.playbackStateChangeCallback(false);
      }
      
      console.log("Audio playback stopped successfully");
    } catch (error) {
      console.error("Failed to stop playback:", error);
      // Still update state even if stop fails
      this.isPlaying = false;
      if (this.playbackStateChangeCallback) {
        this.playbackStateChangeCallback(false);
      }
    }
  }

  // High-level playback control methods
  public async startPlaying(): Promise<void> {
    // Prepare playback first
    await this.preparePlay();
    
    // Start playing (non-blocking)
    this.play(); // Don't await this
    
    // Set up the regular playback update timer
    this.playbackStartTime = performance.now();
    this.playbackStartPosition = this.playheadPosition;
    
    this.startPlaybackUpdates();

  }

  public async stopPlaying(): Promise<void> {
    // Stop the timer first
    this.stopPlaybackUpdates();
    
    // Stop playback (wait for completion)
    await this.stop();
  }

  // Timer management for regular playback updates
  private startPlaybackUpdates(): void {
    if (this.playbackIntervalId !== null) {
      this.stopPlaybackUpdates(); // Clear any existing timer
    }
    
    this.playbackIntervalId = window.setInterval(() => {
      this.onPlaybackUpdate();
    }, PLAYING_CONSTANTS.UPDATE_INTERVAL_MS);
  }

  private stopPlaybackUpdates(): void {
    if (this.playbackIntervalId !== null) {
      clearInterval(this.playbackIntervalId);
      this.playbackIntervalId = null;
    }
  }

  // Regular playback update callback - more generic name as requested
  private onPlaybackUpdate(): void {
    if (!this.isPlaying) {
      this.stopPlaybackUpdates();
      return;
    }

    // Calculate current playhead position based on elapsed time
    const elapsedMs = performance.now() - this.playbackStartTime;

    // Get playback delay from config
    const configManager = ConfigManager.instance();
    const playbackDelaySeconds = (configManager.get('audio.playback_delay') as number) ?? 0.2;
    const playbackDelayMs = playbackDelaySeconds * 1000;

    // Subtract the delay from elapsed time for visual sync
    // During the initial delay period, playhead stays at start position
    const adjustedElapsedMs = Math.max(0, elapsedMs - playbackDelayMs);

    const bpm = this.currentProject.getBpm();
    const beatsPerMs = bpm / (60 * 1000);
    const newPosition = this.playbackStartPosition + (adjustedElapsedMs * beatsPerMs);
    
    // Stop playback at the end of project (maxBars)
    const maxBars = this.currentProject.getMaxBars();
    const beatsPerBar = this.currentProject.getTimeSignature().numerator;
    const maxBeats = maxBars * beatsPerBar;
    if (newPosition >= maxBeats) {
      // Clamp to max and stop
      this.setPlayheadPosition(maxBeats);
      // Stop playback (non-blocking)
      this.stopPlaying();
      return;
    }
    
    // Update playhead position
    this.setPlayheadPosition(newPosition);
    
    // TODO: Future enhancements
    // - Sync with Tone.Transport position for more accurate timing
    // - Handle tempo changes mid-playback
    // - Account for latency compensation
    // - Support for loop regions
  }

  // selected items
  public getSelectedItems(): Selectable[] {
    return this.selectedItems;
  }

  public addSelectedItem(item: Selectable): void {
    this.selectedItems.push(item);
    this.notifySelectionChanged();
  }

  public addSelectedItems(items: Selectable[]): void {
    this.selectedItems.push(...items);
    this.notifySelectionChanged();
  }

  public removeSelectedItem(item: Selectable): void {
    this.selectedItems = this.selectedItems.filter(i => i.getId() !== item.getId());
    this.notifySelectionChanged();
  }

  public removeSelectedItems(items: Selectable[]): void {
    this.selectedItems = this.selectedItems.filter(i => !items.includes(i));
    this.notifySelectionChanged();
  }

  public clearSelectedItems(): void {
    this.selectedItems = [];
    this.notifySelectionChanged();
  }

  // copied items
  public getCopiedItems(): Selectable[] {
    return this.copiedItems;
  }

  public addCopiedItem(item: Selectable): void {
    this.copiedItems.push(item);
  }

  public addCopiedItems(items: Selectable[]): void {
    this.copiedItems.push(...items);
  }

  public removeCopiedItem(item: Selectable): void {
    this.copiedItems = this.copiedItems.filter(i => i.getId() !== item.getId());
  }
  
  public clearCopiedItems(): void {
    this.copiedItems = [];
  }

  public copySelectedItems(): void {
    // Clear existing copied items
    this.clearCopiedItems();
    
    const selectedItems = this.getSelectedItems();
    
    if (selectedItems.length === 0) {
      return;
    }
    
    // Direct copy using getCurrentType() for type identification
    const clonedItems: Selectable[] = [];
    
    selectedItems.forEach(item => {
      const currentType = item.getCurrentType();
      
      switch (currentType) {
        case 'KGMidiNote': {
          const note = item as KGMidiNote;
          const clonedNote = new KGMidiNote(
            generateUniqueId('KGMidiNote'),
            note.getStartBeat(),
            note.getEndBeat(),
            note.getPitch(),
            note.getVelocity()
          );
          clonedItems.push(clonedNote);
          break;
        }
        
        case 'KGMidiRegion': {
          const region = item as KGMidiRegion;
          const clonedRegion = new KGMidiRegion(
            generateUniqueId('KGMidiRegion'),
            region.getTrackId(),
            region.getTrackIndex(),
            region.getName(),
            region.getStartFromBeat(),
            region.getLength()
          );
          
          // Copy all notes within the region
          const originalNotes = region.getNotes();
          originalNotes.forEach(note => {
            const clonedNote = new KGMidiNote(
              generateUniqueId('KGMidiNote'),
              note.getStartBeat(),
              note.getEndBeat(),
              note.getPitch(),
              note.getVelocity()
            );
            clonedRegion.addNote(clonedNote);
          });
          
          clonedItems.push(clonedRegion);
          break;
        }
        
        case 'KGRegion': {
          const region = item as KGRegion;
          const clonedRegion = new KGRegion(
            generateUniqueId('KGRegion'),
            region.getTrackId(),
            region.getTrackIndex(),
            region.getName(),
            region.getStartFromBeat(),
            region.getLength()
          );
          clonedItems.push(clonedRegion);
          break;
        }
        
        default:
          console.warn(`Unknown item type for copying: ${currentType}`);
          break;
      }
    });
    
    // Add the cloned items to the clipboard
    this.addCopiedItems(clonedItems);
    
    console.log(`Copied ${clonedItems.length} items to clipboard (${selectedItems.map(item => item.getCurrentType()).join(', ')})`);
  }

  // Command system methods for undo/redo functionality

  /**
   * Execute a command through the command history system
   * @param command The command to execute
   */
  public executeCommand(command: KGCommand): void {
    this.commandHistory.executeCommand(command);
  }

  /**
   * Undo the last executed command
   * @returns true if undo was successful, false otherwise
   */
  public undo(): boolean {
    return this.commandHistory.undo();
  }

  /**
   * Redo the last undone command
   * @returns true if redo was successful, false otherwise
   */
  public redo(): boolean {
    return this.commandHistory.redo();
  }

  /**
   * Check if undo operation is available
   */
  public canUndo(): boolean {
    return this.commandHistory.canUndo();
  }

  /**
   * Check if redo operation is available
   */
  public canRedo(): boolean {
    return this.commandHistory.canRedo();
  }

  /**
   * Get description of the next command that would be undone
   */
  public getUndoDescription(): string | null {
    return this.commandHistory.getUndoDescription();
  }

  /**
   * Get description of the next command that would be redone
   */
  public getRedoDescription(): string | null {
    return this.commandHistory.getRedoDescription();
  }

  /**
   * Clear all command history
   */
  public clearCommandHistory(): void {
    this.commandHistory.clear();
  }

  /**
   * Set callback for when command history changes (for UI updates)
   */
  public setOnCommandHistoryChanged(callback: () => void): void {
    this.commandHistory.setOnHistoryChanged(callback);
  }

  /**
   * Get current command history statistics for debugging
   */
  public getCommandHistoryStats(): { undoCount: number; redoCount: number; maxSize: number } {
    return this.commandHistory.getHistoryStats();
  }
} 