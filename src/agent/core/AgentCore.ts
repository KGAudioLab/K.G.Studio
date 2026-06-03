import type { LLMProvider } from '../llm/LLMProvider';
import { AgentState } from './AgentState';
import { SystemPrompts } from './SystemPrompts';
import { AVAILABLE_TOOLS } from '../tools';
import { useProjectStore } from '../../stores/projectStore';
import type { StreamChunk } from '../llm/StreamingTypes';
import type { ToolCall } from './AgentState';
import type { OpenAIToolDefinition } from '../tools/BaseTool';
import { ConversationCompactor, type CompactProgress } from '../compact/ConversationCompactor';
import { ConfigManager } from '../../core/config/ConfigManager';
import { buildTodoContext } from './todo';

export interface CompactConversationOptions {
  trigger: 'manual' | 'auto';
  focus?: string;
  onProgress?: (progress: CompactProgress) => void;
}

export interface CompactConversationResult {
  changed: boolean;
  compactedConversation: string;
}

/**
 * Main orchestrator for the AI agent system.
 * Handles the full agentic loop: LLM streaming → tool execution → result feedback → repeat.
 */
export class AgentCore {
  private static _instance: AgentCore | null = null;
  private static readonly TODO_TOOL_NAME = 'update_todo_list';
  private static readonly TODO_REMINDER = '<reminder>Keep the task list current. Use update_todo_list for multi-step work, mark one item in_progress before major tool work, and complete items as you finish them.</reminder>';

  private llmProvider: LLMProvider | null = null;
  private agentState: AgentState;
  private currentUserMessageId: string | null = null;
  private currentAssistantMessageId: string | null = null;
  private todoToolCyclesSinceUpdate = 0;
  private remindAboutTodosOnNextLoop = false;
  private currentTurnLikelyMultiStep = false;

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

