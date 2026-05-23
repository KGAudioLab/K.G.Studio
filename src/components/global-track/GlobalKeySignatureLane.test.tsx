import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import GlobalKeySignatureLane from './GlobalKeySignatureLane';
import { KGKeySignatureRegion } from '../../core/region/KGKeySignatureRegion';

describe('GlobalKeySignatureLane', () => {
  const baseRegion = new KGKeySignatureRegion('sig-1', 'global-signature', 2, 'C major', 0, 4, 4);

  beforeEach(() => {
    document.documentElement.style.setProperty('--track-grid-bar-width', '40');
  });

  it('opens the key signature picker for an existing region', () => {
    const onOpenPicker = vi.fn();

    render(
      <GlobalKeySignatureLane
        signatureRegions={[baseRegion]}
        maxBars={8}
        barWidthMultiplier={1}
        timeSignature={{ numerator: 4, denominator: 4 }}
        selectedRegionIds={[]}
        pickerRegionId={null}
        onClosePicker={vi.fn()}
        onSelectRegion={vi.fn()}
        onCreateAtBar={vi.fn()}
        onResizeRegion={vi.fn()}
        onChangeKeySignature={vi.fn()}
        onOpenPicker={onOpenPicker}
      />
    );

    fireEvent.doubleClick(screen.getByText('C major'));
    expect(onOpenPicker).toHaveBeenCalledWith('sig-1');
  });

  it('creates a new region at a bar-aligned position on empty-lane double click', () => {
    const onCreateAtBar = vi.fn();

    const { container } = render(
      <GlobalKeySignatureLane
        signatureRegions={[baseRegion]}
        maxBars={8}
        barWidthMultiplier={1}
        timeSignature={{ numerator: 4, denominator: 4 }}
        selectedRegionIds={[]}
        pickerRegionId={null}
        onClosePicker={vi.fn()}
        onSelectRegion={vi.fn()}
        onCreateAtBar={onCreateAtBar}
        onResizeRegion={vi.fn()}
        onChangeKeySignature={vi.fn()}
        onOpenPicker={vi.fn()}
      />
    );

    const lane = container.querySelector('.global-key-signature-lane') as HTMLDivElement;
    vi.spyOn(lane, 'getBoundingClientRect').mockReturnValue({
      x: 0,
      y: 0,
      left: 0,
      top: 0,
      right: 320,
      bottom: 24,
      width: 320,
      height: 24,
      toJSON: () => ({}),
    });

    fireEvent.doubleClick(lane, { clientX: 159, clientY: 10 });
    expect(onCreateAtBar).toHaveBeenCalledWith(3);
  });
});
