import React, { useState, useRef, useEffect, memo, useCallback } from 'react';
import { FaPlus, FaBan, FaDownload } from 'react-icons/fa';
import { UserMessage, AssistantMessage } from './chat';
import { AgentCore } from '../agent/core/AgentCore';
import { OpenAIProvider } from '../agent/llm/OpenAIProvider';
import { ClaudeProvider } from '../agent/llm/ClaudeProvider';
import { ClaudeOpenRouterProvider } from '../agent/llm/ClaudeOpenRouterProvider';
import { GeminiProvider } from '../agent/llm/GeminiProvider';
import { LLMProvider } from '../agent/llm/LLMProvider';
import { ConfigManager } from '../core/config/ConfigManager';
import { useProjectStore } from '../stores/projectStore';
import { SystemPrompts } from '../agent/core/SystemPrompts';
import { clearChatHistoryAndUI, registerClearChatUICallback } from '../util/chatUtil';
import { processUserMessage } from '../util/messageFilter/UserMessageFilter';
import { useStreamProcessor } from '../hooks/useStreamProcessor';
import { createMessage, addWelcomeMessage } from '../utils/chatMessageUtils';
import { extractActionableTools, executeAllTools } from '../utils/toolExecutionUtils';
import { formatLocalDateTime } from '../util/timeUtil';
import { downloadBlob, buildTimestampSuffix } from '../util/miscUtil';
import { wrapXmlBlocksInContent } from '../util/xmlUtil';
import KGDropdown from './common/KGDropdown';

import type { ChatMessage } from '../types/projectTypes';

// Module-level guard to avoid duplicate welcome in React StrictMode dev remounts
let hasShownWelcomeOnceInRuntime = false;

/**
 * Create the appropriate LLM provider based on configuration
 */
const createLLMProvider = (): LLMProvider => {
  const configManager = ConfigManager.instance();
  const providerType = configManager.get('general.llm_provider') as string;
  
  switch (providerType) {
    case 'claude':
      return new ClaudeProvider();
    case 'gemini':
      return new GeminiProvider();
    case 'claude_openrouter':
      return new ClaudeOpenRouterProvider();
    case 'openai_compatible':
    case 'openai':
    default:
      return new OpenAIProvider();
  }
};

interface ChatBoxProps {
  isVisible: boolean;
}

