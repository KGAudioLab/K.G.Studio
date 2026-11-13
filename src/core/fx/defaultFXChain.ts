import chains from 'virtual:fx-default-chain';
import { createFX, type KGFX } from './index';

export function createDefaultFXChain(kind: keyof typeof chains = 'preset'): KGFX[] {
  return chains[kind].effects.map(node => createFX(node.type));
}
