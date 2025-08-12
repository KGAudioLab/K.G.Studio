/**
 * Miscellaneous utility functions
 */

/**
 * Generates a unique ID with a consistent format
 * @param prefix - The prefix for the ID (typically class name like 'KGMidiNote')
 * @returns A unique ID in format: prefix_timestamp_randomString
 * @example generateUniqueId('KGMidiNote') -> 'KGMidiNote_1642123456789_abc123def'
 */
export const generateUniqueId = (prefix: string): string => {
  const timestamp = Date.now();
  const randomString = Math.random().toString(36).substring(2, 11); // 9 character random string
  return `${prefix}_${timestamp}_${randomString}`;
};