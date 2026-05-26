import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import DialogProvider from './DialogProvider';
import { showChordDetectionOptions } from '../../util/dialogUtil';

function finishDialogCloseAnimation() {
  const overlay = document.querySelector('.dialog-overlay');
  if (overlay) {
    fireEvent.animationEnd(overlay);
  }
}

describe('DialogProvider chord detection dialog', () => {
  it('opens the chord detection modal with the expected defaults and resolves cancel to null', async () => {
    let resolved: unknown = 'pending';

    render(
      <DialogProvider>
        <button
          type="button"
          onClick={async () => {
            resolved = await showChordDetectionOptions('Tune chord detection settings before processing.', {
              sensitivity: 50,
              stability: 50,
              noChordThreshold: 0,
              enableSevenths: false,
            });
          }}
        >
          Open
        </button>
      </DialogProvider>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Open' }));

    expect(screen.getByText('Chord Detection')).toBeInTheDocument();
    expect(screen.getByLabelText('Sensitivity')).toHaveValue('50');
    expect(screen.getByLabelText('Stability')).toHaveValue('50');
    expect(screen.getByLabelText('No-Chord Threshold')).toHaveValue('0');
    expect(screen.getByLabelText('Chord Detail: Enable sevenths')).not.toBeChecked();

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    finishDialogCloseAnimation();

    await waitFor(() => expect(resolved).toBeNull());
  });

  it('returns the adjusted chord detection options when confirmed', async () => {
    let resolved: unknown = null;

    render(
      <DialogProvider>
        <button
          type="button"
          onClick={async () => {
            resolved = await showChordDetectionOptions('Tune chord detection settings before processing.', {
              sensitivity: 50,
              stability: 50,
              noChordThreshold: 0,
              enableSevenths: false,
            });
          }}
        >
          Open
        </button>
      </DialogProvider>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Open' }));
    fireEvent.change(screen.getByLabelText('Sensitivity'), { target: { value: '62' } });
    fireEvent.change(screen.getByLabelText('Stability'), { target: { value: '81' } });
    fireEvent.change(screen.getByLabelText('No-Chord Threshold'), { target: { value: '24' } });
    fireEvent.click(screen.getByLabelText('Chord Detail: Enable sevenths'));
    fireEvent.click(screen.getByRole('button', { name: 'Detect' }));
    finishDialogCloseAnimation();

    await waitFor(() => expect(resolved).toEqual({
      sensitivity: 62,
      stability: 81,
      noChordThreshold: 24,
      enableSevenths: true,
    }));
  });
});
