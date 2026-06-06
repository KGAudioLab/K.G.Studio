import { describe, expect, it, vi } from 'vitest';
import { ListAllAvailableInstrumentsTool } from './ListAllAvailableInstrumentsTool';
import { listAvailableInstrumentsByGroup } from './toolTargeting';

vi.mock('../../stores/projectStore', () => ({
  useProjectStore: {
    getState: () => ({
      activeRegionId: null,
      selectedRegionIds: [],
      selectedTrackId: null,
    }),
  },
}));

describe('ListAllAvailableInstrumentsTool', () => {
  it('lists instruments grouped by English group name with blank lines between groups', async () => {
    const tool = new ListAllAvailableInstrumentsTool();
    const result = await tool.execute({});

    expect(result.success).toBe(true);
    expect(result.result.startsWith(
      'Group: Piano and Keyboards\n- Acoustic Grand Piano\n- Bright Acoustic Piano',
    )).toBe(true);
    expect(result.result).toContain('\n\nGroup: Guitar\n- Acoustic Guitar (nylon)');
    expect(result.result).toContain('\n\nGroup: Bass\n- Acoustic Bass');
    expect(result.result).toContain('\n\nGroup: Percussion Kit\n- Standard Drum Kit');
    expect(result.result).toContain('\n\nGroup: Synthesizer\n- Lead 1 (square)');
  });

  it('is unavailable in efficient mode', () => {
    const tool = new ListAllAvailableInstrumentsTool();

    expect(tool.isAvailableInEfficientMode()).toBe(false);
  });

  it('returns a simplified UI display message', async () => {
    const tool = new ListAllAvailableInstrumentsTool();
    const result = await tool.execute({});
    const totalInstruments = listAvailableInstrumentsByGroup()
      .reduce((count, group) => count + group.instruments.length, 0);

    expect(tool.buildToolResultDisplayContent({}, result)).toBe(`Listed ${totalInstruments} available instruments.`);
  });
});
