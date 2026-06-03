import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import AssistantMessage from './AssistantMessage';
import type { TodoItem } from '../../agent/core/todo';

describe('AssistantMessage', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it.each([
    '<span class="processing-wave">Thinking...</span> click here to abort.',
    '<span class="processing-wave">Processing...</span> 3 tokens received. click here to abort.'
  ])('renders the abort action for streaming status content: %s', (content) => {
    const onAbort = vi.fn();

    render(
      <AssistantMessage
        content={content}
        isStreaming
        onAbort={onAbort}
      />
    );

    const abortButton = screen.getByRole('button', { name: 'click here to abort' });
    expect(abortButton).toBeInTheDocument();
    fireEvent.click(abortButton);
    expect(onAbort).toHaveBeenCalledTimes(1);
  });

  it('shows and updates the thinking timer while waiting for tokens', () => {
    vi.useFakeTimers();

    render(
      <AssistantMessage
        content={'<span class="processing-wave">Thinking...</span> click here to abort.'}
        isStreaming
        onAbort={vi.fn()}
      />
    );

    expect(screen.getByText('Thinking for 0s...')).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(12_000);
    });

    expect(screen.getByText('Thinking for 12s...')).toBeInTheDocument();
  });

  it('shows minute formatting after one minute of thinking', () => {
    vi.useFakeTimers();

    render(
      <AssistantMessage
        content={'<span class="processing-wave">Thinking...</span> click here to abort.'}
        isStreaming
        onAbort={vi.fn()}
      />
    );

    act(() => {
      vi.advanceTimersByTime(65_000);
    });

    expect(screen.getByText('Thinking for 1m 05s...')).toBeInTheDocument();
  });

  it('renders inline LaTeX with KaTeX markup', () => {
    const { container } = render(
      <AssistantMessage content={'C Major (I) $\\rightarrow$ C4, E4, G4'} />
    );

    expect(container.querySelector('.katex')).toBeInTheDocument();
    expect(container.querySelector('.katex-mathml')).toBeInTheDocument();
    expect(screen.queryByText('$\\rightarrow$')).not.toBeInTheDocument();
  });

  it('renders block LaTeX as display math', () => {
    const { container } = render(
      <AssistantMessage content={'$$\n\\frac{1}{2}mv^2\n$$'} />
    );

    expect(container.querySelector('.katex-display')).toBeInTheDocument();
  });

  it('renders markdown code blocks alongside LaTeX', () => {
    const { container } = render(
      <AssistantMessage content={'Inline math $x^2$ and code:\n```ts\nconst value = 1;\n```'} />
    );

    expect(container.querySelector('.katex')).toBeInTheDocument();
    const codeElement = container.querySelector('code.language-ts');
    expect(codeElement).toBeInTheDocument();
    expect(codeElement).toHaveTextContent('const value = 1;');
  });

  it('keeps non-tool-call code blocks rendered without the expander', () => {
    const { container } = render(
      <AssistantMessage content={'```json\n{"foo": 1}\n```'} />
    );

    expect(container.querySelector('[data-testid="tool-call-code-block"]')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Click to expand' })).not.toBeInTheDocument();
  });

  it('collapses long tool-call code blocks and expands them in place', () => {
    vi.spyOn(HTMLElement.prototype, 'scrollHeight', 'get').mockReturnValue(280);
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      callback(0);
      return 0;
    });

    const { container } = render(
      <div className="chatbox-messages">
        <AssistantMessage
          content={'🔧 **Calling tool: add_notes**\n\n```json\n{\n  "notes": []\n}\n```'}
          isToolCallMessage={true}
        />
      </div>
    );

    const toolCallBlock = screen.getByTestId('tool-call-code-block');
    const toolCallInner = container.querySelector('.tool-call-code-block-inner') as HTMLDivElement;

    expect(toolCallBlock).toBeInTheDocument();
    expect(toolCallInner.style.maxHeight).toBe('200px');
    expect(screen.getByRole('button', { name: 'Click to expand' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Click to expand' }));

    expect(screen.getByRole('button', { name: 'Click to collapse' })).toBeInTheDocument();
    expect(toolCallInner.style.maxHeight).toBe('280px');
  });

  it('preserves chat scroll position when expanding a tool-call block', () => {
    vi.spyOn(HTMLElement.prototype, 'scrollHeight', 'get').mockReturnValue(320);
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      callback(0);
      return 0;
    });

    render(
      <div className="chatbox-messages">
        <AssistantMessage
          content={'🔧 **Calling tool: add_notes**\n\n```json\n{\n  "notes": []\n}\n```'}
          isToolCallMessage={true}
        />
      </div>
    );

    const scrollContainer = document.querySelector('.chatbox-messages') as HTMLDivElement;
    scrollContainer.scrollTop = 96;

    fireEvent.click(screen.getByRole('button', { name: 'Click to expand' }));

    expect(scrollContainer.scrollTop).toBe(96);
  });

  it('renders compacting and compacted messages as divider banners', () => {
    const { rerender, container } = render(
      <AssistantMessage content="Compacting Conversation" />
    );

    expect(container.querySelector('.message-divider-banner')).toBeInTheDocument();
    expect(screen.getByLabelText('Compacting Conversation')).toBeInTheDocument();

    rerender(<AssistantMessage content="Conversation Compacted" />);

    expect(screen.getByLabelText('Conversation Compacted')).toBeInTheDocument();

    rerender(<AssistantMessage content="Nothing to Compact Yet" />);

    expect(screen.getByLabelText('Nothing to Compact Yet')).toBeInTheDocument();
  });

  it('renders a structured todo snapshot card instead of markdown content', () => {
    const todoSnapshot: TodoItem[] = [
      { id: '1', text: 'Inspect melody', status: 'completed', updatedAt: 1 },
      { id: '2', text: 'Write harmony', status: 'in_progress', activeText: 'Writing harmony', updatedAt: 2 },
    ];

    render(
      <AssistantMessage
        content="fallback content"
        toolName="update_todo_list"
        toolSuccess={true}
        todoSnapshot={todoSnapshot}
      />
    );

    expect(screen.getByLabelText('Agent task checklist snapshot')).toBeInTheDocument();
    expect(screen.getByText('Task Checklist')).toBeInTheDocument();
    expect(screen.getByText('1/2 completed')).toBeInTheDocument();
    expect(screen.getByText('Working on: Writing harmony')).toBeInTheDocument();
    expect(screen.queryByText('fallback content')).not.toBeInTheDocument();
  });

  it('renders the add_notes summary instead of the raw tool result text', () => {
    render(
      <AssistantMessage
        content="✅ **add_notes**\n\n └── Successfully created 81 notes: C4..."
        toolName="add_notes"
        toolSuccess={true}
        toolRawResult="Successfully created 81 notes: C4..."
        toolResultDisplayContent="Successfully created 81 notes in region **Verse Melody** on track **Lead Vox**, spanning bars 5 to 12."
      />
    );

    expect(screen.getByText('add_notes')).toBeInTheDocument();
    expect(screen.getByText(/└──/)).toBeInTheDocument();
    expect(screen.getByText(/Successfully created 81 notes in region/i)).toBeInTheDocument();
    expect(screen.getByText('Verse Melody')).toBeInTheDocument();
    expect(screen.getByText('Lead Vox')).toBeInTheDocument();
    expect(screen.queryByText(/Successfully created 81 notes: C4/)).not.toBeInTheDocument();
  });

  it('renders generic tool results with the stable shell and raw body by default', () => {
    render(
      <AssistantMessage
        content="✅ **read_music**\n\n └── raw fallback"
        toolName="read_music"
        toolSuccess={true}
        toolRawResult="C D E F"
      />
    );

    expect(screen.getByText('read_music')).toBeInTheDocument();
    expect(screen.getByText(/└──/)).toBeInTheDocument();
    expect(screen.getByText('C D E F')).toBeInTheDocument();
  });
});
