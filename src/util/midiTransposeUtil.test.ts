import { describe, expect, it } from 'vitest';
import { getKeySignatureTransposeDelta } from './midiTransposeUtil';

describe('getKeySignatureTransposeDelta', () => {
  it('uses shortest tonic distance and ignores key quality', () => {
    expect(getKeySignatureTransposeDelta('C major', 'D major')).toBe(2);
    expect(getKeySignatureTransposeDelta('C major', 'A minor')).toBe(-3);
    expect(getKeySignatureTransposeDelta('B major', 'C minor')).toBe(1);
  });

  it('uses target spelling to resolve tritone ties', () => {
    expect(getKeySignatureTransposeDelta('C major', 'F# major')).toBe(6);
    expect(getKeySignatureTransposeDelta('C major', 'Gb major')).toBe(-6);
  });
});
