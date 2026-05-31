import React from 'react';
import { FaTimes } from 'react-icons/fa';
import type { SettingsSection } from './SettingsPanel';
import { useI18n } from '../../i18n/useI18n';

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
  const { t } = useI18n();
  const sections = [
    { id: 'general' as SettingsSection, label: t('settings.sidebar.general') },
    { id: 'audio_io' as SettingsSection, label: t('settings.sidebar.audioIo') },
    { id: 'behavior' as SettingsSection, label: t('settings.sidebar.behavior') },
    { id: 'templates' as SettingsSection, label: t('settings.sidebar.templates') },
    { id: 'chord_guide' as SettingsSection, label: t('settings.sidebar.chordGuide') }
  ];

  return (
    <div className="settings-sidebar">
      <div className="settings-sidebar-header">
        <h2>{t('settings.sidebar.title')}</h2>
        <button 
          className="settings-close-btn"
          onClick={onClose}
          title={t('settings.sidebar.close')}
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
