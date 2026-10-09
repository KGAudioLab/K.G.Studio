// Minimal static production server. Deliberately sends no COOP/COEP headers.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, extname } from 'node:path';
const root = resolve('dist');
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.wasm': 'application/wasm', '.json': 'application/json', '.css': 'text/css' };
createServer(async (request, response) => {
  const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
  const file = resolve(root, pathname.replace(/^\/kgstudio\/?/, '').replace(/^\/+/, '') || 'index.html');
  if (!file.startsWith(root + '/') && file !== root) { response.writeHead(403).end(); return; }
  try { const data = await readFile(file); response.writeHead(200, { 'Content-Type': mime[extname(file)] || 'application/octet-stream' }); response.end(data); }
  catch { response.writeHead(404).end(); }
}).listen(4175, '127.0.0.1');
