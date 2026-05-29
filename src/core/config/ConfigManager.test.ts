import { describe, expect, it } from 'vitest';
import { enforceDefaultHotkeysForAppConfig } from './ConfigManager';

const baseConfig = {
  general: {} as never,
  hotkeys: {
    main: {} as never,
    piano_roll: {
      switch: 'g',
      switch_voicing: 'shift+tab',
      select: 'q',
      pencil: 'w',
      hold_to_create_note: 'ctrl',
      snap_none: '1',
      snap_1_4: '2',
      snap_1_8: '3',
      snap_1_16: '4',
      qua_pos_1_4: '5',
      qua_pos_1_8: '6',
      qua_pos_1_16: '7',
      qua_len_1_4: '8',
      qua_len_1_8: '9',
      qua_len_1_16: '0',
    },
  },
  editor: {} as never,
  chatbox: {} as never,
  audio: {} as never,
  templates: {} as never,
  chord_guide: {} as never,
};

describe('enforceDefaultHotkeysForAppConfig', () => {
  it('always replaces saved hotkeys with config defaults', () => {
    const result = enforceDefaultHotkeysForAppConfig(
      {
        ...baseConfig,
        hotkeys: {
          ...baseConfig.hotkeys,
          piano_roll: {
            ...baseConfig.hotkeys.piano_roll,
            switch: 'tab',
            switch_voicing: 'f',
          },
        },
      } as never,
      baseConfig as never
    );

    expect(result.hotkeys.main).toBe(baseConfig.hotkeys.main);
    expect(result.hotkeys.piano_roll.switch).toBe('g');
    expect(result.hotkeys.piano_roll.switch_voicing).toBe('shift+tab');
  });
});
