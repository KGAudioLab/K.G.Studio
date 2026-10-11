import { describe, expect, it, vi } from 'vitest';
import { createDefaultFXChain } from './defaultFXChain';
import { ConfigManager } from '../config/ConfigManager';
import config from '../../../public/config.json';
import { KGEQFX, KGReverbFX } from './index';
import { serializeFXPreset } from './fxPresets';

describe('Default FX chain', () => {
  it('creates independent EQ then Reverb instances using the current factory config', () => {
    const defaults = structuredClone(config); defaults.audio.fx_defaults.reverb.wet = .42;
    defaults.audio.fx_defaults.eq.bands[1].gainDb = 3;
    const spy = vi.spyOn(ConfigManager.instance(), 'getDefaults').mockReturnValue(defaults as ReturnType<ConfigManager['getDefaults']>);
    try {
      const a = createDefaultFXChain(); const b = createDefaultFXChain();
      expect(a.map(effect => effect.getType())).toEqual(['eq', 'reverb']);
      expect(serializeFXPreset(a)).toEqual(serializeFXPreset(b));
      expect(a[0].getId()).not.toBe(b[0].getId()); expect(a[1].getId()).not.toBe(b[1].getId());
      expect((a[0] as KGEQFX).getBands()).toEqual(defaults.audio.fx_defaults.eq.bands);
      expect((a[1] as KGReverbFX).getWet()).toBe(.42);
      (a[1] as KGReverbFX).setWet(.8); expect((b[1] as KGReverbFX).getWet()).toBe(.42);
    } finally { spy.mockRestore(); }
  });
});
