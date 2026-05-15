import React, { memo, useEffect, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import rehypeKatex from 'rehype-katex';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';
import type { PerformanceInfo } from '../../agent/llm/StreamingTypes';

interface AssistantMessageProps {
  content: string;
  isStreaming?: boolean;
  onAbort?: () => void;
  performanceInfo?: PerformanceInfo;
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

const formatThinkingDuration = (elapsedSeconds: number): string => {
  if (elapsedSeconds < 60) {
    return `Thinking for ${elapsedSeconds}s...`;
  }

  const minutes = Math.floor(elapsedSeconds / 60);
  const seconds = elapsedSeconds % 60;
  return `Thinking for ${minutes}m ${seconds.toString().padStart(2, '0')}s...`;
};

const AssistantMessage: React.FC<AssistantMessageProps> = ({ content, isStreaming, onAbort, performanceInfo }) => {
  const prefillTps = formatTps(performanceInfo?.prefillTps);
  const generationTps = formatTps(performanceInfo?.generationTps);
  const hasPerformanceInfo = Boolean(prefillTps || generationTps);
  const [thinkingElapsedSeconds, setThinkingElapsedSeconds] = useState(0);
  const processingWaveLabels = [THINKING_LABEL, PROCESSING_LABEL];
  const isThinking = isStreaming && content.includes(`<span class="processing-wave">${THINKING_LABEL}</span>`);

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
