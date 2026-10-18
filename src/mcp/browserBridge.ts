import { ConfigManager } from '../core/config/ConfigManager';
import { KGCore } from '../core/KGCore';
import { useProjectStore } from '../stores/projectStore';
import { getEffectiveAgentMode } from '../util/agentMode';
import { getMcpCatalog } from './catalog';
import { isMcpEnabled, MCP_DISABLED_MESSAGE } from './settings';
import { setMcpServiceAvailable } from './serviceAvailability';
import { showAlert } from '../util/dialogUtil';
import { translate } from '../i18n/translate';
import { BRIDGE_PATH, DISCOVERY_PATH, type BridgeCall, type BridgeResult } from './protocol';

/** Opt-in is discovered only on loopback and on the page's own origin. */
export async function startMcpBrowserBridge(): Promise<() => void> {
  if (!['127.0.0.1', 'localhost', '[::1]'].includes(location.hostname)) return () => {};
  let token: string;
  try {
    const response = await fetch(DISCOVERY_PATH, { cache: 'no-store', signal: AbortSignal.timeout(3000) });
    if (!response.ok || !response.headers.get('content-type')?.includes('application/json')) return () => {};
    const discovery = await response.json();
    if (discovery.protocolVersion !== '2025-11-25' || typeof discovery.bridgeToken !== 'string') return () => {};
    token = discovery.bridgeToken;
  } catch { return () => {}; }

  let stopped = false;
  let socket: WebSocket;
  let retry: ReturnType<typeof setTimeout> | undefined;
  let revision = crypto.randomUUID();
  let project = KGCore.instance().getCurrentProject();
  let mode = getEffectiveAgentMode();
  let enabled = isMcpEnabled();
  let catalog = getMcpCatalog(mode);
  let queue = Promise.resolve();
  let disabledNoticeOpen = false;
  const notifyDisabled = () => {
    if (stopped || disabledNoticeOpen) return;
    disabledNoticeOpen = true;
    void Promise.resolve().then(() => {
      if (!stopped) return showAlert(translate('settings.mcp.disabledNotice'));
    }).catch(error => {
      console.warn('Could not show the MCP disabled notice:', error);
    }).finally(() => { disabledNoticeOpen = false; });
  };
  const cancelled = new Set<string>();
  const activeIds = new Set<string>();
  const status = (message: string) => KGCore.instance().setStatus(`MCP: ${message}`);
  const send = (message: unknown) => {
    if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify(message));
  };
  const publish = () => {
    mode = getEffectiveAgentMode();
    enabled = isMcpEnabled();
    project = KGCore.instance().getCurrentProject();
    catalog = getMcpCatalog(mode);
    revision = crypto.randomUUID();
    send({ type: 'catalog', revision, tools: [...catalog.values()].map(entry => entry.definition) });
  };
  const unsubscribeConfig = ConfigManager.instance().addChangeListener(keys => {
    if (getEffectiveAgentMode() !== mode || isMcpEnabled() !== enabled || keys.includes('general.mcp_enabled')) publish();
  });
  const unsubscribeProject = useProjectStore.subscribe(() => {
    if (project !== KGCore.instance().getCurrentProject()) publish();
  });

  const connect = () => {
    const url = new URL(BRIDGE_PATH, location.origin);
    url.protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
    socket = new WebSocket(url, ['kgstudio-bridge', `token.${token}`]);
    const connection = socket;
    socket.onopen = () => {
      if (stopped || connection !== socket) return;
      setMcpServiceAvailable(true);
      publish();
      status(`connected (${mode} mode)`);
    };
    socket.onmessage = event => {
      let message: BridgeCall | { type: 'cancel'; id: string };
      try { message = JSON.parse(event.data); } catch { return; }
      if (message.type === 'cancel') { if (activeIds.has(message.id)) cancelled.add(message.id); return; }
      if (message.type !== 'call') return;
      const call = message;
      if (!isMcpEnabled()) {
        send({ type: 'result', id: call.id, success: false, result: MCP_DISABLED_MESSAGE });
        notifyDisabled();
        return;
      }
      if (activeIds.size >= 32) {
        send({ type: 'result', id: call.id, success: false, result: 'Browser tool queue is full. Try again later.' });
        return;
      }
      activeIds.add(call.id);
      const targetProject = KGCore.instance().getCurrentProject();
      const targetMode = mode;
      const entry = catalog.get(call.name);
      const check = () => {
        if (!isMcpEnabled()) {
          notifyDisabled();
          throw new Error(MCP_DISABLED_MESSAGE);
        }
        if (stopped || connection !== socket || connection.readyState !== WebSocket.OPEN || cancelled.has(call.id) || Date.now() >= call.deadline) throw new Error('Request expired or cancelled; execution stopped.');
        if (call.revision !== revision || targetMode !== getEffectiveAgentMode() || targetProject !== KGCore.instance().getCurrentProject()) throw new Error('Agent mode or project changed. Refresh the tools and retry.');
        if (!entry || entry.internalName === 'update_todo_list') throw new Error('Tool is not available to MCP.');
      };
      queue = queue.then(async () => {
        let result: BridgeResult;
        try {
          check();
          status(`running ${call.name}`);
          result = await entry!.execute(call.args, check);
          status(`${call.name}: ${result.success ? 'completed' : 'failed'}`);
        } catch (error) {
          result = { success: false, result: error instanceof Error ? error.message : String(error) };
        } finally { cancelled.delete(call.id); activeIds.delete(call.id); }
        if (connection === socket) send({ type: 'result', id: call.id, ...result });
      });
    };
    socket.onclose = event => {
      setMcpServiceAvailable(false);
      status(event.code === 1008 ? 'another browser tab already owns the connection; reload this tab after closing it' : 'disconnected');
      if (!stopped && event.code !== 1008) retry = setTimeout(reconnect, 2000);
    };
    socket.onerror = () => { setMcpServiceAvailable(false); }; // onclose handles reconnects; never retry tool calls.
  };
  let retryDelay = 2000;
  const reconnect = async () => {
    if (stopped) return;
    try {
      const response = await fetch(DISCOVERY_PATH, { cache: 'no-store', signal: AbortSignal.timeout(3000) });
      const discovery = await response.json();
      if (!response.ok || typeof discovery.bridgeToken !== 'string') throw new Error('Local MCP server unavailable');
      token = discovery.bridgeToken;
      if (!stopped) connect();
      retryDelay = 2000;
    } catch {
      retryDelay = Math.min(retryDelay * 2, 30_000);
      if (!stopped) retry = setTimeout(reconnect, retryDelay);
    }
  };
  connect();
  const stop = () => {
    stopped = true;
    setMcpServiceAvailable(false);
    clearTimeout(retry);
    unsubscribeConfig();
    unsubscribeProject();
    socket?.close();
    window.removeEventListener('pagehide', stop);
  };
  window.addEventListener('pagehide', stop);
  import.meta.hot?.dispose(stop);
  return stop;
}
