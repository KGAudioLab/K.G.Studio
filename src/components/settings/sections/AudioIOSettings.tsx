import React, { useEffect, useState } from 'react';
import { ConfigManager } from '../../../core/config/ConfigManager';
import {
  enumerateAudioDevices,
  getDefaultAudioDeviceOption,
  promptForAudioOutputDevice,
  supportsAudioContextSinkSelection,
  type AudioDeviceOption,
} from '../../../util/audioDeviceUtil';
import { useI18n } from '../../../i18n/useI18n';

const AudioIOSettings: React.FC = () => {
  const { t } = useI18n();
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
              label: t('settings.audioIo.previousSelectedInput'),
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
              label: t('settings.audioIo.previousSelectedOutput'),
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
        setDeviceStatus(t('settings.audioIo.status.inputUnavailable'));
      } else {
        setInputDeviceId(hasInput || !snapshot.labelsAvailable ? configuredInputId : 'default');
      }

      if (!hasOutput && configuredOutputId !== 'default' && snapshot.labelsAvailable) {
        setOutputDeviceId('default');
        await configManager.set('audio.output_device_id', 'default');
        setDeviceStatus(t('settings.audioIo.status.outputUnavailable'));
      } else {
        setOutputDeviceId(hasOutput || !snapshot.labelsAvailable ? configuredOutputId : 'default');
      }

      if (showStatus) {
        setDeviceStatus(current => current || t('settings.audioIo.status.refreshed'));
      }
    } catch (error) {
      console.error('Unable to refresh audio devices:', error);
      setDeviceStatus(t('settings.audioIo.status.readFailed'));
    } finally {
      setRefreshing(false);
    }
  };

  const handleInputDeviceChange = async (value: string) => {
    setInputDeviceId(value);
    await configManager.set('audio.input_device_id', value);
    setDeviceStatus(value === 'default'
      ? t('settings.audioIo.status.inputDefaultNextSession')
      : t('settings.audioIo.status.inputChangedNextSession'));
  };

  const handleOutputDeviceChange = async (value: string) => {
    setOutputDeviceId(value);
    await configManager.set('audio.output_device_id', value);
    setDeviceStatus(value === 'default'
      ? t('settings.audioIo.status.outputDefaultAfterRefresh')
      : t('settings.audioIo.status.outputSavedRefreshRequired'));
  };

  const handleChooseOutputDevice = async () => {
    try {
      const selectedDevice = await promptForAudioOutputDevice();
      if (!selectedDevice) {
        setDeviceStatus(t('settings.audioIo.status.outputPromptUnsupported'));
        return;
      }

      setOutputDeviceId(selectedDevice.deviceId);
      await configManager.set('audio.output_device_id', selectedDevice.deviceId);
      await refreshDevices(false);
      setDeviceStatus(t('settings.audioIo.status.outputSelectedRefreshRequired'));
    } catch (error) {
      console.error('Unable to choose audio output device:', error);
      setDeviceStatus(t('settings.audioIo.status.outputSelectionDenied'));
    }
  };

  return (
    <div className="settings-section">
      <div className="settings-section-header">
        <h3>{t('settings.audioIo.title')}</h3>
      </div>

      <div className="settings-section-content">
        <div className="settings-group">
          <div className="settings-group-header">
            <h4>{t('settings.audioIo.deviceRouting')}</h4>
            <button
              type="button"
              className="settings-btn"
              onClick={() => void refreshDevices()}
              disabled={refreshing}
            >
              {refreshing ? t('settings.audioIo.refreshing') : t('settings.audioIo.refresh')}
            </button>
          </div>

          <div className="settings-description">
            {t('settings.audioIo.description')}
          </div>

          <div className="settings-item">
            <label className="settings-label" htmlFor="audio-input-device-select">
              {t('settings.audioIo.inputDevice')}
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
              {t('settings.audioIo.inputHelp')}
            </div>
          </div>

          <div className="settings-item">
            <label className="settings-label" htmlFor="audio-output-device-select">
              {t('settings.audioIo.outputDevice')}
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
                  {t('settings.audioIo.chooseOutputDevice')}
                </button>
              </div>
            )}
            <div className="settings-help" style={{ fontSize: '12px', color: '#888', marginTop: '4px' }}>
              {t('settings.audioIo.outputHelp')}
            </div>
            {!supportsOutputSink && (
              <div className="settings-help" style={{ fontSize: '12px', color: '#d0a56b', marginTop: '6px' }}>
                {t('settings.audioIo.outputSinkUnsupported')}
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
