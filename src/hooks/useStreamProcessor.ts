import { useState, useCallback } from 'react';
import { AgentCore } from '../agent/core/AgentCore';
import { KGCore } from '../core/KGCore';
import { KGMidiRegion } from '../core/region/KGMidiRegion';
import { createStreamingMessage, createMessage } from '../utils/chatMessageUtils';
import { useProjectStore } from '../stores/projectStore';
import type { ChatMessage } from '../types/projectTypes';

const TODO_TOOL_NAME = 'update_todo_list';
const ADD_NOTES_TOOL_NAME = 'add_notes';

interface PendingToolCall {
  name: string;
  arguments: Record<string, unknown> | null;
}

interface AddNotesToolArguments {
  notes: Array<{
    pitch: string;
    start: number;
    length: number;
    velocity?: number;
  }>;
  region_id?: string;
}

const getBarNumberFromStartBeat = (beat: number, beatsPerBar: number): number => (
  Math.floor(beat / beatsPerBar) + 1
);

const getBarNumberFromEndBeat = (beat: number, beatsPerBar: number): number => (
  Math.max(1, Math.ceil(beat / beatsPerBar))
);

interface AddNotesSummaryData {
  noteCount: number;
  regionName: string;
  trackName: string;
  earliestNoteStartBar: number;
  latestNoteEndBar: number;
}

const resolveTargetMidiRegion = (
  regionId: string | undefined,
  storeState: ReturnType<typeof useProjectStore.getState>,
): { region: KGMidiRegion; trackName: string } | undefined => {
  const project = KGCore.instance().getCurrentProject();
  const tracks = project.getTracks();

  const findById = (candidateRegionId: string): { region: KGMidiRegion; trackName: string } | undefined => {
    for (const track of tracks) {
      const region = track.getRegions().find(candidate => candidate.getId() === candidateRegionId);
      if (region instanceof KGMidiRegion) {
        return {
          region,
          trackName: track.getName(),
        };
      }
    }

    return undefined;
  };

  if (regionId) {
    return findById(regionId);
  }

  if (storeState.activeRegionId) {
    const activeRegion = findById(storeState.activeRegionId);
    if (activeRegion) {
      return activeRegion;
    }
  }

  const selectedRegionId = storeState.selectedRegionIds.at(-1);
  if (selectedRegionId) {
    const selectedRegion = findById(selectedRegionId);
    if (selectedRegion) {
      return selectedRegion;
    }
  }

  const selectedItems = KGCore.instance().getSelectedItems();
  for (const item of selectedItems) {
    if (item instanceof KGMidiRegion) {
      const track = tracks.find(candidate => candidate.getId() === item.getTrackId());
      return {
        region: item,
        trackName: track?.getName() ?? `Track ${item.getTrackIndex() + 1}`,
      };
    }
  }

  return undefined;
};

const buildAddNotesSummary = (args: Record<string, unknown> | null): AddNotesSummaryData | undefined => {
  if (!args) {
    return undefined;
  }

  const typedArgs = args as AddNotesToolArguments;
  if (!Array.isArray(typedArgs.notes) || typedArgs.notes.length === 0) {
    return undefined;
  }

  const storeState = useProjectStore.getState();
  const project = KGCore.instance().getCurrentProject();
  const beatsPerBar = project.getTimeSignature().numerator ?? storeState.timeSignature.numerator;
  const targetRegion = resolveTargetMidiRegion(typedArgs.region_id, storeState);
  if (!targetRegion) {
    return undefined;
  }

  const earliestNoteStartBeat = Math.min(...typedArgs.notes.map(note => note.start));
  const latestNoteEndBeat = Math.max(...typedArgs.notes.map(note => note.start + note.length));

  return {
    noteCount: typedArgs.notes.length,
    regionName: targetRegion.region.getName(),
    trackName: targetRegion.trackName,
    earliestNoteStartBar: getBarNumberFromStartBeat(earliestNoteStartBeat, beatsPerBar),
    latestNoteEndBar: getBarNumberFromEndBeat(latestNoteEndBeat, beatsPerBar),
  };
};

const buildToolResultDisplayContent = (
  toolName: string,
  success: boolean,
  rawResult: string,
  toolArgs: Record<string, unknown> | null,
): string => {
  if (!success) {
    return rawResult;
  }

  if (toolName === ADD_NOTES_TOOL_NAME) {
    const summary = buildAddNotesSummary(toolArgs);
    if (summary) {
      return `Successfully created ${summary.noteCount} ${summary.noteCount === 1 ? 'note' : 'notes'} in region **${summary.regionName}** on track **${summary.trackName}**, spanning bars ${summary.earliestNoteStartBar} to ${summary.latestNoteEndBar}.`;
    }
  }

  return rawResult;
};

interface StreamProcessorOptions {
  onMessageUpdate: (messageId: string, updater: (msg: ChatMessage) => ChatMessage) => void;
  onMessageAdd: (message: ChatMessage) => void;
  onMessageRemove: (messageId: string) => void;
  onProcessingChange: (isProcessing: boolean) => void;
}

interface StreamProcessorResult {
  processStream: (input: string, logPrefix?: string) => Promise<string>;
  abortController: AbortController | null;
  isProcessing: boolean;
}

const PROCESSING_WAVE = '<span class="processing-wave">Processing...</span>';

