import { KGStorage } from '../io/KGStorage';
import { DB_CONSTANTS } from '../../constants/coreConstants';

/**
 * Application configuration interface
 */
interface AppConfig {
  general: {
    language: string;
    llm_provider: 'openai' | 'gemini' | 'claude' | 'claude_openrouter' | 'openai_compatible';
    persist_api_keys_non_localhost: boolean;
    openai: {
      api_key: string;
      flex: boolean;
      model: string;
    };
    gemini: {
      api_key: string;
      model: string;
    };
    claude: {
      api_key: string;
      model: string;
    };
    claude_openrouter: {
      api_key: string;
      base_url: string;
      model: string;
    };
    openai_compatible: {
      api_key: string;
      base_url: string;
      model: string;
    };
    soundfont: {
      base_url: string;
    };
  };
  hotkeys: {
    main: {
      hold_to_create_region: string;
      play: string;
      undo: string;
      redo: string;
      select_all: string;
      copy: string;
      cut: string;
      paste: string;
      save: string;
    };
    piano_roll: {
      switch: string;
      select: string;
      pencil: string;
      hold_to_create_note: string;
      snap_none: string;
      snap_1_4: string;
      snap_1_8: string;
      snap_1_16: string;
      qua_pos_1_4: string;
      qua_pos_1_8: string;
      qua_pos_1_16: string;
      qua_len_1_4: string;
      qua_len_1_8: string;
      qua_len_1_16: string;
    };
  };
  editor: {
    playhead_update_frequency: number;
  };
  chatbox: {
    default_open: boolean;
  };
  audio: {
    enable_audio_capture_for_screen_sharing: boolean;
    lookahead_time: number;
    playback_delay: number;
  };
  templates: {
    custom_instructions: string;
  };
  chord_guide: {
    chord_definition: string;
  };
  [key: string]: unknown;
}

/**
 * ConfigManager - Manages application configuration with IndexedDB persistence
 * Implements the singleton pattern for global access
 */
export class ConfigManager {
  // Private static instance for singleton pattern
  private static _instance: ConfigManager | null = null;

  // Configuration key for storage
  private static readonly CONFIG_KEY = 'userConfig';

  // Configuration state
  private config: AppConfig;
  private storage: KGStorage;
  private isInitialized: boolean = false;
  private defaultConfig: AppConfig | null = null;
  private changeListeners: Set<(changedKeys: string[]) => void> = new Set();

  // Private constructor to prevent direct instantiation
  private constructor() {
    // Initialize with empty config, will be loaded during initialize()
    this.config = {} as AppConfig;
    this.storage = KGStorage.getInstance();
    console.log('ConfigManager initialized');
  }

  /**
   * Get the singleton instance of ConfigManager
   * Creates the instance if it doesn't exist yet
   */
  public static instance(): ConfigManager {
    if (!ConfigManager._instance) {
      ConfigManager._instance = new ConfigManager();
    }
    return ConfigManager._instance;
  }

  /**
   * Initialize the config manager and load saved configuration
   */
  public async initialize(): Promise<void> {
    if (this.isInitialized) {
      return;
    }

    try {
      // Load default configuration from JSON file
      await this.loadDefaultConfig();
      
      // Load saved configuration from storage
      const savedConfig = await this.loadFromStorage();
      
      // Merge with default config (saved config overrides defaults)
      this.config = this.mergeConfigs(this.defaultConfig!, savedConfig);
      
      this.isInitialized = true;
      console.log('ConfigManager initialized successfully with config:', this.config);
    } catch (error) {
      console.error('Failed to initialize ConfigManager:', error);
      // Fall back to default config if initialization fails
      if (this.defaultConfig) {
        this.config = { ...this.defaultConfig };
      }
      this.isInitialized = true;
    }
  }

