import { describe, expect, it } from 'vitest';
import { KGMidiControllerEvent } from './KGMidiControllerEvent';

describe('KGMidiControllerEvent', () => {
  it('stores an integer tick and raw controller value', () => {
    const event = new KGMidiControllerEvent('cc-1', 1.5, 64);

    expect(event.getId()).toBe('cc-1');
    expect(event.getTick()).toBe(2);
    expect(event.getValue()).toBe(64);
    expect(event.getCurrentType()).toBe('KGMidiControllerEvent');
  });

  it('supports selection state', () => {
    const event = new KGMidiControllerEvent('cc-1', 0, 127);

    expect(event.isSelected()).toBe(false);
    event.select();
    expect(event.isSelected()).toBe(true);
    event.deselect();
    expect(event.isSelected()).toBe(false);
  });
});
