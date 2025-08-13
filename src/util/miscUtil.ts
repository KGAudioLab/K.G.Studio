/**
 * Miscellaneous utility functions
 */

import { KGCore } from '../core/KGCore';

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

/**
 * Generates a new sequential track name that doesn't conflict with existing tracks
 * @returns A track name in format "Track {number}" where number is the next available sequential number
 * @example generateNewTrackName() -> 'Track 1' (if no tracks exist)
 * @example generateNewTrackName() -> 'Track 3' (if 'Track 1' and 'Track 2' already exist)
 */
export const generateNewTrackName = (): string => {
  const currentProject = KGCore.instance().getCurrentProject();
  const existingTracks = currentProject.getTracks();
  const existingNames = existingTracks.map(track => track.getName());
  
  let i = 1;
  while (true) {
    const candidateName = `Track ${i}`;
    if (!existingNames.includes(candidateName)) {
      return candidateName;
    }
    i++;
  }
};

/**
 * Generates a new sequential region name that doesn't conflict with existing regions on the same track
 * @param trackId - The ID of the track where the region will be created
 * @returns A region name in format "{trackName} Region {number}" where number is the next available sequential number
 * @example generateNewRegionName('1') -> 'Piano Region 1' (if no regions exist on track)
 * @example generateNewRegionName('1') -> 'Piano Region 3' (if 'Piano Region 1' and 'Piano Region 2' already exist)
 */
export const generateNewRegionName = (trackId: string): string => {
  const currentProject = KGCore.instance().getCurrentProject();
  const tracks = currentProject.getTracks();
  const targetTrack = tracks.find(track => track.getId().toString() === trackId);
  
  if (!targetTrack) {
    // Fallback if track not found
    return 'Region 1';
  }
  
  const trackName = targetTrack.getName();
  const existingRegions = targetTrack.getRegions();
  const existingNames = existingRegions.map(region => region.getName());
  
  let i = 1;
  while (true) {
    const candidateName = `${trackName} Region ${i}`;
    if (!existingNames.includes(candidateName)) {
      return candidateName;
    }
    i++;
  }
};