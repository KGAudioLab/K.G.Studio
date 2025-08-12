import React, { memo, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { extractXMLFromString } from '../../util/xmlUtil';

interface ToolXMLExpanderProps {
  toolName: string;
  xmlContent: string;
}

const ToolXMLExpander: React.FC<ToolXMLExpanderProps> = ({ toolName, xmlContent }) => {
  const [isExpanded, setIsExpanded] = useState(false);

  return (
    <div className="tool-xml-expander">
      <div 
        className="tool-xml-expander-header"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <span className="tool-xml-expander-arrow">
          {isExpanded ? '▼' : '▶'}
        </span>
        <span className="tool-xml-expander-title">
          🔧 Tool: {toolName}
        </span>
      </div>
      {isExpanded && (
        <div className="tool-xml-expander-content">
          {xmlContent}
        </div>
      )}
    </div>
  );
};

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
  // Function to process content and replace XML blocks with expanders
  const processContentWithXMLExpanders = (text: string) => {
    const xmlBlocks = extractXMLFromString(text);
    
    if (xmlBlocks.length === 0) {
      // No XML blocks found, return content as-is
      return text;
    }

    let processedContent = text;
    const expanders: React.ReactElement[] = [];
    let expanderIndex = 0;

    // Replace each XML block with a placeholder
    xmlBlocks.forEach((xmlBlock) => {
      const toolNameMatch = xmlBlock.match(/<([a-zA-Z_][a-zA-Z0-9_-]*)/);
      const toolName = toolNameMatch ? toolNameMatch[1] : 'unknown_tool';
      
      const placeholder = `__XML_EXPANDER_${expanderIndex}__`;
      processedContent = processedContent.replace(xmlBlock, placeholder);
      
      expanders[expanderIndex] = (
        <ToolXMLExpander 
          key={`xml-expander-${expanderIndex}`}
          toolName={toolName} 
          xmlContent={xmlBlock} 
        />
      );
      
      expanderIndex++;
    });

    // Split content by placeholders and interleave with expanders
    const parts = processedContent.split(/__XML_EXPANDER_\d+__/);
    const result: (string | React.ReactElement)[] = [];
    
    for (let i = 0; i < parts.length; i++) {
      if (parts[i]) {
        result.push(parts[i]);
      }
      if (i < expanders.length) {
        result.push(expanders[i]);
      }
    }

    return result;
  };

  // Handle special abort link for streaming messages
  const renderContent = () => {
    if (isStreaming && onAbort && content.includes('click here to abort')) {
      const parts = content.split('click here to abort');
      return (
        <span>
          {parts[0]}
          <button 
            onClick={onAbort}
            className="abort-link"
          >
            click here to abort
          </button>
          {parts[1]}
        </span>
      );
    }

    const processedContent = processContentWithXMLExpanders(content);
    
    // If we have mixed content (text + React elements), render them separately
    if (Array.isArray(processedContent)) {
      return (
        <div>
          {processedContent.map((item, index) => {
            if (typeof item === 'string') {
              return (
                <ReactMarkdown
                  key={`text-${index}`}
                  remarkPlugins={[remarkGfm]}
                  components={{
                    code: CodeComponent,
                  }}
                >
                  {item}
                </ReactMarkdown>
              );
            } else {
              return item; // React element (expander)
            }
          })}
        </div>
      );
    }

    // Plain text content, render with markdown
    return (
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          code: CodeComponent,
        }}
      >
        {processedContent as string}
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