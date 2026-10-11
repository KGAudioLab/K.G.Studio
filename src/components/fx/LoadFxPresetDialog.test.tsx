import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import LoadFxPresetDialog from './LoadFxPresetDialog';
import { fxPresetStorage } from '../../core/io/FXPresetStorage';
import { showAlert, showConfirm } from '../../util/dialogUtil';
import { KGReverbFX } from '../../core/fx';

vi.mock('../../core/io/FXPresetStorage', () => ({ fxPresetStorage: { list: vi.fn(), read: vi.fn(), delete: vi.fn() } }));
vi.mock('../../util/dialogUtil', () => ({ showConfirm: vi.fn(), showAlert: vi.fn() }));
beforeEach(() => {
  vi.mocked(fxPresetStorage.list).mockResolvedValue([{ name: 'Broken', effects: null }, { name: 'Empty', effects: [] }, { name: 'Warm', effects: [new KGReverbFX('plate', .75)] }]);
  vi.mocked(fxPresetStorage.delete).mockReset(); vi.mocked(fxPresetStorage.delete).mockResolvedValue();
  vi.mocked(showConfirm).mockReset(); vi.mocked(showAlert).mockResolvedValue();
});
describe('LoadFxPresetDialog', () => {
  it('selects protected Default and previews saved/invalid/empty chains', async () => {
    render(<LoadFxPresetDialog onClose={vi.fn()} onLoad={vi.fn()} />);
    await screen.findByRole('button', { name: 'Warm 1 FX' });
    expect(screen.getByRole('button', { name: 'Default 2 FX' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Delete' })).toBeDisabled();
    expect(screen.queryByRole('button', { name: 'Delete preset Default' })).not.toBeInTheDocument();
    expect(screen.getAllByRole('row')).toHaveLength(3);
    fireEvent.click(screen.getByRole('button', { name: 'Broken Unavailable' })); expect(screen.getByRole('button', { name: 'Load' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Delete' })).toBeEnabled();
    fireEvent.click(screen.getByRole('button', { name: 'Empty 0 FX' })); expect(screen.getByRole('button', { name: 'Load' })).toBeEnabled();
    expect(screen.getByText('This preset contains no FX.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Warm 1 FX' }));
    expect(screen.getByTitle('Enabled · Reverb type: Plate · Dry/Wet: 75%')).toBeInTheDocument();
  });
  it.each(['sidebar', 'footer'])('confirms %s deletion, preserves tracks, and selects Default afterward', async location => {
    vi.mocked(showConfirm).mockResolvedValueOnce(false).mockResolvedValueOnce(true);
    render(<LoadFxPresetDialog onClose={vi.fn()} onLoad={vi.fn()} />);
    await screen.findByRole('button', { name: 'Warm 1 FX' });
    fireEvent.click(screen.getByRole('button', { name: 'Warm 1 FX' }));
    const remove = () => fireEvent.click(screen.getByRole('button', { name: location === 'sidebar' ? 'Delete preset Warm' : 'Delete' }));
    remove(); await waitFor(() => expect(showConfirm).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Delete' })).toBeEnabled()); expect(fxPresetStorage.delete).not.toHaveBeenCalled();
    remove(); await waitFor(() => expect(fxPresetStorage.delete).toHaveBeenCalledWith('Warm'));
    expect(screen.getByRole('button', { name: 'Default 2 FX' })).toHaveAttribute('aria-pressed', 'true'); expect(screen.queryByRole('button', { name: 'Warm 1 FX' })).not.toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole('button', { name: 'Default 2 FX' })).toHaveFocus());
  });
  it('rereads saved settings and closes only after a successful load', async () => {
    const onLoad = vi.fn().mockResolvedValueOnce(false).mockResolvedValueOnce(true); const onClose = vi.fn();
    const latest = [new KGReverbFX('spring', .9)]; vi.mocked(fxPresetStorage.read).mockResolvedValue(latest);
    render(<LoadFxPresetDialog onClose={onClose} onLoad={onLoad} />);
    await screen.findByRole('button', { name: 'Warm 1 FX' }); fireEvent.click(screen.getByRole('button', { name: 'Warm 1 FX' }));
    fireEvent.click(screen.getByRole('button', { name: 'Load' })); await waitFor(() => expect(onLoad).toHaveBeenCalledWith(latest)); expect(onClose).not.toHaveBeenCalled();
    await waitFor(() => expect(screen.getByRole('button', { name: 'Load' })).toBeEnabled());
    fireEvent.click(screen.getByRole('button', { name: 'Load' })); await waitFor(() => expect(onClose).toHaveBeenCalledOnce());
  });
  it('reports read/delete failures while retaining the selected preset', async () => {
    vi.mocked(showConfirm).mockResolvedValue(true); vi.mocked(fxPresetStorage.delete).mockRejectedValue(new Error('quota'));
    const onClose = vi.fn(); render(<LoadFxPresetDialog onClose={onClose} onLoad={vi.fn()} />);
    await screen.findByRole('button', { name: 'Warm 1 FX' }); fireEvent.click(screen.getByRole('button', { name: 'Warm 1 FX' }));
    fireEvent.click(screen.getByRole('button', { name: 'Delete' })); await waitFor(() => expect(showAlert).toHaveBeenCalled());
    expect(onClose).not.toHaveBeenCalled(); expect(screen.getByRole('button', { name: 'Warm 1 FX' })).toHaveAttribute('aria-pressed', 'true');
  });
  it('traps focus, restores it on close, and lets nested confirmations own Escape', async () => {
    const previous = document.createElement('button'); document.body.append(previous); previous.focus();
    let finish!: (confirmed: boolean) => void;
    vi.mocked(showConfirm).mockImplementation(() => new Promise(resolve => { finish = resolve; }));
    const onClose = vi.fn(); const view = render(<LoadFxPresetDialog onClose={onClose} onLoad={vi.fn()} />);
    await screen.findByRole('button', { name: 'Warm 1 FX' });
    const close = screen.getByRole('button', { name: 'Close dialog' }); const load = screen.getByRole('button', { name: 'Load' });
    load.focus(); fireEvent.keyDown(load, { key: 'Tab' }); expect(close).toHaveFocus();
    fireEvent.keyDown(close, { key: 'Tab', shiftKey: true }); expect(load).toHaveFocus();
    fireEvent.click(screen.getByRole('button', { name: 'Delete preset Warm' }));
    const overlay = document.createElement('div'); overlay.className = 'dialog-overlay'; const cancel = document.createElement('button'); cancel.className = 'dialog-close-btn';
    cancel.onclick = () => finish(false); overlay.append(cancel); document.body.append(overlay); cancel.focus();
    await act(async () => fireEvent.keyDown(cancel, { key: 'Escape' })); expect(onClose).not.toHaveBeenCalled(); overlay.remove();
    view.unmount(); expect(previous).toHaveFocus(); previous.remove();
  });
});
