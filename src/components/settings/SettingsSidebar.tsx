import React from 'react';
import { FaTimes } from 'react-icons/fa';
import type { SettingsSection } from './SettingsPanel';

interface SettingsSidebarProps {
  activeSection: SettingsSection;
  onSectionChange: (section: SettingsSection) => void;
  onClose: () => void;
}

const SettingsSidebar: React.FC<SettingsSidebarProps> = ({
  activeSection,
  onSectionChange,
  onClose
}) => {
  const sections = [
    { id: 'general' as SettingsSection, label: 'General' },
    { id: 'behavior' as SettingsSection, label: 'Behavior' },
    { id: 'templates' as SettingsSection, label: 'Templates' },
    { id: 'chord_guide' as SettingsSection, label: 'Chord Guide' }
  ];

  return (
    <div className="settings-sidebar">
      <div className="settings-sidebar-header">
        <h2>Settings</h2>
        <button 
          className="settings-close-btn"
          onClick={onClose}
          title="Close Settings"
        >
          <FaTimes />
        </button>
      </div>
      
      <nav className="settings-nav">
        {sections.map((section) => (
          <button
            key={section.id}
            className={`settings-nav-item ${activeSection === section.id ? 'active' : ''}`}
            onClick={() => onSectionChange(section.id)}
          >
            {section.label}
          </button>
        ))}
      </nav>
    </div>
  );
};

export default SettingsSidebar;