  /**
   * Load default configuration from config.json file
   */
  private async loadDefaultConfig(): Promise<void> {
    try {
      const response = await fetch(`${import.meta.env.BASE_URL}config.json`);
      if (!response.ok) {
        throw new Error(`Failed to fetch config.json: ${response.status}`);
      }
      
      const configData = await response.json();
      this.defaultConfig = configData as AppConfig;
      console.log('Loaded default config from config.json:', this.defaultConfig);
    } catch (error) {
      console.error('Error loading default config from config.json:', error);
      
      // Fallback to minimal hardcoded config
      this.defaultConfig = {
        general: {
          language: 'en_us',
          llm_provider: 'openai',
          persist_api_keys_non_localhost: false,
          openai: {
            api_key: '',
            flex: false,
            model: 'gpt-5.2'
          },
          gemini: {
            api_key: '',
            model: 'gemini-2.5-flash'
          },
          claude: {
            api_key: '',
            model: 'claude-sonnet-4.5'
          },
          claude_openrouter: {
            api_key: '',
            base_url: 'https://openrouter.ai/api/v1/chat/completions',
            model: 'anthropic/claude-sonnet-4.5'
          },
          openai_compatible: {
            api_key: '',
            base_url: '',
            model: ''
          },
          soundfont: {
            base_url: 'https://cdn.jsdelivr.net/npm/soundfont-for-samplers/FluidR3_GM/'
          }
        },
        hotkeys: {
          main: {
            hold_to_create_region: 'ctrl',
            play: 'space',
            undo: 'ctrl+z',
            redo: 'ctrl+shift+z',
            select_all: 'ctrl+a',
            copy: 'ctrl+c',
            cut: 'ctrl+x',
            paste: 'ctrl+v', 
            save: 'ctrl+s'
          },
          piano_roll: {
            switch: 'tab', 
            select: 'q',
            pencil: 'w',
            hold_to_create_note: 'ctrl',
            snap_none: '1',
            snap_1_4: '2',
            snap_1_8: '3',
            snap_1_16: '4',
            qua_pos_1_4: '5',
            qua_pos_1_8: '6',
            qua_pos_1_16: '7',
            qua_len_1_4: '8',
            qua_len_1_8: '9',
            qua_len_1_16: '0'
          },
        },
        editor: {
          playhead_update_frequency: 10
        },
        chatbox: {
          default_open: true
        },
        audio: {
          enable_audio_capture_for_screen_sharing: false,
          lookahead_time: 0.05,
          playback_delay: 0.2
        },
        templates: {
          custom_instructions: ''
        },
        chord_guide: {
          chord_definition: ''
        }
      };
      console.log('Using fallback hardcoded config due to load error');
    }
  }

  /**
   * Load configuration from storage
   */
  private async loadFromStorage(): Promise<Partial<AppConfig> | null> {
    try {
      // For config, we don't use class-transformer since it's plain objects
      // So we'll use a simple object approach and handle it directly with KGStorage
      const savedConfigData = await this.storage.load(
        DB_CONSTANTS.DB_NAME,
        DB_CONSTANTS.CONFIG_STORE_NAME,
        ConfigManager.CONFIG_KEY,
        Object, // Simple object class
        DB_CONSTANTS.DB_VERSION
      );
      
      if (savedConfigData) {
        console.log('Loaded config from storage:', savedConfigData);
        return savedConfigData as Partial<AppConfig>;
      } else {
        console.log('No saved config found in storage, using defaults');
        return null;
      }
    } catch (error) {
      console.error('Error loading config from storage:', error);
      return null;
    }
  }

  /**
   * Save configuration to storage
   */
  private async saveToStorage(): Promise<void> {
    try {
      const shouldSanitize = !this.isRunningOnLocalhost() &&
        !this.config.general.persist_api_keys_non_localhost;
      const configToPersist = shouldSanitize
        ? this.getSanitizedConfigForStorage()
        : this.config;

      await this.storage.save(
        DB_CONSTANTS.DB_NAME,
        DB_CONSTANTS.CONFIG_STORE_NAME,
        ConfigManager.CONFIG_KEY,
        configToPersist,
        true, // Always overwrite config
        DB_CONSTANTS.DB_VERSION
      );
      console.log('Saved config to storage:', configToPersist);
    } catch (error) {
      console.error('Error saving config to storage:', error);
      throw error;
    }
  }

