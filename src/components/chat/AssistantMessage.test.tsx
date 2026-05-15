import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import AssistantMessage from './AssistantMessage';

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
});
