import { readFile } from 'node:fs/promises';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { resolve } from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { parseEnv } from 'node:util';
import type { Plugin, PreviewServer, ViteDevServer } from 'vite';
import { HF_MODEL_DOWNLOAD_HEADER, HF_MODEL_DOWNLOAD_ROUTE, isHuggingFaceModelUrl, isLoopbackHostname } from '../src/util/huggingFaceModelEndpoint';

export const HF_CREDENTIAL_FILE = '.hfrc';

async function readHuggingFaceToken(root: string): Promise<string | undefined> {
  const contents = await readFile(resolve(root, HF_CREDENTIAL_FILE), 'utf8').catch((error: NodeJS.ErrnoException) => {
    if (error.code === 'ENOENT') return undefined;
    throw error;
  });
  if (contents === undefined) return undefined;
  const token = parseEnv(contents).HF_TOKEN;
  if (!token || !/^hf_[A-Za-z0-9]+$/.test(token)) throw new Error('Invalid HF_TOKEN');
  return token;
}

function isLocalBrowserRequest(req: IncomingMessage): boolean {
  const hostname = req.headers.host?.replace(/:\d+$/, '') ?? '';
  return req.headers['sec-fetch-site'] === 'same-origin' && isLoopbackHostname(hostname)
    && ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(req.socket.remoteAddress ?? '');
}

async function serveDownload(req: IncomingMessage, res: ServerResponse, root: string): Promise<void> {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'GET' || !isLocalBrowserRequest(req)) {
    res.writeHead(403).end();
    return;
  }
  const requestUrl = new URL(req.url!, 'http://localhost');
  const source = URL.parse(requestUrl.searchParams.get('url') ?? '');
  if (!source || !isHuggingFaceModelUrl(source)) {
    res.writeHead(400).end();
    return;
  }
  const abort = new AbortController();
  const onClose = () => abort.abort();
  res.once('close', onClose);
  try {
    const token = await readHuggingFaceToken(root);
    if (!token) {
      res.writeHead(204).end();
      return;
    }
    res.setHeader(HF_MODEL_DOWNLOAD_HEADER, '1');
    const upstream = await fetch(source, {
      // Fetch strips Authorization if Hugging Face redirects to a different origin.
      headers: { Authorization: `Bearer ${token}`, 'Accept-Encoding': 'identity' },
      signal: abort.signal,
    });
    if (!upstream.ok || !upstream.body) {
      await upstream.body?.cancel();
      res.writeHead(upstream.status).end();
      return;
    }
    const size = upstream.headers.get('Content-Length');
    if (size && !upstream.headers.has('Content-Encoding')) res.setHeader('Content-Length', size);
    res.writeHead(200, { 'Content-Type': 'application/octet-stream' });
    await pipeline(Readable.from(upstream.body), res);
  } catch {
    if (res.destroyed) return;
    if (res.headersSent) {
      res.destroy();
      return;
    }
    res.removeHeader('Content-Length');
    res.setHeader(HF_MODEL_DOWNLOAD_HEADER, '1');
    res.writeHead(502).end();
  } finally {
    res.off('close', onClose);
  }
}

export function huggingFaceModelPlugin(): Plugin {
  const attach = (server: ViteDevServer | PreviewServer) => {
    const route = `${server.config.base}${HF_MODEL_DOWNLOAD_ROUTE}`;
    server.middlewares.use((req, res, next) => {
      if (req.url?.split('?')[0] !== route) return next();
      void serveDownload(req, res, server.config.root);
    });
  };
  return {
    name: 'kgstudio-hugging-face-models',
    configureServer: attach,
    configurePreviewServer: attach,
  };
}
