import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { storage } = vi.hoisted(() => ({ storage: {
  load: vi.fn(), save: vi.fn(), getRaw: vi.fn(), saveRaw: vi.fn(),
} }));
vi.mock('../io/KGConfigStorage', () => ({ KGConfigStorage: { getInstance: () => storage } }));

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('use fallback defaults')));
});
afterEach(() => vi.unstubAllGlobals());

describe('ConfigManager reload after migration', () => {
  it('uses V6 values in the same session without saving or exposing credentials in storage', async () => {
    const config = { general: { llm_provider: 'openai', openai: { api_key: 'saved-key', model: 'saved-model', flex: true } } };
    storage.load.mockImplementation(async () => structuredClone(config));
    storage.getRaw.mockImplementation(async () => structuredClone(config));
    storage.saveRaw.mockImplementation(async (_key, value) => Object.assign(config, structuredClone(value)));
    const { ConfigManager } = await import('./ConfigManager');
    const { upgradeConfigToV6 } = await import('../config-upgrader/upgradeConfigToV6');
    const manager = ConfigManager.instance();
    await manager.initialize();
    expect(manager.get('general.llm_provider')).toBe('openai');
    await upgradeConfigToV6(manager.getDefaults()!.general);
    // Config was already initialized before the upgrader executed.
    expect(manager.get('general.llm_provider')).toBe('openai');
    const listener = vi.fn();
    manager.addChangeListener(listener);
    await manager.reloadFromStorage();
    expect(manager.get('general.llm_provider')).toBe('openai_compatible');
    expect(manager.get('general.openai_compatible')).toEqual({ api_key: 'saved-key', model: 'saved-model', base_url: 'https://api.openai.com/v1', reasoning_effort: 'medium' });
    expect(manager.get('general.openai.flex')).toBe(true);
    expect(listener).toHaveBeenCalledExactlyOnceWith(['__all__']);
    expect(storage.save).not.toHaveBeenCalled();
  });

  it('loads the V7 mode in the same session and allows selecting regular afterward', async () => {
    const config = { general: { agent_mode: 'regular' } };
    storage.load.mockImplementation(async () => structuredClone(config));
    storage.getRaw.mockImplementation(async () => structuredClone(config));
    storage.saveRaw.mockImplementation(async (_key, value) => Object.assign(config, structuredClone(value)));
    const { ConfigManager } = await import('./ConfigManager');
    const { upgradeConfigToV7 } = await import('../config-upgrader/upgradeConfigToV7');
    const manager = ConfigManager.instance();
    await manager.initialize();
    expect(manager.get('general.agent_mode')).toBe('regular');
    await upgradeConfigToV7();
    await manager.reloadFromStorage();
    expect(manager.get('general.agent_mode')).toBe('advanced');
    await manager.set('general.agent_mode', 'regular');
    expect(manager.get('general.agent_mode')).toBe('regular');
  });

  it('preserves managed server overrides and default hotkeys across reloads', async () => {
    storage.load.mockResolvedValue({ general: { language: 'fr_fr' }, hotkeys: { main: { play: 'wrong' } } });
    const { ConfigManager } = await import('./ConfigManager');
    const manager = ConfigManager.instance();
    await manager.initialize();
    manager.setSoundfontManagedByServer('https://sounds.example');
    await manager.reloadFromStorage();
    expect(manager.get('general.soundfont.base_url')).toBe('https://sounds.example');
    expect(manager.get('hotkeys.main.play')).toBe(manager.getDefaults()!.hotkeys.main.play);
    expect(manager.get('general.language')).toBe('fr_fr');
    expect(storage.save).not.toHaveBeenCalled();
  });

  it('leaves legacy saved KGOne values inert without migrating storage', async () => {
    storage.load.mockResolvedValue({ general: { kgone: { enabled: true, base_url: 'https://old.example' } } });
    const { ConfigManager } = await import('./ConfigManager');
    const manager = ConfigManager.instance();
    await manager.initialize();
    expect(manager.getDefaults()!.general).not.toHaveProperty('kgone');
    expect(manager).not.toHaveProperty('setKGOneManagedByServer');
    expect(manager).not.toHaveProperty('isKGOneServerManaged');
    expect(storage.save).not.toHaveBeenCalled();
  });

  it('initializes when reload is called before initialization', async () => {
    storage.load.mockResolvedValue(null);
    const { ConfigManager } = await import('./ConfigManager');
    const manager = ConfigManager.instance();
    await manager.reloadFromStorage();
    expect(manager.getIsInitialized()).toBe(true);
    expect(manager.get('general.agent_mode')).toBe('advanced');
    expect(manager.get('general.llm_provider')).toBe('local_browser');
  });

  it('saves a preset with one notification while sanitizing keys on non-local hosts', async () => {
    storage.load.mockResolvedValue(null);
    const { ConfigManager } = await import('./ConfigManager');
    const manager = ConfigManager.instance();
    await manager.initialize();
    vi.stubGlobal('window', { location: { protocol: 'https:', hostname: 'studio.example' } });
    const listener = vi.fn();
    manager.addChangeListener(listener);
    await manager.update({ general: { ...manager.getAll().general,
      llm_provider: 'openai_compatible',
      openai_compatible: { api_key: 'session-key', base_url: 'https://example.com/v1', model: 'model' },
    } });
    expect(listener).toHaveBeenCalledOnce();
    expect(storage.save).toHaveBeenCalledOnce();
    expect(storage.save.mock.calls[0][1].general.openai_compatible.api_key).toBe('');
    expect(manager.get('general.openai_compatible.api_key')).toBe('session-key');
  });
});
