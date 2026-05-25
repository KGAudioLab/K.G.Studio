import { describe, expect, it, vi } from 'vitest';
import { AUDIO_INTERFACE_CONSTANTS } from '../../constants/coreConstants';

vi.mock('../../stores/projectStore', () => ({
  useProjectStore: (selector: (state: {
    selectedTrackAutomationPointIds: string[];
    updateTrack: () => Promise<void>;
    refreshProjectState: () => void;
    bumpTrackAutomationRedrawVersion: () => void;
  }) => unknown) => selector({
    selectedTrackAutomationPointIds: [],
    updateTrack: async () => {},
    refreshProjectState: () => {},
    bumpTrackAutomationRedrawVersion: () => {},
  }),
}));

const __trackAutomationTestUtils = await import('./trackAutomationLaneUtils');

describe('TrackAutomationLane mapping', () => {
  it('maps volume 0.0dB to the visual midpoint and back', () => {
    const laneHeight = 120;
    const middle = __trackAutomationTestUtils.getLaneMetrics(laneHeight).middle;

    expect(__trackAutomationTestUtils.volumeToY(0, laneHeight)).toBe(middle);
    expect(__trackAutomationTestUtils.yToVolume(middle, laneHeight)).toBe(0);
  });

  it('maps the volume bounds to the top and bottom limits', () => {
    const laneHeight = 120;
    const { top, bottom } = __trackAutomationTestUtils.getLaneMetrics(laneHeight);

    expect(__trackAutomationTestUtils.volumeToY(AUDIO_INTERFACE_CONSTANTS.MAX_TRACK_VOLUME_DB, laneHeight)).toBe(top);
    expect(__trackAutomationTestUtils.volumeToY(AUDIO_INTERFACE_CONSTANTS.MIN_TRACK_VOLUME_DB, laneHeight)).toBe(bottom);
  });

  it('maps pan center to a reachable 1-pixel midpoint band', () => {
    const laneHeight = 120;
    const middle = __trackAutomationTestUtils.getLaneMetrics(laneHeight).middle;

    expect(__trackAutomationTestUtils.panToY(0, laneHeight)).toBe(middle);
    expect(__trackAutomationTestUtils.yToPan(middle, laneHeight)).toBe(0);
    expect(__trackAutomationTestUtils.yToPan(middle - 0.5, laneHeight)).toBe(0);
    expect(__trackAutomationTestUtils.yToPan(middle + 0.5, laneHeight)).toBe(0);
  });

  it('formats volume and pan labels with the refined representation', () => {
    expect(__trackAutomationTestUtils.formatAutomationValue('volume', 0)).toBe('+0.0dB');
    expect(__trackAutomationTestUtils.formatAutomationValue('volume', AUDIO_INTERFACE_CONSTANTS.MIN_TRACK_VOLUME_DB)).toBe('−∞');
    expect(__trackAutomationTestUtils.formatAutomationValue('pan', -1)).toBe('-64');
    expect(__trackAutomationTestUtils.formatAutomationValue('pan', 0)).toBe('+0');
    expect(__trackAutomationTestUtils.formatAutomationValue('pan', 1)).toBe('+63');
  });
});
