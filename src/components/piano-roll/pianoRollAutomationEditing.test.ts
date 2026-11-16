import { describe, expect, it } from 'vitest';
import { simplifyAutomationStroke } from './pianoRollAutomationEditing';

describe('simplifyAutomationStroke', () => {
  it('uses the Medium tolerance while preserving the endpoints', () => {
    const start = { tick: 0, value: 20 };
    const end = { tick: 200, value: 80 };
    const smallDeviation = { tick: 100, value: 51.5 };
    const largeDeviation = { tick: 100, value: 53 };

    expect(simplifyAutomationStroke([start, smallDeviation, end], 300)).toEqual([start, end]);
    expect(simplifyAutomationStroke([start, largeDeviation, end], 300)).toEqual([start, largeDeviation, end]);
  });

  it('uses the last pass over retraced ticks and interpolates at clip boundaries', () => {
    const stroke = [
      { tick: -100, value: 0 },
      { tick: 100, value: 20 },
      { tick: 200, value: 30 },
      { tick: 300, value: 40 },
      { tick: 150, value: 100 },
    ];

    expect(simplifyAutomationStroke(stroke, 251)).toEqual([
      { tick: 0, value: 10 },
      { tick: 100, value: 20 },
      { tick: 150, value: 100 },
      { tick: 250, value: 60 },
    ]);
    expect(simplifyAutomationStroke(stroke.slice(2), 100)).toEqual([]);
  });
});
