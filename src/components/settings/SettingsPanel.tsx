import React, { useState } from 'react';
import SettingsSidebar from './SettingsSidebar';
import GeneralSettings from './sections/GeneralSettings';
import BehaviorSettings from './sections/BehaviorSettings';
import TemplatesSettings from './sections/TemplatesSettings';

export type SettingsSection = 'general' | 'behavior' | 'templates';

interface SettingsPanelProps {
  onClose: () => void;
}

const SettingsPanel: React.FC<SettingsPanelProps> = ({ onClose }) => {
  const [activeSection, setActiveSection] = useState<SettingsSection>('general');

  const renderActiveSection = () => {
    switch (activeSection) {
      case 'general':
        return <GeneralSettings />;
      case 'behavior':
        return <BehaviorSettings />;
      case 'templates':
        return <TemplatesSettings />;
      default:
        return <GeneralSettings />;
    }
  };

  return (
    <div className="settings-panel">
      <div className="settings-container">
        <SettingsSidebar 
          activeSection={activeSection}
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