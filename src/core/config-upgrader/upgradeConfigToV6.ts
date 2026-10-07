import { KGConfigStorage } from '../io/KGConfigStorage';
import { URL_CONSTANTS } from '../../constants/coreConstants';

interface LegacyProviderDefaults {
  openai?: { api_key: string; model: string };
  claude_openrouter?: { api_key: string; base_url: string; model: string };
}

const FALLBACK_DEFAULTS: Required<LegacyProviderDefaults> = {
  openai: { api_key: '', model: 'gpt-5.4-mini' },
  claude_openrouter: { api_key: '', base_url: 'https://openrouter.ai/api/v1', model: 'anthropic/claude-sonnet-4.6' },
};

/** Consolidate the active legacy provider without discarding its original settings. */
export async function upgradeConfigToV6(defaults: LegacyProviderDefaults = FALLBACK_DEFAULTS): Promise<void> {
  const storage = KGConfigStorage.getInstance();
  const config = await storage.getRaw('userConfig');
  if (!config || typeof config !== 'object') return;
  const general = config.general as Record<string, unknown> | undefined;
  if (!general || typeof general !== 'object') return;
  const provider = general.llm_provider;
  if (provider !== 'openai' && provider !== 'claude_openrouter') return;

  const source = general[provider];
  const saved = source && typeof source === 'object' ? source as Record<string, unknown> : {};
  const fallback = defaults[provider] ?? FALLBACK_DEFAULTS[provider];
  const compatible = general.openai_compatible;
  general.openai_compatible = {
    ...(compatible && typeof compatible === 'object' ? compatible : {}),
    api_key: typeof saved.api_key === 'string' ? saved.api_key : fallback.api_key,
    model: typeof saved.model === 'string' ? saved.model : fallback.model,
    base_url: provider === 'openai'
      ? URL_CONSTANTS.DEFAULT_OPENAI_BASE_URL
      : typeof saved.base_url === 'string'
        ? saved.base_url
        : (defaults.claude_openrouter ?? FALLBACK_DEFAULTS.claude_openrouter).base_url,
  };
  general.llm_provider = 'openai_compatible';
  await storage.saveRaw('userConfig', config);
}
