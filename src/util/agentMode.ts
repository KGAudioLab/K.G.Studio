import { ConfigManager } from '../core/config/ConfigManager';
import { LOCAL_LLM_PROVIDER_KEY } from './localLLMConfig';

export type AgentMode = 'regular' | 'advanced' | 'efficient';

export const DEFAULT_AGENT_MODE: AgentMode = 'advanced';
export const EFFICIENT_AGENT_MODE: AgentMode = 'efficient';

export function normalizeAgentMode(value: unknown): AgentMode {
  if (value === 'advanced' || value === 'regular') {
    return value;
  }

  return value === EFFICIENT_AGENT_MODE ? EFFICIENT_AGENT_MODE : DEFAULT_AGENT_MODE;
}

export function isAgentModeForcedByProvider(providerType: string | null | undefined): boolean {
  return providerType === LOCAL_LLM_PROVIDER_KEY;
}

export function getConfiguredAgentMode(configManager: ConfigManager = ConfigManager.instance()): AgentMode {
  return normalizeAgentMode(configManager.get('general.agent_mode'));
}

export function getEffectiveAgentMode(configManager: ConfigManager = ConfigManager.instance()): AgentMode {
  const providerType = configManager.get('general.llm_provider');
  if (typeof providerType === 'string' && isAgentModeForcedByProvider(providerType)) {
    return EFFICIENT_AGENT_MODE;
  }

  return getConfiguredAgentMode(configManager);
}

export function getSystemPromptPathForAgentMode(mode: AgentMode): string {
  if (mode === 'advanced') {
    return 'prompts/system_advanced.md';
  }

  return mode === EFFICIENT_AGENT_MODE ? 'prompts/system_compact.md' : 'prompts/system.md';
}
