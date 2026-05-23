import { KEY_SIGNATURE_MAP } from '../constants/coreConstants';
import type { KeySignature } from '../core/KGProject';

type KeyQuality = 'major' | 'minor';

interface KeySignatureSlotDefinition {
  id: string;
  majorKeys: KeySignature[];
  minorKeys: KeySignature[];
}

export interface KeySignatureCircleItem {
  keySignature: KeySignature;
  label: string;
  quality: KeyQuality;
}

export interface KeySignatureCircleSlot {
  id: string;
  angleDeg: number;
  outerItems: KeySignatureCircleItem[];
  innerItems: KeySignatureCircleItem[];
  accidentalLabel: string;
}

const CIRCLE_SLOT_DEFINITIONS: KeySignatureSlotDefinition[] = [
  { id: 'c', majorKeys: ['C major'], minorKeys: ['A minor'] },
  { id: 'g', majorKeys: ['G major'], minorKeys: ['E minor'] },
  { id: 'd', majorKeys: ['D major'], minorKeys: ['B minor'] },
  { id: 'a', majorKeys: ['A major'], minorKeys: ['F# minor'] },
  { id: 'e', majorKeys: ['E major'], minorKeys: ['C# minor'] },
  { id: 'b-cb', majorKeys: ['B major', 'Cb major'], minorKeys: ['G# minor', 'Ab minor'] },
  { id: 'gb-fsharp', majorKeys: ['Gb major', 'F# major'], minorKeys: ['Eb minor', 'D# minor'] },
  { id: 'db-csharp', majorKeys: ['Db major', 'C# major'], minorKeys: ['Bb minor', 'A# minor'] },
  { id: 'ab', majorKeys: ['Ab major'], minorKeys: ['F minor'] },
  { id: 'eb', majorKeys: ['Eb major'], minorKeys: ['C minor'] },
  { id: 'bb', majorKeys: ['Bb major'], minorKeys: ['G minor'] },
  { id: 'f', majorKeys: ['F major'], minorKeys: ['D minor'] },
];

function assertKnownKeySignature(keySignature: KeySignature): KeySignature {
  if (!(keySignature in KEY_SIGNATURE_MAP)) {
    throw new Error(`Unknown key signature in circle layout: ${keySignature}`);
  }

  return keySignature;
}

function getLabelForKeySignature(keySignature: KeySignature): string {
  const [tonic, quality] = keySignature.split(' ');
  return quality === 'major' ? tonic : tonic.toLowerCase();
}

function formatAccidentalCount(keySignatures: KeySignature[]): string {
  const segments = keySignatures.map((keySignature) => {
    const entry = KEY_SIGNATURE_MAP[keySignature];
    if (entry.sharps > 0) {
      return `${entry.sharps}♯`;
    }
    if (entry.flats > 0) {
      return `${entry.flats}♭`;
    }
    return 'natural';
  });

  return [...new Set(segments)].join(' / ');
}

export function buildKeySignatureCircleSlots(): KeySignatureCircleSlot[] {
  const totalSlots = CIRCLE_SLOT_DEFINITIONS.length;

  return CIRCLE_SLOT_DEFINITIONS.map((slot, index) => {
    const outerItems = slot.majorKeys.map((keySignature) => ({
      keySignature: assertKnownKeySignature(keySignature),
      label: getLabelForKeySignature(keySignature),
      quality: 'major' as const,
    }));
    const innerItems = slot.minorKeys.map((keySignature) => ({
      keySignature: assertKnownKeySignature(keySignature),
      label: getLabelForKeySignature(keySignature),
      quality: 'minor' as const,
    }));

    return {
      id: slot.id,
      angleDeg: -90 + (360 / totalSlots) * index,
      outerItems,
      innerItems,
      accidentalLabel: formatAccidentalCount(slot.majorKeys),
    };
  });
}
