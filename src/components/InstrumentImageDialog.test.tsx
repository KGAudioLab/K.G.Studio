import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import images from 'virtual:instrument-images';
import InstrumentImageDialog from './InstrumentImageDialog';
import { I18nContext } from '../i18n/I18nProvider';
import { translate } from '../i18n/translate';

function mount(onCancel = vi.fn(), onConfirm = vi.fn()) {
  const view = render(<I18nContext.Provider value={{ languageSetting: 'en_us', resolvedLocale: 'en_us', setLanguageSetting: async () => {}, t: (key, params) => translate(key, params, 'en_us') }}>
    <InstrumentImageDialog imageName="piano.png" onCancel={onCancel} onConfirm={onConfirm} />
  </I18nContext.Provider>);
  return { ...view, onCancel, onConfirm };
}

describe('InstrumentImageDialog', () => {
  it('preselects and focuses the current image, exposes every asset with no visible labels, and commits only on OK', () => {
    const { onConfirm } = mount();
    expect(screen.getByRole('dialog')).toHaveAccessibleName('Track Image');
    expect(screen.getByRole('button', { name: 'piano' })).toHaveFocus();
    expect(document.querySelectorAll('.track-image-option').length).toBe(images.length);
    expect(document.querySelector('.track-image-option')).toHaveTextContent('');
    fireEvent.click(screen.getByRole('button', { name: 'violin' }));
    expect(onConfirm).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'violin' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'piano' })).toHaveAttribute('aria-pressed', 'false');
    fireEvent.click(screen.getByRole('button', { name: 'OK' }));
    expect(onConfirm).toHaveBeenCalledWith('violin.png');
  });

  it.each(['Cancel', 'Close image picker', 'Escape', 'outside'])('discards selection via %s', method => {
    const { onCancel, onConfirm } = mount();
    fireEvent.click(screen.getByRole('button', { name: 'violin' }));
    if (method === 'Escape') fireEvent.keyDown(window, { key: 'Escape' });
    else if (method === 'outside') {
      const overlay = document.querySelector('.dialog-overlay')!;
      fireEvent.mouseDown(overlay); fireEvent.click(overlay);
    } else fireEvent.click(screen.getByRole('button', { name: method }));
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('does not dismiss on a drag starting inside the dialog and ending outside', () => {
    const { onCancel } = mount();
    fireEvent.mouseDown(screen.getByRole('button', { name: 'piano' }));
    fireEvent.click(document.querySelector('.dialog-overlay')!);
    expect(onCancel).not.toHaveBeenCalled();
  });

  it('traps Tab focus and restores the previous focus on unmount', () => {
    const opener = document.createElement('button'); document.body.append(opener); opener.focus();
    const { unmount } = mount();
    const first = screen.getByRole('button', { name: 'Close image picker' });
    const last = screen.getByRole('button', { name: 'OK' });
    last.focus(); fireEvent.keyDown(window, { key: 'Tab' }); expect(first).toHaveFocus();
    fireEvent.keyDown(window, { key: 'Tab', shiftKey: true }); expect(last).toHaveFocus();
    unmount(); expect(opener).toHaveFocus(); opener.remove();
  });
});
