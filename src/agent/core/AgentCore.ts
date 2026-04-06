import { LLMProvider } from '../llm/LLMProvider';
import { AgentState } from './AgentState';
import { SystemPrompts } from './SystemPrompts';
import { AVAILABLE_TOOLS } from '../tools';
import { useProjectStore } from '../../stores/projectStore';
import type { StreamChunk } from '../llm/StreamingTypes';
import type { ToolCall } from './AgentState';
import type { OpenAIToolDefinition } from '../tools/BaseTool';

/**
 * Main orchestrator for the AI agent system.
 * Handles the full agentic loop: LLM streaming → tool execution → result feedback → repeat.
 */
export class AgentCore {
  private static _instance: AgentCore | null = null;

  private llmProvider: LLMProvider | null = null;
  private agentState: AgentState;
  private currentUserMessageId: string | null = null;
  private currentAssistantMessageId: string | null = null;

  private constructor() {
    this.agentState = new AgentState();
  }

  static instance(): AgentCore {
    if (!AgentCore._instance) {
      AgentCore._instance = new AgentCore();
    }
    return AgentCore._instance;
  }

  setLLMProvider(provider: LLMProvider): void {
    this.llmProvider = provider;
  }

  getLLMProvider(): LLMProvider | null {
    return this.llmProvider;
  }

  getAgentState(): AgentState {
    return this.agentState;
  }

  /**
   * Get OpenAI tool definitions for all available tools
   */
  private getToolDefinitions(): OpenAIToolDefinition[] {
    return Object.values(AVAILABLE_TOOLS).map(ToolClass => {
      const tool = new ToolClass();
      return tool.getDefinition();
    });
  }

  /**
   * Execute a single tool call and return the result
   */
  private async executeTool(toolCall: ToolCall): Promise<{ success: boolean; result: string }> {
    const toolName = toolCall.function.name;
    const ToolClass = AVAILABLE_TOOLS[toolName as keyof typeof AVAILABLE_TOOLS];

    if (!ToolClass) {
      return { success: false, result: `Unknown tool: ${toolName}` };
    }

    try {
      const params = JSON.parse(toolCall.function.arguments);
      const toolInstance = new ToolClass();
      const result = await toolInstance.execute(params);

      // Sync UI state after successful tool execution
      if (result.success) {
        useProjectStore.getState().refreshProjectState();
      }

      return result;
    } catch (error) {
      return { success: false, result: `Tool execution failed: ${error}` };
    }
  }

  /**
   * Process user input and generate streaming response.
   * Handles the full agentic loop internally: if the LLM returns tool_calls,
   * execute them and feed results back until the LLM produces a final text response.
   */
  async *processUserInput(userInput: string): AsyncIterableIterator<StreamChunk> {
    if (!this.llmProvider) {
      throw new Error('No LLM provider configured');
    }

    // Add user message to state
    this.currentUserMessageId = this.agentState.addMessage('user', userInput);

    const systemPrompt = await SystemPrompts.getSystemPromptWithContext();
    const tools = this.getToolDefinitions();

    try {
      // Agentic loop: stream → check for tool calls → execute → repeat
      let continueLoop = true;

      while (continueLoop) {
        const conversationHistory = this.agentState.getMessages();

        // Pre-add an empty assistant message that we'll update as we stream
        this.currentAssistantMessageId = this.agentState.addMessage('assistant', '');

        let assistantTextContent = '';
        const accumulatedToolCalls: ToolCall[] = [];
        let finishReason = 'stop';

        for await (const chunk of this.llmProvider.generateStream(conversationHistory, systemPrompt, tools)) {
          if (chunk.type === 'text') {
            assistantTextContent += chunk.content;
            this.agentState.updateMessage(this.currentAssistantMessageId, assistantTextContent);
            yield chunk;
          } else if (chunk.type === 'tool_call' && chunk.toolCall) {
            accumulatedToolCalls.push(chunk.toolCall);
          } else if (chunk.type === 'done') {
            finishReason = chunk.finishReason ?? 'stop';
          }
        }

        if (finishReason === 'tool_calls' && accumulatedToolCalls.length > 0) {
          // Update assistant message with tool calls
          this.agentState.updateMessage(
            this.currentAssistantMessageId,
            assistantTextContent || null,
            { tool_calls: accumulatedToolCalls }
          );

          // Execute each tool call and add results to conversation
          for (const toolCall of accumulatedToolCalls) {
            // Notify UI about the tool call
            yield { type: 'tool_call', content: '', toolCall };

            const result = await this.executeTool(toolCall);

            // Add tool result message to conversation history
            this.agentState.addMessage('tool', JSON.stringify(result), {
              tool_call_id: toolCall.id,
            });

            // Notify UI about the tool result
            yield {
              type: 'tool_result',
              content: '',
              toolResult: {
                name: toolCall.function.name,
                success: result.success,
                result: result.result,
              },
            };
          }

          // Clear assistant message ID before next iteration creates a new one
          this.currentAssistantMessageId = null;

          // Continue loop — send tool results back to LLM
        } else {
          // LLM finished with text response (stop reason)
          this.agentState.updateMessage(this.currentAssistantMessageId, assistantTextContent);
          continueLoop = false;
        }
      }

      yield { type: 'done', content: '', finishReason: 'stop' };
    } finally {
      this.currentUserMessageId = null;
      this.currentAssistantMessageId = null;
    }
  }

  /**
   * Abort the current streaming request and clean up messages
   * Returns the content of the user message that was aborted (for restoring to input)
   */
  abortCurrentRequest(): string | null {
    let userMessageContent = null;

    if (this.currentAssistantMessageId) {
      this.agentState.removeMessage(this.currentAssistantMessageId);
      this.currentAssistantMessageId = null;
    }

    if (this.currentUserMessageId) {
      const messages = this.agentState.getMessages();
      const userMessage = messages.find(msg => msg.id === this.currentUserMessageId);
      if (userMessage) {
        userMessageContent = userMessage.content;
      }
      this.agentState.removeMessage(this.currentUserMessageId);
      this.currentUserMessageId = null;
    }

    return userMessageContent;
  }

  isStreamingInProgress(): boolean {
    return this.currentUserMessageId !== null;
  }

  clearConversation(): void {
    this.agentState.clearMessages();
  }

  getIsWorkingOnTask(): boolean {
    return this.agentState.getIsWorkingOnTask();
  }

  setIsWorkingOnTask(isWorking: boolean): void {
    this.agentState.setIsWorkingOnTask(isWorking);
  }
}
