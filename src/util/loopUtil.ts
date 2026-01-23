import { KGCore } from '../core/KGCore';
import { ChangeLoopSettingsCommand } from '../core/commands';

/**
 * Toggle the loop mode on/off with proper validation.
 * When enabling loop mode:
 * - If loop range is [0, 0], sets it to the entire song [0, maxBars]
 * - Validates that loop range is within [0, maxBars]
 * Uses the command pattern for undo/redo support.
 *
 * @param currentIsLooping Current loop mode state
 * @param currentLoopingRange Current loop range [startBar, endBar]
 * @param maxBars Maximum number of bars in the project
 */
export const toggleLoop = (
  currentIsLooping: boolean,
  currentLoopingRange: [number, number],
  maxBars: number
): void => {
  const newLoopingState = !currentIsLooping;
  let newLoopingRange = currentLoopingRange;

  // When enabling loop, validate and set the loop range
  if (newLoopingState) {
    const currentRange = currentLoopingRange;
    const projectMaxBars = maxBars;

    // If range is [0, 0], set it to the entire song
    if (currentRange[0] === 0 && currentRange[1] === 0) {
      newLoopingRange = [0, projectMaxBars] as [number, number];
    } else {
      // Validate range is within [0, maxBars]
      const validatedStart = Math.max(0, Math.min(currentRange[0], projectMaxBars));
      const validatedEnd = Math.max(0, Math.min(currentRange[1], projectMaxBars));

      // If range changed, update it
      if (validatedStart !== currentRange[0] || validatedEnd !== currentRange[1]) {
        newLoopingRange = [validatedStart, validatedEnd] as [number, number];
      }
    }
  }

  // Execute command for undo/redo support
  const command = new ChangeLoopSettingsCommand({
    isLooping: newLoopingState,
    loopingRange: newLoopingRange
  });
  KGCore.instance().executeCommand(command);
};