  /**
   * Deep merge two configuration objects recursively
   * The override config takes precedence over the base config
   * Only existing keys in the override are merged, preserving all base config structure
   */
  private mergeConfigs(baseConfig: AppConfig, overrideConfig: Partial<AppConfig> | null): AppConfig {
    if (!overrideConfig) {
      return { ...baseConfig };
    }

    return this.deepMerge(baseConfig, overrideConfig) as AppConfig;
  }

  /**
   * Recursively deep merge two objects
   * Only overwrites primitive values, recursively merges objects
   */
  private deepMerge(base: Record<string, unknown>, override: Record<string, unknown>): Record<string, unknown> {
    const result = { ...base };
    
    Object.keys(override).forEach(key => {
      const overrideValue = override[key];
      const baseValue = result[key];
      
      if (overrideValue === null || overrideValue === undefined) {
        // Skip null/undefined values in override
        return;
      }
      
      if (typeof overrideValue === 'object' && !Array.isArray(overrideValue)) {
        // Both values are objects - recursively merge
        if (typeof baseValue === 'object' && baseValue !== null && !Array.isArray(baseValue)) {
          result[key] = this.deepMerge(baseValue as Record<string, unknown>, overrideValue as Record<string, unknown>);
        } else {
          // Base value is not an object, use override value as-is
          result[key] = { ...(overrideValue as Record<string, unknown>) };
        }
      } else {
        // Override value is primitive - use it directly
        result[key] = overrideValue;
      }
    });
    
    return result;
  }

  /**
   * Get a configuration value using dot notation
   * Example: get('general.language') returns 'en_us'
   */
  public get(key: string): unknown {
    if (!this.isInitialized) {
      console.warn('ConfigManager not initialized, returning default value');
      if (this.defaultConfig) {
        return this.getFromObject(this.defaultConfig as Record<string, unknown>, key);
      }
      return undefined;
    }

    return this.getFromObject(this.config as Record<string, unknown>, key);
  }

  /**
   * Set a configuration value using dot notation and save to storage
   * Example: set('general.language', 'fr_fr')
   */
  public async set(key: string, value: unknown): Promise<void> {
    if (!this.isInitialized) {
      throw new Error('ConfigManager not initialized');
    }

    // Update the configuration object
    this.setInObject(this.config as Record<string, unknown>, key, value);
    
    // Save to storage
    await this.saveToStorage();
    
    console.log(`Config updated: ${key} = ${value}`);
    // Notify listeners of the specific key change
    this.notifyChangeListeners([key]);
  }

  /**
   * Update multiple configuration values at once
   */
  public async update(updates: Partial<AppConfig>): Promise<void> {
    if (!this.isInitialized) {
      throw new Error('ConfigManager not initialized');
    }

    // Merge updates with current config
    this.config = this.mergeConfigs(this.config, updates);
    
    // Save to storage
    await this.saveToStorage();
    
    console.log('Config updated with multiple values:', updates);
    // Notify listeners of changed keys (dot notation)
    const changedKeys = this.collectDotKeys(updates as Record<string, unknown>);
    if (changedKeys.length > 0) {
      this.notifyChangeListeners(changedKeys);
    }
  }

  /**
   * Reset configuration to defaults
   */
  public async resetToDefaults(): Promise<void> {
    if (!this.isInitialized) {
      throw new Error('ConfigManager not initialized');
    }

    if (!this.defaultConfig) {
      throw new Error('Default config not loaded');
    }

    this.config = { ...this.defaultConfig };
    await this.saveToStorage();
    
    console.log('Config reset to defaults');
    this.notifyChangeListeners(['__all__']);
  }

  /**
   * Get the entire configuration object (read-only copy)
   */
  public getAll(): Readonly<AppConfig> {
    return { ...this.config };
  }

