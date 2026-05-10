import React, { useEffect, useState } from 'react';
import { ConfigManager } from '../../../core/config/ConfigManager';
import {
  enumerateAudioDevices,
  getDefaultAudioDeviceOption,
  promptForAudioOutputDevice,
  supportsAudioContextSinkSelection,
  type AudioDeviceOption,
} from '../../../util/audioDeviceUtil';

const AudioIOSettings: React.FC = () => {
  const [inputDeviceId, setInputDeviceId] = useState<string>('default');
  const [outputDeviceId, setOutputDeviceId] = useState<string>('default');
  const [inputs, setInputs] = useState<AudioDeviceOption[]>([getDefaultAudioDeviceOption('audioinput')]);
  const [outputs, setOutputs] = useState<AudioDeviceOption[]>([getDefaultAudioDeviceOption('audiooutput')]);
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [deviceStatus, setDeviceStatus] = useState<string>('');
  const [supportsOutputPrompt, setSupportsOutputPrompt] = useState<boolean>(false);
  const [supportsOutputSink, setSupportsOutputSink] = useState<boolean>(false);

  const configManager = ConfigManager.instance();

  useEffect(() => {
    const initialize = async () => {
      if (!configManager.getIsInitialized()) {
        await configManager.initialize();
      }

      setInputDeviceId((configManager.get('audio.input_device_id') as string | undefined) ?? 'default');
      setOutputDeviceId((configManager.get('audio.output_device_id') as string | undefined) ?? 'default');
      setSupportsOutputSink(supportsAudioContextSinkSelection());
      await refreshDevices();
      setLoading(false);
    };

    void initialize();

    const mediaDevices = navigator.mediaDevices;
    const handleDeviceChange = () => {
      void refreshDevices(false);
    };

    if (mediaDevices && typeof mediaDevices.addEventListener === 'function') {
      mediaDevices.addEventListener('devicechange', handleDeviceChange);
      return () => {
        mediaDevices.removeEventListener('devicechange', handleDeviceChange);
      };
    }

    return undefined;
  }, [configManager]);

  const refreshDevices = async (showStatus: boolean = true) => {
    setRefreshing(true);
    try {
      const snapshot = await enumerateAudioDevices();
      setSupportsOutputPrompt(snapshot.canSelectOutput);

      const configuredInputId = (configManager.get('audio.input_device_id') as string | undefined) ?? 'default';
      const configuredOutputId = (configManager.get('audio.output_device_id') as string | undefined) ?? 'default';

      const hasInput = snapshot.inputs.some(device => device.deviceId === configuredInputId);
      const hasOutput = snapshot.outputs.some(device => device.deviceId === configuredOutputId);
      const nextInputs = !hasInput && configuredInputId !== 'default' && !snapshot.labelsAvailable
        ? [
            ...snapshot.inputs,
            {
              deviceId: configuredInputId,
              label: 'Previously Selected Input (permission required to verify)',
              kind: 'audioinput' as const,
              isDefault: false,
            },
          ]
        : snapshot.inputs;
      const nextOutputs = !hasOutput && configuredOutputId !== 'default' && !snapshot.labelsAvailable
        ? [
            ...snapshot.outputs,
            {
              deviceId: configuredOutputId,
              label: 'Previously Selected Output (permission required to verify)',
              kind: 'audiooutput' as const,
              isDefault: false,
            },
          ]
        : snapshot.outputs;

      setInputs(nextInputs);
      setOutputs(nextOutputs);

      if (!hasInput && configuredInputId !== 'default' && snapshot.labelsAvailable) {
        setInputDeviceId('default');
        await configManager.set('audio.input_device_id', 'default');
        setDeviceStatus('Previously selected audio input device is unavailable; using System Default.');
      } else {
        setInputDeviceId(hasInput || !snapshot.labelsAvailable ? configuredInputId : 'default');
      }

      if (!hasOutput && configuredOutputId !== 'default' && snapshot.labelsAvailable) {
        setOutputDeviceId('default');
        await configManager.set('audio.output_device_id', 'default');
        setDeviceStatus('Previously selected audio output device is unavailable; using System Default.');
      } else {
        setOutputDeviceId(hasOutput || !snapshot.labelsAvailable ? configuredOutputId : 'default');
      }

      if (showStatus) {
        setDeviceStatus(current => current || 'Audio device list refreshed.');
      }
    } catch (error) {
      console.error('Unable to refresh audio devices:', error);
      setDeviceStatus('Unable to read audio devices from the browser.');
    } finally {
      setRefreshing(false);
    }
  };

  const handleInputDeviceChange = async (value: string) => {
    setInputDeviceId(value);
    await configManager.set('audio.input_device_id', value);
    setDeviceStatus(value === 'default'
      ? 'Audio input will use System Default on the next recording session.'
      : 'Audio input will change on the next recording session.');
  };

  const handleOutputDeviceChange = async (value: string) => {
    setOutputDeviceId(value);
    await configManager.set('audio.output_device_id', value);
    setDeviceStatus(value === 'default'
      ? 'Audio output will use System Default after refresh.'
      : 'Audio output device saved. Refresh the page to apply it in v1.');
  };

  const handleChooseOutputDevice = async () => {
    try {
      const selectedDevice = await promptForAudioOutputDevice();
      if (!selectedDevice) {
        setDeviceStatus('This browser does not support prompting for audio output devices.');
        return;
      }

      setOutputDeviceId(selectedDevice.deviceId);
      await configManager.set('audio.output_device_id', selectedDevice.deviceId);
      await refreshDevices(false);
      setDeviceStatus('Output device selected. Refresh the page to apply it in v1.');
    } catch (error) {
      console.error('Unable to choose audio output device:', error);
      setDeviceStatus('The browser did not allow selecting a non-default output device.');
    }
  };

  return (
    <div className="settings-section">
      <div className="settings-section-header">
        <h3>Audio I/O</h3>
      </div>

      <div className="settings-section-content">
        <div className="settings-group">
          <div className="settings-group-header">
            <h4>Device Routing</h4>
            <button
              type="button"
              className="settings-btn"
              onClick={() => void refreshDevices()}
              disabled={refreshing}
            >
              {refreshing ? 'Refreshing…' : 'Refresh Device List'}
            </button>
          </div>

          <div className="settings-description">
            Choose the devices KGStudio should use for recording and playback. Input changes apply to the next recording session. Output changes require a page refresh in v1.
          </div>

          <div className="settings-item">
            <label className="settings-label" htmlFor="audio-input-device-select">
              Audio Input Device
            </label>
            <select
              id="audio-input-device-select"
              className="settings-select"
              value={inputDeviceId}
              onChange={(e) => void handleInputDeviceChange(e.target.value)}
              disabled={loading}
            >
              {inputs.map(device => (
                <option key={device.deviceId} value={device.deviceId}>
                  {device.label}
                </option>
              ))}
            </select>
            <div className="settings-help" style={{ fontSize: '12px', color: '#888', marginTop: '4px' }}>
              Changes apply to the next audio recording. If the selected device is removed, KGStudio will fall back to System Default.
            </div>
          </div>

          <div className="settings-item">
            <label className="settings-label" htmlFor="audio-output-device-select">
              Audio Output Device
            </label>
            <select
              id="audio-output-device-select"
              className="settings-select"
              value={outputDeviceId}
              onChange={(e) => void handleOutputDeviceChange(e.target.value)}
              disabled={loading}
            >
              {outputs.map(device => (
                <option key={device.deviceId} value={device.deviceId}>
                  {device.label}
                </option>
              ))}
            </select>
            {supportsOutputPrompt && (
              <div style={{ marginTop: '10px' }}>
                <button type="button" className="settings-btn" onClick={() => void handleChooseOutputDevice()}>
                  Choose Output Device…
                </button>
              </div>
            )}
            <div className="settings-help" style={{ fontSize: '12px', color: '#888', marginTop: '4px' }}>
              Output-device changes require refresh in v1. Browser support for non-default output routing is limited, so KGStudio will continue on System Default when unsupported.
            </div>
            {!supportsOutputSink && (
              <div className="settings-help" style={{ fontSize: '12px', color: '#d0a56b', marginTop: '6px' }}>
                This browser does not expose reliable live Web Audio sink switching. Non-default output selection is best-effort and may remain on System Default.
              </div>
            )}
          </div>

          {deviceStatus && (
            <div className="settings-help" style={{ fontSize: '12px', color: '#9bc17c', marginTop: '8px' }}>
              {deviceStatus}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default AudioIOSettings;
