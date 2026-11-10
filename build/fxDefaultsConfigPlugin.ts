import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { Plugin } from 'vite';

/** Bundle the FX fallback values and default chains from public JSON files.
 * Virtual modules avoid importing public assets as application source.
 */
export function fxDefaultsConfigPlugin(): Plugin {
  const file = fileURLToPath(new URL('../public/config.json', import.meta.url));
  const id = '\0virtual:fx-defaults';
  const chainFiles = {
    preset: fileURLToPath(new URL('../public/resources/fx/default.json', import.meta.url)),
    audio: fileURLToPath(new URL('../public/resources/fx/default-audio.json', import.meta.url)),
    midi: fileURLToPath(new URL('../public/resources/fx/default-midi.json', import.meta.url)),
  };
  const chainId = '\0virtual:fx-default-chain';
  return {
    name: 'kgstudio-fx-defaults',
    resolveId(source) {
      if (source === 'virtual:fx-defaults') return id;
      if (source === 'virtual:fx-default-chain') return chainId;
    },
    load(source) {
      if (source === chainId) {
        const chains = Object.fromEntries(Object.entries(chainFiles).map(([kind, chainFile]) => {
          this.addWatchFile(chainFile);
          const chain = JSON.parse(readFileSync(chainFile, 'utf8'));
          if (chain.version !== 1 || !Array.isArray(chain.effects) || chain.effects.some((node: { type: string }) => !['eq', 'reverb', 'compressor', 'limiter'].includes(node.type))) {
            throw new Error(`Invalid default FX chain in ${chainFile}`);
          }
          return [kind, chain];
        }));
        return `export default ${JSON.stringify(chains)};`;
      }
      if (source !== id) return;
      this.addWatchFile(file);
      const defaults = JSON.parse(readFileSync(file, 'utf8')).audio.fx_defaults;
      return `export default ${JSON.stringify(defaults)};`;
    },
    handleHotUpdate(context) {
      if (context.file === file || Object.values(chainFiles).includes(context.file)) {
        const module = context.server.moduleGraph.getModuleById(context.file === file ? id : chainId);
        if (module) context.server.moduleGraph.invalidateModule(module);
        context.server.ws.send({ type: 'full-reload' });
        return [];
      }
    },
  };
}
