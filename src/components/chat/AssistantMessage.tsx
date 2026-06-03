import React, { memo, useEffect, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import rehypeKatex from 'rehype-katex';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';
import type { PerformanceInfo } from '../../agent/llm/StreamingTypes';
import { summarizeTodoCounts } from '../../agent/core/todo';
import type { TodoItem } from '../../agent/core/todo';

interface AssistantMessageProps {
  content: string;
  isStreaming?: boolean;
  onAbort?: () => void;
  performanceInfo?: PerformanceInfo;
  toolName?: string;
  toolSuccess?: boolean;
  todoSnapshot?: TodoItem[];
}

// Memoized code component to prevent SyntaxHighlighter re-renders
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const CodeComponent = memo(({ inline, className, children, ...props }: any) => {
  const match = /language-(\w+)/.exec(className || '');
  return !inline && match ? (
    <SyntaxHighlighter
      style={vscDarkPlus}
      language={match[1]}
      PreTag="div"
      {...props}
    >
      {String(children).replace(/\n$/, '')}
    </SyntaxHighlighter>
  ) : (
    <code className={className} {...props}>
      {children}
    </code>
  );
});

const formatTps = (value?: number): string | null => {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    return null;
  }

  return value.toFixed(1);
};

const THINKING_LABEL = 'Thinking...';
const PROCESSING_LABEL = 'Processing...';
const COMPACTION_IN_PROGRESS_LABEL = 'Compacting Conversation';
const COMPACTION_DONE_LABEL = 'Conversation Compacted';
const COMPACTION_EMPTY_LABEL = 'Nothing to Compact Yet';

const formatThinkingDuration = (elapsedSeconds: number): string => {
  if (elapsedSeconds < 60) {
    return `Thinking for ${elapsedSeconds}s...`;
  }

  const minutes = Math.floor(elapsedSeconds / 60);
  const seconds = elapsedSeconds % 60;
  return `Thinking for ${minutes}m ${seconds.toString().padStart(2, '0')}s...`;
};

const AssistantMessage: React.FC<AssistantMessageProps> = ({
  content,
  isStreaming,
  onAbort,
  performanceInfo,
  toolName,
  toolSuccess,
  todoSnapshot,
}) => {
  const prefillTps = formatTps(performanceInfo?.prefillTps);
  const generationTps = formatTps(performanceInfo?.generationTps);
  const hasPerformanceInfo = Boolean(prefillTps || generationTps);
  const [thinkingElapsedSeconds, setThinkingElapsedSeconds] = useState(0);
  const processingWaveLabels = [THINKING_LABEL, PROCESSING_LABEL];
  const isThinking = isStreaming && content.includes(`<span class="processing-wave">${THINKING_LABEL}</span>`);
  const isCompactionBanner = content === COMPACTION_IN_PROGRESS_LABEL
    || content === COMPACTION_DONE_LABEL
    || content === COMPACTION_EMPTY_LABEL;
  const isTodoSnapshotCard = toolName === 'update_todo_list' && Array.isArray(todoSnapshot);

  useEffect(() => {
    if (!isThinking) {
      setThinkingElapsedSeconds(0);
      return;
    }

    setThinkingElapsedSeconds(0);

    const startedAt = Date.now();
    const intervalId = window.setInterval(() => {
      const elapsedSeconds = Math.floor((Date.now() - startedAt) / 1000);
      setThinkingElapsedSeconds(elapsedSeconds);
    }, 1000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [isThinking]);

  const renderContent = () => {
    if (isTodoSnapshotCard) {
      const counts = summarizeTodoCounts(todoSnapshot);
      const activeTodo = todoSnapshot.find(todo => todo.status === 'in_progress') ?? null;

      return (
        <section className="chatbox-todo-card" aria-label="Agent task checklist snapshot">
          <div className="chatbox-todo-card-header">
            <h4>Task Checklist</h4>
            <span className="chatbox-todo-count">
              {counts.completed}/{counts.total} completed
            </span>
          </div>
          {activeTodo && (
            <div className="chatbox-todo-active">
              Working on: {activeTodo.activeText || activeTodo.text}
            </div>
          )}
          <ul className="chatbox-todo-list">
            {todoSnapshot.map((todo) => (
              <li key={todo.id} className={`chatbox-todo-item is-${todo.status}`}>
                <span className="chatbox-todo-marker" aria-hidden="true">
                  {todo.status === 'completed' ? '✓' : todo.status === 'in_progress' ? '→' : '•'}
                </span>
                <span className="chatbox-todo-text">{todo.text}</span>
              </li>
            ))}
          </ul>
        </section>
      );
    }

    if (isCompactionBanner) {
      return (
        <div className="message-divider-banner" aria-label={content}>
          <span className="message-divider-banner-line" aria-hidden="true" />
          <span className="message-divider-banner-label">{content}</span>
          <span className="message-divider-banner-line" aria-hidden="true" />
        </div>
      );
    }

    // Handle special abort link for streaming messages
    if (isStreaming && onAbort && content.includes('click here to abort')) {
      const processingWaveMarkup = processingWaveLabels
        .map(label => `<span class="processing-wave">${label}</span>`)
        .find(markup => content.includes(markup));

      if (processingWaveMarkup) {
        const parts = content.split('click here to abort');
        const beforeAbort = parts[0].replace(
          processingWaveMarkup,
          ''
        );
        const waveLabel = processingWaveMarkup.includes(THINKING_LABEL)
          ? formatThinkingDuration(thinkingElapsedSeconds)
          : processingWaveLabels.find(label => processingWaveMarkup.includes(label)) ?? THINKING_LABEL;

        return (
          <span>
            <span className="processing-wave">{waveLabel}</span>
            {beforeAbort}
            <button onClick={onAbort} className="abort-link">
              click here to abort
            </button>
            {parts[1]}
          </span>
        );
      } else {
        const parts = content.split('click here to abort');
        return (
          <span>
            {parts[0]}
            <button onClick={onAbort} className="abort-link">
              click here to abort
            </button>
            {parts[1]}
          </span>
        );
      }
    }

    return (
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkMath]}
        rehypePlugins={[rehypeKatex]}
        components={{
          code: CodeComponent,
        }}
      >
        {content}
      </ReactMarkdown>
    );
  };

  return (
    <div className="message-container message-assistant">
      <div className="message-content">
        {renderContent()}
        {hasPerformanceInfo && (
          <div className="message-performance-info">
            {prefillTps ? `Prefill: ${prefillTps} t/s` : 'Prefill: -'}
            {' · '}
            {generationTps ? `Generation: ${generationTps} t/s` : 'Generation: -'}
          </div>
        )}
      </div>
    </div>
  );
};

export default memo(AssistantMessage);
