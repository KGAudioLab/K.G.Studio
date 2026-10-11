import chain from 'virtual:fx-default-chain';
import { createFX, type KGFX } from './index';

export function createDefaultFXChain(): KGFX[] {
  return chain.effects.map(node => createFX(node.type));
}
