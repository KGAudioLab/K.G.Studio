import React, { memo } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';

interface AssistantMessageProps {
  content: string;
  isStreaming?: boolean;
  onAbort?: () => void;
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

const AssistantMessage: React.FC<AssistantMessageProps> = ({ content, isStreaming, onAbort }) => {
  const renderContent = () => {
    // Handle special abort link for streaming messages
    if (isStreaming && onAbort && content.includes('click here to abort')) {
      const hasProcessingWave = content.includes('<span class="processing-wave">Processing...</span>');

      if (hasProcessingWave) {
        const parts = content.split('click here to abort');
        const beforeAbort = parts[0].replace(
          '<span class="processing-wave">Processing...</span>',
          ''
        );

        return (
          <span>
            <span className="processing-wave">Processing...</span>
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
      </div>
    </div>
  );
};

export default memo(AssistantMessage);
