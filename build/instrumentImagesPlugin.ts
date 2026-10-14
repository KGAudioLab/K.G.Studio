import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { Plugin } from 'vite';

/** Public assets stay public; only their filenames are bundled. */
export function instrumentImagesPlugin(): Plugin {
  const directory = fileURLToPath(new URL('../public/resources/instruments/', import.meta.url));
  const id = '\0virtual:instrument-images';
  const orderFile = `${directory}order.json`;
  const orderId = '\0virtual:instrument-image-order';
  return {
    name: 'kgstudio-instrument-images',
    resolveId(source) {
      if (source === 'virtual:instrument-images') return id;
      if (source === 'virtual:instrument-image-order') return orderId;
    },
    load(source) {
      if (source === orderId) {
        this.addWatchFile(orderFile);
        const order: unknown = JSON.parse(readFileSync(orderFile, 'utf8'));
        if (!Array.isArray(order) || order.some(name => typeof name !== 'string')) {
          throw new Error('Instrument order.json must contain an array of image filenames');
        }
        return `export default ${JSON.stringify(order)};`;
      }
      if (source !== id) return;
      const names = readdirSync(directory, { withFileTypes: true })
        .filter(entry => entry.isFile() && /\.png$/i.test(entry.name))
        .map(entry => entry.name).sort();
      for (const name of names) this.addWatchFile(`${directory}${name}`);
      return `export default ${JSON.stringify(names)};`;
    },
    handleHotUpdate(context) {
      if (context.file !== orderFile) return;
      const module = context.server.moduleGraph.getModuleById(orderId);
      if (module) context.server.moduleGraph.invalidateModule(module);
      context.server.ws.send({ type: 'full-reload' });
      return [];
    },
    configureServer(server) {
      const reload = (file: string) => {
        if (!file.startsWith(directory) || !/\.png$/i.test(file)) return;
        const module = server.moduleGraph.getModuleById(id);
        if (module) server.moduleGraph.invalidateModule(module);
        server.ws.send({ type: 'full-reload' });
      };
      server.watcher.add(directory);
      server.watcher.on('add', reload);
      server.watcher.on('unlink', reload);
      server.httpServer?.once('close', () => {
        server.watcher.off('add', reload);
        server.watcher.off('unlink', reload);
      });
    },
  };
}
