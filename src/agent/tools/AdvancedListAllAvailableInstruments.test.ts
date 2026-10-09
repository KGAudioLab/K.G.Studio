import Ajv from 'ajv';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AdvancedListAllAvailableInstruments } from './AdvancedListAllAvailableInstruments';
import { ListAllAvailableInstrumentsTool } from './ListAllAvailableInstrumentsTool';
import { createToolInstance } from './index';
import * as targeting from './toolTargeting';
import { UserInstrumentRegistry } from '../../core/instruments/UserInstrumentRegistry';
import type { UserInstrumentDefinition } from '../../core/instruments/UserInstrumentRegistry';
import {
  ADVANCED_LIST_ALL_AVAILABLE_INSTRUMENTS_RESPONSE_SCHEMA,
  ADVANCED_LIST_ALL_AVAILABLE_INSTRUMENTS_RESPONSE_EXAMPLE,
} from './advancedReaderResponses';

vi.mock('../../stores/projectStore', () => ({ useProjectStore: { getState: () => ({}) } }));

const validate = new Ajv({ allErrors: true }).compile(ADVANCED_LIST_ALL_AVAILABLE_INSTRUMENTS_RESPONSE_SCHEMA);

function custom(displayName: string, enabled: boolean): UserInstrumentDefinition {
  return {
    instrumentId: displayName, displayName, enabled, midiInstrument: 1001,
    image: 'piano.png', pitchRange: [21, 108], percussion: false,
    fallbackInstrument: 'acoustic_grand_piano', samples: {},
  };
}

describe('AdvancedListAllAvailableInstruments', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(UserInstrumentRegistry, 'list').mockReturnValue([]);
  });

  it('preserves the full built-in catalog and ordering, matching the published example', async () => {
    const response = await new AdvancedListAllAvailableInstruments().execute({});
    expect(response).toEqual(ADVANCED_LIST_ALL_AVAILABLE_INSTRUMENTS_RESPONSE_EXAMPLE);
    expect(response.result).toEqual({ groups: targeting.listAvailableInstrumentsByGroup().map(({ groupName, instruments }) => ({ group_name: groupName, instruments })) });
    expect(validate(response), JSON.stringify(validate.errors)).toBe(true);
  });

  it('includes enabled custom names in registry order and excludes disabled names', async () => {
    vi.mocked(UserInstrumentRegistry.list).mockReturnValue([
      custom('Zither Custom', true), custom('Disabled Piano', false), custom('Air Strings', true),
    ]);
    const response = await new AdvancedListAllAvailableInstruments().execute({});
    expect(response.result).toMatchObject({ groups: expect.arrayContaining([
      { group_name: 'Custom Instruments', instruments: ['Zither Custom', 'Air Strings'] },
    ]) });
    expect(JSON.stringify(response)).not.toContain('Disabled Piano');
    expect(validate(response)).toBe(true);
  });

  it('preserves empty groups and counts the returned payload without rereading the catalog', async () => {
    const catalog = vi.spyOn(targeting, 'listAvailableInstrumentsByGroup').mockReturnValue([
      { groupName: 'Piano and Keyboards', instruments: ['Acoustic Grand Piano'] },
      { groupName: 'Custom Instruments', instruments: [] },
    ]);
    const tool = new AdvancedListAllAvailableInstruments();
    const response = await tool.execute({});
    expect(response).toEqual({ success: true, result: { groups: [
      { group_name: 'Piano and Keyboards', instruments: ['Acoustic Grand Piano'] },
      { group_name: 'Custom Instruments', instruments: [] },
    ] } });
    catalog.mockImplementation(() => { throw new Error('Catalog changed'); });
    expect(tool.buildToolResultDisplayContent(null, response)).toBe('Listed 1 available instruments.');
    expect(catalog).toHaveBeenCalledTimes(1);
    expect(validate(response)).toBe(true);
    expect(tool.buildToolResultDisplayContent(null, { success: true, result: { groups: [] } })).toBe('Listed 0 available instruments.');
  });

  it('preserves string errors and leaves error rendering to the framework', async () => {
    vi.spyOn(UserInstrumentRegistry, 'listEnabled').mockImplementation(() => { throw new Error('Instrument registry unavailable'); });
    const tool = new AdvancedListAllAvailableInstruments();
    const response = await tool.execute({});
    expect(response).toEqual({ success: false, result: 'Failed to list available instruments: Error: Instrument registry unavailable' });
    expect(validate(response)).toBe(true);
    expect(tool.buildToolResultDisplayContent(null, response)).toBeUndefined();
  });

  it('uses the new class only in Advanced mode and preserves legacy output and availability', async () => {
    const advanced = createToolInstance('list_all_available_instruments', 'advanced')!;
    expect(advanced).toBeInstanceOf(AdvancedListAllAvailableInstruments);
    expect(advanced.isAvailableInAdvancedMode()).toBe(true);
    expect(advanced.isAvailableInRegularMode()).toBe(false);
    expect(advanced.isAvailableInEfficientMode()).toBe(false);
    expect(advanced.getDefinition().function.parameters).toEqual({ type: 'object', properties: {} });
    const legacy = new ListAllAvailableInstrumentsTool();
    for (const mode of ['regular', 'efficient'] as const) {
      const tool = createToolInstance('list_all_available_instruments', mode)!;
      expect(tool).toBeInstanceOf(ListAllAvailableInstrumentsTool);
      expect(tool.getDefinition()).toEqual(legacy.getDefinition());
      expect(await tool.execute({})).toEqual(await legacy.execute({}));
      expect(tool.isAvailableInRegularMode()).toBe(true);
      expect(tool.isAvailableInEfficientMode()).toBe(false);
    }
  });
});
