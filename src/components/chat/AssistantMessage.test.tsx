import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import AssistantMessage from './AssistantMessage';

describe('AssistantMessage', () => {
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
});
