import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import AssistantMessage from './AssistantMessage';
import type { TodoItem } from '../../agent/core/todo';

describe('AssistantMessage', () => {
  afterEach(() => {
    vi.useRealTimers();
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
});
