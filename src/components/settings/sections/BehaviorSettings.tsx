import React, { useState, useEffect } from 'react';
import { ConfigManager } from '../../../core/config/ConfigManager';

const BehaviorSettings: React.FC = () => {
  const [chatboxDefaultOpen, setChatboxDefaultOpen] = useState<boolean>(true);

  const configManager = ConfigManager.instance();

  // Load configuration values on component mount
  useEffect(() => {
    const loadConfig = async () => {
      if (!configManager.getIsInitialized()) {
        await configManager.initialize();
      }

      setChatboxDefaultOpen((configManager.get('chatbox.default_open') as boolean) ?? true);
    };

    loadConfig();
  }, [configManager]);

  // Save configuration when values change
  const handleChatboxDefaultOpenChange = async (value: string) => {
    const boolValue = value === 'yes';
    setChatboxDefaultOpen(boolValue);
    await configManager.set('chatbox.default_open', boolValue);
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
      </div>
    </div>
  );
};

export default BehaviorSettings;