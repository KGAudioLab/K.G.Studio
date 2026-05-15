import React, { memo } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
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

const AssistantMessage: React.FC<AssistantMessageProps> = ({ content, isStreaming, onAbort, performanceInfo }) => {
  const prefillTps = formatTps(performanceInfo?.prefillTps);
  const generationTps = formatTps(performanceInfo?.generationTps);
  const hasPerformanceInfo = Boolean(prefillTps || generationTps);
  const processingWaveLabels = ['Thinking...', 'Processing...'];

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
        const waveLabel = processingWaveLabels.find(label => processingWaveMarkup.includes(label)) ?? 'Thinking...';

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
        remarkPlugins={[remarkGfm]}
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
