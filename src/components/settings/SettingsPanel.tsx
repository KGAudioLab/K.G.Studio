import React, { useState } from 'react';
import './Settings.css';
import SettingsSidebar from './SettingsSidebar';
import GeneralSettings from './sections/GeneralSettings';
import MusicAssistantSettings from './sections/MusicAssistantSettings';
import McpSettings from './sections/McpSettings';
import BehaviorSettings from './sections/BehaviorSettings';
import AudioIOSettings from './sections/AudioIOSettings';
import TemplatesSettings from './sections/TemplatesSettings';
import ChordGuideSettings from './sections/ChordGuideSettings';
import { useMcpServiceAvailable } from '../../mcp/serviceAvailability';

export type SettingsSection = 'general' | 'music_assistant' | 'mcp' | 'audio_io' | 'behavior' | 'templates' | 'chord_guide';

interface SettingsPanelProps {
  onClose: () => void;
}

const SettingsPanel: React.FC<SettingsPanelProps> = ({ onClose }) => {
  const [activeSection, setActiveSection] = useState<SettingsSection>('general');
  const mcpAvailable = useMcpServiceAvailable();
  const visibleSection = activeSection === 'mcp' && !mcpAvailable ? 'general' : activeSection;

  const renderActiveSection = () => {
    switch (visibleSection) {
      case 'general':
        return <GeneralSettings />;
      case 'music_assistant':
        return <MusicAssistantSettings />;
      case 'mcp':
        return <McpSettings />;
      case 'behavior':
        return <BehaviorSettings />;
      case 'audio_io':
        return <AudioIOSettings />;
      case 'templates':
        return <TemplatesSettings />;
      case 'chord_guide':
        return <ChordGuideSettings />;
      default:
        return <GeneralSettings />;
    }
  };

  return (
    <div className="settings-panel">
      <div className="settings-container">
        <SettingsSidebar 
          activeSection={visibleSection}
          mcpAvailable={mcpAvailable}
          onSectionChange={setActiveSection}
          onClose={onClose}
        />
        <div className="settings-content">
          {renderActiveSection()}
        </div>
      </div>
    </div>
  );
};

export default SettingsPanel;
