import React, { useState, useRef, useEffect, memo, useCallback } from 'react';
import './ChatBox.css';
import { FaPlus, FaBan, FaDownload } from 'react-icons/fa';
import { UserMessage, AssistantMessage } from './chat';
import { AgentCore } from '../agent/core/AgentCore';
import { summarizeTodoCounts } from '../agent/core/todo';
import { OpenAICompatibleLLMProvider, type LLMProvider } from '../agent/llm/LLMProvider';
import { LocalBrowserLLMProvider } from '../agent/llm/LocalBrowserLLMProvider';
import { ConfigManager } from '../core/config/ConfigManager';
import { useProjectStore } from '../stores/projectStore';
import { SystemPrompts } from '../agent/core/SystemPrompts';
import { clearChatHistoryAndUI, registerClearChatUICallback } from '../util/chatUtil';
import { processUserMessage } from '../util/messageFilter/UserMessageFilter';
import { useStreamProcessor } from '../hooks/useStreamProcessor';
import { createMessage, createStreamingMessage, addWelcomeMessage } from '../utils/chatMessageUtils';
import { formatLocalDateTime } from '../util/timeUtil';
import { downloadBlob, buildTimestampSuffix } from '../util/miscUtil';
import { LocalLLMModelManager, type LocalLLMModelState } from '../util/localLLMModelManager';
import { LOCAL_LLM_DISPLAY_NAME, LOCAL_LLM_PROVIDER_KEY } from '../util/localLLMConfig';
import KGDropdown from './common/KGDropdown';
import { useI18n } from '../i18n/useI18n';

import type { ChatMessage } from '../types/projectTypes';

// Module-level guard to avoid duplicate welcome in React StrictMode dev remounts
let hasShownWelcomeOnceInRuntime = false;
const TODO_TOOL_NAME = 'update_todo_list';

const isCompletedTodoSnapshotMessage = (message: ChatMessage): boolean => {
  if (message.toolName !== TODO_TOOL_NAME || !Array.isArray(message.todoSnapshot)) {
    return false;
  }

  const counts = summarizeTodoCounts(message.todoSnapshot);
  return counts.total > 0 && counts.completed === counts.total;
};

/**
 * Create the LLM provider from current configuration
 */
const createLLMProviderFromConfig = (): LLMProvider => {
  const configManager = ConfigManager.instance();
  const providerType = configManager.get('general.llm_provider') as string;

  let apiKey: string;
  let model: string;
  let baseURL: string | undefined;

  switch (providerType) {
    case LOCAL_LLM_PROVIDER_KEY:
      return new LocalBrowserLLMProvider();
    case 'openai':
      apiKey = configManager.get('general.openai.api_key') as string;
      model = configManager.get('general.openai.model') as string;
      baseURL = undefined; // Uses OpenAI default
      break;
    case 'claude_openrouter':
      apiKey = configManager.get('general.claude_openrouter.api_key') as string;
      model = configManager.get('general.claude_openrouter.model') as string;
      baseURL = configManager.get('general.claude_openrouter.base_url') as string || undefined;
      break;
    case 'openai_compatible':
    default:
      apiKey = configManager.get('general.openai_compatible.api_key') as string;
      model = configManager.get('general.openai_compatible.model') as string;
      baseURL = configManager.get('general.openai_compatible.base_url') as string || undefined;
      break;
  }

  return new OpenAICompatibleLLMProvider(apiKey, model, baseURL);
};

interface ChatBoxProps {
  isVisible: boolean;
}

