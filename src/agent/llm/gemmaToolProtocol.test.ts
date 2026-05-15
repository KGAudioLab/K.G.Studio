import { describe, expect, it } from 'vitest';
import { parseToolCalls } from './gemmaToolProtocol';

describe('parseToolCalls', () => {
  it('parses nested object arguments emitted by Gemma tool calling', () => {
    const text = '<|tool_call>call:add_notes{notes:[{pitch:<|"|>C4<|"|>,meta:{velocity:90,length:1.5}}],replaceExisting:false}<tool_call|>';

    const parsed = parseToolCalls(text);

    expect(parsed).toHaveLength(1);
    expect(parsed[0].name).toBe('add_notes');
    expect(parsed[0].args).toEqual({
      notes: [
        {
          pitch: 'C4',
          meta: {
            velocity: 90,
            length: 1.5,
          },
        },
      ],
      replaceExisting: false,
    });
  });
});
