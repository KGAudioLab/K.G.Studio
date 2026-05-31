import React, { useState, useEffect, useCallback } from 'react';
import { ConfigManager } from '../../../core/config/ConfigManager';
import { useI18n } from '../../../i18n/useI18n';

const TemplatesSettings: React.FC = () => {
  const { t } = useI18n();
  const [customInstructions, setCustomInstructions] = useState<string>('');

  const configManager = ConfigManager.instance();

  // Load configuration values on component mount
  useEffect(() => {
    const loadConfig = async () => {
      if (!configManager.getIsInitialized()) {
        await configManager.initialize();
      }

      setCustomInstructions((configManager.get('templates.custom_instructions') as string) || '');
    };

    loadConfig();
  }, [configManager]);

  // Debounced save function for textarea
  const debouncedSave = useCallback((value: string) => {
    const timeoutId = setTimeout(async () => {
      try {
        await configManager.set('templates.custom_instructions', value);
        console.log('Custom instructions saved');
      } catch (error) {
        console.error('Failed to save custom instructions:', error);
      }
    }, 1000); // 1 second debounce for longer text

    return () => clearTimeout(timeoutId);
  }, [configManager]);

  // Save configuration when value changes
  const handleCustomInstructionsChange = (value: string) => {
    setCustomInstructions(value);
    debouncedSave(value);
  };

  return (
    <div className="settings-section">
      <div className="settings-section-header">
        <h3>{t('settings.templates.title')}</h3>
      </div>
      
      <div className="settings-section-content">
        <div className="settings-group">
          <h4>{t('settings.templates.customInstructions')}</h4>
          
          <div className="settings-item">
            <textarea 
              className="settings-textarea"
              placeholder={t('settings.templates.placeholder')}
              rows={8}
              value={customInstructions}
              onChange={(e) => handleCustomInstructionsChange(e.target.value)}
            />
          </div>
        </div>
      </div>
    </div>
  );
};

export default TemplatesSettings;
