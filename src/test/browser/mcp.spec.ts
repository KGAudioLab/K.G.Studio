import { expect, test } from '@playwright/test';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

for (const [label, port] of [['dev', 5178], ['preview', 4178]] as const) {
  test(`${label}: project tools, MCP opt-in, undo, mode switching, and disconnect`, async ({ page }) => {
    const origin = `http://127.0.0.1:${port}`;
    // Select an external provider without making any model requests, so Advanced mode is effective.
    await page.route('**/kgstudio/config.json', async route => {
      const response = await route.fetch();
      const config = await response.json();
      config.general.llm_provider = 'openai_compatible';
      config.general.language = 'en_us';
      config.general.agent_mode = 'advanced';
      await route.fulfill({ json: config });
    });
    const client = new Client({ name: 'browser-test', version: '1' });
    await client.connect(new StreamableHTTPClientTransport(new URL(`${origin}/mcp`)));
    try {
      expect((await client.listTools()).tools).toEqual([]);
      await page.goto(`${origin}/kgstudio/`);
      await expect.poll(async () => (await client.listTools()).tools.map(tool => tool.name)).toContain('advanced_read_music');
      expect((await client.listTools()).tools.some(tool => tool.name.includes('update_todo_list'))).toBe(false);
      const call = (name: string, args: Record<string, unknown> = {}) => client.callTool({ name, arguments: args });
      const disabled = await call('get_current_project_info');
      expect(disabled.isError).toBe(true);
      expect(JSON.stringify(disabled)).toContain('Settings → MCP');
      await expect(page.locator('.dialog-message')).toContainText('MCP requests are disabled');
      await page.getByRole('button', { name: 'OK', exact: true }).click();
      await page.getByTitle('Settings', { exact: true }).click();
      await page.getByRole('button', { name: 'MCP', exact: true }).click();
      await expect(page.locator('#mcp-enabled-select')).toHaveValue('disabled');
      await page.locator('#mcp-enabled-select').selectOption('enabled');
      await page.getByTitle('Close Settings', { exact: true }).click();
      expect((await call('get_current_project_info')).isError).toBe(false);
      expect((await call('save_project')).isError).toBe(true); // Reserved Untitled Project is never renamed by MCP.
      expect((await call('create_project', { name: 'Untitled Project' })).isError).toBe(true);
      expect((await call('create_project')).isError).toBe(true);
      expect((await call('advanced_list_all_tracks')).isError).toBe(false);

      const write = await call('create_new_track', { track_name: 'MCP browser test', instrument: 'Acoustic Grand Piano' });
      expect(write.isError).toBe(false);
      await expect(page.locator('.dialog-message')).toHaveCount(0);
      expect(JSON.stringify(await call('advanced_list_all_tracks'))).toContain('MCP browser test');
      await page.getByTitle('Undo', { exact: true }).click();
      expect(JSON.stringify(await call('advanced_list_all_tracks'))).not.toContain('MCP browser test');

      expect((await call('create_project', { name: 'MCP Project A' })).isError).toBe(false);
      expect((await call('get_current_project_info')).structuredContent).toMatchObject({ name: 'MCP Project A', has_saved_snapshot: false });
      expect(JSON.stringify(await call('list_projects'))).not.toContain('MCP Project A');
      expect((await call('save_project')).structuredContent).toMatchObject({ name: 'MCP Project A', saved: true });
      expect((await call('create_new_track', { track_name: 'Unsaved A', instrument: 'Acoustic Grand Piano' })).isError).toBe(false);
      expect((await call('create_project', { name: 'MCP Project B' })).isError).toBe(false);
      expect((await call('save_project')).isError).toBe(false);
      const duplicate = await call('create_project', { name: 'MCP Project A' });
      expect(duplicate.isError).toBe(true);
      expect(JSON.stringify(duplicate)).toContain('already exists');
      expect((await call('get_current_project_info')).structuredContent).toMatchObject({ name: 'MCP Project B' });
      expect((await call('create_new_track', { track_name: 'Unsaved B', instrument: 'Acoustic Grand Piano' })).isError).toBe(false);
      expect((await call('open_project', { name: 'MCP Project A' })).isError).toBe(false);
      expect(JSON.stringify(await call('advanced_list_all_tracks'))).not.toContain('Unsaved A');
      expect((await call('open_project', { name: 'MCP Project B' })).isError).toBe(false);
      expect(JSON.stringify(await call('advanced_list_all_tracks'))).not.toContain('Unsaved B');
      expect(JSON.stringify(await call('list_projects'))).toContain('MCP Project A');
      expect(JSON.stringify(await call('list_projects'))).toContain('MCP Project B');
      expect((await call('open_project', { name: 'Missing Project' })).isError).toBe(true);
      await expect(page.locator('.dialog-message')).toHaveCount(0);

      await page.getByTitle('Settings', { exact: true }).click();
      await page.getByRole('button', { name: 'MCP', exact: true }).click();
      await expect(page.locator('#mcp-enabled-select')).toHaveValue('enabled');
      await page.locator('#mcp-enabled-select').selectOption('disabled');
      expect((await call('get_current_project_info')).isError).toBe(true);
      await expect(page.locator('.dialog-message')).toContainText('MCP requests are disabled');
      await page.getByRole('button', { name: 'OK', exact: true }).click();
      await page.locator('#mcp-enabled-select').selectOption('enabled');
      await page.getByRole('button', { name: 'Music Assistant', exact: true }).click();
      await page.locator('#general-agent-mode-select').selectOption('regular');
      await expect.poll(async () => (await client.listTools()).tools.map(tool => tool.name)).toContain('regular_read_music');
      expect((await call('advanced_read_music')).isError).toBe(true);

      // Provider changes also affect the effective mode and catalog.
      await page.locator('.settings-section select').first().selectOption('local_browser');
      await expect.poll(async () => (await client.listTools()).tools.map(tool => tool.name)).toContain('efficient_add_notes');
      expect((await client.listTools()).tools.some(tool => tool.name === 'create_new_track')).toBe(false);
      expect((await call('get_current_project_info')).structuredContent).toMatchObject({ name: 'MCP Project B', agent_mode: 'efficient' });
      await page.close({ runBeforeUnload: false });
      await expect.poll(async () => (await client.listTools()).tools.length).toBe(0);
    } finally { await client.close(); }
  });
}

test('ordinary static preview works without an MCP server or browser bridge', async ({ page, request }) => {
  const sockets: string[] = [];
  page.on('websocket', socket => sockets.push(socket.url()));
  await page.goto('http://127.0.0.1:4179/kgstudio/');
  await expect(page.locator('.status-bar')).toBeVisible();
  const response = await request.get('http://127.0.0.1:4179/mcp');
  expect(response.headers()['content-type'] ?? '').not.toContain('application/json');
  expect(sockets.some(url => url.includes('/internal/kgstudio-mcp/bridge'))).toBe(false);
  await page.getByTitle('Settings', { exact: true }).click();
  await expect(page.locator('.settings-nav').getByRole('button', { name: 'MCP', exact: true })).toHaveCount(0);
});