  private async getSystemPrompt(templatePath?: string): Promise<string> {
    return SystemPrompts.getSystemPromptWithContext(templatePath);
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
    this.currentTurnLikelyMultiStep = this.isLikelyMultiStepTask(userInput);

    const systemPrompt = await SystemPrompts.getSystemPromptWithContext(
      this.llmProvider.getPreferredSystemPromptPath?.(),
    );
    const tools = this.getToolDefinitions();

    try {
      // Agentic loop: stream → check for tool calls → execute → repeat
      let continueLoop = true;

      while (continueLoop) {
        const conversationHistory = this.agentState.getMessages();
        const turnMessages = this.buildLoopMessages(conversationHistory);

        // Pre-add an empty assistant message that we'll update as we stream
        this.currentAssistantMessageId = this.agentState.addMessage('assistant', '');

        let assistantTextContent = '';
        const accumulatedToolCalls: ToolCall[] = [];
        let finishReason = 'stop';
        let performanceInfo: StreamChunk['performanceInfo'];

        for await (const chunk of this.llmProvider.generateStream(turnMessages, systemPrompt, tools)) {
          if (chunk.type === 'text') {
            assistantTextContent += chunk.content;
            this.agentState.updateMessage(this.currentAssistantMessageId, assistantTextContent);
            yield chunk;
          } else if (chunk.type === 'tool_call' && chunk.toolCall) {
            accumulatedToolCalls.push(chunk.toolCall);
          } else if (chunk.type === 'done') {
            finishReason = chunk.finishReason ?? 'stop';
            performanceInfo = chunk.performanceInfo;
          }
        }

        if (finishReason === 'tool_calls' && accumulatedToolCalls.length > 0) {
          this.updateTodoReminderState(accumulatedToolCalls);

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
                toolCallId: toolCall.id,
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
          yield { type: 'done', content: '', finishReason, performanceInfo };
        }
      }
    } finally {
      this.currentUserMessageId = null;
      this.currentAssistantMessageId = null;
      this.currentTurnLikelyMultiStep = false;
      if (this.agentState.getTodos().length === 0) {
        this.remindAboutTodosOnNextLoop = false;
      }
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
    this.todoToolCyclesSinceUpdate = 0;
    this.remindAboutTodosOnNextLoop = false;
    this.currentTurnLikelyMultiStep = false;
  }

  async shouldCompactBeforeNextTurn(userInput: string): Promise<boolean> {
    if (!this.llmProvider?.estimateHistoryTokens || !this.llmProvider.getContextWindow) {
      return false;
    }

    const contextWindow = this.llmProvider.getContextWindow();
    if (!contextWindow) {
      return false;
    }

    const tools = this.getToolDefinitions();
    const systemPrompt = await this.getSystemPrompt(
      this.llmProvider.getPreferredSystemPromptPath?.(),
    );
    const thresholdPercent = await this.getAutoCompactThresholdPercent();
    const reservedOutputTokens = this.llmProvider.getReservedOutputTokens?.() ?? 4096;
    const hypotheticalMessages = [
      ...this.agentState.getMessages(),
      {
        id: `preflight_${Date.now()}`,
        role: 'user' as const,
        content: userInput,
        timestamp: Date.now(),
      },
    ];
    const estimatedTokens = await this.llmProvider.estimateHistoryTokens(
      hypotheticalMessages,
      systemPrompt,
      tools,
    );
    const thresholdTokens = Math.floor(contextWindow * (thresholdPercent / 100));

    return (estimatedTokens + reservedOutputTokens) >= thresholdTokens;
  }

  async compactConversation(options: CompactConversationOptions): Promise<CompactConversationResult> {
    if (!this.llmProvider) {
      throw new Error('No LLM provider configured');
    }

    const messages = this.agentState.getMessages();
    if (messages.length < 2) {
      return {
        changed: false,
        compactedConversation: messages.map(message => message.content ?? '').join('\n\n'),
      };
    }

    const tailStartIndex = this.agentState.findRecentTailStartIndex();
    if (tailStartIndex <= 0 || tailStartIndex >= messages.length) {
      return {
        changed: false,
        compactedConversation: messages.map(message => message.content ?? '').join('\n\n'),
      };
    }

    const compactionPrompt = await this.getSystemPrompt('prompts/system_compaction.md');
    const compactor = new ConversationCompactor({
      provider: this.llmProvider,
      systemPrompt: compactionPrompt,
      tools: this.getToolDefinitions(),
      focus: options.focus,
      onProgress: options.onProgress,
      supplementalContext: buildTodoContext(this.agentState.getTodos()),
    });
    const result = await compactor.compact(messages, tailStartIndex);
    if (!result.changed) {
      return {
        changed: false,
        compactedConversation: result.compactedConversation,
      };
    }

    const nextMessages = this.agentState.createCompactedHistory(
      result.summary,
      result.tailStartIndex,
      options.trigger,
    );
    this.agentState.replaceMessages(nextMessages);
    console.log('------------ COMPACTED CONVERSATION ------------');
    console.log(result.compactedConversation);
    console.log('------------------------------------------------');

    return {
      changed: true,
      compactedConversation: result.compactedConversation,
    };
  }

  async retryAfterCompaction(
    userInput: string,
    options: Omit<CompactConversationOptions, 'trigger'> = {},
  ): Promise<CompactConversationResult> {
    return this.compactConversation({
      trigger: 'auto',
      focus: options.focus,
      onProgress: options.onProgress,
    });
  }

  getIsWorkingOnTask(): boolean {
    return this.agentState.getIsWorkingOnTask();
  }

  setIsWorkingOnTask(isWorking: boolean): void {
    this.agentState.setIsWorkingOnTask(isWorking);
  }

  private async getAutoCompactThresholdPercent(): Promise<80 | 90 | 95> {
    try {
      const configManager = ConfigManager.instance();
      if (!configManager.getIsInitialized()) {
        await configManager.initialize();
      }

      const configured = Number(configManager.get('general.auto_compact_threshold_percent'));
      if (configured === 80 || configured === 95) {
        return configured;
      }
    } catch (error) {
      console.warn('Failed to load auto-compact threshold, using default.', error);
    }

    return 90;
  }

  private buildLoopMessages(conversationHistory: ReturnType<AgentState['getMessages']>): ReturnType<AgentState['getMessages']> {
    if (!this.shouldInjectTodoReminder()) {
      return conversationHistory;
    }

    return [
      ...conversationHistory,
      {
        id: `todo_reminder_${Date.now()}`,
        role: 'user',
        content: AgentCore.TODO_REMINDER,
        timestamp: Date.now(),
      },
    ];
  }

  private shouldInjectTodoReminder(): boolean {
    const hasTodos = this.agentState.getTodos().length > 0;
    return (hasTodos && this.todoToolCyclesSinceUpdate >= 2)
      || (!hasTodos && this.remindAboutTodosOnNextLoop && this.currentTurnLikelyMultiStep);
  }

  private updateTodoReminderState(toolCalls: ToolCall[]): void {
    const usedTodoTool = toolCalls.some(toolCall => toolCall.function.name === AgentCore.TODO_TOOL_NAME);
    const hasNonTodoToolCall = toolCalls.some(toolCall => toolCall.function.name !== AgentCore.TODO_TOOL_NAME);
    const hasTodos = this.agentState.getTodos().length > 0;

    if (usedTodoTool) {
      this.todoToolCyclesSinceUpdate = 0;
      this.remindAboutTodosOnNextLoop = false;
      return;
    }

    if (!hasNonTodoToolCall) {
      return;
    }

    if (hasTodos) {
      this.todoToolCyclesSinceUpdate += 1;
      return;
    }

    if (this.currentTurnLikelyMultiStep) {
      this.remindAboutTodosOnNextLoop = true;
    }
  }

  private isLikelyMultiStepTask(userInput: string): boolean {
    const normalized = userInput.toLowerCase();
    if (/\n\s*[-*]\s|\n\s*\d+\.\s/.test(userInput)) {
      return true;
    }

    const coordinationKeywords = [
      'plan',
      'analyze',
      'compare',
      'design',
      'implement',
      'refactor',
      'fix',
      'update',
      'multi-step',
      'todo',
      'checklist',
    ];

    if (coordinationKeywords.some(keyword => normalized.includes(keyword))) {
      return true;
    }

    return userInput.length >= 120 && /\band\b/.test(normalized);
  }
}
