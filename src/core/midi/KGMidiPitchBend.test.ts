import { describe, expect, it } from 'vitest';
import { KGMidiPitchBend } from './KGMidiPitchBend';

describe('KGMidiPitchBend', () => {
  it('stores beat and raw pitch bend value', () => {
    const event = new KGMidiPitchBend('bend-1', 1.5, 4096);

    expect(event.getId()).toBe('bend-1');
    expect(event.getBeat()).toBe(1.5);
    expect(event.getValue()).toBe(4096);
    expect(event.getCurrentType()).toBe('KGMidiPitchBend');
  });

  it('supports selection state', () => {
    const event = new KGMidiPitchBend('bend-1', 0, 8192);

    expect(event.isSelected()).toBe(false);
    event.select();
    expect(event.isSelected()).toBe(true);
    event.deselect();
    expect(event.isSelected()).toBe(false);
  });
});
