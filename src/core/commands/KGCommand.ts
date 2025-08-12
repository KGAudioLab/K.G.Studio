/**
 * Base command interface for the command pattern implementation
 * All undoable operations in KGSP should extend this class
 */
export abstract class KGCommand {
  /**
   * Execute the command (perform the operation)
   */
  abstract execute(): void;

  /**
   * Undo the command (reverse the operation)
   */
  abstract undo(): void;

  /**
   * Get a human-readable description of what the command does
   * Used for UI feedback and debugging
   */
  abstract getDescription(): string;

  /**
   * Check if this command can be merged with another command
   * Used for continuous operations like dragging or resizing
   * @param other The other command to potentially merge with
   */
  canMergeWith(other: KGCommand): boolean {
    return false; // Default: commands cannot be merged
  }

  /**
   * Merge this command with another command
   * Only called if canMergeWith returns true
   * @param other The other command to merge with
   * @returns A new merged command, or null if merge fails
   */
  mergeWith(other: KGCommand): KGCommand | null {
    return null; // Default: no merging implemented
  }

  /**
   * Get the timestamp when this command was created
   * Used for command history management
   */
  public readonly timestamp: number = Date.now();
}