import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import React from 'react';
import TransposeSettingsPopup from './TransposeSettingsPopup';

describe('TransposeSettingsPopup', () => {
  it('renders the complete descending transpose range', () => {
    render(
      <TransposeSettingsPopup
        isOpen={true}
        settings={{ followKeySignature: false, transpose: 0 }}
        noTranspose={false}
        showNoTranspose={true}
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    const options = screen.getByRole('combobox').querySelectorAll('option');
    expect(options).toHaveLength(73);
    expect(options[0]).toHaveTextContent('+36');
    expect(options[36]).toHaveTextContent('+0');
    expect(options[72]).toHaveTextContent('-36');
  });

  it('disables transpose controls when no-transpose is selected', () => {
    render(
      <TransposeSettingsPopup
        isOpen={true}
        settings={{ followKeySignature: true, transpose: 2 }}
        noTranspose={false}
        showNoTranspose={true}
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByLabelText('No transpose'));
    expect(screen.getByLabelText('Follow key signature')).toBeDisabled();
    expect(screen.getByRole('combobox')).toBeDisabled();
  });

  it('keeps checkbox drafts when portal clicks would rerender the parent with a fresh settings object', () => {
    const Harness = () => {
      const [, rerenderParent] = React.useState(0);
      return (
        <div onClick={() => rerenderParent(value => value + 1)}>
          <TransposeSettingsPopup
            isOpen={true}
            settings={{ followKeySignature: false, transpose: 0 }}
            noTranspose={false}
            showNoTranspose={true}
            onConfirm={vi.fn()}
            onCancel={vi.fn()}
          />
        </div>
      );
    };

    render(<Harness />);
    const checkbox = screen.getByLabelText('Follow key signature');
    fireEvent.click(checkbox);
    expect(checkbox).toBeChecked();
  });

  it('uses the shared inset-arrow select styling', () => {
    render(
      <TransposeSettingsPopup
        isOpen={true}
        settings={{ followKeySignature: false, transpose: 0 }}
        noTranspose={false}
        showNoTranspose={true}
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    expect(screen.getByRole('combobox')).toHaveClass('settings-select');
  });

  it('treats Escape and outside clicks as cancellation without confirming', () => {
    const onCancel = vi.fn();
    const onConfirm = vi.fn();
    const { rerender } = render(
      <TransposeSettingsPopup
        isOpen={true}
        settings={{ followKeySignature: false, transpose: 0 }}
        noTranspose={false}
        showNoTranspose={false}
        inherit={true}
        onConfirm={onConfirm}
        onCancel={onCancel}
      />,
    );
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onConfirm).not.toHaveBeenCalled();

    rerender(
      <TransposeSettingsPopup
        isOpen={true}
        settings={{ followKeySignature: false, transpose: 0 }}
        noTranspose={false}
        showNoTranspose={false}
        inherit={true}
        onConfirm={onConfirm}
        onCancel={onCancel}
      />,
    );
    fireEvent.mouseDown(document.querySelector('.transpose-popup-backdrop')!);
    expect(onCancel).toHaveBeenCalledTimes(2);
    expect(onConfirm).not.toHaveBeenCalled();
  });
});
