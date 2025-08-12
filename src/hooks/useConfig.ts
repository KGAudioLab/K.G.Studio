import { useState, useEffect, useCallback } from 'react';
import { ConfigManager } from '../core/config/ConfigManager';

/**
 * Custom hook for managing configuration values with automatic loading and saving
 * @param configKey - The dot-notation key for the configuration value
 * @param defaultValue - Default value to use if config is not loaded
 * @param debounceMs - Debounce time in milliseconds for saving (default: 500ms)
 */
export function useConfig<T>(
  configKey: string,
  defaultValue: T,
  debounceMs: number = 500
) {
  const [value, setValue] = useState<T>(defaultValue);
  const [isLoading, setIsLoading] = useState(true);
  const configManager = ConfigManager.instance();

  // Load configuration value on mount
  useEffect(() => {
    const loadConfig = async () => {
      try {
        if (!configManager.getIsInitialized()) {
          await configManager.initialize();
        }

        const loadedValue = configManager.get(configKey) as T;
        setValue(loadedValue ?? defaultValue);
      } catch (error) {
        console.error(`Failed to load config for ${configKey}:`, error);
        setValue(defaultValue);
      } finally {
        setIsLoading(false);
      }
    };

    loadConfig();
  }, [configKey, defaultValue, configManager]);

  // Debounced save function
  const debouncedSave = useCallback((newValue: T) => {
    const timeoutId = setTimeout(async () => {
      try {
        await configManager.set(configKey, newValue);
        console.log(`Config saved: ${configKey} = ${newValue}`);
      } catch (error) {
        console.error(`Failed to save config for ${configKey}:`, error);
      }
    }, debounceMs);

    return () => clearTimeout(timeoutId);
  }, [configKey, configManager, debounceMs]);

  // Update function that immediately updates state and debounces save
  const updateValue = useCallback((newValue: T) => {
    setValue(newValue);
    debouncedSave(newValue);
  }, [debouncedSave]);

  // Immediate save function (for dropdowns, checkboxes, etc.)
  const saveImmediately = useCallback(async (newValue: T) => {
    setValue(newValue);
    try {
      await configManager.set(configKey, newValue);
      console.log(`Config saved immediately: ${configKey} = ${newValue}`);
    } catch (error) {
      console.error(`Failed to save config immediately for ${configKey}:`, error);
    }
  }, [configKey, configManager]);

  return {
    value,
    setValue: updateValue,
    saveImmediately,
    isLoading
  };
}