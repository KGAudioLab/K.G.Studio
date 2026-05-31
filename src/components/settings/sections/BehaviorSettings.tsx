import React, { useState, useEffect } from 'react';
import { ConfigManager } from '../../../core/config/ConfigManager';
import { KGAudioInterface } from '../../../core/audio-interface/KGAudioInterface';
import {
  normalizeSpectrogramHeightResolution,
  type SpectrogramHeightResolution,
} from '../../../util/spectrogramUtil';
import { useI18n } from '../../../i18n/useI18n';

const BehaviorSettings: React.FC = () => {
  const { t } = useI18n();
  const [playheadUpdateFrequency, setPlayheadUpdateFrequency] = useState<number>(30);
  const [spectrogramHeightResolution, setSpectrogramHeightResolution] = useState<SpectrogramHeightResolution>(3);
  const [chatboxDefaultOpen, setChatboxDefaultOpen] = useState<boolean>(true);
  const [audioLookaheadTime, setAudioLookaheadTime] = useState<string>('50');
  const [midiAutomationInterpolationIntervalMs, setMidiAutomationInterpolationIntervalMs] = useState<number>(10);
  const [playbackDelay, setPlaybackDelay] = useState<string>('200');
  const [recordingOffset, setRecordingOffset] = useState<string>('0');
  const [bounceStartsFromBeat1, setBounceStartsFromBeat1] = useState<boolean>(true);
  const [enableAudioCapture, setEnableAudioCapture] = useState<boolean>(false);
  const [lookaheadValidationErrors, setLookaheadValidationErrors] = useState<string[]>([]);
  const [playbackDelayValidationErrors, setPlaybackDelayValidationErrors] = useState<string[]>([]);
  const [recordingOffsetValidationErrors, setRecordingOffsetValidationErrors] = useState<string[]>([]);

  const configManager = ConfigManager.instance();

  // Load configuration values on component mount
  useEffect(() => {
    const loadConfig = async () => {
      if (!configManager.getIsInitialized()) {
        await configManager.initialize();
      }

      setPlayheadUpdateFrequency((configManager.get('editor.playhead_update_frequency') as number) ?? 30);
      setSpectrogramHeightResolution(
        normalizeSpectrogramHeightResolution(configManager.get('editor.spectrogram_height_resolution'))
      );
      setChatboxDefaultOpen((configManager.get('chatbox.default_open') as boolean) ?? true);
      const lookaheadTimeSeconds = (configManager.get('audio.lookahead_time') as number) ?? 0.05;
      setAudioLookaheadTime(((lookaheadTimeSeconds * 1000).toFixed(0)));
      setMidiAutomationInterpolationIntervalMs(
        (configManager.get('audio.midi_automation_interpolation_interval_ms') as number) ?? 10
      );
      const playbackDelaySeconds = (configManager.get('audio.playback_delay') as number) ?? 0.2;
      setPlaybackDelay(((playbackDelaySeconds * 1000).toFixed(0)));
      const recordingOffsetSeconds = (configManager.get('audio.recording_offset') as number) ?? 0;
      setRecordingOffset(((recordingOffsetSeconds * 1000).toFixed(0)));
      setBounceStartsFromBeat1((configManager.get('audio.bounce_starts_from_beat_1') as boolean) ?? true);
      setEnableAudioCapture((configManager.get('audio.enable_audio_capture_for_screen_sharing') as boolean) ?? false);
    };

    loadConfig();
  }, [configManager]);

  // Save configuration when values change
  const handlePlayheadUpdateFrequencyChange = async (value: string) => {
    const numValue = parseInt(value, 10);
    setPlayheadUpdateFrequency(numValue);
    await configManager.set('editor.playhead_update_frequency', numValue);
    console.log(`Playhead update frequency changed to: ${numValue} fps`);
  };

  const handleChatboxDefaultOpenChange = async (value: string) => {
    const boolValue = value === 'yes';
    setChatboxDefaultOpen(boolValue);
    await configManager.set('chatbox.default_open', boolValue);
  };

  const handleSpectrogramHeightResolutionChange = async (value: string) => {
    const nextValue = normalizeSpectrogramHeightResolution(parseInt(value, 10));
    setSpectrogramHeightResolution(nextValue);
    await configManager.set('editor.spectrogram_height_resolution', nextValue);
  };

  const handleAudioLookaheadTimeChange = async (value: string) => {
    // Allow empty string, treat as 0 ms
    const numValueMs = value === '' ? 0 : parseFloat(value);
    const numValueSeconds = numValueMs / 1000;
    const errors: string[] = [];

    // Validate the input
    if (isNaN(numValueMs)) {
      errors.push(t('settings.behavior.validation.lookahead.invalidNumber'));
    } else if (numValueSeconds < 0) {
      errors.push(t('settings.behavior.validation.lookahead.range'));
    } else if (numValueSeconds > 0.5) {
      errors.push(t('settings.behavior.validation.lookahead.range'));
    }

    setLookaheadValidationErrors(errors);

    // Only apply if valid
    if (errors.length === 0) {
      setAudioLookaheadTime(value);
      await configManager.set('audio.lookahead_time', numValueSeconds);

      // Apply the change immediately without restart
      const audioInterface = KGAudioInterface.instance();
      audioInterface.setLookaheadTime(numValueSeconds);

      console.log(`Audio lookahead time changed to: ${numValueSeconds}s (${numValueMs}ms)`);
    }
  };

  const handlePlaybackDelayChange = async (value: string) => {
    // Allow empty string, treat as 0 ms
    const numValueMs = value === '' ? 0 : parseFloat(value);
    const numValueSeconds = numValueMs / 1000;
    const errors: string[] = [];

    // Validate the input
    if (isNaN(numValueMs)) {
      errors.push(t('settings.behavior.validation.playbackDelay.invalidNumber'));
    } else if (numValueSeconds < 0) {
      errors.push(t('settings.behavior.validation.playbackDelay.range'));
    } else if (numValueSeconds > 0.5) {
      errors.push(t('settings.behavior.validation.playbackDelay.range'));
    }

    setPlaybackDelayValidationErrors(errors);

    // Only apply if valid
    if (errors.length === 0) {
      setPlaybackDelay(value);
      await configManager.set('audio.playback_delay', numValueSeconds);

      console.log(`Playback delay changed to: ${numValueSeconds}s (${numValueMs}ms)`);
    }
  };

  const handleMidiAutomationInterpolationIntervalChange = async (value: string) => {
    const nextValue = parseInt(value, 10);
    setMidiAutomationInterpolationIntervalMs(nextValue);
    await configManager.set('audio.midi_automation_interpolation_interval_ms', nextValue);
  };

  const handleRecordingOffsetChange = async (value: string) => {
    const numValueMs = value === '' ? 0 : parseFloat(value);
    const numValueSeconds = numValueMs / 1000;
    const errors: string[] = [];

    if (isNaN(numValueMs)) {
      errors.push(t('settings.behavior.validation.recordingOffset.invalidNumber'));
    } else if (numValueSeconds < 0) {
      errors.push(t('settings.behavior.validation.recordingOffset.range'));
    } else if (numValueSeconds > 0.5) {
      errors.push(t('settings.behavior.validation.recordingOffset.range'));
    }

    setRecordingOffsetValidationErrors(errors);

    if (errors.length === 0) {
      setRecordingOffset(value);
      await configManager.set('audio.recording_offset', numValueSeconds);
      console.log(`MIDI input latency changed to: ${numValueSeconds}s (${numValueMs}ms)`);
    }
  };

  const handleEnableAudioCaptureChange = async (value: string) => {
    const boolValue = value === 'yes';
    setEnableAudioCapture(boolValue);
    await configManager.set('audio.enable_audio_capture_for_screen_sharing', boolValue);
  };

  const handleBounceStartsFromBeat1Change = async (value: string) => {
    const boolValue = value === 'yes';
    setBounceStartsFromBeat1(boolValue);
    await configManager.set('audio.bounce_starts_from_beat_1', boolValue);
  };

  return (
    <div className="settings-section">
      <div className="settings-section-header">
        <h3>{t('settings.behavior.title')}</h3>
      </div>

      <div className="settings-section-content">
        <div className="settings-group">
          <h4>{t('settings.behavior.editor')}</h4>

          <div className="settings-item">
            <label className="settings-label">
              {t('settings.behavior.playheadUpdateFrequency')}
            </label>
            <select
              className="settings-select"
              value={playheadUpdateFrequency}
              onChange={(e) => handlePlayheadUpdateFrequencyChange(e.target.value)}
            >
              <option value="10">10</option>
              <option value="30">30</option>
              <option value="60">60</option>
            </select>
            <div className="settings-help" style={{ fontSize: '12px', color: '#888', marginTop: '4px' }}>
              {t('settings.behavior.playheadUpdateFrequencyHelp')}
            </div>
          </div>

          <div className="settings-item">
            <label className="settings-label">
              {t('settings.behavior.spectrogramHeightResolution')}
            </label>
            <select
              className="settings-select"
              value={spectrogramHeightResolution}
              onChange={(e) => handleSpectrogramHeightResolutionChange(e.target.value)}
            >
              <option value="1">1x</option>
              <option value="3">3x</option>
              <option value="5">5x</option>
            </select>
            <div className="settings-help" style={{ fontSize: '12px', color: '#888', marginTop: '4px' }}>
              {t('settings.behavior.spectrogramHeightResolutionHelp')}
            </div>
          </div>
        </div>

        <div className="settings-group">
          <h4>{t('settings.behavior.chatBox')}</h4>

          <div className="settings-item">
            <label className="settings-label">
              {t('settings.behavior.openAtStartup')}
            </label>
            <select
              className="settings-select"
              value={chatboxDefaultOpen ? 'yes' : 'no'}
              onChange={(e) => handleChatboxDefaultOpenChange(e.target.value)}
            >
              <option value="no">{t('settings.no')}</option>
              <option value="yes">{t('settings.yes')}</option>
            </select>
          </div>
        </div>

        <div className="settings-group">
          <h4>{t('settings.behavior.audio')}</h4>

          <div className="settings-item">
            <label className="settings-label">
              {t('settings.behavior.lookaheadTime')}
            </label>
            <input
              type="number"
              className="settings-select"
              value={audioLookaheadTime}
              onChange={(e) => handleAudioLookaheadTimeChange(e.target.value)}
              min="0"
              max="500"
              step="1"
            />
            {lookaheadValidationErrors.length > 0 && (
              <div className="settings-validation-errors">
                {lookaheadValidationErrors.map((error, index) => (
                  <div key={index} className="settings-validation-error">
                    {error}
                  </div>
                ))}
              </div>
            )}
            <div className="settings-help" style={{ fontSize: '12px', color: '#888', marginTop: '4px' }}>
              {t('settings.behavior.lookaheadTimeHelp')}
            </div>
          </div>

          <div className="settings-item">
            <label className="settings-label">
              {t('settings.behavior.playbackDelay')}
            </label>
            <input
              type="number"
              className="settings-select"
              value={playbackDelay}
              onChange={(e) => handlePlaybackDelayChange(e.target.value)}
              min="0"
              max="500"
              step="1"
            />
            {playbackDelayValidationErrors.length > 0 && (
              <div className="settings-validation-errors">
                {playbackDelayValidationErrors.map((error, index) => (
                  <div key={index} className="settings-validation-error">
                    {error}
                  </div>
                ))}
              </div>
            )}
            <div className="settings-help" style={{ fontSize: '12px', color: '#888', marginTop: '4px' }}>
              {t('settings.behavior.playbackDelayHelp')}
            </div>
          </div>

          <div className="settings-item">
            <label className="settings-label">
              {t('settings.behavior.midiAutomationInterpolation')}
            </label>
            <select
              className="settings-select"
              value={midiAutomationInterpolationIntervalMs}
              onChange={(e) => handleMidiAutomationInterpolationIntervalChange(e.target.value)}
            >
              <option value="20">{t('settings.behavior.midiAutomationInterpolation.low')}</option>
              <option value="10">{t('settings.behavior.midiAutomationInterpolation.balanced')}</option>
              <option value="5">{t('settings.behavior.midiAutomationInterpolation.high')}</option>
            </select>
            <div className="settings-help" style={{ fontSize: '12px', color: '#888', marginTop: '4px' }}>
              {t('settings.behavior.midiAutomationInterpolationHelp')}
            </div>
          </div>

          <div className="settings-item">
            <label className="settings-label">
              {t('settings.behavior.midiInputLatency')}
            </label>
            <input
              type="number"
              className="settings-select"
              value={recordingOffset}
              onChange={(e) => handleRecordingOffsetChange(e.target.value)}
              min="0"
              max="500"
              step="1"
            />
            {recordingOffsetValidationErrors.length > 0 && (
              <div className="settings-validation-errors">
                {recordingOffsetValidationErrors.map((error, index) => (
                  <div key={index} className="settings-validation-error">
                    {error}
                  </div>
                ))}
              </div>
            )}
            <div className="settings-help" style={{ fontSize: '12px', color: '#888', marginTop: '4px' }}>
              {t('settings.behavior.midiInputLatencyHelp')}
            </div>
          </div>

          <div className="settings-item">
            <label className="settings-label">
              {t('settings.behavior.bounceStartsFromBeat1')}
            </label>
            <select
              className="settings-select"
              value={bounceStartsFromBeat1 ? 'yes' : 'no'}
              onChange={(e) => handleBounceStartsFromBeat1Change(e.target.value)}
            >
              <option value="no">{t('settings.no')}</option>
              <option value="yes">{t('settings.yes')}</option>
            </select>
            <div className="settings-help" style={{ fontSize: '12px', color: '#888', marginTop: '4px' }}>
              {t('settings.behavior.bounceStartsFromBeat1Help')}
            </div>
          </div>

          <div className="settings-item">
            <label className="settings-label">
              {t('settings.behavior.captureAudioForScreenSharing')}
            </label>
            <select
              className="settings-select"
              value={enableAudioCapture ? 'yes' : 'no'}
              onChange={(e) => handleEnableAudioCaptureChange(e.target.value)}
            >
              <option value="no">{t('settings.no')}</option>
              <option value="yes">{t('settings.yes')}</option>
            </select>
            <div className="settings-help" style={{ fontSize: '12px', color: '#888', marginTop: '4px' }}>
              {t('settings.behavior.captureAudioForScreenSharingHelp')}
              <br />
              <b>{t('settings.behavior.captureAudioForScreenSharingWarning')}</b>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default BehaviorSettings;