const ChatBox: React.FC<ChatBoxProps> = ({ isVisible }) => {
  const { t } = useI18n();
  const [inputValue, setInputValue] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isCompacting, setIsCompacting] = useState(false);
  const [lastUserMessage, setLastUserMessage] = useState<string>('');
  const [localModelState, setLocalModelState] = useState<LocalLLMModelState>(LocalLLMModelManager.getState());
  const [activeProvider, setActiveProvider] = useState<string>('openai');

  // Track if this is the first message (for system prompt logging)
  const [isFirstMessage, setIsFirstMessage] = useState(true);

  // Export dropdown state and options
  const [showExportDropdown, setShowExportDropdown] = useState(false);
  const exportOptions = [
    'Export conversation as JSON',
    'Export conversation as Markdown'
  ];

  const handleExportOptionSelect = (option: string) => {
    if (option === 'Export conversation as JSON') {
      try {
        const agentMessages = AgentCore.instance().getAgentState().getFullMessages();
        const exportMessages = agentMessages.map((m) => ({
          id: m.id,
          role: m.role,
          content: m.content,
          ...(m.tool_calls ? { tool_calls: m.tool_calls } : {}),
          ...(m.tool_call_id ? { tool_call_id: m.tool_call_id } : {}),
          timestamp: formatLocalDateTime(new Date(m.timestamp))
        }));
        const json = JSON.stringify(exportMessages, null, 2);
        const filename = `kgstudio-conversation-${buildTimestampSuffix()}.json`;
        downloadBlob(json, 'application/json', filename);
      } catch (err) {
        console.error('Failed to export conversation as JSON:', err);
      }
    } else if (option === 'Export conversation as Markdown') {
      (async () => {
        try {
          const agentMessages = AgentCore.instance().getAgentState().getFullMessages();
          const templateUrl = `${import.meta.env.BASE_URL}chat/export_conversation_template.md`;
          const res = await fetch(templateUrl);
          const template = await res.text();

          const sections = agentMessages.map((m) => {
              let roleLabel: string;
              if (m.role === 'assistant') roleLabel = 'Assistant';
              else if (m.role === 'tool') roleLabel = 'Tool Result';
              else roleLabel = 'User';

              const ts = formatLocalDateTime(new Date(m.timestamp));

              let content = m.content ?? '';
              // For assistant messages with tool_calls but no text, show tool call info
              if (m.role === 'assistant' && m.tool_calls && m.tool_calls.length > 0) {
                const toolCallsText = m.tool_calls.map(tc =>
                  `**Tool call: ${tc.function.name}**\n\`\`\`json\n${tc.function.arguments}\n\`\`\``
                ).join('\n\n');
                content = content ? `${content}\n\n${toolCallsText}` : toolCallsText;
              }

              return template
                .replace('{role}', roleLabel)
                .replace('{timestamp}', ts)
                .replace('{content}', content);
            });

          const markdown = sections.join('\n');
          const filename = `kgstudio-conversation-${buildTimestampSuffix()}.md`;
          downloadBlob(markdown, 'text/markdown', filename);
        } catch (err) {
          console.error('Failed to export conversation as Markdown:', err);
        }
      })();
    }
    setShowExportDropdown(false);
  };

  // Message update callbacks for stream processor
  const handleMessageUpdate = useCallback((messageId: string, updater: (msg: ChatMessage) => ChatMessage) => {
    setMessages(prev => prev.map(msg => msg.id === messageId ? updater(msg) : msg));
  }, []);

  const handleMessageAdd = useCallback((message: ChatMessage) => {
    setMessages((prev) => {
      if (message.toolName === TODO_TOOL_NAME && Array.isArray(message.todoSnapshot)) {
        const preservedMessages = prev.filter((existingMessage) => (
          existingMessage.toolName !== TODO_TOOL_NAME
          || !Array.isArray(existingMessage.todoSnapshot)
          || isCompletedTodoSnapshotMessage(existingMessage)
        ));
        return [...preservedMessages, message];
      }

      return [...prev, message];
    });
  }, []);

  const handleMessageRemove = useCallback((messageId: string) => {
    setMessages(prev => prev.filter(msg => msg.id !== messageId));
  }, []);

  const handleProcessingChange = useCallback((processing: boolean) => {
    setIsProcessing(processing);
  }, []);

  // Stream processor hook
  const streamProcessor = useStreamProcessor({
    onMessageUpdate: handleMessageUpdate,
    onMessageAdd: handleMessageAdd,
    onMessageRemove: handleMessageRemove,
    onProcessingChange: handleProcessingChange
  });

  const clearChatUI = useCallback(async () => {
    setMessages([]);
    setIsFirstMessage(true);

    const welcomeMessage = await addWelcomeMessage();
    if (welcomeMessage) {
      setMessages([welcomeMessage]);
    }
  }, []);

  // Initialize AgentCore with configured provider and register clear UI callback
  useEffect(() => {
    const initializeProvider = async () => {
      const configManager = ConfigManager.instance();

      if (!configManager.getIsInitialized()) {
        await configManager.initialize();
      }

      const applyProviderFromConfig = () => {
        const providerType = (configManager.get('general.llm_provider') as string) || 'openai';
        const provider = createLLMProviderFromConfig();
        const agentCore = AgentCore.instance();
        agentCore.setLLMProvider(provider);
        setActiveProvider(providerType);
        console.log('LLM provider configured');
      };

      applyProviderFromConfig();

      const unsubscribe = configManager.addChangeListener((changedKeys) => {
        if (
          changedKeys.includes('general.llm_provider') ||
          changedKeys.includes('general.local_browser.context_length') ||
          changedKeys.some(k => k.startsWith('general.openai.')) ||
          changedKeys.some(k => k.startsWith('general.claude_openrouter.')) ||
          changedKeys.some(k => k.startsWith('general.openai_compatible.'))
        ) {
          applyProviderFromConfig();
        }
      });

      return unsubscribe;
    };

    registerClearChatUICallback(clearChatUI);

    const maybeUnsubscribePromise = initializeProvider();
    const unsubscribeLocalModel = LocalLLMModelManager.subscribe(setLocalModelState);

    (async () => {
      if (hasShownWelcomeOnceInRuntime) return;
      hasShownWelcomeOnceInRuntime = true;

      const welcomeMessage = await addWelcomeMessage();
      if (welcomeMessage) {
        setMessages([welcomeMessage]);
      }
    })();

    return () => {
      unsubscribeLocalModel();
      Promise.resolve(maybeUnsubscribePromise).then((cleanup) => {
        if (typeof cleanup === 'function') cleanup();
      }).catch(() => {});
    };
  }, [clearChatUI]);

  const handleAbort = () => {
    const controller = streamProcessor.abortController;
    if (controller) {
      controller.abort();

      const agentCore = AgentCore.instance();
      const userMessageContent = agentCore.abortCurrentRequest();

      setMessages(prev => prev.slice(0, -2));
      setInputValue(userMessageContent || lastUserMessage);
      setIsProcessing(false);
    }
  };

  const handleClearCommand = () => {
    const { setStatus } = useProjectStore.getState();
    clearChatHistoryAndUI(setStatus);
  };

  const runCompactionWithStatus = useCallback(async (
    trigger: 'manual' | 'auto',
    focus?: string,
  ): Promise<boolean> => {
    const agentCore = AgentCore.instance();
    const statusMessage = createMessage('assistant', 'Compacting Conversation');
    const progressMessage = createStreamingMessage();
    let progressTokenCount = 0;

    handleMessageAdd(statusMessage);
    handleMessageAdd(progressMessage);
    setIsCompacting(true);

    try {
      const result = await agentCore.compactConversation({
        trigger,
        focus,
        onProgress: () => {
          progressTokenCount += 1;
          handleMessageUpdate(progressMessage.id, (msg) => ({
            ...msg,
            content: `<span class="processing-wave">Processing...</span>${progressTokenCount > 0 ? ` ${progressTokenCount} tokens received.` : ''} click here to abort.`,
            tokenCount: progressTokenCount,
          }));
        },
      });

      handleMessageUpdate(statusMessage.id, (msg) => ({
        ...msg,
        content: result.changed ? 'Conversation Compacted' : 'Nothing to Compact Yet',
      }));
      handleMessageRemove(progressMessage.id);
      return result.changed;
    } catch (error) {
      console.error('Conversation compaction failed:', error);
      handleMessageUpdate(statusMessage.id, (msg) => ({
        ...msg,
        content: `Compaction failed: ${error instanceof Error ? error.message : 'Unable to compact the conversation.'}`,
      }));
      handleMessageRemove(progressMessage.id);
      return false;
    } finally {
      setIsCompacting(false);
    }
  }, [handleMessageAdd, handleMessageRemove, handleMessageUpdate]);

  const sendWithCompactionRecovery = useCallback(async (
    llmInput: string,
    originalUserMessage: string,
  ): Promise<void> => {
    try {
      await streamProcessor.processStream(llmInput, 'USER');
    } catch (error) {
      const provider = AgentCore.instance().getLLMProvider();
      if (provider?.isContextTooLongError?.(error)) {
        const compacted = await runCompactionWithStatus('auto');
        if (compacted) {
          try {
            await streamProcessor.processStream(llmInput, 'USER');
          } catch (retryError) {
            console.error('Retry after compaction failed:', retryError, originalUserMessage);
          }
          return;
        }
      }

      console.error('Failed to process user message:', error, originalUserMessage);
    }
  }, [runCompactionWithStatus, streamProcessor]);

  const handleSend = async () => {
    if (inputValue.trim() && !isProcessing && !isCompacting) {
      const userMessage = inputValue.trim();
      setLastUserMessage(userMessage);
      setInputValue('');

      const filterResult = await processUserMessage(userMessage);

      if (filterResult.displayUserMessage) {
        const userMsgObject = createMessage('user', userMessage);
        handleMessageAdd(userMsgObject);
      }

      if (filterResult.pseudoAssistantResponse) {
        const pseudoMessage = createMessage('assistant', filterResult.pseudoAssistantResponse);
        handleMessageAdd(pseudoMessage);
      }

      if (filterResult.metadata?.command === 'compact') {
        await runCompactionWithStatus(
          'manual',
          typeof filterResult.metadata.focus === 'string' ? filterResult.metadata.focus : undefined,
        );
        return;
      }

      if (!filterResult.sendToLLM || !filterResult.finalMessageForLLM) {
        return;
      }

      // Log system prompt only for first message
      if (isFirstMessage) {
        try {
          const provider = AgentCore.instance().getLLMProvider();
          const systemPrompt = await SystemPrompts.getSystemPromptWithContext(
            provider?.getPreferredSystemPromptPath?.(),
          );
          console.log('------------ SYSTEM ------------');
          console.log(systemPrompt);
          console.log('--------------------------------');
        } catch (error) {
          console.error('Failed to log system prompt:', error);
        }
        setIsFirstMessage(false);
      }

      // Process through stream processor — AgentCore handles the full agentic loop internally
      const agentCore = AgentCore.instance();
      if (await agentCore.shouldCompactBeforeNextTurn(filterResult.finalMessageForLLM)) {
        await runCompactionWithStatus('auto');
      }

      await sendWithCompactionRecovery(filterResult.finalMessageForLLM, userMessage);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleInputFocus = () => {
    if (textareaRef.current) {
      textareaRef.current.setAttribute('data-chatbox-input', 'true');
    }
  };

  const handleInputBlur = () => {
    if (textareaRef.current) {
      textareaRef.current.removeAttribute('data-chatbox-input');
    }
  };

  // Auto-resize textarea based on content
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`;
    }
  }, [inputValue]);

  // Auto-scroll to bottom when new messages arrive
  const messagesEndRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Auto-focus input when processing completes
  useEffect(() => {
    if (!isProcessing && !isCompacting && textareaRef.current) {
      setTimeout(() => {
        textareaRef.current?.focus();
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
      }, 0);
    }
  }, [isCompacting, isProcessing]);

  const localRuntimeMessage = localModelState.runtimeSupport.reason;
  const hasLocalRuntimeHardFailure = !localModelState.runtimeSupport.supported;
  return (
    <div className={`chatbox ${isVisible ? '' : 'is-hidden'}`}>
      <div className="chatbox-header">
        <h3>{t('assistant.displayName')}</h3>
        <div className="chatbox-actions">
          {isProcessing && (
            <button
              type="button"
              title="Abort"
              onClick={handleAbort}
              className="chatbox-action-btn"
            >
              <FaBan />
            </button>
          )}
          <div className="chatbox-export-wrapper">
            <button
              type="button"
              title="Export"
              onClick={() => setShowExportDropdown(!showExportDropdown)}
              className="chatbox-action-btn chatbox-export-btn"
            >
              <FaDownload />
            </button>
            <div className="chatbox-export-dropdown-anchor">
              <KGDropdown
                options={exportOptions}
                value={exportOptions[0]}
                onChange={handleExportOptionSelect}
                label="Export"
                hideButton={true}
                isOpen={showExportDropdown}
                onToggle={setShowExportDropdown}
                className="chatbox-export-dropdown"
              />
            </div>
          </div>
          <button
            type="button"
            title="New Chat"
            onClick={handleClearCommand}
            className="chatbox-action-btn"
          >
            <FaPlus />
          </button>
        </div>
      </div>

      {activeProvider === LOCAL_LLM_PROVIDER_KEY && (
        <div className="chatbox-local-runtime-section">
          <div className="chatbox-local-runtime-card">
            <h4 className="chatbox-local-mode-title">{LOCAL_LLM_DISPLAY_NAME} Local Runtime</h4>
            {hasLocalRuntimeHardFailure && (
              <div className="chatbox-local-runtime-error">
                {localRuntimeMessage}
              </div>
            )}
            {!localModelState.isCached && !localModelState.isDownloading && localModelState.runtimeSupport.supported && (
              <div className="chatbox-local-runtime-help">
                The local language model has not been downloaded yet. It will be downloaded automatically the next time you send a chat request with this provider.
              </div>
            )}
            {(localModelState.isChecking || localModelState.isDownloading || localModelState.progressText) && (
              <div className="chatbox-progress-block">
                <div
                  className="chatbox-progress-track"
                  role="progressbar"
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={Math.max(0, Math.min(100, localModelState.progressPercent))}
                >
                  <div className="chatbox-progress-fill" style={{ width: `${Math.max(0, Math.min(100, localModelState.progressPercent))}%` }} />
                </div>
                <div className="chatbox-gen-hint">
                  {localModelState.isChecking ? 'Checking local model cache...' : localModelState.progressText}
                </div>
              </div>
            )}
            {localModelState.error && (
              <div className="chatbox-local-runtime-error">
                {localModelState.error}
              </div>
            )}
          </div>
        </div>
      )}

      <div className="chatbox-messages">
        {messages.map((message) => (
          message.role === 'user' ? (
            <UserMessage key={message.id} content={message.content} />
          ) : (
            <AssistantMessage
              key={message.id}
              content={message.content}
              isStreaming={message.isStreaming}
              performanceInfo={message.performanceInfo}
              toolName={message.toolName}
              toolSuccess={message.toolSuccess}
              toolRawResult={message.toolRawResult}
              toolResultDisplayContent={message.toolResultDisplayContent}
              todoSnapshot={message.todoSnapshot}
              isToolCallMessage={message.isToolCallMessage}
              onAbort={message.isStreaming ? handleAbort : undefined}
            />
          )
        ))}
        <div ref={messagesEndRef} />
      </div>

      {!isProcessing && !isCompacting && (
        <div className="chatbox-input-area">
          <textarea
            ref={textareaRef}
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={handleKeyDown}
            onFocus={handleInputFocus}
            onBlur={handleInputBlur}
            placeholder="Press Enter to send message, Shift + Enter for new line"
            className="chatbox-input"
            rows={1}
          />
        </div>
      )}
    </div>
  );
};

export default memo(ChatBox);
