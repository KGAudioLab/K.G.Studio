import React, { useState, useEffect } from 'react';
import { ConfigManager } from '../../../core/config/ConfigManager';

const BehaviorSettings: React.FC = () => {
  const [chatboxDefaultOpen, setChatboxDefaultOpen] = useState<boolean>(true);
  const [enableAudioCapture, setEnableAudioCapture] = useState<boolean>(false);

  const configManager = ConfigManager.instance();

  // Load configuration values on component mount
  useEffect(() => {
    const loadConfig = async () => {
      if (!configManager.getIsInitialized()) {
        await configManager.initialize();
      }

      setChatboxDefaultOpen((configManager.get('chatbox.default_open') as boolean) ?? true);
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