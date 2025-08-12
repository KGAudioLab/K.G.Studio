import { AgentCore } from '../agent/core/AgentCore';

/**
 * Clear chat history and reset chat state
 * This utility can be used from various parts of the application
 * to ensure consistent chat clearing behavior
 */
export const clearChatHistory = () => {
  // Clear agent state
  const agentCore = AgentCore.instance();
  agentCore.clearConversation();
  
  console.log('Chat history cleared programmatically');
};

/**
 * Clear chat history with status message feedback
 */
export const clearChatHistoryWithStatus = (setStatus?: (message: string) => void) => {
  clearChatHistory();
  
  if (setStatus) {
    setStatus('Chat history cleared');
  }
};

// Global callback for clearing UI state
let globalClearChatUI: (() => void) | null = null;

/**
 * Register a callback to clear chat UI state
 * This allows external components to clear the ChatBox UI
 */
export const registerClearChatUICallback = (callback: () => void) => {
  globalClearChatUI = callback;
};

/**
 * Clear both chat history and UI state
 * This is the main function that should be called when starting new/loading projects
 */
export const clearChatHistoryAndUI = (setStatus?: (statusMessage: string) => void) => {
  // Clear the data model
  clearChatHistory();
  
  // Clear the UI state if callback is registered
  if (globalClearChatUI) {
    globalClearChatUI();
  }
  
  // Set status message
  if (setStatus) {
    setStatus('Chat history cleared');
  }
};