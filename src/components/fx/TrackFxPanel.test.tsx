import 'reflect-metadata';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { KGTrack } from '../../core/track/KGTrack';
import { showConfirm } from '../../util/dialogUtil';
import TrackFxPanel from './TrackFxPanel';

vi.mock('../../util/dialogUtil', () => ({ showConfirm: vi.fn() }));

function addEq() {
  fireEvent.click(screen.getByRole('button', { name: 'Add' }));
  fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Add' }));
}

describe('FX removal', () => {
  it('preserves a card when confirmation is cancelled', async () => {
    vi.mocked(showConfirm).mockResolvedValue(false);
    render(<TrackFxPanel track={new KGTrack()} hidden={false} />);
    addEq();
    fireEvent.click(screen.getByRole('button', { name: 'Delete EQ' }));
    await waitFor(() => expect(showConfirm).toHaveBeenCalledWith('Delete this EQ from the track?', { confirmLabel: 'Delete', cancelLabel: 'Cancel' }));
    expect(screen.getByRole('region', { name: 'EQ' })).toBeInTheDocument();
  });

  it('deletes only the clicked duplicate and retains the other instance’s settings', async () => {
    vi.mocked(showConfirm).mockResolvedValue(true);
    render(<TrackFxPanel track={new KGTrack()} hidden={false} />);
    addEq(); addEq();
    const cards = screen.getAllByRole('region', { name: 'EQ' });
    fireEvent.click(within(cards[1]).getByRole('button', { name: 'Disable EQ' }));
    fireEvent.click(within(cards[0]).getByRole('button', { name: 'Delete EQ' }));
    await waitFor(() => expect(screen.getAllByRole('region', { name: 'EQ' })).toHaveLength(1));
    expect(screen.getByRole('button', { name: 'Enable EQ' })).toHaveAttribute('aria-pressed', 'false');
  });

  it('removes from the originating track if selection changes during confirmation', async () => {
    let confirm!: (result: boolean) => void;
    vi.mocked(showConfirm).mockReturnValue(new Promise(resolve => { confirm = resolve; }));
    const first = new KGTrack('First'); const second = new KGTrack('Second');
    const { rerender } = render(<TrackFxPanel track={first} hidden={false} />);
    addEq();
    fireEvent.click(screen.getByRole('button', { name: 'Delete EQ' }));
    rerender(<TrackFxPanel track={second} hidden={false} />);
    addEq();
    await act(async () => confirm(true));
    expect(screen.getAllByRole('region', { name: 'EQ' })).toHaveLength(1);
    rerender(<TrackFxPanel track={first} hidden={false} />);
    expect(screen.queryByRole('region', { name: 'EQ' })).not.toBeInTheDocument();
  });
});