export const useStreamProcessor = (options: StreamProcessorOptions): StreamProcessorResult => {
  const { onMessageUpdate, onMessageAdd, onMessageRemove, onProcessingChange } = options;
  const [abortController, setAbortController] = useState<AbortController | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);

  const processStream = useCallback(async (input: string, logPrefix: string = 'USER'): Promise<string> => {
    setIsProcessing(true);
    onProcessingChange(true);

    const controller = new AbortController();
    setAbortController(controller);

    // Track the current streaming message ID (mutable)
    const initialStreamingMsg = createStreamingMessage();
    let currentStreamingId = initialStreamingMsg.id;
    const pendingToolCalls: PendingToolCall[] = [];
    onMessageAdd(initialStreamingMsg);

    try {
      const agentCore = AgentCore.instance();
      let assistantResponse = '';
      let tokenCount = 0;
      let hasTextContent = false;
      let performanceInfo: ChatMessage['performanceInfo'];

      console.log(`------------ ${logPrefix} ------------`);
      console.log(input);
      console.log('------------------------------');

      for await (const chunk of agentCore.processUserInput(input)) {
        if (controller.signal.aborted) {
          return '';
        }

        if (chunk.type === 'text') {
          assistantResponse += chunk.content;
          tokenCount++;
          hasTextContent = true;

          onMessageUpdate(currentStreamingId, (msg) => ({
            ...msg,
            content: `${PROCESSING_WAVE}${tokenCount > 0 ? ` ${tokenCount} tokens received.` : ''} click here to abort.`,
            tokenCount
          }));
        } else if (chunk.type === 'tool_call' && chunk.toolCall) {
          // Finalize or remove the current streaming message
          if (hasTextContent) {
            onMessageUpdate(currentStreamingId, (msg) => ({
              ...msg,
              content: assistantResponse,
              isStreaming: false,
              tokenCount: undefined,
              performanceInfo
            }));

            console.log('------------ ASSISTANT ------------');
            console.log(assistantResponse);
            console.log('-----------------------------------');
          } else {
            // No text before this tool call — remove the empty streaming placeholder
            onMessageRemove(currentStreamingId);
          }

          // Show tool call in UI
          const toolName = chunk.toolCall.function.name;
          if (toolName === TODO_TOOL_NAME) {
            continue;
          }
          let argsDisplay = '';
          try {
            const args = JSON.parse(chunk.toolCall.function.arguments);
            argsDisplay = JSON.stringify(args, null, 2);
            pendingToolCalls.push({ name: toolName, arguments: args });
          } catch {
            argsDisplay = chunk.toolCall.function.arguments;
            pendingToolCalls.push({ name: toolName, arguments: null });
          }
          const toolCallMsg = {
            ...createMessage('assistant', `🔧 **Calling tool: ${toolName}**\n\n\`\`\`json\n${argsDisplay}\n\`\`\``),
            isToolCallMessage: true,
          };
          onMessageAdd(toolCallMsg);
        } else if (chunk.type === 'tool_result' && chunk.toolResult) {
          // Show tool result in UI
          const { name, success, result } = chunk.toolResult;
          const pendingToolCallIndex = pendingToolCalls.findIndex(toolCall => toolCall.name === name);
          const pendingToolCall = pendingToolCallIndex >= 0
            ? pendingToolCalls.splice(pendingToolCallIndex, 1)[0]
            : undefined;
          const toolResultDisplayContent = buildToolResultDisplayContent(
            name,
            success,
            result,
            pendingToolCall?.arguments ?? null,
          );
          const toolResultMsg = name === TODO_TOOL_NAME
            ? {
              ...createMessage('assistant', result),
              toolName: name,
              toolSuccess: success,
              todoSnapshot: AgentCore.instance().getAgentState().getTodos().map(todo => ({ ...todo })),
            }
            : {
              ...createMessage('assistant', `${success ? '✅' : '❌'} **${name}**\n\n └── ${result}`),
              toolName: name,
              toolSuccess: success,
              toolRawResult: result,
              toolResultDisplayContent,
            };
          onMessageAdd(toolResultMsg);

          // Reset for the next LLM turn in the agentic loop
          assistantResponse = '';
          tokenCount = 0;
          hasTextContent = false;
          performanceInfo = undefined;

          // Create a fresh streaming placeholder for the next LLM response
          const nextMsg = createStreamingMessage();
          currentStreamingId = nextMsg.id;
          onMessageAdd(nextMsg);
        } else if (chunk.type === 'done') {
          performanceInfo = chunk.performanceInfo;
          // Finalize the streaming message
          if (hasTextContent) {
            onMessageUpdate(currentStreamingId, (msg) => ({
              ...msg,
              content: assistantResponse,
              isStreaming: false,
              tokenCount: undefined,
              performanceInfo
            }));
          } else {
            // No text in final response — remove empty placeholder
            onMessageRemove(currentStreamingId);
          }

          console.log('------------ ASSISTANT ------------');
          console.log(assistantResponse);
          console.log('-----------------------------------');
          break;
        }
      }

      return assistantResponse;
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        return '';
      }

      console.error('Error processing stream:', error);
      onMessageUpdate(currentStreamingId, (msg) => ({
        ...msg,
        content: `Error: ${error instanceof Error ? error.message : 'Failed to process message'}`,
        isStreaming: false,
        tokenCount: undefined
      }));
      throw error;
    } finally {
      setAbortController(null);
      setIsProcessing(false);
      onProcessingChange(false);
    }
  }, [onMessageUpdate, onMessageAdd, onMessageRemove, onProcessingChange]);

  return {
    processStream,
    abortController,
    isProcessing
  };
};
