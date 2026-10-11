import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { Plugin } from 'vite';

/** Bundle only the FX fallback values from the same public config file.
 * A virtual module avoids importing a public asset as application source.
 */
export function fxDefaultsConfigPlugin(): Plugin {
  const file = fileURLToPath(new URL('../public/config.json', import.meta.url));
  const id = '\0virtual:fx-defaults';
  const chainFile = fileURLToPath(new URL('../public/resources/fx/default.json', import.meta.url));
  const chainId = '\0virtual:fx-default-chain';
  return {
    name: 'kgstudio-fx-defaults',
    resolveId(source) {
      if (source === 'virtual:fx-defaults') return id;
      if (source === 'virtual:fx-default-chain') return chainId;
    },
    load(source) {
      if (source === chainId) {
        this.addWatchFile(chainFile);
        const chain = JSON.parse(readFileSync(chainFile, 'utf8'));
        if (chain.version !== 1 || !Array.isArray(chain.effects) || chain.effects.some((node: { type: string }) => !['eq', 'reverb', 'compressor', 'limiter'].includes(node.type))) throw new Error('Invalid default FX chain');
        return `export default ${JSON.stringify(chain)};`;
      }
      if (source !== id) return;
      this.addWatchFile(file);
      const defaults = JSON.parse(readFileSync(file, 'utf8')).audio.fx_defaults;
      return `export default ${JSON.stringify(defaults)};`;
    },
    handleHotUpdate(context) {
      if (context.file === file || context.file === chainFile) {
        const module = context.server.moduleGraph.getModuleById(context.file === file ? id : chainId);
        if (module) context.server.moduleGraph.invalidateModule(module);
        context.server.ws.send({ type: 'full-reload' });
        return [];
      }
    },
  };
}
