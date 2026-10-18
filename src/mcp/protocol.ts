/** Browser-safe bridge types. No Node or MCP SDK code belongs in the webpage bundle. */
export const MCP_PATH = '/mcp';
export const BRIDGE_PATH = '/internal/kgstudio-mcp/bridge';
export const DISCOVERY_PATH = '/internal/kgstudio-mcp';
export const MCP_PROTOCOL_VERSION = '2025-11-25';

export interface BridgeTool {
  name: string;
  description: string;
  inputSchema: { type: 'object'; properties: Record<string, unknown>; required?: string[]; additionalProperties?: boolean };
  annotations: { readOnlyHint: boolean };
}

export interface BridgeResult {
  success: boolean;
  result: string | Record<string, unknown>;
}

export interface BridgeCall {
  type: 'call';
  id: string;
  name: string;
  args: Record<string, unknown>;
  revision: string;
  deadline: number;
}
