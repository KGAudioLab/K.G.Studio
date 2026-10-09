import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import HumanizePopup from './HumanizePopup';
import { KGProject } from '../core/KGProject';
import { KGMidiRegion } from '../core/region/KGMidiRegion';
import { KGMidiTrack } from '../core/track/KGMidiTrack';
import { KGMidiNote } from '../core/midi/KGMidiNote';
import { KGMidiControllerEvent } from '../core/midi/KGMidiControllerEvent';
import { KGCore } from '../core/KGCore';
import { aireCache } from '../util/aire/config';
import { runAireWorker } from '../util/aire/client';
vi.mock('../util/aire/client', () => ({ runAireWorker: vi.fn(), serializeAireCacheTask: (task: () => Promise<unknown>) => task() }));
vi.mock('../core/config/ConfigManager', () => ({ ConfigManager: { instance: () => ({ get: () => undefined }) } }));
let project: KGProject, region: KGMidiRegion;
beforeEach(() => {
  vi.restoreAllMocks();
  project = new KGProject(); const track = new KGMidiTrack('t', 0, 'Strings');
  region = new KGMidiRegion('r', 't', 0, 'Test', 0, 3840); region.setNotes([new KGMidiNote('n', 0, 3840, 60, 64)]);
  track.addRegion(region); project.setTracks([track]);
  vi.mocked(KGCore.instance).mockReturnValue({ getCurrentProject: vi.fn(() => project), executeCommand: vi.fn(), getSelectedItems: vi.fn(() => []), removeSelectedItem: vi.fn() } as never);
  vi.spyOn(aireCache, 'exists').mockResolvedValue(true); vi.spyOn(aireCache, 'getArrayBuffer').mockResolvedValue(new ArrayBuffer(4));
  vi.mocked(runAireWorker).mockReset().mockResolvedValue([{ tick: 0, value: 64 }]);
});
describe('Humanize dialog', () => {
  it('has approved defaults, family moods, and resets invalid mood on family change', () => {
    render(<HumanizePopup region={region} onCancel={vi.fn()} onSuccess={vi.fn()} />);
    const [family, role, mood] = screen.getAllByRole('combobox');
    expect(family).toHaveValue('S03'); expect(role).toHaveValue('pad'); expect(mood).toHaveValue('peaceful');
    fireEvent.change(family, { target: { value: 'W01' } }); fireEvent.change(mood, { target: { value: 'tragicomic' } });
    fireEvent.change(family, { target: { value: 'S03' } }); expect(mood).toHaveValue('peaceful'); expect(screen.queryByRole('option', { name: 'Tragicomic' })).toBeNull();
  });
  it('disables Humanize for empty or nonoverlapping loop targets', () => {
    project.setIsLooping(true); project.setLoopingRange([2, 2]);
    render(<HumanizePopup region={region} onCancel={vi.fn()} onSuccess={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'Humanize' })).toBeDisabled();
  });
  it('asks before replacement and does not download when declined', async () => {
    region.setControllerEvents(1, [new KGMidiControllerEvent('c', 0, 80)]);
    const download = vi.spyOn(aireCache, 'download');
    render(<HumanizePopup region={region} onCancel={vi.fn()} onSuccess={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Humanize' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Replace the existing CC1');
    expect(screen.getByRole('button', { name: 'Replace CC1 and Humanize' })).toBeEnabled();
    expect(download).not.toHaveBeenCalled(); expect(runAireWorker).not.toHaveBeenCalled();
  });
  it('shows completed-window progress, disables controls, and commits once', async () => {
    let finish!: (value: { tick: number; value: number }[]) => void;
    vi.mocked(runAireWorker).mockImplementation(async (_request, _signal, progress) => {
      progress({ completed: 1, total: 3, provider: 'wasm' }); return new Promise(resolve => { finish = resolve; });
    });
    const success = vi.fn(); render(<HumanizePopup region={region} onCancel={vi.fn()} onSuccess={success} />);
    fireEvent.click(screen.getByRole('button', { name: 'Humanize' }));
    await waitFor(() => expect(Number(screen.getByRole('progressbar').getAttribute('aria-valuenow'))).toBeCloseTo(100 / 3));
    expect(screen.getByRole('button', { name: 'Humanize' })).toBeDisabled(); expect(screen.getByRole('button', { name: 'Cancel' })).toBeEnabled();
    await act(async () => finish([{ tick: 0, value: 64 }]));
    expect(KGCore.instance().executeCommand).toHaveBeenCalledTimes(1); expect(success).toHaveBeenCalledTimes(1);
  });
  it('rejects stale input and allows retry after failure', async () => {
    vi.mocked(runAireWorker).mockImplementation(async () => { region.getNotes()[0].setVelocity(90); return [{ tick: 0, value: 80 }]; });
    render(<HumanizePopup region={region} onCancel={vi.fn()} onSuccess={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Humanize' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('changed'); expect(KGCore.instance().executeCommand).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Humanize' })).toBeEnabled();
  });
  it('aborts the download when cancelled and discards its eventual result', async () => {
    vi.spyOn(aireCache, 'exists').mockResolvedValue(false);
    let signal: AbortSignal | undefined;
    vi.spyOn(aireCache, 'download').mockImplementation(async (_url, _path, options) => {
      signal = options?.signal;
      return new Promise((_resolve, reject) => signal?.addEventListener('abort', () => reject(signal?.reason)));
    });
    const cancel = vi.fn(); render(<HumanizePopup region={region} onCancel={cancel} onSuccess={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Humanize' })); await waitFor(() => expect(signal).toBeDefined());
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(signal!.aborted).toBe(true); expect(cancel).toHaveBeenCalled(); expect(runAireWorker).not.toHaveBeenCalled();
  });
});
