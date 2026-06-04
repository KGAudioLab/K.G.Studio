import React, { memo, useEffect, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import rehypeKatex from 'rehype-katex';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import { FaCaretDown, FaCaretUp } from 'react-icons/fa';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';
import type { PerformanceInfo, ToolApprovalDecision } from '../../agent/llm/StreamingTypes';
import { summarizeTodoCounts } from '../../agent/core/todo';
import type { TodoItem } from '../../agent/core/todo';
import { useI18n } from '../../i18n/useI18n';

interface AssistantMessageProps {
  content: string;
  isStreaming?: boolean;
  onAbort?: () => void;
  performanceInfo?: PerformanceInfo;
  toolName?: string;
  toolSuccess?: boolean;
  toolRawResult?: string;
  toolResultDisplayContent?: string;
  toolConfirmation?: {
    toolCallId: string;
    toolName: string;
    message: string;
  };
  toolDenied?: boolean;
  onToolConfirmationDecision?: (decision: ToolApprovalDecision) => void;
  todoSnapshot?: TodoItem[];
  isToolCallMessage?: boolean;
}

const COLLAPSED_TOOL_CALL_HEIGHT_PX = 200;
const TOOL_CALL_FADE_HEIGHT_PX = 50;

interface MarkdownCodeProps {
  inline?: boolean;
  className?: string;
  children?: React.ReactNode;
}

const ToolCallCodeBlock = memo(({
  className,
  children,
}: Omit<MarkdownCodeProps, 'inline'>) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [isExpandable, setIsExpandable] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const [expandedHeight, setExpandedHeight] = useState(COLLAPSED_TOOL_CALL_HEIGHT_PX);
  const match = /language-(\w+)/.exec(className || '');
  const codeText = String(children).replace(/\n$/, '');

  useEffect(() => {
    const container = containerRef.current;
    if (!container) {
      return;
    }

    const measuredHeight = container.scrollHeight;
    setExpandedHeight(measuredHeight);
    setIsExpandable(measuredHeight > COLLAPSED_TOOL_CALL_HEIGHT_PX);
  }, [codeText]);

  const handleToggleExpanded = () => {
    const scrollContainer = containerRef.current?.closest('.chatbox-messages') as HTMLDivElement | null;
    const previousScrollTop = scrollContainer?.scrollTop ?? null;

    setIsExpanded((current) => !current);

    window.requestAnimationFrame(() => {
      if (scrollContainer && previousScrollTop !== null) {
        scrollContainer.scrollTop = previousScrollTop;
      }
    });
  };

  const maxHeight = isExpanded ? `${expandedHeight}px` : `${COLLAPSED_TOOL_CALL_HEIGHT_PX}px`;

  return (
    <div
      className={`tool-call-code-block${isExpandable ? ' is-expandable' : ''}${isExpanded ? ' is-expanded' : ''}`}
      data-testid="tool-call-code-block"
    >
      <div
        ref={containerRef}
        className="tool-call-code-block-inner"
        style={{ maxHeight }}
      >
        <SyntaxHighlighter
          style={vscDarkPlus}
          language={match?.[1]}
          PreTag="div"
        >
          {codeText}
        </SyntaxHighlighter>
      </div>
      {isExpandable && (
        <button
          type="button"
          className="tool-call-code-block-toggle"
          onClick={handleToggleExpanded}
        >
          <span
            className="tool-call-code-block-fade"
            aria-hidden="true"
            style={{ height: `${TOOL_CALL_FADE_HEIGHT_PX}px` }}
          />
          <span className="tool-call-code-block-toggle-content">
            {isExpanded ? <FaCaretUp aria-hidden="true" /> : <FaCaretDown aria-hidden="true" />}
            <span>{isExpanded ? 'Click to collapse' : 'Click to expand'}</span>
            {isExpanded ? <FaCaretUp aria-hidden="true" /> : <FaCaretDown aria-hidden="true" />}
          </span>
        </button>
      )}
    </div>
  );
});

