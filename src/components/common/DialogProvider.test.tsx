import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockKgoneEnabled } = vi.hoisted(() => ({
  mockKgoneEnabled: { value: false },
}));

vi.mock('../../core/config/ConfigManager', () => ({
  ConfigManager: {
    instance: () => ({
      get: (key: string) => {
        if (key === 'general.kgone.enabled') return mockKgoneEnabled.value;
        return undefined;
      },
    }),
  },
}));

import DialogProvider from './DialogProvider';
import {
  showAudioToMidiOptions,
  showChoice,
  showChordDetectionOptions,
  showMidiChordDetectionOptions,
  showNoteRankSelectionOptions,
  showTempoApply,
  showTempoDetectionOptions,
} from '../../util/dialogUtil';

function finishDialogCloseAnimation() {
  const overlay = document.querySelector('.dialog-overlay');
  if (overlay) {
    fireEvent.animationEnd(overlay);
  }
}

beforeEach(() => {
  mockKgoneEnabled.value = false;
});

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
    expect(screen.getByText('Experimental Feature')).toBeInTheDocument();
    expect(screen.getByText(/Chord analysis is still experimental\./)).toBeInTheDocument();
    expect(screen.getByText('Recommended Source Material')).toBeInTheDocument();
    expect(screen.getByText(/Vocal, Drums, Bass, and Others/)).toBeInTheDocument();
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
    fireEvent.click(screen.getByRole('button', { name: 'OK' }));
    finishDialogCloseAnimation();

    await waitFor(() => expect(resolved).toEqual({
      sensitivity: 62,
      stability: 81,
      noChordThreshold: 24,
      enableSevenths: true,
    }));
  });

  it('shows K.G.One separator guidance when server integration is enabled', async () => {
    mockKgoneEnabled.value = true;

    render(
      <DialogProvider>
        <button
          type="button"
          onClick={async () => {
            await showChordDetectionOptions('Tune chord detection settings before processing.', {
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

    expect(screen.getByText(/Vocal, Drums, Bass, Guitar, Piano, and Others/)).toBeInTheDocument();
    expect(screen.getByText(/Piano or Others stem/)).toBeInTheDocument();
  });
});

describe('DialogProvider MIDI chord detection dialog', () => {
  it('shows the experimental hint without audio stem guidance', async () => {
    render(
      <DialogProvider>
        <button
          type="button"
          onClick={async () => {
            await showMidiChordDetectionOptions('Tune MIDI chord detection settings before processing.', {
              enableSevenths: false,
              shortNoteSuppression: 'medium',
              harmonicFocus: 'favor-sustained-notes',
            });
          }}
        >
          Open MIDI
        </button>
      </DialogProvider>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Open MIDI' }));

    expect(screen.getByText('Chord Detection')).toBeInTheDocument();
    expect(screen.getByText('Experimental Feature')).toBeInTheDocument();
    expect(screen.getByText(/Voicing density, overlaps, and ornamental notes/)).toBeInTheDocument();
    expect(screen.queryByText('Recommended Source Material')).not.toBeInTheDocument();
  });
});

describe('DialogProvider note-rank selection dialog', () => {
  it('shows defaults, provides all quantize-length intervals, and returns adjusted options', async () => {
    let resolved: unknown = null;

    render(
      <DialogProvider>
        <button type="button" onClick={async () => { resolved = await showNoteRankSelectionOptions(''); }}>Open</button>
      </DialogProvider>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Open' }));
    expect(screen.getByText('Select Note by Rank')).toBeInTheDocument();
    expect(screen.getByLabelText('Rank')).toHaveValue(1);
    expect(screen.getByLabelText('Detection interval')).toHaveValue('1/16');
    expect(screen.getByRole('option', { name: '1/1' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: '1/32' })).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Direction'), { target: { value: 'top-to-bottom' } });
    fireEvent.change(screen.getByLabelText('Rank'), { target: { value: '3' } });
    fireEvent.change(screen.getByLabelText('Detection interval'), { target: { value: '1/8' } });
    fireEvent.click(screen.getByRole('button', { name: 'Apply' }));
    finishDialogCloseAnimation();

    await waitFor(() => expect(resolved).toEqual({ direction: 'top-to-bottom', rank: 3, interval: '1/8' }));
  });

  it('resolves cancellation to null', async () => {
    let resolved: unknown = 'pending';
    render(
      <DialogProvider>
        <button type="button" onClick={async () => { resolved = await showNoteRankSelectionOptions(''); }}>Open</button>
      </DialogProvider>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Open' }));
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    finishDialogCloseAnimation();
    await waitFor(() => expect(resolved).toBeNull());
  });
});

describe('DialogProvider audio-to-MIDI dialog', () => {
  it('opens with the expected defaults and resolves cancel to null', async () => {
    let resolved: unknown = 'pending';

    render(
      <DialogProvider>
        <button
          type="button"
          onClick={async () => {
            resolved = await showAudioToMidiOptions(
              'Tune audio-to-MIDI conversion settings before processing.',
              [
                { label: 'Lead Synth', value: 'track-1' },
                { label: 'Bass', value: 'track-2' },
              ],
              false,
              {
                monophonic: true,
                useCurrentFloorDb: true,
                manualFloorDb: -25,
                pitchRangeStart: 12,
                pitchRangeEnd: 107,
                quantizeNoteStart: '1/16',
                quantizeNoteLength: '1/16',
                convertLoopRangeOnly: true,
                groupAdjacentPitchesToHighest: true,
                targetTrackId: 'track-1',
              },
            );
          }}
        >
          Open audio-to-midi
        </button>
      </DialogProvider>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Open audio-to-midi' }));

    expect(screen.getByText('Convert to MIDI')).toBeInTheDocument();
    expect(screen.getByText('Experimental Feature')).toBeInTheDocument();
    expect(screen.getByText(/best results, switch to spectrogram view/i)).toBeInTheDocument();
    expect(screen.getByLabelText('Monophonic only (v1)')).toBeChecked();
    expect(screen.getByLabelText('Monophonic only (v1)')).toBeDisabled();
    expect(screen.getByLabelText('Use current Floor dB')).toBeChecked();
    expect(screen.getByLabelText('Manual Floor dB')).toBeDisabled();
    expect(screen.getByLabelText('Convert loop-range audio clip only')).toBeChecked();
    expect(screen.getByLabelText('Convert loop-range audio clip only')).toBeDisabled();

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    finishDialogCloseAnimation();

    await waitFor(() => expect(resolved).toBeNull());
  });

  it('returns adjusted conversion options when confirmed', async () => {
    let resolved: unknown = null;

    render(
      <DialogProvider>
        <button
          type="button"
          onClick={async () => {
            resolved = await showAudioToMidiOptions(
              'Tune audio-to-MIDI conversion settings before processing.',
              [
                { label: 'Lead Synth', value: 'track-1' },
                { label: 'Bass', value: 'track-2' },
              ],
              true,
              {
                monophonic: true,
                useCurrentFloorDb: true,
                manualFloorDb: -25,
                pitchRangeStart: 12,
                pitchRangeEnd: 107,
                quantizeNoteStart: '1/16',
                quantizeNoteLength: '1/16',
                convertLoopRangeOnly: true,
                groupAdjacentPitchesToHighest: true,
                targetTrackId: 'track-1',
              },
            );
          }}
        >
          Open audio-to-midi
        </button>
      </DialogProvider>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Open audio-to-midi' }));
    fireEvent.click(screen.getByLabelText('Use current Floor dB'));
    fireEvent.change(screen.getByLabelText('Manual Floor dB'), { target: { value: '-16' } });
    fireEvent.change(screen.getByLabelText('Pitch range start'), { target: { value: '21' } });
    fireEvent.change(screen.getByLabelText('Pitch range end'), { target: { value: '38' } });
    fireEvent.change(screen.getByLabelText('Quantize note start'), { target: { value: '1/8' } });
    fireEvent.change(screen.getByLabelText('Quantize note length'), { target: { value: '1/8' } });
    fireEvent.click(screen.getByLabelText('Convert loop-range audio clip only'));
    fireEvent.click(screen.getByLabelText('Group adjacent pitches to the strongest bin'));
    fireEvent.change(screen.getByLabelText('Target MIDI track'), { target: { value: 'track-2' } });
    fireEvent.click(screen.getByRole('button', { name: 'OK' }));
    finishDialogCloseAnimation();

    await waitFor(() => expect(resolved).toEqual({
      monophonic: true,
      useCurrentFloorDb: false,
      manualFloorDb: -16,
      pitchRangeStart: 21,
      pitchRangeEnd: 38,
      quantizeNoteStart: '1/8',
      quantizeNoteLength: '1/8',
      convertLoopRangeOnly: false,
      groupAdjacentPitchesToHighest: false,
      targetTrackId: 'track-2',
    }));
  });
});

describe('DialogProvider tempo detection dialog', () => {
  it('opens the tempo detection modal with the expected defaults and resolves cancel to null', async () => {
    let resolved: unknown = 'pending';

    render(
      <DialogProvider>
        <button
          type="button"
          onClick={async () => {
            resolved = await showTempoDetectionOptions('Tune audio tempo detection settings before processing.', {
              minTempo: 80,
              maxTempo: 180,
            });
          }}
        >
          Open tempo
        </button>
      </DialogProvider>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Open tempo' }));

    expect(screen.getByText('Tempo Detection')).toBeInTheDocument();
    expect(screen.getByText('Experimental Feature')).toBeInTheDocument();
    expect(screen.getByText(/Tempo analysis is still experimental\./)).toBeInTheDocument();
    expect(screen.getByLabelText('Minimum BPM')).toHaveValue('80');
    expect(screen.getByLabelText('Maximum BPM')).toHaveValue('180');

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    finishDialogCloseAnimation();

    await waitFor(() => expect(resolved).toBeNull());
  });

  it('returns the adjusted tempo detection options when confirmed', async () => {
    let resolved: unknown = null;

    render(
      <DialogProvider>
        <button
          type="button"
          onClick={async () => {
            resolved = await showTempoDetectionOptions('Tune audio tempo detection settings before processing.', {
              minTempo: 80,
              maxTempo: 180,
            });
          }}
        >
          Open tempo
        </button>
      </DialogProvider>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Open tempo' }));
    fireEvent.change(screen.getByLabelText('Minimum BPM'), { target: { value: '96' } });
    fireEvent.change(screen.getByLabelText('Maximum BPM'), { target: { value: '154' } });
    expect(screen.getByText('96')).toBeInTheDocument();
    expect(screen.getByText('154')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'OK' }));
    finishDialogCloseAnimation();

    await waitFor(() => expect(resolved).toEqual({
      minTempo: 96,
      maxTempo: 154,
    }));
  });
});

describe('DialogProvider choice dialog', () => {
  it('renders the supplied choice labels and resolves the selected action', async () => {
    let resolved: unknown = null;

    render(
      <DialogProvider>
        <button
          type="button"
          onClick={async () => {
            resolved = await showChoice(
              'Detected tempo: 128 BPM. Choose how to apply it.',
              [
                { label: 'Update Current Tempo', value: 'update-current-tempo' },
                { label: 'Insert Tempo Change', value: 'insert-tempo-change' },
              ],
            );
          }}
        >
          Open choice
        </button>
      </DialogProvider>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Open choice' }));

    expect(screen.getByText('Detected tempo: 128 BPM. Choose how to apply it.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Update Current Tempo' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Insert Tempo Change' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Insert Tempo Change' }));
    finishDialogCloseAnimation();

    await waitFor(() => expect(resolved).toBe('insert-tempo-change'));
  });
});

describe('DialogProvider tempo apply dialog', () => {
  it('renders actions and resolves cancel to null', async () => {
    let resolved: unknown = 'pending';

    render(
      <DialogProvider>
        <button
          type="button"
          onClick={async () => {
            resolved = await showTempoApply(
              'Detected tempo: 128 BPM. Choose how to apply it.',
              [
                { label: 'Update Current Tempo', value: 'update-current-tempo' },
                { label: 'Insert Tempo Change', value: 'insert-tempo-change' },
              ],
            );
          }}
        >
          Open apply
        </button>
      </DialogProvider>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Open apply' }));

    expect(screen.getByText('Apply Tempo')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Update Current Tempo' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Insert Tempo Change' })).toBeInTheDocument();
    expect(screen.getByLabelText('Auto-align region to beat')).not.toBeChecked();

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    finishDialogCloseAnimation();

    await waitFor(() => expect(resolved).toBeNull());
  });

  it('returns selected action plus auto-align checkbox state', async () => {
    let resolved: unknown = null;

    render(
      <DialogProvider>
        <button
          type="button"
          onClick={async () => {
            resolved = await showTempoApply(
              'Detected tempo: 128 BPM. Choose how to apply it.',
              [
                { label: 'Update Current Tempo', value: 'update-current-tempo' },
                { label: 'Insert Tempo Change', value: 'insert-tempo-change' },
              ],
            );
          }}
        >
          Open apply
        </button>
      </DialogProvider>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Open apply' }));
    fireEvent.click(screen.getByLabelText('Auto-align region to beat'));
    fireEvent.click(screen.getByRole('button', { name: 'Insert Tempo Change' }));
    finishDialogCloseAnimation();

    await waitFor(() => expect(resolved).toEqual({
      action: 'insert-tempo-change',
      autoAlignRegionToBeat: true,
    }));
  });
});
