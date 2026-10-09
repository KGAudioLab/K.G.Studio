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
import { AIRE_CONTROLLERS, AIRE_SIMPLIFICATION_LEVELS } from '../util/aire/types';
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
    const [family, role, mood, controller, simplification] = screen.getAllByRole('combobox');
    expect(screen.getByRole('checkbox', { name: 'Use note velocity' })).toBeChecked();
    expect(simplification).toHaveValue('medium');
    expect(Array.from((simplification as HTMLSelectElement).options).map(option => option.text)).toEqual(['None', 'Mild', 'Medium', 'Aggressive']);
    expect(controller).toHaveValue('1');
    expect(Array.from((controller as HTMLSelectElement).options).map(option => option.text)).toEqual(['CC1 — Modulation', 'CC2 — Breath', 'CC7 — Volume', 'CC11 — Expression']);
    expect(family).toHaveValue('S03'); expect(role).toHaveValue('pad'); expect(mood).toHaveValue('peaceful');
    fireEvent.change(family, { target: { value: 'W01' } }); fireEvent.change(mood, { target: { value: 'tragicomic' } });
    fireEvent.change(family, { target: { value: 'S03' } }); expect(mood).toHaveValue('peaceful'); expect(screen.queryByRole('option', { name: 'Tragicomic' })).toBeNull();
  });
  it('passes the velocity checkbox preference to the worker', async () => {
    render(<HumanizePopup region={region} onCancel={vi.fn()} onSuccess={vi.fn()} />);
    fireEvent.click(screen.getByRole('checkbox', { name: 'Use note velocity' }));
    fireEvent.click(screen.getByRole('button', { name: 'Humanize' }));
    await waitFor(() => expect(runAireWorker).toHaveBeenCalled());
    expect(vi.mocked(runAireWorker).mock.calls[0][0].options.useVelocity).toBe(false);
  });
  it.each(AIRE_SIMPLIFICATION_LEVELS)('passes %s simplification to the worker and resets on reopening', async level => {
    const props = { region, onCancel: vi.fn(), onSuccess: vi.fn() };
    const view = render(<HumanizePopup {...props} />);
    fireEvent.change(screen.getByRole('combobox', { name: 'Curve Simplification' }), { target: { value: level } });
    fireEvent.click(screen.getByRole('button', { name: 'Humanize' }));
    await waitFor(() => expect(props.onSuccess).toHaveBeenCalled());
    expect(vi.mocked(runAireWorker).mock.calls[0][0].simplification).toBe(level);
    view.unmount(); render(<HumanizePopup {...props} />);
    expect(screen.getByRole('combobox', { name: 'Curve Simplification' })).toHaveValue('medium');
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
    expect(screen.getByRole('alertdialog')).toHaveTextContent('Replace the existing CC1');
    expect(screen.getByRole('button', { name: 'Yes' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'No' })).toHaveFocus();
    fireEvent.click(screen.getByRole('button', { name: 'No' }));
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(screen.getByRole('button', { name: 'Humanize' })).toHaveFocus();
    expect(download).not.toHaveBeenCalled(); expect(runAireWorker).not.toHaveBeenCalled();
  });
  it.each(['Escape', 'close', 'backdrop'])('dismisses confirmation with %s without cancelling Humanize', method => {
    region.setControllerEvents(1, [new KGMidiControllerEvent('c', 0, 80)]);
    const cancel = vi.fn();
    render(<HumanizePopup region={region} onCancel={cancel} onSuccess={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Humanize' }));
    const confirmation = screen.getByRole('alertdialog');
    expect(document.querySelector('.transpose-popup-backdrop')).toHaveAttribute('inert');
    if (method === 'Escape') fireEvent.keyDown(document, { key: 'Escape' });
    else if (method === 'close') fireEvent.click(screen.getByRole('button', { name: 'Close dialog' }));
    else fireEvent.mouseDown(confirmation.parentElement!);
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(screen.getByRole('button', { name: 'Humanize' })).toBeEnabled();
    expect(cancel).not.toHaveBeenCalled(); expect(runAireWorker).not.toHaveBeenCalled();
  });
  it('keeps keyboard focus inside confirmation', () => {
    region.setControllerEvents(1, [new KGMidiControllerEvent('c', 0, 80)]);
    render(<HumanizePopup region={region} onCancel={vi.fn()} onSuccess={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Humanize' }));
    const yes = screen.getByRole('button', { name: 'Yes' });
    const close = screen.getByRole('button', { name: 'Close dialog' });
    yes.focus(); fireEvent.keyDown(yes, { key: 'Tab' }); expect(close).toHaveFocus();
    fireEvent.keyDown(close, { key: 'Tab', shiftKey: true }); expect(yes).toHaveFocus();
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
    expect(screen.getByRole('checkbox', { name: 'Use note velocity' })).toBeDisabled();
    expect(screen.getByRole('combobox', { name: 'Target Controller' })).toBeDisabled();
    expect(screen.getByRole('combobox', { name: 'Curve Simplification' })).toBeDisabled();
    await act(async () => finish([{ tick: 0, value: 64 }]));
    expect(KGCore.instance().executeCommand).toHaveBeenCalledTimes(1); expect(success).toHaveBeenCalledExactlyOnceWith(1);
  });
  it('rejects stale input and allows retry after failure', async () => {
    vi.mocked(runAireWorker).mockImplementation(async () => { region.getNotes()[0].setVelocity(90); return [{ tick: 0, value: 80 }]; });
    render(<HumanizePopup region={region} onCancel={vi.fn()} onSuccess={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Humanize' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('changed'); expect(KGCore.instance().executeCommand).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Humanize' })).toBeEnabled();
  });
  it.each(AIRE_CONTROLLERS)('confirms and applies only CC%i, passing the controller on success', async controller => {
    for (const cc of AIRE_CONTROLLERS) region.setControllerEvents(cc, [new KGMidiControllerEvent(`c-${cc}`, 0, 80)]);
    vi.mocked(KGCore.instance().executeCommand).mockImplementation(command => { command.execute(); });
    const success = vi.fn();
    render(<HumanizePopup region={region} onCancel={vi.fn()} onSuccess={success} />);
    fireEvent.change(screen.getByRole('combobox', { name: 'Target Controller' }), { target: { value: String(controller) } });
    fireEvent.click(screen.getByRole('button', { name: 'Humanize' }));
    expect(screen.getByRole('alertdialog')).toHaveTextContent(`Replace the existing CC${controller}`);
    expect(runAireWorker).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Yes' }));
    await waitFor(() => expect(success).toHaveBeenCalledExactlyOnceWith(controller));
    expect(region.getControllerEvents(controller)[0].getValue()).toBe(64);
    for (const cc of AIRE_CONTROLLERS.filter(cc => cc !== controller)) expect(region.getControllerEvents(cc)[0].getValue()).toBe(80);
  });
  it('returns to controller selection after No and resets on reopening', async () => {
    region.setControllerEvents(1, [new KGMidiControllerEvent('c', 0, 80)]);
    const props = { region, onCancel: vi.fn(), onSuccess: vi.fn() };
    const view = render(<HumanizePopup {...props} />);
    fireEvent.click(screen.getByRole('button', { name: 'Humanize' }));
    fireEvent.click(screen.getByRole('button', { name: 'No' }));
    fireEvent.change(screen.getByRole('combobox', { name: 'Target Controller' }), { target: { value: '11' } });
    expect(screen.queryByRole('alertdialog')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Humanize' }));
    await waitFor(() => expect(props.onSuccess).toHaveBeenCalledWith(11));
    view.unmount(); render(<HumanizePopup {...props} />);
    expect(screen.getByRole('combobox', { name: 'Target Controller' })).toHaveValue('1');
    expect(screen.getByRole('combobox', { name: 'Curve Simplification' })).toHaveValue('medium');
  });
  it.each(AIRE_CONTROLLERS)('rejects intervening CC%i edits', async controller => {
    vi.mocked(runAireWorker).mockImplementation(async () => {
      region.setControllerEvents(controller, [new KGMidiControllerEvent('edit', 100, 80)]);
      return [{ tick: 0, value: 64 }];
    });
    render(<HumanizePopup region={region} onCancel={vi.fn()} onSuccess={vi.fn()} />);
    fireEvent.change(screen.getByRole('combobox', { name: 'Target Controller' }), { target: { value: String(controller) } });
    fireEvent.click(screen.getByRole('button', { name: 'Humanize' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('changed');
    expect(KGCore.instance().executeCommand).not.toHaveBeenCalled();
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