  /**
   * Get a value from an object using dot notation
   */
  private getFromObject(obj: Record<string, unknown>, path: string): unknown {
    const keys = path.split('.');
    let current: unknown = obj;
    
    for (const key of keys) {
      if (current && typeof current === 'object' && key in (current as Record<string, unknown>)) {
        current = (current as Record<string, unknown>)[key];
      } else {
        return undefined;
      }
    }
    
    return current;
  }

  /**
   * Set a value in an object using dot notation
   */
  private setInObject(obj: Record<string, unknown>, path: string, value: unknown): void {
    const keys = path.split('.');
    let current: Record<string, unknown> = obj;
    
    // Navigate to the parent of the target key
    for (let i = 0; i < keys.length - 1; i++) {
      const key = keys[i];
      if (!(key in current) || typeof current[key] !== 'object') {
        current[key] = {};
      }
      current = current[key] as Record<string, unknown>;
    }
    
    // Set the final value
    current[keys[keys.length - 1]] = value;
  }

  /**
   * Subscribe to config changes. Returns an unsubscribe function.
   */
  public addChangeListener(listener: (changedKeys: string[]) => void): () => void {
    this.changeListeners.add(listener);
    return () => this.changeListeners.delete(listener);
  }

  public removeChangeListener(listener: (changedKeys: string[]) => void): void {
    this.changeListeners.delete(listener);
  }

  private notifyChangeListeners(changedKeys: string[]): void {
    for (const listener of this.changeListeners) {
      try {
        listener(changedKeys);
      } catch (error) {
        console.error('Config change listener error:', error);
      }
    }
  }

  /**
   * Collect dot-notation keys for all leaf values in a partial config object
   */
  private collectDotKeys(obj: Record<string, unknown>, prefix = ''): string[] {
    const keys: string[] = [];
    for (const [k, v] of Object.entries(obj)) {
      const path = prefix ? `${prefix}.${k}` : k;
      if (v && typeof v === 'object' && !Array.isArray(v)) {
        keys.push(...this.collectDotKeys(v as Record<string, unknown>, path));
      } else {
        keys.push(path);
      }
    }
    return keys;
  }

  /**
   * Check if ConfigManager is initialized
   */
  public getIsInitialized(): boolean {
    return this.isInitialized;
  }

  /**
   * Determine whether the app is being served from a local host
   * Consider localhost, 127.0.0.1, ::1, and 0.0.0.0 as local.
   */
  private isRunningOnLocalhost(): boolean {
    try {
      if (typeof window === 'undefined' || typeof window.location === 'undefined') {
        return false;
      }
      const { protocol, hostname } = window.location;
      if (protocol === 'file:') return true; // treat file protocol as local usage
      const localHosts = new Set(['localhost', '127.0.0.1', '::1', '0.0.0.0']);
      return localHosts.has(hostname);
    } catch {
      return false;
    }
  }

  /**
   * Return a deep-copied config with all provider API keys scrubbed (empty strings)
   * for persistence to storage in non-local environments.
   */
  private getSanitizedConfigForStorage(): AppConfig {
    const copied: AppConfig = JSON.parse(JSON.stringify(this.config));
    if (copied?.general) {
      if (copied.general.openai) copied.general.openai.api_key = '';
      if (copied.general.gemini) copied.general.gemini.api_key = '';
      if (copied.general.claude) copied.general.claude.api_key = '';
      if (copied.general.claude_openrouter) copied.general.claude_openrouter.api_key = '';
      if (copied.general.openai_compatible) copied.general.openai_compatible.api_key = '';
    }
    return copied;
  }

  /**
   * Get the default configuration
   */
  public getDefaults(): Readonly<AppConfig> | null {
    return this.defaultConfig ? { ...this.defaultConfig } : null;
  }

  /**
   * Clean up resources
   */
  public async dispose(): Promise<void> {
    try {
      this.isInitialized = false;
      console.log('ConfigManager disposed successfully');
    } catch (error) {
      console.error('Error disposing ConfigManager:', error);
    }
  }
}