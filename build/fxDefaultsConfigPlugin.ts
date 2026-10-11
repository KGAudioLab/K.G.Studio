import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { Plugin } from 'vite';

/** Bundle only the FX fallback values from the same public config file.
 * A virtual module avoids importing a public asset as application source.
 */
export function fxDefaultsConfigPlugin(): Plugin {
  const file = fileURLToPath(new URL('../public/config.json', import.meta.url));
  const id = '\0virtual:fx-defaults';
  return {
    name: 'kgstudio-fx-defaults',
    resolveId(source) { if (source === 'virtual:fx-defaults') return id; },
    load(source) {
      if (source !== id) return;
      this.addWatchFile(file);
      const defaults = JSON.parse(readFileSync(file, 'utf8')).audio.fx_defaults;
      return `export default ${JSON.stringify(defaults)};`;
    },
    handleHotUpdate(context) {
      if (context.file === file) {
        const module = context.server.moduleGraph.getModuleById(id);
        if (module) context.server.moduleGraph.invalidateModule(module);
        context.server.ws.send({ type: 'full-reload' });
        return [];
      }
    },
  };
}
