import { useEffect, useState } from 'react';
import { ConfigManager } from '../../../core/config/ConfigManager';
import { useI18n } from '../../../i18n/useI18n';

const McpSettings = () => {
  const { t } = useI18n();
  const config = ConfigManager.instance();
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    let active = true;
    void (async () => {
      if (!config.getIsInitialized()) await config.initialize();
      if (active) setEnabled(config.get('general.mcp_enabled') === true);
    })();
    return () => { active = false; };
  }, [config]);

  return (
    <div className="settings-section">
      <div className="settings-section-header"><h3>MCP</h3></div>
      <div className="settings-section-content">
        <div className="settings-group">
          <div className="settings-item">
            <label className="settings-label" htmlFor="mcp-enabled-select">{t('settings.mcp.allowRequests')}</label>
            <select
              id="mcp-enabled-select"
              className="settings-select"
              value={enabled ? 'enabled' : 'disabled'}
              onChange={async event => {
                const nextEnabled = event.target.value === 'enabled';
                setEnabled(nextEnabled);
                await config.set('general.mcp_enabled', nextEnabled);
              }}
            >
              <option value="disabled">{t('settings.mcp.disabled')}</option>
              <option value="enabled">{t('settings.mcp.enabled')}</option>
            </select>
            <div className="settings-help">{t('settings.mcp.help')}</div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default McpSettings;
