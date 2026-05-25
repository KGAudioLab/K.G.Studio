import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import GlobalTempoLane from './GlobalTempoLane';
import { KGTempoRegion } from '../../core/region/KGTempoRegion';

describe('GlobalTempoLane', () => {
  const baseRegion = new KGTempoRegion('tempo-1', 'global-tempo', 1, 128, 0, 4, 4);

  beforeEach(() => {
    document.documentElement.style.setProperty('--track-grid-bar-width', '40');
  });

  it('opens inline editing for an existing region', () => {
    const onBeginEdit = vi.fn();

    render(
      <GlobalTempoLane
        tempoRegions={[baseRegion]}
        maxBars={8}
        barWidthMultiplier={1}
        selectedRegionIds={[]}
        editingRegionId={null}
        editingText=""
        onEditingTextChange={vi.fn()}
        onCommitEdit={vi.fn()}
        onCancelEdit={vi.fn()}
        onBeginEdit={onBeginEdit}
        onSelectRegion={vi.fn()}
        onCreateAtBar={vi.fn()}
        onResizeRegion={vi.fn()}
      />
    );

    fireEvent.doubleClick(screen.getByText('128 BPM'));
    expect(onBeginEdit).toHaveBeenCalledWith('tempo-1');
  });

  it('creates a new region at a bar-aligned position on empty-lane double click', () => {
    const onCreateAtBar = vi.fn();

    const { container } = render(
      <GlobalTempoLane
        tempoRegions={[baseRegion]}
        maxBars={8}
        barWidthMultiplier={1}
        selectedRegionIds={[]}
        editingRegionId={null}
        editingText=""
        onEditingTextChange={vi.fn()}
        onCommitEdit={vi.fn()}
        onCancelEdit={vi.fn()}
        onBeginEdit={vi.fn()}
        onSelectRegion={vi.fn()}
        onCreateAtBar={onCreateAtBar}
        onResizeRegion={vi.fn()}
      />
    );

    const lane = container.querySelector('.global-tempo-lane') as HTMLDivElement;
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

  it('strips non-digit characters during inline editing', () => {
    const onEditingTextChange = vi.fn();

    render(
      <GlobalTempoLane
        tempoRegions={[baseRegion]}
        maxBars={8}
        barWidthMultiplier={1}
        selectedRegionIds={[]}
        editingRegionId="tempo-1"
        editingText="128"
        onEditingTextChange={onEditingTextChange}
        onCommitEdit={vi.fn()}
        onCancelEdit={vi.fn()}
        onBeginEdit={vi.fn()}
        onSelectRegion={vi.fn()}
        onCreateAtBar={vi.fn()}
        onResizeRegion={vi.fn()}
      />
    );

    fireEvent.change(screen.getByDisplayValue('128'), { target: { value: '12a8!' } });
    expect(onEditingTextChange).toHaveBeenCalledWith('128');
  });

  it('renders tempo regions with the dedicated tempo-region class', () => {
    const { container } = render(
      <GlobalTempoLane
        tempoRegions={[baseRegion]}
        maxBars={8}
        barWidthMultiplier={1}
        selectedRegionIds={[]}
        editingRegionId={null}
        editingText=""
        onEditingTextChange={vi.fn()}
        onCommitEdit={vi.fn()}
        onCancelEdit={vi.fn()}
        onBeginEdit={vi.fn()}
        onSelectRegion={vi.fn()}
        onCreateAtBar={vi.fn()}
        onResizeRegion={vi.fn()}
      />
    );

    expect(container.querySelector('.global-marker-region.global-tempo-region')).toBeInTheDocument();
  });
});
