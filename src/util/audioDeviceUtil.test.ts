import { describe, expect, it } from 'vitest';
import {
  getDefaultAudioDeviceOption,
  validateConfiguredAudioDevices,
  type AudioDeviceSnapshot,
} from './audioDeviceUtil';

describe('audioDeviceUtil', () => {
  it('falls back to System Default when saved devices are missing and labels are available', () => {
    const snapshot: AudioDeviceSnapshot = {
      inputs: [
        getDefaultAudioDeviceOption('audioinput'),
        { deviceId: 'mic-1', label: 'Mic 1', kind: 'audioinput', isDefault: false },
      ],
      outputs: [
        getDefaultAudioDeviceOption('audiooutput'),
        { deviceId: 'speaker-1', label: 'Speaker 1', kind: 'audiooutput', isDefault: false },
      ],
      labelsAvailable: true,
      canSelectOutput: true,
      canWatchDeviceChanges: true,
    };

    const result = validateConfiguredAudioDevices('missing-input', 'missing-output', snapshot);

    expect(result.inputDeviceId).toBe('default');
    expect(result.outputDeviceId).toBe('default');
    expect(result.inputFellBackToDefault).toBe(true);
    expect(result.outputFellBackToDefault).toBe(true);
  });

  it('preserves saved devices when labels are unavailable and validation is inconclusive', () => {
    const snapshot: AudioDeviceSnapshot = {
      inputs: [getDefaultAudioDeviceOption('audioinput')],
      outputs: [getDefaultAudioDeviceOption('audiooutput')],
      labelsAvailable: false,
      canSelectOutput: false,
      canWatchDeviceChanges: false,
    };

    const result = validateConfiguredAudioDevices('saved-input', 'saved-output', snapshot);

    expect(result.inputDeviceId).toBe('saved-input');
    expect(result.outputDeviceId).toBe('saved-output');
    expect(result.inputFellBackToDefault).toBe(false);
    expect(result.outputFellBackToDefault).toBe(false);
  });
});
