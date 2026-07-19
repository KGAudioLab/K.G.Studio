import React from 'react';
import { render } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import Playhead from './Playhead';

const storeState = {
  playheadPosition: 2,
  timeSignature: { numerator: 4, denominator: 4 },
};

vi.mock('../../stores/projectStore', () => ({
  useProjectStore: () => storeState,
}));

describe('Playhead', () => {
  beforeEach(() => {
    document.documentElement.style.setProperty('--region-grid-beat-width', '40px');
  });

  it('applies a layout-specific horizontal offset to the rendered line', () => {
    const { container } = render(<Playhead context="piano-roll" horizontalOffset={-1} />);

    expect(container.querySelector('.playhead')).toHaveStyle({ left: '79px' });
  });

  it('keeps the calculated position when no horizontal offset is supplied', () => {
    const { container } = render(<Playhead context="piano-roll" />);

    expect(container.querySelector('.playhead')).toHaveStyle({ left: '80px' });
  });

  it('can render the triangle marker in the piano-roll header segment', () => {
    const { container } = render(<Playhead context="piano-roll" showTriangle />);

    expect(container.querySelectorAll('.playhead-triangle')).toHaveLength(1);
  });
});
