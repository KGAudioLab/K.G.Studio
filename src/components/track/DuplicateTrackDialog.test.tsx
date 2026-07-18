import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import DuplicateTrackDialog from './DuplicateTrackDialog';

describe('DuplicateTrackDialog', () => {
  it('uses the confirmed defaults and disables unavailable regions with a hint', () => {
    render(
      <DuplicateTrackDialog isOpen={true} hasRegions={false} onConfirm={vi.fn()} onCancel={vi.fn()} />,
    );

    expect(screen.getByRole('dialog', { name: 'Duplicate Track' })).toBeInTheDocument();
    expect(screen.getByText('Choose what you’d like to include in the duplicated track.')).toBeInTheDocument();
    expect(screen.getByLabelText('Track Settings')).toBeChecked();
    expect(screen.getByLabelText('Track Settings')).toBeDisabled();
    expect(screen.getByLabelText('Automation')).not.toBeChecked();
    expect(screen.getByLabelText('Regions')).not.toBeChecked();
    expect(screen.getByLabelText('Regions')).toBeDisabled();
    expect(screen.getByText('This track has no regions.')).toBeInTheDocument();
  });

  it('submits the selected optional content', () => {
    const onConfirm = vi.fn();
    render(
      <DuplicateTrackDialog isOpen={true} hasRegions={true} onConfirm={onConfirm} onCancel={vi.fn()} />,
    );

    fireEvent.click(screen.getByLabelText('Automation'));
    fireEvent.click(screen.getByLabelText('Regions'));
    fireEvent.click(screen.getByRole('button', { name: 'Duplicate' }));

    expect(onConfirm).toHaveBeenCalledWith({ includeAutomation: true, includeRegions: true });
  });

  it('cancels on Escape, outside click, close, and Cancel without confirming', () => {
    const onCancel = vi.fn();
    const onConfirm = vi.fn();
    const { rerender } = render(
      <DuplicateTrackDialog isOpen={true} hasRegions={true} onConfirm={onConfirm} onCancel={onCancel} />,
    );

    fireEvent.keyDown(document, { key: 'Escape' });
    fireEvent.mouseDown(document.querySelector('.dialog-overlay')!);
    fireEvent.click(screen.getByRole('button', { name: 'Close dialog' }));
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onCancel).toHaveBeenCalledTimes(4);
    expect(onConfirm).not.toHaveBeenCalled();

    rerender(
      <DuplicateTrackDialog isOpen={false} hasRegions={true} onConfirm={onConfirm} onCancel={onCancel} />,
    );
  });
});