const ChatBox: React.FC<ChatBoxProps> = ({ isVisible }) => {
  const [inputValue, setInputValue] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  
  // Initialize with empty messages
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [lastUserMessage, setLastUserMessage] = useState<string>('');
  
  // Tool execution state
  const [isExecutingTools, setIsExecutingTools] = useState(false);
  const [, setToolResults] = useState<string>(''); // placeholder for future display/use
  const [, setCurrentToolIndex] = useState<number>(0); // placeholder for future display/use
  
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
        const messages = AgentCore.instance().getAgentState().getMessages();
        const exportMessages = messages.map((m) => ({
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
          const messages = AgentCore.instance().getAgentState().getMessages();
          const templateUrl = `${import.meta.env.BASE_URL}chat/export_conversation_template.md`;
          const res = await fetch(templateUrl);
          const template = await res.text();

          const isAutomatedUserMessage = (content: string): boolean => {
            return /^tool:\s.*\nsuccess:\s*(true|false)/i.test(content);
          };

          const sections = messages.map((m) => {
            const isAutomaticUserMessage = isAutomatedUserMessage(m.content);
            const roleLabel = m.role === 'assistant' ? 'Assistant' : (isAutomaticUserMessage ? 'User (Automatic)' : 'User');
            const ts = formatLocalDateTime(new Date(m.timestamp));
            const contentWithXml = isAutomaticUserMessage ? "```\n" + m.content + "\n```" : wrapXmlBlocksInContent(m.content);
            return template
              .replace('{role}', roleLabel)
              .replace('{timestamp}', ts)
              .replace('{content}', contentWithXml);
          });

          const markdown = sections.join('\n');
          const filename = `kgstudio-conversation-${buildTimestampSuffix()}.md`;
          downloadBlob(markdown, 'text/markdown', filename);
        } catch (err) {
          console.error('Failed to export conversation as Markdown:', err);
        }
      })();
    } else {
      console.log('Chat export selected:', option);
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

  const handleProcessingChange = useCallback((processing: boolean) => {
    setIsProcessing(processing);
  }, []);

  // Stream processor hook
  const streamProcessor = useStreamProcessor({
    onMessageUpdate: handleMessageUpdate,
    onMessageAdd: handleMessageAdd,
    onProcessingChange: handleProcessingChange
  });

  const clearChatUI = useCallback(async () => {
    // Clear UI state
    setMessages([]);
    
    // Reset first message flag so system prompt will be logged again
    setIsFirstMessage(true);
    
    // Auto-show welcome message after clearing (like on app startup)
    const welcomeMessage = await addWelcomeMessage();
    if (welcomeMessage) {
      setMessages([welcomeMessage]);
    }
  }, []);

  // Initialize AgentCore with configured provider and register clear UI callback
  useEffect(() => {
    const initializeProvider = async () => {
      const configManager = ConfigManager.instance();
      
      // Ensure ConfigManager is initialized
      if (!configManager.getIsInitialized()) {
        await configManager.initialize();
      }
      
      const applyProviderFromConfig = () => {
        const provider = createLLMProvider();
        const agentCore = AgentCore.instance();
        agentCore.setLLMProvider(provider);
        console.log(`Switched to ${provider.name} provider`);
      };

      // Initial apply
      applyProviderFromConfig();

      // Subscribe to config changes to hot-swap providers
      const unsubscribe = configManager.addChangeListener((changedKeys) => {
        // Hot-swap on provider change or when relevant provider config changes
        if (
          changedKeys.includes('general.llm_provider') ||
          changedKeys.some(k => k.startsWith('general.openai.')) ||
          changedKeys.some(k => k.startsWith('general.openai_compatible.')) ||
          changedKeys.some(k => k.startsWith('general.claude_openrouter.')) ||
          changedKeys.some(k => k.startsWith('general.gemini.')) ||
          changedKeys.some(k => k.startsWith('general.claude.'))
        ) {
          applyProviderFromConfig();
        }
      });

      // Cleanup subscription on unmount
      return unsubscribe;
    };
    
    // Register the UI clear callback for external components to use
    registerClearChatUICallback(clearChatUI);
    
    const maybeUnsubscribePromise = initializeProvider();
    
    // Auto-trigger welcome on first launch (guard against React StrictMode double-invoke only)
    (async () => {
      if (hasShownWelcomeOnceInRuntime) return;
      hasShownWelcomeOnceInRuntime = true;

      const welcomeMessage = await addWelcomeMessage();
      if (welcomeMessage) {
        setMessages([welcomeMessage]);
      }
    })();
    // In case initializeProvider returned a cleanup, ensure we call it
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
      
      // Use AgentCore to clean up the data model and get the user message content
      const agentCore = AgentCore.instance();
      const userMessageContent = agentCore.abortCurrentRequest();
      
      // Remove the last user message and assistant message from UI
      setMessages(prev => prev.slice(0, -2));
      
      // Restore the user's input (use the content from AgentCore if available)
      setInputValue(userMessageContent || lastUserMessage);
      
      setIsProcessing(false);
    }
  };

  const handleClearCommand = () => {
    const { setStatus } = useProjectStore.getState();
    clearChatHistoryAndUI(setStatus);
  };

  const executeToolsFromResponse = async (response: string): Promise<boolean> => {
    try {
      const actionableBlocks = extractActionableTools(response);

      if (actionableBlocks.length === 0) {
        // No actionable tools to execute, stop the loop
        return false;
      }

      // Start tool execution phase
      setIsExecutingTools(true);
      setToolResults('');
      setCurrentToolIndex(0);
      
      const { setStatus } = useProjectStore.getState();
      
      // Execute all tools and get accumulated results
      const accumulatedResults = await executeAllTools(actionableBlocks, {
        onMessageAdd: handleMessageAdd,
        onStatusUpdate: setStatus
      });

      // Store accumulated results
      setToolResults(accumulatedResults);
      setIsExecutingTools(false);
      
      // Check if agent is still working on task before sending results to LLM
      const agentCore = AgentCore.instance();
      const isStillWorkingOnTask = agentCore.getAgentState().getIsWorkingOnTask();
      
      if (isStillWorkingOnTask) {
        // Send tool results back to LLM
        setStatus('Processing tool results...');
        await sendToolResultsToLLM(accumulatedResults);
      } else {
        // Agent is no longer working on task, ignore results and return control to user
        setStatus('Tool execution completed');
      }

      return true; // Tools were found and executed

    } catch (error) {
      console.error('Error executing tools:', error);
      setIsExecutingTools(false);
      const { setStatus } = useProjectStore.getState();
      setStatus(`Tool execution failed: ${error}`);
      return false; // Tool execution failed
    }
  };

  const sendToolResultsToLLM = async (toolResultsString: string): Promise<void> => {
    // Process tool results through the stream processor
    const assistantResponse = await streamProcessor.processStream(toolResultsString, 'TOOL_RESULTS');
    
    // Check if the new response contains more tools
    const hasMoreTools = await executeToolsFromResponse(assistantResponse);
    
    // If no more tools were found, set working flag to false
    if (!hasMoreTools) {
      const agentCore = AgentCore.instance();
      agentCore.getAgentState().setIsWorkingOnTask(false);
    }
  };

  const handleSend = async () => {
    if (inputValue.trim() && !isProcessing) {
      const userMessage = inputValue.trim();
      setLastUserMessage(userMessage);
      setInputValue('');

      // Run message through the filter system
      const filterResult = await processUserMessage(userMessage);

      // Conditionally show the user message bubble
      if (filterResult.displayUserMessage) {
        const userMsgObject = createMessage('user', userMessage);
        handleMessageAdd(userMsgObject);
      }

      // If we have a pseudo assistant response, show it immediately
      if (filterResult.pseudoAssistantResponse) {
        const pseudoMessage = createMessage('assistant', filterResult.pseudoAssistantResponse);
        handleMessageAdd(pseudoMessage);
      }

      // If we shouldn't send anything to LLM, stop here
      if (!filterResult.sendToLLM || !filterResult.finalMessageForLLM) {
        return;
      }

      // Set working on task flag when user sends a message
      const agentCore = AgentCore.instance();
      agentCore.getAgentState().setIsWorkingOnTask(true);

      // Log system prompt only for first message or first message after clear
      if (isFirstMessage) {
        try {
          const systemPrompt = await SystemPrompts.getSystemPromptWithContext();
          console.log('------------ SYSTEM ------------');
          console.log(systemPrompt);
          console.log('--------------------------------');
        } catch (error) {
          console.error('Failed to log system prompt:', error);
        }
        // Mark that we've logged the system prompt for this conversation
        setIsFirstMessage(false);
      }

      // Process user input through the stream processor
      const assistantResponse = await streamProcessor.processStream(filterResult.finalMessageForLLM, 'USER');
      
      // Check if response contains tools to execute
      const hasTools = await executeToolsFromResponse(assistantResponse);
      
      // If no tools were found, set working flag to false and return control to user
      if (!hasTools) {
        agentCore.getAgentState().setIsWorkingOnTask(false);
      }
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
    // Allow Shift+Enter for new lines (default textarea behavior)
  };

  const handleInputFocus = () => {
    // Set a data attribute on the textarea to help global keyboard handler identify it
    if (textareaRef.current) {
      textareaRef.current.setAttribute('data-chatbox-input', 'true');
    }
  };

  const handleInputBlur = () => {
    // Remove the data attribute when losing focus
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

  // Auto-focus input when it becomes visible (when processing and tool execution complete)
  useEffect(() => {
    if (!isProcessing && !isExecutingTools && textareaRef.current) {
      // Use a small delay to ensure the DOM has updated
      setTimeout(() => {
        textareaRef.current?.focus();
        // Also scroll to bottom when input becomes visible after tool execution
        // This ensures proper scroll position after layout changes from showing input box
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
      }, 0);
    }
  }, [isProcessing, isExecutingTools]);

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
      
      {!isProcessing && !isExecutingTools && (
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