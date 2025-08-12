import { clearChatHistoryAndUI } from '../chatUtil';
import { useProjectStore } from '../../stores/projectStore';
import { ConfigManager } from '../../core/config/ConfigManager';
import { SystemPrompts } from '../../agent/core/SystemPrompts';

export interface UserMessageFilterResult {
  // Whether to render the user message bubble (div.message-user)
  displayUserMessage: boolean;
  // Whether to send a message to the LLM
  sendToLLM: boolean;
  // The final text to send to the LLM (can differ from user input)
  finalMessageForLLM: string | null;
  // Optional pseudo assistant response to display immediately (without LLM)
  pseudoAssistantResponse: string | null;
  // Placeholder metadata for future extensibility
  metadata?: Record<string, unknown>;
}

/**
 * Process a user message before it is displayed or sent to the LLM.
 * Handles slash-commands and returns a structured decision.
 *
 * For now:
 * - Supports `/clear` command (clears conversation and UI)
 * - Unknown commands surface a pseudo assistant response
 * - Non-commands pass through to LLM unchanged
 */
export async function processUserMessage(originalMessage: string): Promise<UserMessageFilterResult> {
  const trimmed = originalMessage.trim();

  if (trimmed.startsWith('/')) {
    const [command, ...rest] = trimmed.split(/\s+/);
    const argString = rest.join(' ');

    switch (command.toLowerCase()) {
      case '/clear': {
        const { setStatus } = useProjectStore.getState();
        clearChatHistoryAndUI(setStatus);
        return {
          displayUserMessage: false,
          sendToLLM: false,
          finalMessageForLLM: null,
          pseudoAssistantResponse: `_Chat history cleared. Starting a new chat._`,
          metadata: { command: 'clear' }
        };
      }

      case '/welcome': {
        try {
          const configManager = ConfigManager.instance();
          if (!configManager.getIsInitialized()) {
            await configManager.initialize();
          }

          const openaiKey = (configManager.get('general.openai.api_key') as string) || '';
          const oaiCompatKey = (configManager.get('general.openai_compatible.api_key') as string) || '';
          const oaiCompatBaseUrl = (configManager.get('general.openai_compatible.base_url') as string) || '';
          const isNew = openaiKey.trim() === '' && oaiCompatKey.trim() === '' && oaiCompatBaseUrl.trim() === '';

          const url = isNew ? `${import.meta.env.BASE_URL}chat/welcome_new.md` : `${import.meta.env.BASE_URL}chat/welcome_again.md`;
          const resp = await fetch(url);
          if (!resp.ok) {
            throw new Error(`Failed to fetch ${url}: ${resp.status}`);
          }
          const md = await resp.text();
          return {
            displayUserMessage: false,
            sendToLLM: false,
            finalMessageForLLM: null,
            pseudoAssistantResponse: md,
            metadata: { command: 'welcome', variant: isNew ? 'new' : 'again' }
          };
        } catch (err) {
          const fallback = 'Welcome to K.G.Studio Musician Assistant.';
          return {
            displayUserMessage: false,
            sendToLLM: false,
            finalMessageForLLM: null,
            pseudoAssistantResponse: fallback,
            metadata: { command: 'welcome', error: String(err) }
          };
        }
      }

      default: {
        const { setStatus } = useProjectStore.getState();
        const help = 'Available commands: /clear, /welcome';
        setStatus(`Unknown command: ${command}. ${help}`);
        return {
          displayUserMessage: false,
          sendToLLM: false,
          finalMessageForLLM: null,
          pseudoAssistantResponse: `Unknown command: ${command}${argString ? ' ' + argString : ''}.\n${help}`,
          metadata: { command: 'unknown' }
        };
      }
    }
  }

  // Non-command message: require an active or selected region
  try {
    // Provider-specific configuration checks before sending to LLM
    try {
      const configManager = ConfigManager.instance();
      if (!configManager.getIsInitialized()) {
        await configManager.initialize();
      }
      const provider = (configManager.get('general.llm_provider') as string) || 'openai';

      if (provider === 'openai') {
        const openaiKey = (configManager.get('general.openai.api_key') as string) || '';
        if (openaiKey.trim() === '') {
          const url = `${import.meta.env.BASE_URL}chat/error_no_openai_key.md`;
          let md = 'OpenAI provider selected, but no API key configured.';
          try {
            const resp = await fetch(url);
            if (resp.ok) md = await resp.text();
          } catch (e) {
            console.warn('Failed to fetch error_no_openai_key.md', e);
          }
          return {
            displayUserMessage: true,
            sendToLLM: false,
            finalMessageForLLM: null,
            pseudoAssistantResponse: md,
            metadata: { error: 'no_openai_key' }
          };
        }
      } else if (provider === 'openai_compatible') {
        const baseUrl = (configManager.get('general.openai_compatible.base_url') as string) || '';
        if (baseUrl.trim() === '') {
          const url = `${import.meta.env.BASE_URL}chat/error_no_openai_compatible_base_url.md`;
          let md = 'OpenAI Compatible provider selected, but no Base URL configured.';
          try {
            const resp = await fetch(url);
            if (resp.ok) md = await resp.text();
          } catch (e) {
            console.warn('Failed to fetch error_no_openai_compatible_base_url.md', e);
          }
          return {
            displayUserMessage: true,
            sendToLLM: false,
            finalMessageForLLM: null,
            pseudoAssistantResponse: md,
            metadata: { error: 'no_openai_compatible_base_url' }
          };
        }

        const model = (configManager.get('general.openai_compatible.model') as string) || '';
        if (model.trim() === '') {
          const url = `${import.meta.env.BASE_URL}chat/error_no_openai_compatible_model.md`;
          let md = 'OpenAI Compatible provider selected, but no Model configured.';
          try {
            const resp = await fetch(url);
            if (resp.ok) md = await resp.text();
          } catch (e) {
            console.warn('Failed to fetch error_no_openai_compatible_model.md', e);
          }
          return {
            displayUserMessage: true,
            sendToLLM: false,
            finalMessageForLLM: null,
            pseudoAssistantResponse: md,
            metadata: { error: 'no_openai_compatible_model' }
          };
        }
      }
    } catch (e) {
      console.warn('Provider config check failed; proceeding with defaults', e);
    }

    const { activeRegionId, selectedRegionIds } = useProjectStore.getState();
    const hasContextRegion = !!activeRegionId || (Array.isArray(selectedRegionIds) && selectedRegionIds.length > 0);

    if (!hasContextRegion) {
      // No region context: show guidance and do not send to LLM
      const url = `${import.meta.env.BASE_URL}chat/error_no_selected_region.md`;
      let md = 'Please select a region or open a MIDI region in the piano roll before asking for editing.';
      try {
        const resp = await fetch(url);
        if (resp.ok) {
          md = await resp.text();
        }
      } catch (e) {
        console.warn('Failed to fetch error_no_selected_region.md', e);
        // ignore fetch failure, use fallback text
      }

      return {
        displayUserMessage: true,
        sendToLLM: false,
        finalMessageForLLM: null,
        pseudoAssistantResponse: md,
        metadata: { error: 'no_selected_region' }
      };
    }

    // Has region context: pass through, but append processed appendix to the LLM-bound message
    let appendix = '';
    try {
      const resp = await fetch(`${import.meta.env.BASE_URL}prompts/user_msg_appendix.md`);
      if (resp.ok) {
        const rawAppendix = await resp.text();
        appendix = await SystemPrompts.getPromptWithContext(rawAppendix);
      }
    } catch (e) {
      // If appendix fetch fails, proceed without it
      console.warn('Failed to fetch user_msg_appendix.md', e);
    }

    const finalForLLM = appendix ? `${trimmed}${appendix}` : trimmed;

    return {
      displayUserMessage: true,
      sendToLLM: true,
      finalMessageForLLM: finalForLLM,
      pseudoAssistantResponse: null,
      metadata: { mode: 'pass_through_with_region', appendixIncluded: appendix.length > 0 }
    };
  } catch {
    // Fallback: if store access fails, pass through unchanged
    return {
      displayUserMessage: true,
      sendToLLM: true,
      finalMessageForLLM: trimmed,
      pseudoAssistantResponse: null,
      metadata: { mode: 'pass_through_fallback' }
    };
  }
}


