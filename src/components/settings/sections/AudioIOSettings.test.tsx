import React from 'react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import AudioIOSettings from './AudioIOSettings';

const configState = new Map<string, unknown>([
  ['audio.input_device_id', 'default'],
  ['audio.output_device_id', 'default'],
]);

const configManagerMock = {
  getIsInitialized: vi.fn(() => true),
  initialize: vi.fn().mockResolvedValue(undefined),
  get: vi.fn((key: string) => configState.get(key)),
  set: vi.fn(async (key: string, value: unknown) => {
    configState.set(key, value);
  }),
};

vi.mock('../../../core/config/ConfigManager', () => ({
  ConfigManager: {
    instance: () => configManagerMock,
  },
}));

vi.mock('../../../util/audioDeviceUtil', () => ({
  enumerateAudioDevices: vi.fn().mockResolvedValue({
    inputs: [
      { deviceId: 'default', label: 'System Default', kind: 'audioinput', isDefault: true },
      { deviceId: 'mic-1', label: 'Studio Mic', kind: 'audioinput', isDefault: false },
    ],
    outputs: [
      { deviceId: 'default', label: 'System Default', kind: 'audiooutput', isDefault: true },
      { deviceId: 'speaker-1', label: 'Monitor Out', kind: 'audiooutput', isDefault: false },
    ],
    labelsAvailable: true,
    canSelectOutput: true,
    canWatchDeviceChanges: false,
  }),
  getDefaultAudioDeviceOption: vi.fn((kind: 'audioinput' | 'audiooutput') => ({
    deviceId: 'default',
    label: 'System Default',
    kind,
    isDefault: true,
  })),
  promptForAudioOutputDevice: vi.fn().mockResolvedValue({
    deviceId: 'speaker-1',
    label: 'Monitor Out',
    kind: 'audiooutput',
    isDefault: false,
  }),
  supportsAudioContextSinkSelection: vi.fn(() => false),
}));

describe('AudioIOSettings', () => {
  beforeEach(() => {
    configState.set('audio.input_device_id', 'default');
    configState.set('audio.output_device_id', 'default');
    configManagerMock.get.mockClear();
    configManagerMock.set.mockClear();
  });

  it('renders input/output selectors and refresh action', async () => {
    render(<AudioIOSettings />);

    expect(await screen.findByText('Audio I/O')).toBeTruthy();
    expect(screen.getByLabelText('Audio Input Device')).toBeTruthy();
    expect(screen.getByLabelText('Audio Output Device')).toBeTruthy();
    expect(screen.getByText('Refresh Device List')).toBeTruthy();
  });

  it('persists input device changes', async () => {
    render(<AudioIOSettings />);

    const select = await screen.findByLabelText('Audio Input Device');
    fireEvent.change(select, { target: { value: 'mic-1' } });

    await waitFor(() => {
      expect(configManagerMock.set).toHaveBeenCalledWith('audio.input_device_id', 'mic-1');
    });
  });

  it('resolves missing saved devices to System Default when validation is conclusive', async () => {
    configState.set('audio.input_device_id', 'missing-input');

    render(<AudioIOSettings />);

    await waitFor(() => {
      expect(configManagerMock.set).toHaveBeenCalledWith('audio.input_device_id', 'default');
    });
  });
});
