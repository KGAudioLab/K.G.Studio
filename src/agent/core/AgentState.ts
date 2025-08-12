/**
 * Manages the state of an agent conversation
 */

export interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
}

export class AgentState {
  private messages: Message[] = [];
  private conversationId: string;
  private isWorkingOnTask: boolean = false;
  
  constructor(conversationId?: string, isWorkingOnTask: boolean = false) {
    this.conversationId = conversationId || this.generateConversationId();
    this.isWorkingOnTask = isWorkingOnTask;
  }
  
  /**
   * Add a message to the conversation
   */
  addMessage(role: 'user' | 'assistant', content: string): string {
    const message: Message = {
      id: this.generateMessageId(),
      role,
      content,
      timestamp: Date.now()
    };
    
    this.messages.push(message);
    return message.id;
  }
  
  /**
   * Update the content of a message by ID
   */
  updateMessage(messageId: string, content: string): boolean {
    const messageIndex = this.messages.findIndex(msg => msg.id === messageId);
    if (messageIndex !== -1) {
      this.messages[messageIndex].content = content;
      return true;
    }
    return false;
  }
  
  /**
   * Remove a message by ID
   */
  removeMessage(messageId: string): boolean {
    const messageIndex = this.messages.findIndex(msg => msg.id === messageId);
    if (messageIndex !== -1) {
      this.messages.splice(messageIndex, 1);
      return true;
    }
    return false;
  }
  
  /**
   * Remove the last N messages
   */
  removeLastMessages(count: number): void {
    this.messages.splice(-count, count);
  }
  
  /**
   * Get all messages in the conversation
   */
  getMessages(): Message[] {
    return [...this.messages];
  }
  
  /**
   * Get the conversation ID
   */
  getConversationId(): string {
    return this.conversationId;
  }
  
  /**
   * Clear all messages
   */
  clearMessages(): void {
    this.messages = [];
  }
  
  /**
   * Get the last N messages
   */
  getRecentMessages(count: number): Message[] {
    return this.messages.slice(-count);
  }
  
  private generateConversationId(): string {
    return `conv_${Date.now()}_${Math.random().toString(36).substring(2, 15)}`;
  }
  
  private generateMessageId(): string {
    return `msg_${Date.now()}_${Math.random().toString(36).substring(2, 15)}`;
  }

  // getters and setters
  getIsWorkingOnTask(): boolean {
    return this.isWorkingOnTask;
  }

  setIsWorkingOnTask(isWorkingOnTask: boolean): void {
    this.isWorkingOnTask = isWorkingOnTask;
  }
}