import { ConfigManager } from '../core/config/ConfigManager';

export const MCP_DISABLED_MESSAGE = 'MCP requests are disabled in K.G.Studio. Ask the user to enable "Allow MCP requests" in K.G.Studio → Settings → MCP before retrying.';

export function isMcpEnabled(): boolean {
  return ConfigManager.instance().get('general.mcp_enabled') === true;
}
