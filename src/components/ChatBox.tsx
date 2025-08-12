import React, { useState, useRef, useEffect, memo } from 'react';
import { FaPlus, FaBan } from 'react-icons/fa';
import { UserMessage, AssistantMessage } from './chat';
import { AgentCore } from '../agent/core/AgentCore';
import { OpenAIProvider } from '../agent/llm/OpenAIProvider';
import { ClaudeProvider } from '../agent/llm/ClaudeProvider';
import { GeminiProvider } from '../agent/llm/GeminiProvider';
import { LLMProvider } from '../agent/llm/LLMProvider';
import { ConfigManager } from '../core/config/ConfigManager';
import { useProjectStore } from '../stores/projectStore';
import { XMLToolExecutor } from '../agent/core/XMLToolExecutor';
import { extractXMLFromString } from '../util/xmlUtil';
import { SystemPrompts } from '../agent/core/SystemPrompts';
import { clearChatHistoryAndUI, registerClearChatUICallback } from '../util/chatUtil';
import { processUserMessage } from '../util/messageFilter/UserMessageFilter';

// Module-level guard to avoid duplicate welcome in React StrictMode dev remounts
let hasShownWelcomeOnceInRuntime = false;

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  isStreaming?: boolean;
  tokenCount?: number;
}

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
    case 'openai_compatible':
    case 'openai':
    default:
      return new OpenAIProvider();
  }
};

