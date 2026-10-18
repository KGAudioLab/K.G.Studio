import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { startMcpBrowserBridge } from './browserBridge';
import { getMcpServiceAvailable, setMcpServiceAvailable } from './serviceAvailability';

const state = vi.hoisted(() => ({
  mode: 'regular', enabled: true, project: {}, configChanged: (_keys: string[]) => {}, projectChanged: () => {},
  execute: vi.fn(), confirm: vi.fn(), alert: vi.fn(), status: vi.fn(),
}));
vi.mock('../core/config/ConfigManager', () => ({ ConfigManager: { instance: () => ({ get: () => state.enabled, addChangeListener: (listener: (keys: string[]) => void) => { state.configChanged = listener; return () => {}; } }) } }));
vi.mock('../core/KGCore', () => ({ KGCore: { instance: () => ({ getCurrentProject: () => state.project, setStatus: state.status }) } }));
vi.mock('../stores/projectStore', () => ({ useProjectStore: {
  getState: () => ({ toolFastForwardEnabled: false }),
  subscribe: (listener: () => void) => { state.projectChanged = listener; return () => {}; },
} }));
vi.mock('../util/agentMode', () => ({ getEffectiveAgentMode: () => state.mode }));
vi.mock('../util/dialogUtil', () => ({ showConfirm: state.confirm, showAlert: state.alert }));
vi.mock('../agent/tools/toolExecution', () => ({ executeAvailableTool: state.execute }));
vi.mock('./catalog', () => ({ getMcpCatalog: () => new Map([[`${state.mode}_write`, {
  definition: { name: `${state.mode}_write` },
  internalName: 'write',
  execute: (args: Record<string, unknown>, check: () => void) => { check(); return state.execute('write', args, state.mode); },
}]]) }));

