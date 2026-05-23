import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import KeySignaturePickerPopup from './KeySignaturePickerPopup';

vi.mock('vexflow', () => {
  class MockRenderer {
    static Backends = { SVG: 'svg' };
    private readonly host: HTMLElement;

    constructor(host: HTMLElement) {
      this.host = host;
    }

    resize() {}

    getContext() {
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      this.host.appendChild(svg);
      return {};
    }
  }

  class MockStave {
    constructor() {}

    addClef() {
      return this;
    }

    addKeySignature() {
      return this;
    }

    setContext() {
      return this;
    }

    draw() {
      return this;
    }
  }

  return {
    Renderer: MockRenderer,
    Stave: MockStave,
  };
});

describe('KeySignaturePickerPopup', () => {
  it('selects major and minor key signatures', () => {
    const onChange = vi.fn();
    render(<KeySignaturePickerPopup value="C major" onChange={onChange} />);

    fireEvent.click(screen.getByRole('button', { name: 'Select G major' }));
    fireEvent.click(screen.getByRole('button', { name: 'Select E minor' }));

    expect(onChange).toHaveBeenNthCalledWith(1, 'G major');
    expect(onChange).toHaveBeenNthCalledWith(2, 'E minor');
  });

  it('renders both exact options for shared enharmonic slots', () => {
    render(<KeySignaturePickerPopup value="C major" onChange={vi.fn()} />);

    expect(screen.getByRole('button', { name: 'Select Gb major or F# major' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Select Eb minor or D# minor' })).toBeInTheDocument();
  });

  it('toggles between paired enharmonic options from a single button', () => {
    const onChange = vi.fn();
    const { rerender } = render(<KeySignaturePickerPopup value="C major" onChange={onChange} />);

    fireEvent.click(screen.getByRole('button', { name: 'Select Gb major or F# major' }));
    expect(onChange).toHaveBeenCalledWith('Gb major');

    rerender(<KeySignaturePickerPopup value="Gb major" onChange={onChange} />);
    fireEvent.click(screen.getByRole('button', { name: 'Select Gb major or F# major' }));
    expect(onChange).toHaveBeenLastCalledWith('F# major');
  });
});
