import { describe, expect, it } from 'vitest';
import { buildKeySignatureCircleSlots } from './keySignaturePickerLayout';

describe('keySignaturePickerLayout', () => {
  it('builds shared enharmonic slots with both exact key signatures', () => {
    const slots = buildKeySignatureCircleSlots();
    const sharedMajorSlot = slots.find(slot => slot.outerItems.some(item => item.keySignature === 'Gb major'));
    const sharedMinorSlot = slots.find(slot => slot.innerItems.some(item => item.keySignature === 'D# minor'));

    expect(sharedMajorSlot?.outerItems.map(item => item.keySignature)).toEqual(['Gb major', 'F# major']);
    expect(sharedMinorSlot?.innerItems.map(item => item.keySignature)).toEqual(['Eb minor', 'D# minor']);
  });

  it('uses accidental counts derived from the key signature map', () => {
    const slots = buildKeySignatureCircleSlots();
    const cSlot = slots.find(slot => slot.id === 'c');
    const gbSlot = slots.find(slot => slot.id === 'gb-fsharp');

    expect(cSlot?.accidentalLabel).toBe('natural');
    expect(gbSlot?.accidentalLabel).toBe('6♭ / 6♯');
  });
});
