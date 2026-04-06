import React, { useState, useRef, useEffect, memo, useCallback } from 'react';
import { FaPlus, FaBan, FaDownload } from 'react-icons/fa';
import { UserMessage, AssistantMessage } from './chat';
import { AgentCore } from '../agent/core/AgentCore';
import { LLMProvider } from '../agent/llm/LLMProvider';
import { ConfigManager } from '../core/config/ConfigManager';
import { useProjectStore } from '../stores/projectStore';
import { SystemPrompts } from '../agent/core/SystemPrompts';
import { clearChatHistoryAndUI, registerClearChatUICallback } from '../util/chatUtil';
import { processUserMessage } from '../util/messageFilter/UserMessageFilter';
import { useStreamProcessor } from '../hooks/useStreamProcessor';
import { createMessage, addWelcomeMessage } from '../utils/chatMessageUtils';
import { formatLocalDateTime } from '../util/timeUtil';
import { downloadBlob, buildTimestampSuffix } from '../util/miscUtil';
import KGDropdown from './common/KGDropdown';

import type { ChatMessage } from '../types/projectTypes';

// Module-level guard to avoid duplicate welcome in React StrictMode dev remounts
let hasShownWelcomeOnceInRuntime = false;

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

  return new LLMProvider(apiKey, model, baseURL);
};

interface ChatBoxProps {
  isVisible: boolean;
}

const ChatBox: React.FC<ChatBoxProps> = ({ isVisible }) => {
  const [inputValue, setInputValue] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [lastUserMessage, setLastUserMessage] = useState<string>('');

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
        const agentMessages = AgentCore.instance().getAgentState().getMessages();
        const exportMessages = agentMessages.map((m) => ({
          id: m.id,
          role: m.role,
          content: m.content,
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
          const agentMessages = AgentCore.instance().getAgentState().getMessages();
          const templateUrl = `${import.meta.env.BASE_URL}chat/export_conversation_template.md`;
          const res = await fetch(templateUrl);
          const template = await res.text();

          const sections = agentMessages
            .filter(m => m.role === 'user' || m.role === 'assistant')
            .map((m) => {
              const roleLabel = m.role === 'assistant' ? 'Assistant' : 'User';
              const ts = formatLocalDateTime(new Date(m.timestamp));
              return template
                .replace('{role}', roleLabel)
                .replace('{timestamp}', ts)
                .replace('{content}', m.content ?? '');
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
    setMessages(prev => [...prev, message]);
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
        const provider = createLLMProviderFromConfig();
        const agentCore = AgentCore.instance();
        agentCore.setLLMProvider(provider);
        console.log('LLM provider configured');
      };

      applyProviderFromConfig();

      const unsubscribe = configManager.addChangeListener((changedKeys) => {
        if (
          changedKeys.includes('general.llm_provider') ||
          changedKeys.some(k => k.startsWith('general.openai.')) ||
          changedKeys.some(k => k.startsWith('general.openai_compatible.'))
        ) {
          applyProviderFromConfig();
        }
      });

      return unsubscribe;
    };

    registerClearChatUICallback(clearChatUI);

    const maybeUnsubscribePromise = initializeProvider();

    (async () => {
      if (hasShownWelcomeOnceInRuntime) return;
      hasShownWelcomeOnceInRuntime = true;

      const welcomeMessage = await addWelcomeMessage();
      if (welcomeMessage) {
        setMessages([welcomeMessage]);
      }
    })();

    return () => {
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

  const handleSend = async () => {
    if (inputValue.trim() && !isProcessing) {
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

      if (!filterResult.sendToLLM || !filterResult.finalMessageForLLM) {
        return;
      }

      // Log system prompt only for first message
      if (isFirstMessage) {
        try {
          const systemPrompt = await SystemPrompts.getSystemPromptWithContext();
          console.log('------------ SYSTEM ------------');
          console.log(systemPrompt);
          console.log('--------------------------------');
        } catch (error) {
          console.error('Failed to log system prompt:', error);
        }
        setIsFirstMessage(false);
      }

      // Process through stream processor — AgentCore handles the full agentic loop internally
      await streamProcessor.processStream(filterResult.finalMessageForLLM, 'USER');
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
    if (!isProcessing && textareaRef.current) {
      setTimeout(() => {
        textareaRef.current?.focus();
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
      }, 0);
    }
  }, [isProcessing]);

  return (
    <div className={`chatbox ${isVisible ? '' : 'is-hidden'}`}>
      <div className="chatbox-header">
        <h3>K.G.Studio Musician Assistant</h3>
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

      <div className="chatbox-messages">
        {messages.map((message) => (
          message.role === 'user' ? (
            <UserMessage key={message.id} content={message.content} />
          ) : (
            <AssistantMessage
              key={message.id}
              content={message.content}
              isStreaming={message.isStreaming}
              onAbort={message.isStreaming ? handleAbort : undefined}
            />
          )
        ))}
        <div ref={messagesEndRef} />
      </div>

      {!isProcessing && (
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
