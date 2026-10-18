// @vitest-environment node
import { afterEach, describe, expect, it } from 'vitest';
import { createServer, request } from 'node:http';
import { once } from 'node:events';
import { WebSocket } from 'ws';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { ToolListChangedNotificationSchema } from '@modelcontextprotocol/sdk/types.js';
import { createLocalMcpServer } from './mcpServer';

const cleanup: Array<() => Promise<unknown> | void> = [];
afterEach(async () => { for (const close of cleanup.splice(0).reverse()) await close(); });

async function setup() {
  const http = createServer((req, res) => { void mcp.middleware(req, res, () => res.writeHead(404).end()); });
  const mcp = createLocalMcpServer(http);
  http.listen(0, '127.0.0.1');
  await once(http, 'listening');
  const address = http.address() as { port: number };
  const origin = `http://127.0.0.1:${address.port}`;
  cleanup.push(async () => { mcp.close(); http.closeAllConnections(); await new Promise<void>(resolve => http.close(() => resolve())); });
  const client = new Client({ name: 'test', version: '1' });
  await client.connect(new StreamableHTTPClientTransport(new URL(`${origin}/mcp`)));
  cleanup.push(() => client.close());
  const connectBrowser = async () => {
    const response = await fetch(`${origin}/internal/kgstudio-mcp`, { headers: { 'Sec-Fetch-Site': 'same-origin' } });
    const { bridgeToken } = await response.json() as { bridgeToken: string };
    const browser = new WebSocket(`${origin.replace('http:', 'ws:')}/internal/kgstudio-mcp/bridge`, ['kgstudio-bridge', `token.${bridgeToken}`], { origin });
    await once(browser, 'open');
    cleanup.push(() => { browser.terminate(); });
    return browser;
  };
  return { client, origin, connectBrowser };
}

const tool = (name: string) => ({ name, description: 'Test tool', inputSchema: { type: 'object', properties: { value: { type: 'number' } }, required: ['value'] }, annotations: { readOnlyHint: true } });

describe('local MCP server', () => {
  it('requires both a browser and the local runtime, then dynamically refreshes tools and relays results', async () => {
    const { client, connectBrowser } = await setup();
    expect((await client.listTools()).tools).toEqual([]);
    const absent = await client.callTool({ name: 'read_music', arguments: {} });
    expect(absent.isError).toBe(true);
    expect(JSON.stringify(absent)).toContain('open in your browser');
    const browser = await connectBrowser();
    const changed = new Promise<void>(resolve => client.setNotificationHandler(ToolListChangedNotificationSchema, () => resolve()));
    browser.send(JSON.stringify({ type: 'catalog', revision: 'regular-1', tools: [tool('regular_read_music')] }));
    await changed;
    expect((await client.listTools()).tools.map(tool => tool.name)).toEqual(['regular_read_music']);
    browser.on('message', data => {
      const call = JSON.parse(data.toString());
      if (call.type === 'call') browser.send(JSON.stringify({ type: 'result', id: call.id, success: true, result: { value: call.args.value, revision: call.revision } }));
    });
    const result = await client.callTool({ name: 'regular_read_music', arguments: { value: 4 } });
    expect(result.structuredContent).toEqual({ value: 4, revision: 'regular-1' });
    const changedAgain = new Promise<void>(resolve => client.setNotificationHandler(ToolListChangedNotificationSchema, () => resolve()));
    browser.send(JSON.stringify({ type: 'catalog', revision: 'advanced-2', tools: [tool('advanced_read_music')] }));
    await changedAgain;
    expect((await client.listTools()).tools.map(tool => tool.name)).toEqual(['advanced_read_music']);
    expect((await client.callTool({ name: 'regular_read_music', arguments: { value: 4 } })).isError).toBe(true);
    expect((await client.callTool({ name: 'update_todo_list', arguments: {} })).isError).toBe(true);
  });

  it('validates arguments before forwarding and fails pending requests when the browser disconnects', async () => {
    const { client, connectBrowser } = await setup();
    const browser = await connectBrowser();
    const changed = new Promise<void>(resolve => client.setNotificationHandler(ToolListChangedNotificationSchema, () => resolve()));
    browser.send(JSON.stringify({ type: 'catalog', revision: '1', tools: [tool('read_music')] }));
    await changed;
    const invalid = await client.callTool({ name: 'read_music', arguments: { value: 'wrong' } });
    expect(invalid.isError).toBe(true);
    expect(JSON.stringify(invalid)).toContain('Invalid tool arguments');
    browser.once('message', () => browser.close());
    const pending = await client.callTool({ name: 'read_music', arguments: { value: 1 } });
    expect(pending.isError).toBe(true);
    expect(JSON.stringify(pending)).toContain('disconnected edit may already have completed');
    expect((await client.listTools()).tools).toEqual([]);
  });

  it('accepts token-free local requests while rejecting cross-origin, wrong-host, and wrong-version requests', async () => {
    const { origin } = await setup();
    expect((await fetch(`${origin}/mcp`)).status).toBe(400); // Initialization required, no authentication required.
    expect((await fetch(`${origin}/mcp`, { headers: { Origin: 'https://evil.example' } })).status).toBe(403);
    const wrongHost = await new Promise<number | undefined>(resolve => {
      request(`${origin}/mcp`, { headers: { Host: 'evil.example' } }, response => {
        response.resume();
        resolve(response.statusCode);
      }).end();
    });
    expect(wrongHost).toBe(403);
    expect((await fetch(`${origin}/mcp`, { headers: { 'MCP-Protocol-Version': '2026-07-28' } })).status).toBe(400);
    expect((await fetch(`${origin}/internal/kgstudio-mcp`)).status).toBe(403);
  });

  it('allows only one controlling browser tab and rejects catalogs exposing internal todos', async () => {
    const { client, connectBrowser } = await setup();
    const first = await connectBrowser();
    const second = await connectBrowser();
    const [code] = await once(second, 'close');
    expect(code).toBe(1008);
    first.send(JSON.stringify({ type: 'catalog', revision: 'bad', tools: [tool('update_todo_list')] }));
    const [invalidCode] = await once(first, 'close');
    expect(invalidCode).toBe(1008);
    expect((await client.listTools()).tools).toEqual([]);
  });
});
