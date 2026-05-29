import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import FloatingPopup from './FloatingPopup';

describe('FloatingPopup', () => {
  it('closes on outside click and escape', () => {
    const onClose = vi.fn();
    render(
      <div>
        <FloatingPopup
          isOpen={true}
          onClose={onClose}
          trigger={<button type="button">Toggle</button>}
        >
          <div>Popup body</div>
        </FloatingPopup>
        <button type="button">Outside</button>
      </div>
    );

    expect(screen.getByRole('dialog')).toBeInTheDocument();

    fireEvent.mouseDown(screen.getByRole('button', { name: 'Outside' }));
    fireEvent.keyDown(document, { key: 'Escape' });

    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it('stops escape from bubbling to outer window listeners', () => {
    const onClose = vi.fn();
    const outerEscapeHandler = vi.fn();
    window.addEventListener('keydown', outerEscapeHandler);

    render(
      <FloatingPopup
        isOpen={true}
        onClose={onClose}
        trigger={<button type="button">Toggle</button>}
      >
        <div>Popup body</div>
      </FloatingPopup>
    );

    fireEvent.keyDown(document, { key: 'Escape' });

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(outerEscapeHandler).not.toHaveBeenCalled();

    window.removeEventListener('keydown', outerEscapeHandler);
  });
});
