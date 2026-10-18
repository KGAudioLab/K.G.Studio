import type { Plugin, PreviewServer, ViteDevServer } from 'vite';
import { Server as HttpServer } from 'node:http';

/** Loaded only by explicit MCP commands; never imported by the browser. */
export function localMcpPlugin(): Plugin {
  const closers: Array<() => void> = [];
  const attach = async (server: ViteDevServer | PreviewServer) => {
    if (!(server.httpServer instanceof HttpServer)) throw new Error('MCP requires a local HTTP/1 server.');
    const { createLocalMcpServer } = await import('./mcpServer');
    const mcp = createLocalMcpServer(server.httpServer);
    closers.push(mcp.close);
    server.middlewares.use((req, res, next) => { void mcp.middleware(req, res, next); });
    const announce = () => {
      const address = server.httpServer!.address();
      if (!address || typeof address === 'string') return;
      console.log(`\nK.G.Studio MCP (2025-11-25)\nOpen in your browser: http://127.0.0.1:${address.port}${server.config.base}\nMCP URL: http://127.0.0.1:${address.port}/mcp\nKeep the local server running AND the app open in your browser. Only one tab can control MCP.\n`);
    };
    if (server.httpServer.listening) announce();
    else server.httpServer.once('listening', announce);
  };
  return {
    name: 'kgstudio-local-mcp',
    configureServer: attach,
    configurePreviewServer: attach,
    closeBundle() { for (const close of closers) close(); },
  };
}