class FakeSocket {
  static OPEN = 1;
  static sockets: FakeSocket[] = [];
  readyState = 1;
  onopen: (() => void) | null = null;
  onclose: ((event: { code: number }) => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;
  onerror: (() => void) | null = null;
  sent: Array<Record<string, unknown>> = [];
  constructor() { FakeSocket.sockets.push(this); }
  send(data: string) { this.sent.push(JSON.parse(data)); }
  close() { this.readyState = 3; }
  receive(message: unknown) { this.onmessage?.({ data: JSON.stringify(message) }); }
}

let stop: (() => void) | undefined;
const flush = async () => { for (let i = 0; i < 12; i++) await Promise.resolve(); };
async function setup() {
  stop = await startMcpBrowserBridge();
  const socket = FakeSocket.sockets.at(-1)!;
  socket.onopen?.();
  const revision = socket.sent.at(-1)!.revision;
  const call = { type: 'call', id: 'call-1', name: 'regular_write', args: {}, revision, deadline: Date.now() + 60_000 };
  return { socket, call };
}

beforeEach(() => {
  setMcpServiceAvailable(false);
  state.mode = 'regular';
  state.enabled = true;
  state.project = {};
  state.execute.mockReset().mockResolvedValue({ success: true, result: 'done' });
  state.confirm.mockReset().mockResolvedValue(true);
  state.alert.mockReset().mockResolvedValue(undefined);
  FakeSocket.sockets = [];
  vi.stubGlobal('location', new URL('http://127.0.0.1:5173/kgstudio/'));
  vi.stubGlobal('WebSocket', FakeSocket);
  vi.stubGlobal('fetch', vi.fn().mockImplementation(async () => new Response(JSON.stringify({ protocolVersion: '2025-11-25', bridgeToken: 'test-token' }), { headers: { 'Content-Type': 'application/json' } })));
});
afterEach(() => { stop?.(); stop = undefined; vi.unstubAllGlobals(); });

describe('browser MCP bridge', () => {
  it('does not discover or connect from public static hosting', async () => {
    vi.stubGlobal('location', new URL('https://kgaudiolab.github.io/kgstudio/'));
    stop = await startMcpBrowserBridge();
    expect(fetch).not.toHaveBeenCalled();
    expect(FakeSocket.sockets).toHaveLength(0);
  });

  it('tracks availability from the existing WebSocket without polling', async () => {
    const { socket } = await setup();
    expect(getMcpServiceAvailable()).toBe(true);
    socket.onerror?.();
    expect(getMcpServiceAvailable()).toBe(false);
    socket.onopen?.();
    expect(getMcpServiceAvailable()).toBe(true);
    stop?.();
    expect(getMcpServiceAvailable()).toBe(false);
  });

  it('executes enabled writes without a confirmation popup', async () => {
    const { socket, call } = await setup();
    socket.receive(call);
    await flush();
    expect(state.confirm).not.toHaveBeenCalled();
    expect(state.execute).toHaveBeenCalledWith('write', {}, 'regular');
    expect(socket.sent.at(-1)).toMatchObject({ type: 'result', success: true });
  });

  it('rejects disabled requests immediately and shows an informational popup', async () => {
    state.enabled = false;
    const { socket, call } = await setup();
    socket.receive(call);
    await flush();
    expect(state.execute).not.toHaveBeenCalled();
    expect(state.confirm).not.toHaveBeenCalled();
    expect(String(socket.sent.at(-1)?.result)).toContain('Settings → MCP');
    expect(state.alert).toHaveBeenCalledWith(expect.stringContaining('Settings → MCP'));
    state.enabled = true;
    state.configChanged(['general.mcp_enabled']);
    socket.receive({ ...call, revision: socket.sent.at(-1)?.revision });
    await flush();
    expect(state.execute).toHaveBeenCalledOnce();
  });

  it('coalesces blocked requests while the notice is open without delaying their errors', async () => {
    let dismiss: () => void = () => {};
    state.alert.mockImplementationOnce(() => new Promise<void>(resolve => { dismiss = resolve; }));
    state.enabled = false;
    const { socket, call } = await setup();
    for (const id of ['one', 'two', 'three']) socket.receive({ ...call, id });
    expect(socket.sent.filter(message => message.type === 'result')).toHaveLength(3);
    await flush();
    expect(state.alert).toHaveBeenCalledOnce();
    expect(state.execute).not.toHaveBeenCalled();
    dismiss();
    await flush();
    socket.receive({ ...call, id: 'later' });
    await flush();
    expect(state.alert).toHaveBeenCalledTimes(2);
  });

  it.each(['mode', 'project', 'cancel', 'disconnect', 'disabled', 'reenabled'] as const)('rejects queued calls when %s changes', async change => {
    let finish: (result: unknown) => void = () => {};
    state.execute.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    const { socket, call } = await setup();
    socket.receive(call);
    await flush();
    socket.receive({ ...call, id: 'queued' });
    if (change === 'mode') { state.mode = 'advanced'; state.configChanged([]); }
    if (change === 'project') { state.project = {}; state.projectChanged(); }
    if (change === 'cancel') socket.receive({ type: 'cancel', id: 'queued' });
    if (change === 'disconnect') socket.close();
    if (change === 'disabled' || change === 'reenabled') {
      state.enabled = false;
      state.configChanged(['general.mcp_enabled']);
      if (change === 'reenabled') { state.enabled = true; state.configChanged(['general.mcp_enabled']); }
    }
    finish({ success: true, result: 'done' });
    await flush();
    expect(state.execute).toHaveBeenCalledTimes(1);
  });

  it('rejects expired calls and undisclosed internal tools before requesting approval', async () => {
    const { socket, call } = await setup();
    socket.receive({ ...call, deadline: Date.now() - 1 });
    socket.receive({ ...call, id: 'todo', name: 'update_todo_list' });
    await flush();
    expect(state.confirm).not.toHaveBeenCalled();
    expect(state.execute).not.toHaveBeenCalled();
    expect(socket.sent.at(-1)).toMatchObject({ success: false, result: 'Tool is not available to MCP.' });
  });
});
