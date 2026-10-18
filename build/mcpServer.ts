import { randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import type { IncomingMessage, Server as HttpServer, ServerResponse } from 'node:http';
import { WebSocket, WebSocketServer } from 'ws';
import Ajv from 'ajv';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { CallToolRequestSchema, ListToolsRequestSchema, type Tool } from '@modelcontextprotocol/sdk/types.js';
import { BRIDGE_PATH, DISCOVERY_PATH, MCP_PATH, MCP_PROTOCOL_VERSION, type BridgeResult, type BridgeTool } from '../src/mcp/protocol';

const MAX_BODY = 1024 * 1024;
const MAX_PENDING = 32;
const MAX_SESSIONS = 16;
const CALL_TIMEOUT = 120_000;
const SESSION_IDLE = 30 * 60_000;
const unavailable = 'K.G.Studio MCP is not ready because no browser tab has registered its tools. Keep the local MCP server running and open the local app URL printed by the server in your browser. If the app is already open in your browser, reload that tab to reconnect, then refresh tools/list. Keep the connected tab open.';
const serverInstructions = [
  'K.G.Studio is a browser-based digital audio workstation (DAW) for composing, arranging, and editing music. This local MCP service lets external assistants inspect and edit the active music project in the connected K.G.Studio browser tab.',
  'Available tools can list instruments and MIDI tracks; create, rename, update, or delete MIDI tracks; read, add, or remove MIDI notes; adjust track volume, pan, mute, and solo; and read, write, or remove global tempo changes, key signatures, chord annotations, and markers. Advanced mode also provides MIDI controller, pitch-bend, volume, and pan automation editing. Chord annotations and markers are references only: create MIDI notes on instrument tracks for audible music. Only capabilities exposed in the current tool catalog are available through MCP; other DAW features are not automatically accessible.',
  `Treat the service as ready for use and proceed with the available tools; ask the user to troubleshoot setup only if a tool or connection error indicates a problem. Calls use the connected browser tab's active project, selection, and undo history. Inspect the project and selection before editing, and use explicit track identifiers when available. Edits use the app's command system and support its undo behavior. Write tools may wait for confirmation in the browser unless the app's tool fast-forward setting is enabled.`,
  `Tools follow the app's effective agent mode (Regular, Advanced, or Efficient); the Local LLM (Browser) provider forces Efficient mode. Refresh tools/list when the mode changes. Mode-specific tool names distinguish incompatible contracts. Advanced positions and durations use integer ticks, with 960 ticks per quarter note. Regular/Efficient timing uses quarter notes. Follow each tool's description and input schema for exact targeting rules, units, required parameters, and constraints. Discover valid instrument names with the instrument-listing tool before assigning instruments.`,
  'Calls expire after two minutes. If an edit times out or disconnects, inspect the project before retrying because it may already have completed. update_todo_list is internal to the in-app assistant and is never exposed through MCP.',
].join('\n\n');

function secretMatches(actual: string | undefined, expected: string): boolean {
  const a = Buffer.from(actual ?? '');
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

function localRequest(req: IncomingMessage, port: number): boolean {
  const hosts = [`127.0.0.1:${port}`, `localhost:${port}`, `[::1]:${port}`];
  if (!hosts.includes(req.headers.host ?? '')) return false;
  const remote = req.socket.remoteAddress;
  if (remote !== '127.0.0.1' && remote !== '::1' && remote !== '::ffff:127.0.0.1') return false;
  return !req.headers.origin || hosts.some(host => req.headers.origin === `http://${host}`);
}

async function readBody(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let length = 0;
  for await (const chunk of req) {
    length += Buffer.byteLength(chunk);
    if (length > MAX_BODY) throw new Error('Request body exceeds 1 MiB.');
    chunks.push(Buffer.from(chunk));
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

export function createLocalMcpServer(http: HttpServer) {
  const bridgeToken = randomBytes(32).toString('hex');
  const ajv = new Ajv({ allErrors: true });
  const sessions = new Map<string, { server: Server; transport: StreamableHTTPServerTransport; touched: number }>();
  const pending = new Map<string, { resolve: (result: BridgeResult) => void; timer: ReturnType<typeof setTimeout>; cleanup: () => void }>();
  const wss = new WebSocketServer({ noServer: true, maxPayload: MAX_BODY, handleProtocols: () => 'kgstudio-bridge' });
  let browser: WebSocket | undefined;
  let revision = '';
  let tools: BridgeTool[] = [];
  let validators = new Map<string, Ajv.ValidateFunction>();
  let closed = false;
  const getPort = () => {
    const address = http.address();
    return typeof address === 'object' && address ? address.port : 0;
  };
  const notify = () => {
    for (const { server } of sessions.values()) void server.notification({ method: 'notifications/tools/list_changed' }).catch(() => {});
  };
  const finish = (id: string, result: BridgeResult) => {
    const request = pending.get(id);
    if (!request) return;
    pending.delete(id);
    clearTimeout(request.timer);
    request.cleanup();
    request.resolve(result);
  };
  const cancel = (id: string, reason: string) => {
    if (browser?.readyState === WebSocket.OPEN) browser.send(JSON.stringify({ type: 'cancel', id }));
    finish(id, { success: false, result: reason });
  };
  const disconnect = () => {
    browser = undefined;
    tools = [];
    validators.clear();
    revision = '';
    for (const id of pending.keys()) finish(id, { success: false, result: `${unavailable} A disconnected edit may already have completed; inspect the project before retrying.` });
    notify();
  };
  wss.on('connection', socket => {
    if (browser) { socket.close(1008, 'Another browser tab already controls MCP'); return; }
    browser = socket;
    socket.on('error', () => {});
    socket.on('close', () => { if (browser === socket) disconnect(); });
    socket.on('message', data => {
      if (browser !== socket) return;
      try {
        const message = JSON.parse(data.toString());
        if (message.type === 'catalog') {
          if (typeof message.revision !== 'string' || !Array.isArray(message.tools) || message.tools.length > 100) throw new Error('Invalid catalog');
          const nextValidators = new Map<string, Ajv.ValidateFunction>();
          for (const tool of message.tools as BridgeTool[]) {
            if (!/^[a-zA-Z0-9_-]{1,64}$/.test(tool.name) || /(^|_)update_todo_list$/.test(tool.name) || nextValidators.has(tool.name)) throw new Error('Invalid MCP tool name');
            if (tool.inputSchema?.type !== 'object' || typeof tool.description !== 'string') throw new Error('Invalid tool schema');
            nextValidators.set(tool.name, ajv.compile(tool.inputSchema));
          }
          // Catalog changes invalidate calls that have not yet executed in the browser.
          tools = message.tools;
          validators = nextValidators;
          revision = message.revision;
          notify();
        } else if (message.type === 'result' && typeof message.id === 'string' && typeof message.success === 'boolean'
          && (typeof message.result === 'string' || (message.result && typeof message.result === 'object' && !Array.isArray(message.result)))) {
          finish(message.id, { success: message.success, result: message.result });
        }
      } catch { socket.close(1008, 'Invalid browser bridge message'); }
    });
  });

  const onUpgrade = (req: IncomingMessage, socket: import('node:stream').Duplex, head: Buffer) => {
    if (req.url?.split('?')[0] !== BRIDGE_PATH) return;
    const protocols = req.headers['sec-websocket-protocol']?.split(',').map(value => value.trim()) ?? [];
    if (!localRequest(req, getPort()) || !req.headers.origin || !protocols.some(value => secretMatches(value, `token.${bridgeToken}`))) {
      socket.end('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n');
      return;
    }
    wss.handleUpgrade(req, socket, head, ws => wss.emit('connection', ws, req));
  };
  http.on('upgrade', onUpgrade);

  const callBrowser = (name: string, args: Record<string, unknown>, signal: AbortSignal): Promise<BridgeResult> => {
    if (!browser || !revision || browser.readyState !== WebSocket.OPEN) return Promise.resolve({ success: false, result: unavailable });
    if (pending.size >= MAX_PENDING) return Promise.resolve({ success: false, result: 'MCP request queue is full. Try again later.' });
    const validate = validators.get(name);
    if (!validate || /(^|_)update_todo_list$/.test(name)) return Promise.resolve({ success: false, result: 'Tool is unavailable in the current mode. Refresh tools/list.' });
    if (!validate(args)) return Promise.resolve({ success: false, result: `Invalid tool arguments: ${ajv.errorsText(validate.errors)}` });
    if (signal.aborted) return Promise.resolve({ success: false, result: 'Request cancelled.' });
    return new Promise(resolve => {
      const id = randomUUID();
      const onAbort = () => cancel(id, 'Request cancelled. An edit already executing may still finish.');
      const timer = setTimeout(() => cancel(id, 'Tool request timed out. Inspect the project before retrying an edit.'), CALL_TIMEOUT);
      pending.set(id, { resolve, timer, cleanup: () => signal.removeEventListener('abort', onAbort) });
      signal.addEventListener('abort', onAbort, { once: true });
      browser!.send(JSON.stringify({ type: 'call', id, name, args, revision, deadline: Date.now() + CALL_TIMEOUT }));
    });
  };

  const middleware = async (req: IncomingMessage, res: ServerResponse, next: () => void) => {
    const path = req.url?.split('?')[0];
    if (path !== MCP_PATH && path !== DISCOVERY_PATH) { next(); return; }
    res.setHeader('Cache-Control', 'no-store');
    const reject = (code: number, message: string) => { res.writeHead(code, { 'Content-Type': 'application/json' }).end(JSON.stringify({ error: message })); };
    if (!localRequest(req, getPort())) { reject(403, 'Only the local K.G.Studio origin is allowed.'); return; }
    if (path === DISCOVERY_PATH) {
      // Browsers supply Fetch Metadata; do not make pairing secrets readable cross-origin.
      if (req.method !== 'GET' || req.headers['sec-fetch-site'] !== 'same-origin') { reject(403, 'Same-origin browser discovery required.'); return; }
      res.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify({ protocolVersion: MCP_PROTOCOL_VERSION, bridgeToken }));
      return;
    }
    const version = req.headers['mcp-protocol-version'];
    if (version && version !== MCP_PROTOCOL_VERSION) { reject(400, `Only MCP ${MCP_PROTOCOL_VERSION} is supported.`); return; }
    try {
      const sessionId = req.headers['mcp-session-id'];
      const session = typeof sessionId === 'string' ? sessions.get(sessionId) : undefined;
      if (sessionId && !session) { reject(404, 'MCP session expired. Reinitialize.'); return; }
      const body = req.method === 'POST' ? await readBody(req) : undefined;
      if (session) {
        session.touched = Date.now();
        await session.transport.handleRequest(req, res, body);
        return;
      }
      if (req.method !== 'POST' || !body || typeof body !== 'object' || !('method' in body) || body.method !== 'initialize') {
        reject(400, 'Initialize an MCP session first.'); return;
      }
      const init = body as { params?: { protocolVersion?: string } };
      if (init.params?.protocolVersion !== MCP_PROTOCOL_VERSION) { reject(400, `Initialize using MCP ${MCP_PROTOCOL_VERSION}.`); return; }
      if (sessions.size >= MAX_SESSIONS) { reject(429, 'Too many MCP sessions.'); return; }
      const server = new Server({ name: 'kgstudio', version: '1.0.0' }, {
        capabilities: { tools: { listChanged: true } },
        instructions: serverInstructions,
      });
      const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: randomUUID,
        enableJsonResponse: true,
        onsessioninitialized: id => { sessions.set(id, { server, transport, touched: Date.now() }); },
      });
      server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: tools as Tool[] }));
      server.setRequestHandler(CallToolRequestSchema, async (request, extra) => {
        const result = await callBrowser(request.params.name, request.params.arguments ?? {}, extra.signal);
        return {
          content: [{ type: 'text' as const, text: typeof result.result === 'string' ? result.result : JSON.stringify(result.result) }],
          ...(typeof result.result === 'object' ? { structuredContent: result.result } : {}),
          isError: !result.success,
        };
      });
      transport.onclose = () => { if (transport.sessionId) sessions.delete(transport.sessionId); };
      await server.connect(transport);
      await transport.handleRequest(req, res, body);
    } catch (error) {
      if (!res.headersSent) reject(400, error instanceof Error ? error.message : 'Invalid MCP request.');
      else res.end();
    }
  };
  const reaper = setInterval(() => {
    for (const [id, session] of sessions) if (Date.now() - session.touched > SESSION_IDLE) {
      sessions.delete(id);
      void session.server.close();
    }
    // Detect suspended or closed browser connections without frequent HTTP polling.
    if (browser?.readyState === WebSocket.OPEN) browser.ping();
  }, 60_000);
  reaper.unref();
  const close = () => {
    if (closed) return;
    closed = true;
    clearInterval(reaper);
    http.removeListener('upgrade', onUpgrade);
    for (const socket of wss.clients) socket.terminate();
    wss.close();
    disconnect();
    for (const session of sessions.values()) void session.server.close();
    sessions.clear();
  };
  http.once('close', close);
  return { middleware, close };
}
