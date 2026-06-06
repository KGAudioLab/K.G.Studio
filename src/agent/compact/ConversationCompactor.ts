import type { Message } from '../core/AgentState';
import type { LLMProvider } from '../llm/LLMProvider';
import type { OpenAIToolDefinition } from '../tools/BaseTool';

export interface CompactProgress {
  chunkIndex: number;
  chunkCount: number;
  receivedTokenCount: number;
}

export interface ConversationCompactorOptions {
  provider: LLMProvider;
  systemPrompt: string;
  tools?: OpenAIToolDefinition[];
  focus?: string;
  onProgress?: (progress: CompactProgress) => void;
  supplementalContext?: string;
}

export interface ConversationCompactionResult {
  changed: boolean;
  compactedConversation: string;
  summary: string;
  tailStartIndex: number;
}

const CHUNK_CHARACTER_BUDGET = 24_000;

function formatMessage(message: Message): string {
  const parts = [`[${message.role.toUpperCase()}]`];
  if (message.is_compacted_summary) {
    parts.push('[COMPACTED_SUMMARY]');
  }

  if (message.content) {
    parts.push(message.content);
  }

  if (message.tool_calls?.length) {
    for (const toolCall of message.tool_calls) {
      parts.push(
        `TOOL_CALL ${toolCall.function.name}: ${toolCall.function.arguments}`,
      );
    }
  }

  if (message.tool_call_id) {
    parts.push(`TOOL_RESULT_FOR ${message.tool_call_id}`);
  }

  return parts.join('\n');
}

function splitIntoChunks(serializedMessages: string[]): string[] {
  const chunks: string[] = [];
  let currentChunk = '';

  for (const serialized of serializedMessages) {
    if (!currentChunk) {
      currentChunk = serialized;
      continue;
    }

    if ((currentChunk.length + serialized.length + 2) > CHUNK_CHARACTER_BUDGET) {
      chunks.push(currentChunk);
      currentChunk = serialized;
      continue;
    }

    currentChunk += `\n\n${serialized}`;
  }

  if (currentChunk) {
    chunks.push(currentChunk);
  }

  return chunks;
}

function buildCompactionUserPrompt(
  chunkText: string,
  chunkIndex: number,
  chunkCount: number,
  focus?: string,
  supplementalContext?: string,
): string {
  const focusSection = focus?.trim()
    ? `Focus instruction from the user: ${focus.trim()}\n\n`
    : '';
  const contextSection = supplementalContext?.trim()
    ? `${supplementalContext.trim()}\n\n`
    : '';

  return `${focusSection}${contextSection}Summarize this conversation history chunk for future continuation.

Preserve:
- the active goal
- accepted constraints and decisions
- important tool results and errors
- relevant project, track, region, and music context
- unfinished work and next steps

Do not quote the full transcript. Produce a concise but durable handoff summary.

Chunk ${chunkIndex + 1} of ${chunkCount}:

${chunkText}`;
}

export class ConversationCompactor {
  private readonly provider: LLMProvider;
  private readonly systemPrompt: string;
  private readonly tools: OpenAIToolDefinition[];
  private readonly focus?: string;
  private readonly onProgress?: (progress: CompactProgress) => void;
  private readonly supplementalContext?: string;

  constructor(options: ConversationCompactorOptions) {
    this.provider = options.provider;
    this.systemPrompt = options.systemPrompt;
    this.tools = options.tools ?? [];
    this.focus = options.focus;
    this.onProgress = options.onProgress;
    this.supplementalContext = options.supplementalContext;
  }

  async compact(messages: Message[], tailStartIndex: number): Promise<ConversationCompactionResult> {
    if (tailStartIndex <= 0 || tailStartIndex >= messages.length) {
      return {
        changed: false,
        compactedConversation: this.renderConversation(messages),
        summary: '',
        tailStartIndex,
      };
    }

    const prefix = messages.slice(0, tailStartIndex);
    const serializedMessages = prefix.map(formatMessage);
    const chunks = splitIntoChunks(serializedMessages);

    if (chunks.length === 0) {
      return {
        changed: false,
        compactedConversation: this.renderConversation(messages),
        summary: '',
        tailStartIndex,
      };
    }

    let summaries = await Promise.all(
      chunks.map((chunk, index) => this.summarizeChunk(chunk, index, chunks.length)),
    );

    while (summaries.length > 1) {
      const mergedChunks = splitIntoChunks(summaries.map((summary, index) => `SUMMARY ${index + 1}\n${summary}`));
      summaries = await Promise.all(
        mergedChunks.map((chunk, index) => this.summarizeChunk(chunk, index, mergedChunks.length)),
      );
    }

    const summary = `Compacted conversation summary:\n${summaries[0].trim()}`;
    const compactedConversation = this.renderConversation([
      {
        ...messages[0],
        id: 'compacted-summary-preview',
        role: 'assistant',
        content: summary,
        is_compacted_summary: true,
        compact_trigger: 'manual',
        tool_calls: undefined,
        tool_call_id: undefined,
      },
      ...messages.slice(tailStartIndex),
    ]);

    return {
      changed: true,
      compactedConversation,
      summary,
      tailStartIndex,
    };
  }

  renderConversation(messages: Message[]): string {
    return messages.map(formatMessage).join('\n\n');
  }

  private async summarizeChunk(chunkText: string, chunkIndex: number, chunkCount: number): Promise<string> {
    const prompt = buildCompactionUserPrompt(
      chunkText,
      chunkIndex,
      chunkCount,
      this.focus,
      this.supplementalContext,
    );
    const messages: Message[] = [
      {
        id: `compact_user_${chunkIndex}`,
        role: 'user',
        content: prompt,
        timestamp: Date.now(),
      },
    ];

    let receivedTokenCount = 0;
    let summary = '';

    for await (const chunk of this.provider.generateStream(messages, this.systemPrompt, [])) {
      if (chunk.type === 'text') {
        summary += chunk.content;
        receivedTokenCount += 1;
        this.onProgress?.({
          chunkIndex,
          chunkCount,
          receivedTokenCount,
        });
      }
    }

    return summary.trim();
  }
}
