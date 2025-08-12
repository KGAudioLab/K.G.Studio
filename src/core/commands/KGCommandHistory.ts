import { KGCommand } from './KGCommand';
import { DEBUG_MODE } from '../../constants';

/**
 * Manages the command history for undo/redo functionality
 * Implements a singleton pattern to ensure single source of truth
 */
export class KGCommandHistory {
  private static _instance: KGCommandHistory | null = null;

  private undoStack: KGCommand[] = [];
  private redoStack: KGCommand[] = [];
  private maxHistorySize: number = 30;
  
  // Callbacks for UI updates
  private onHistoryChanged?: () => void;

  private constructor() {
    // Private constructor for singleton pattern
  }

  /**
   * Get the singleton instance
   */
  public static instance(): KGCommandHistory {
    if (!this._instance) {
      this._instance = new KGCommandHistory();
    }
    return this._instance;
  }

  /**
   * Execute a command and add it to the history
   * @param command The command to execute
   */
  public executeCommand(command: KGCommand): void {
    try {
      // Execute the command
      command.execute();

      // Check if we can merge with the last command
      if (this.undoStack.length > 0) {
        const lastCommand = this.undoStack[this.undoStack.length - 1];
        if (lastCommand.canMergeWith(command)) {
          const mergedCommand = lastCommand.mergeWith(command);
          if (mergedCommand) {
            // Replace the last command with the merged one
            this.undoStack[this.undoStack.length - 1] = mergedCommand;
            
            if (DEBUG_MODE.CORE) {
              console.log(`Merged command: ${mergedCommand.getDescription()}`);
            }
            
            this.notifyHistoryChanged();
            return;
          }
        }
      }

      // Add to undo stack
      this.undoStack.push(command);

      // Clear redo stack since we're executing a new command
      this.redoStack = [];

      // Maintain history size limit
      if (this.undoStack.length > this.maxHistorySize) {
        this.undoStack.shift();
      }

      if (DEBUG_MODE.CORE) {
        console.log(`Executed command: ${command.getDescription()}`);
        console.log(`Undo stack size: ${this.undoStack.length}`);
      }

      this.notifyHistoryChanged();
    } catch (error) {
      console.error('Failed to execute command:', error);
      // Don't add failed commands to history
    }
  }

  /**
   * Undo the last command
   * @returns true if undo was successful, false otherwise
   */
  public undo(): boolean {
    if (this.undoStack.length === 0) {
      return false;
    }

    const command = this.undoStack.pop()!;
    
    try {
      command.undo();
      this.redoStack.push(command);

      if (DEBUG_MODE.CORE) {
        console.log(`Undid command: ${command.getDescription()}`);
        console.log(`Undo stack size: ${this.undoStack.length}, Redo stack size: ${this.redoStack.length}`);
      }

      this.notifyHistoryChanged();
      return true;
    } catch (error) {
      console.error('Failed to undo command:', error);
      // Put the command back on the stack if undo fails
      this.undoStack.push(command);
      return false;
    }
  }

  /**
   * Redo the last undone command
   * @returns true if redo was successful, false otherwise
   */
  public redo(): boolean {
    if (this.redoStack.length === 0) {
      return false;
    }

    const command = this.redoStack.pop()!;
    
    try {
      command.execute();
      this.undoStack.push(command);

      if (DEBUG_MODE.CORE) {
        console.log(`Redid command: ${command.getDescription()}`);
        console.log(`Undo stack size: ${this.undoStack.length}, Redo stack size: ${this.redoStack.length}`);
      }

      this.notifyHistoryChanged();
      return true;
    } catch (error) {
      console.error('Failed to redo command:', error);
      // Put the command back on the redo stack if redo fails
      this.redoStack.push(command);
      return false;
    }
  }

  /**
   * Check if undo is available
   */
  public canUndo(): boolean {
    return this.undoStack.length > 0;
  }

  /**
   * Check if redo is available
   */
  public canRedo(): boolean {
    return this.redoStack.length > 0;
  }

  /**
   * Get description of the next command that would be undone
   */
  public getUndoDescription(): string | null {
    if (this.undoStack.length === 0) {
      return null;
    }
    return this.undoStack[this.undoStack.length - 1].getDescription();
  }

  /**
   * Get description of the next command that would be redone
   */
  public getRedoDescription(): string | null {
    if (this.redoStack.length === 0) {
      return null;
    }
    return this.redoStack[this.redoStack.length - 1].getDescription();
  }

  /**
   * Clear all command history
   */
  public clear(): void {
    this.undoStack = [];
    this.redoStack = [];
    
    if (DEBUG_MODE.CORE) {
      console.log('Cleared command history');
    }

    this.notifyHistoryChanged();
  }

  /**
   * Set the maximum number of commands to keep in history
   * @param size Maximum history size (default: 30)
   */
  public setMaxHistorySize(size: number): void {
    this.maxHistorySize = Math.max(1, size);
    
    // Trim history if needed
    while (this.undoStack.length > this.maxHistorySize) {
      this.undoStack.shift();
    }
    
    this.notifyHistoryChanged();
  }

  /**
   * Get current history size limit
   */
  public getMaxHistorySize(): number {
    return this.maxHistorySize;
  }

  /**
   * Set callback for when history changes (for UI updates)
   */
  public setOnHistoryChanged(callback: () => void): void {
    this.onHistoryChanged = callback;
  }

  /**
   * Get current history statistics for debugging
   */
  public getHistoryStats(): { undoCount: number; redoCount: number; maxSize: number } {
    return {
      undoCount: this.undoStack.length,
      redoCount: this.redoStack.length,
      maxSize: this.maxHistorySize
    };
  }

  /**
   * Notify listeners that history has changed
   */
  private notifyHistoryChanged(): void {
    if (this.onHistoryChanged) {
      this.onHistoryChanged();
    }
  }
}