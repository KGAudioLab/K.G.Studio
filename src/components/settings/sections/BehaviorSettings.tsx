import React, { useState, useEffect } from 'react';
import { ConfigManager } from '../../../core/config/ConfigManager';
import { KGAudioInterface } from '../../../core/audio-interface/KGAudioInterface';

const BehaviorSettings: React.FC = () => {
  const [chatboxDefaultOpen, setChatboxDefaultOpen] = useState<boolean>(true);
  const [audioLookaheadTime, setAudioLookaheadTime] = useState<string>('50');
  const [enableAudioCapture, setEnableAudioCapture] = useState<boolean>(false);
  const [validationErrors, setValidationErrors] = useState<string[]>([]);

  const configManager = ConfigManager.instance();

  // Load configuration values on component mount
  useEffect(() => {
    const loadConfig = async () => {
      if (!configManager.getIsInitialized()) {
        await configManager.initialize();
      }

      setChatboxDefaultOpen((configManager.get('chatbox.default_open') as boolean) ?? true);
      const lookaheadTimeSeconds = (configManager.get('audio.lookahead_time') as number) ?? 0.05;
      setAudioLookaheadTime(((lookaheadTimeSeconds * 1000).toFixed(0)));
      setEnableAudioCapture((configManager.get('audio.enable_audio_capture_for_screen_sharing') as boolean) ?? false);
    };

    loadConfig();
  }, [configManager]);

  // Save configuration when values change
  const handleChatboxDefaultOpenChange = async (value: string) => {
    const boolValue = value === 'yes';
    setChatboxDefaultOpen(boolValue);
    await configManager.set('chatbox.default_open', boolValue);
  };

  const handleAudioLookaheadTimeChange = async (value: string) => {
    // Allow empty string, treat as 0 ms
    const numValueMs = value === '' ? 0 : parseFloat(value);
    const numValueSeconds = numValueMs / 1000;
    const errors: string[] = [];

    // Validate the input
    if (isNaN(numValueMs)) {
      errors.push('Lookahead time must be a valid number');
    } else if (numValueSeconds < 0) {
      errors.push('Lookahead time must be between 0 and 0.5 seconds (0-500ms)');
    } else if (numValueSeconds > 0.5) {
      errors.push('Lookahead time must be between 0 and 0.5 seconds (0-500ms)');
    }

    setValidationErrors(errors);

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

  const handleEnableAudioCaptureChange = async (value: string) => {
    const boolValue = value === 'yes';
    setEnableAudioCapture(boolValue);
    await configManager.set('audio.enable_audio_capture_for_screen_sharing', boolValue);
  };

  return (
    <div className="settings-section">
      <div className="settings-section-header">
        <h3>Behavior</h3>
      </div>
      
      <div className="settings-section-content">
        <div className="settings-group">
          <h4>Chat Box</h4>
          
          <div className="settings-item">
            <label className="settings-label">
              Open at Start Up
            </label>
            <select 
              className="settings-select" 
              value={chatboxDefaultOpen ? 'yes' : 'no'}
              onChange={(e) => handleChatboxDefaultOpenChange(e.target.value)}
            >
              <option value="no">No</option>
              <option value="yes">Yes</option>
            </select>
          </div>
        </div>

        <div className="settings-group">
          <h4>Audio</h4>

          <div className="settings-item">
            <label className="settings-label">
              Lookahead Time (ms)
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
            {validationErrors.length > 0 && (
              <div className="settings-validation-errors">
                {validationErrors.map((error, index) => (
                  <div key={index} className="settings-validation-error">
                    {error}
                  </div>
                ))}
              </div>
            )}
            <div className="settings-help" style={{ fontSize: '12px', color: '#888', marginTop: '4px' }}>
              Audio scheduling lookahead time (0-500ms). Lower values (10-20ms) reduce MIDI input latency but may cause audio glitches on slower systems. Higher values (100ms+) are better for playback stability. Changes apply immediately without restart.
            </div>
          </div>

          <div className="settings-item">
            <label className="settings-label">
              Capture Audio for Screen Sharing
            </label>
            <select 
              className="settings-select" 
              value={enableAudioCapture ? 'yes' : 'no'}
              onChange={(e) => handleEnableAudioCaptureChange(e.target.value)}
            >
              <option value="no">No</option>
              <option value="yes">Yes</option>
            </select>
            <div className="settings-help" style={{ fontSize: '12px', color: '#888', marginTop: '4px' }}>
              Restart KGStudio (refresh the page) to take effect. Enable this option when KGStudio's audio cannot be captured during screen sharing in video calls (e.g., Zoom, Teams). This creates an additional audio stream that screen capture applications can detect. 
              <br />
              <b>It is important to make sure when screen sharing in Zoom, the "Share Sound" option is enabled.</b>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default BehaviorSettings;