const ChatBox: React.FC = () => {
  const [inputValue, setInputValue] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  
  // Initialize with empty messages
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [abortController, setAbortController] = useState<AbortController | null>(null);
  const [lastUserMessage, setLastUserMessage] = useState<string>('');
  
  // Tool execution state
  const [isExecutingTools, setIsExecutingTools] = useState(false);
  const [, setToolResults] = useState<string>(''); // placeholder for future display/use
  const [, setCurrentToolIndex] = useState<number>(0); // placeholder for future display/use
  
  // Track if this is the first message (for system prompt logging)
  const [isFirstMessage, setIsFirstMessage] = useState(true);

  // Initialize AgentCore with configured provider and register clear UI callback
  useEffect(() => {
    const initializeProvider = async () => {
      const configManager = ConfigManager.instance();
      
      // Ensure ConfigManager is initialized
      if (!configManager.getIsInitialized()) {
        await configManager.initialize();
      }
      
      const provider = createLLMProvider();
      const agentCore = AgentCore.instance();
      agentCore.setLLMProvider(provider);

      console.log(`Switched to ${provider.name} provider`);
    };
    
    // Register the UI clear callback for external components to use
    registerClearChatUICallback(clearChatUI);
    
    initializeProvider();
    
    // Auto-trigger welcome on first launch (guard against React StrictMode double-invoke only)
    (async () => {
      try {
        if (hasShownWelcomeOnceInRuntime) return;
        hasShownWelcomeOnceInRuntime = true;

        const result = await processUserMessage('/welcome');
        if (result.pseudoAssistantResponse) {
          const pseudoId = generateMessageId();
          setMessages(prev => [...prev, {
            id: pseudoId,
            role: 'assistant',
            content: result.pseudoAssistantResponse!,
          }]);
        }
      } catch {
        // ignore
      }
    })();
  }, []);

  const generateMessageId = (): string => {
    return `msg_${Date.now()}_${Math.random().toString(36).substring(2, 15)}`;
  };

  const handleAbort = () => {
    if (abortController) {
      abortController.abort();
      setAbortController(null);
      
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

  const clearChatUI = () => {
    // Clear UI state
    setMessages([]);
    
    // Reset first message flag so system prompt will be logged again
    setIsFirstMessage(true);
  };

  const handleClearCommand = () => {
    const { setStatus } = useProjectStore.getState();
    clearChatHistoryAndUI(setStatus);
  };


  const addToolResultMessage = (toolName: string, success: boolean, result: string) => {
    const toolMsgId = generateMessageId();
    const friendlyDisplay = `${success ? '✅' : '❌'} __**${toolName}**__ \n\n └── ${result}`;
    
    setMessages(prev => [...prev, {
      id: toolMsgId,
      role: 'user',
      content: friendlyDisplay
    }]);
  };

  const executeToolsFromResponse = async (response: string): Promise<boolean> => {
    try {
      // Check if response contains XML tool invocations
      const xmlBlocks = extractXMLFromString(response);
      // Consider only actionable tools (exclude think/thinking)
      const actionableBlocks = xmlBlocks.filter((block) => {
        const match = block.match(/<([a-zA-Z_][a-zA-Z0-9_-]*)/);
        const name = match ? match[1].toLowerCase() : '';
        return name !== 'think' && name !== 'thinking';
      });

      if (actionableBlocks.length === 0) {
        // No actionable tools to execute, stop the loop
        return false;
      }

      // Start tool execution phase
      setIsExecutingTools(true);
      setToolResults('');
      setCurrentToolIndex(0);
      
      const { setStatus } = useProjectStore.getState();
      setStatus(`Executing ${actionableBlocks.length} tool(s)...`);

      const executor = XMLToolExecutor.instance();
      let accumulatedResults = '';

      // Execute tools sequentially with real-time updates
      for (let i = 0; i < actionableBlocks.length; i++) {
        setCurrentToolIndex(i + 1);
        setStatus(`Executing tool ${i + 1} of ${actionableBlocks.length}...`);

        // Determine tool name from XML block
        const toolNameMatch = actionableBlocks[i].match(/<([a-zA-Z_][a-zA-Z0-9_-]*)/);
        const toolName = toolNameMatch ? toolNameMatch[1] : 'unknown_tool';

        try {
          // Execute single XML block
          const results = await executor.executeXMLTools(actionableBlocks[i]);
          const result = results[0]; // Single block should give single result
          
          if (result) {
            // Add friendly display message
            addToolResultMessage(toolName, result.success, result.result);
            
            // Accumulate formatted result for LLM (skip thinking tools)
            if (toolName !== 'thinking' && toolName !== 'think') {
              const formattedResult = `tool: ${toolName}\nsuccess: ${result.success}\nresult:\n${result.result}\n------------\n`;
              accumulatedResults += formattedResult;
            }
          }
        } catch (error) {
          // Handle individual tool error
          addToolResultMessage(toolName, false, `Tool execution failed: ${error}`);
          
          // Accumulate error result for LLM (skip thinking tools)
          if (toolName !== 'thinking' && toolName !== 'think') {
            const formattedResult = `tool: ${toolName}\nsuccess: false\nresult:\nTool execution failed: ${error}\n------------\n`;
            accumulatedResults += formattedResult;
          }
        }
      }

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
    // Send tool results as hidden user input to LLM
    setIsProcessing(true);

    // Create abort controller for this request
    const controller = new AbortController();
    setAbortController(controller);

    // Add streaming assistant message for the response
    const assistantMsgId = generateMessageId();
    setMessages(prev => [...prev, {
      id: assistantMsgId,
      role: 'assistant',
      content: 'processing... 0 tokens received. click here to abort.',
      isStreaming: true,
      tokenCount: 0
    }]);

    try {
      const agentCore = AgentCore.instance();
      let assistantResponse = '';
      let tokenCount = 0;

      // Log the tool results being sent to LLM
      console.log('------------ USER ------------');
      console.log(toolResultsString);
      console.log('------------------------------');

      for await (const chunk of agentCore.processUserInput(toolResultsString)) {
        // Check if request was aborted
        if (controller.signal.aborted) {
          return;
        }

        if (chunk.type === 'text') {
          assistantResponse += chunk.content;
          tokenCount++;
          
          // Update streaming message with token count and abort link
          setMessages(prev => prev.map(msg => 
            msg.id === assistantMsgId
              ? { ...msg, content: `processing... ${tokenCount} tokens received. click here to abort.`, tokenCount }
              : msg
          ));
        } else if (chunk.type === 'done') {
          // Replace with final response
          setMessages(prev => prev.map(msg => 
            msg.id === assistantMsgId
              ? { ...msg, content: assistantResponse, isStreaming: false, tokenCount: undefined }
              : msg
          ));
          
          // Log the complete assistant response
          console.log('------------ ASSISTANT ------------');
          console.log(assistantResponse);
          console.log('-----------------------------------');
          
          // Check if the new response contains more tools
          const hasMoreTools = await executeToolsFromResponse(assistantResponse);
          
          // If no more tools were found, set working flag to false
          if (!hasMoreTools) {
            const agentCore = AgentCore.instance();
            agentCore.getAgentState().setIsWorkingOnTask(false);
          }
          
          break;
        }
      }
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        // Request was aborted, don't show error
        return;
      }
      
      console.error('Error processing tool results:', error);
      // Update with error message
      setMessages(prev => prev.map(msg => 
        msg.id === assistantMsgId
          ? { ...msg, content: 'Error: Failed to process tool results', isStreaming: false, tokenCount: undefined }
          : msg
      ));
    } finally {
      setAbortController(null);
      setIsProcessing(false);
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
        const userMsgId = generateMessageId();
        setMessages(prev => [...prev, {
          id: userMsgId,
          role: 'user',
          content: userMessage
        }]);
      }

      // If we have a pseudo assistant response, show it immediately
      if (filterResult.pseudoAssistantResponse) {
        const pseudoId = generateMessageId();
        setMessages(prev => [...prev, {
          id: pseudoId,
          role: 'assistant',
          content: filterResult.pseudoAssistantResponse!,
        }]);
      }

      // If we shouldn't send anything to LLM, stop here
      if (!filterResult.sendToLLM || !filterResult.finalMessageForLLM) {
        return;
      }

      setIsProcessing(true);

      // Create abort controller for this request
      const controller = new AbortController();
      setAbortController(controller);

      // Add streaming assistant message
      const assistantMsgId = generateMessageId();
      setMessages(prev => [...prev, {
        id: assistantMsgId,
        role: 'assistant',
        content: 'processing... 0 tokens received. click here to abort.',
        isStreaming: true,
        tokenCount: 0
      }]);

      try {
        const agentCore = AgentCore.instance();
        let assistantResponse = '';
        let tokenCount = 0;

        // Set working on task flag when user sends a message
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

        // Log the final user message being sent to LLM
        console.log('------------ USER ------------');
        console.log(filterResult.finalMessageForLLM);
        console.log('------------------------------');

        for await (const chunk of agentCore.processUserInput(filterResult.finalMessageForLLM)) {
          // Check if request was aborted
          if (controller.signal.aborted) {
            return;
          }

          if (chunk.type === 'text') {
            assistantResponse += chunk.content;
            tokenCount++;
            
            // Update streaming message with token count and abort link
            setMessages(prev => prev.map(msg => 
              msg.id === assistantMsgId
                ? { ...msg, content: `processing... ${tokenCount} tokens received. click here to abort.`, tokenCount }
                : msg
            ));
          } else if (chunk.type === 'done') {
            // Replace with final response
            setMessages(prev => prev.map(msg => 
              msg.id === assistantMsgId
                ? { ...msg, content: assistantResponse, isStreaming: false, tokenCount: undefined }
                : msg
            ));
            
            // Log the complete assistant response
            console.log('------------ ASSISTANT ------------');
            console.log(assistantResponse);
            console.log('-----------------------------------');
            
            // Check if response contains tools to execute
            const hasTools = await executeToolsFromResponse(assistantResponse);
            
            // If no tools were found, set working flag to false and return control to user
            if (!hasTools) {
              agentCore.getAgentState().setIsWorkingOnTask(false);
            }
            
            break;
          }
        }
      } catch (error) {
        if (error instanceof Error && error.name === 'AbortError') {
          // Request was aborted, don't show error
          return;
        }
        
        console.error('Error processing message:', error);
        // Update with error message
        setMessages(prev => prev.map(msg => 
          msg.id === assistantMsgId
            ? { ...msg, content: 'Error: Failed to process message', isStreaming: false, tokenCount: undefined }
            : msg
        ));
      } finally {
        setAbortController(null);
        setIsProcessing(false);
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
    <div className="chatbox">
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