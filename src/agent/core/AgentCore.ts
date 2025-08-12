import { LLMProvider } from '../llm/LLMProvider';
import { AgentState } from './AgentState';
import { SystemPrompts } from './SystemPrompts';
import type { StreamChunk } from '../llm/StreamingTypes';

/**
 * Main orchestrator for the AI agent system
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
  
  /**
   * Get the singleton instance
   */
  static instance(): AgentCore {
    if (!AgentCore._instance) {
      AgentCore._instance = new AgentCore();
    }
    return AgentCore._instance;
  }
  
  /**
   * Set the LLM provider
   */
  setLLMProvider(provider: LLMProvider): void {
    this.llmProvider = provider;
  }
  
  /**
   * Get the current LLM provider
   */
  getLLMProvider(): LLMProvider | null {
    return this.llmProvider;
  }
  
  /**
   * Get the agent state
   */
  getAgentState(): AgentState {
    return this.agentState;
  }
  
  /**
   * Process user input and generate streaming response
   */
  async *processUserInput(userInput: string): AsyncIterableIterator<StreamChunk> {
    if (!this.llmProvider) {
      throw new Error('No LLM provider configured');
    }
    
    // Add user message to state and track its ID
    this.currentUserMessageId = this.agentState.addMessage('user', userInput);
    
    // Get system prompt with current context
    const systemPrompt = await SystemPrompts.getSystemPromptWithContext();
    
    // Get full conversation history with preserved roles
    const conversationHistory = this.agentState.getMessages();
    
    // Generate streaming response with full conversation context
    let assistantResponse = '';
    
    // Pre-add an empty assistant message that we'll update as we stream
    this.currentAssistantMessageId = this.agentState.addMessage('assistant', '');
    
    try {
      for await (const chunk of this.llmProvider.generateStream(conversationHistory, systemPrompt)) {
        if (chunk.type === 'text') {
          assistantResponse += chunk.content;
          // Update the assistant message in real-time
          this.agentState.updateMessage(this.currentAssistantMessageId, assistantResponse);
        }
        yield chunk;
      }
      
      // Final update to ensure the complete response is stored
      if (assistantResponse) {
        this.agentState.updateMessage(this.currentAssistantMessageId, assistantResponse);
      }
    } finally {
      // Clear the current message IDs when done (successfully or not)
      this.currentUserMessageId = null;
      this.currentAssistantMessageId = null;
    }
  }
  
  /**
   * Process user input and get complete response (non-streaming)
   */
  async processUserInputComplete(userInput: string): Promise<string> {
    if (!this.llmProvider) {
      throw new Error('No LLM provider configured');
    }
    
    // Add user message to state
    this.agentState.addMessage('user', userInput);
    
    // Get system prompt with current context
    const systemPrompt = await SystemPrompts.getSystemPromptWithContext();
    
    // Get full conversation history with preserved roles
    const conversationHistory = this.agentState.getMessages();
    
    // Generate complete response with full conversation context
    const response = await this.llmProvider.generateCompletion(conversationHistory, systemPrompt);
    
    // Add assistant response to state
    this.agentState.addMessage('assistant', response.content);
    
    return response.content;
  }
  
  /**
   * Abort the current streaming request and clean up messages
   * Returns the content of the user message that was aborted (for restoring to input)
   */
  abortCurrentRequest(): string | null {
    let userMessageContent = null;
    
    // Remove the current assistant message (the "in progress" one)
    if (this.currentAssistantMessageId) {
      this.agentState.removeMessage(this.currentAssistantMessageId);
      this.currentAssistantMessageId = null;
    }
    
    // Remove the current user message and get its content for restoration
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
  
  /**
   * Check if there's a current streaming request in progress
   */
  isStreamingInProgress(): boolean {
    return this.currentUserMessageId !== null && this.currentAssistantMessageId !== null;
  }
  
  /**
   * Clear the conversation history
   */
  clearConversation(): void {
    this.agentState.clearMessages();
  }
  
  /**
   * Get whether the agent is currently working on a task
   */
  getIsWorkingOnTask(): boolean {
    return this.agentState.getIsWorkingOnTask();
  }
  
  /**
   * Set whether the agent is currently working on a task
   */
  setIsWorkingOnTask(isWorking: boolean): void {
    this.agentState.setIsWorkingOnTask(isWorking);
  }
}