// Memoized code component to prevent SyntaxHighlighter re-renders
const CodeComponent = memo(({ inline, className, children, isToolCallMessage, ...props }: MarkdownCodeProps & { isToolCallMessage: boolean }) => {
  const match = /language-(\w+)/.exec(className || '');
  if (!inline && match && isToolCallMessage) {
    return (
      <ToolCallCodeBlock className={className}>
        {children}
      </ToolCallCodeBlock>
    );
  }

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
  toolRawResult,
  toolResultDisplayContent,
  toolConfirmation,
  onToolConfirmationDecision,
  todoSnapshot,
  isToolCallMessage = false,
}) => {
  const { t } = useI18n();
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
  const isToolConfirmationCard = Boolean(toolConfirmation) && Boolean(onToolConfirmationDecision);
  const shouldRenderGenericToolResult = Boolean(toolName) && typeof toolSuccess === 'boolean' && !isTodoSnapshotCard;
  const genericToolDisplayContent = toolResultDisplayContent ?? toolRawResult ?? content;

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
        <section className="chatbox-todo-card" aria-label={t('chatbox.todo.ariaLabel')}>
          <div className="chatbox-todo-card-header">
            <h4>{t('chatbox.todo.title')}</h4>
            <span className="chatbox-todo-count">
              {t('chatbox.todo.count', { completed: counts.completed, total: counts.total })}
            </span>
          </div>
          {activeTodo && (
            <div className="chatbox-todo-active">
              {t('chatbox.todo.active', { task: activeTodo.activeText || activeTodo.text })}
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

    if (isToolConfirmationCard && toolConfirmation && onToolConfirmationDecision) {
      return (
        <div className="message-tool-result">
          <p className="message-tool-result-title">
            <span aria-hidden="true">?</span>{' '}
            <strong>{toolConfirmation.toolName}</strong>
          </p>
          <div className="message-tool-summary">
            <span className="message-tool-summary-prefix" aria-hidden="true">└── </span>
            <div className="message-tool-summary-content">
              <ReactMarkdown
                remarkPlugins={[remarkGfm, remarkMath]}
                rehypePlugins={[rehypeKatex]}
                components={{
                  code: (props) => <CodeComponent {...props} isToolCallMessage={false} />,
                }}
              >
                {toolConfirmation.message}
              </ReactMarkdown>
            </div>
          </div>
          <div className="message-tool-confirmation-actions" aria-label={t('chatbox.tool.confirmation.ariaLabel')}>
            <button
              type="button"
              className="message-tool-confirmation-btn dialog-btn dialog-btn-primary kgone-btn-generate"
              onClick={() => onToolConfirmationDecision('allow')}
            >
              {t('chatbox.tool.confirmation.allow')}
            </button>
            <button
              type="button"
              className="message-tool-confirmation-btn message-tool-confirmation-btn-always dialog-btn dialog-btn-primary kgone-btn-generate"
              onClick={() => onToolConfirmationDecision('always_allow')}
            >
              {t('chatbox.tool.confirmation.alwaysAllow')}
            </button>
            <button
              type="button"
              className="message-tool-confirmation-btn message-tool-confirmation-btn-deny dialog-btn dialog-btn-primary kgone-btn-generate"
              onClick={() => onToolConfirmationDecision('deny')}
            >
              {t('chatbox.tool.confirmation.deny')}
            </button>
          </div>
        </div>
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

    if (shouldRenderGenericToolResult && toolName) {
      return (
        <div className="message-tool-result">
          <p className="message-tool-result-title">
            <span aria-hidden="true">{toolSuccess ? '✅' : '❌'}</span>{' '}
            <strong>{toolName}</strong>
          </p>
          <div className="message-tool-summary">
            <span className="message-tool-summary-prefix" aria-hidden="true">└── </span>
            <div className="message-tool-summary-content">
              <ReactMarkdown
                remarkPlugins={[remarkGfm, remarkMath]}
                rehypePlugins={[rehypeKatex]}
                components={{
                  code: (props) => <CodeComponent {...props} isToolCallMessage={false} />,
                }}
              >
                {genericToolDisplayContent}
              </ReactMarkdown>
            </div>
          </div>
        </div>
      );
    }

    return (
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkMath]}
        rehypePlugins={[rehypeKatex]}
        components={{
          code: (props) => <CodeComponent {...props} isToolCallMessage={isToolCallMessage} />,
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
