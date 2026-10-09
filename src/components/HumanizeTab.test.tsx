import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import HumanizeTab from './HumanizeTab';
import { I18nContext } from '../i18n/I18nProvider';
import { translate } from '../i18n/translate';
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
describe('Humanize tab', () => {
  it('has approved defaults, family moods, and resets invalid mood on family change', () => {
    render(<HumanizeTab region={region} isActive={true} contextKey="test" onSuccess={vi.fn()} />);
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
    render(<HumanizeTab region={region} isActive={true} contextKey="test" onSuccess={vi.fn()} />);
    fireEvent.click(screen.getByRole('checkbox', { name: 'Use note velocity' }));
    fireEvent.click(screen.getByRole('button', { name: 'Humanize' }));
    await waitFor(() => expect(runAireWorker).toHaveBeenCalled());
    expect(vi.mocked(runAireWorker).mock.calls[0][0].options.useVelocity).toBe(false);
  });
  it.each(AIRE_SIMPLIFICATION_LEVELS)('passes %s simplification to the worker and retains it when reopening', async level => {
    const props = { region, isActive: true, contextKey: "test", onSuccess: vi.fn() };
    const view = render(<HumanizeTab {...props} />);
    fireEvent.change(screen.getByRole('combobox', { name: 'Curve Simplification' }), { target: { value: level } });
    fireEvent.click(screen.getByRole('button', { name: 'Humanize' }));
    await waitFor(() => expect(props.onSuccess).toHaveBeenCalled());
    expect(vi.mocked(runAireWorker).mock.calls[0][0].simplification).toBe(level);
    view.rerender(<HumanizeTab {...props} isActive={false} />);
    view.rerender(<HumanizeTab {...props} isActive={true} />);
    expect(screen.getByRole('combobox', { name: 'Curve Simplification' })).toHaveValue(level);
  });
  it('disables Humanize for empty or nonoverlapping loop targets', () => {
    project.setIsLooping(true); project.setLoopingRange([2, 2]);
    render(<HumanizeTab region={region} isActive={true} contextKey="test" onSuccess={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'Humanize' })).toBeDisabled();
  });
  it('asks before replacement and does not download when declined', async () => {
    region.setControllerEvents(1, [new KGMidiControllerEvent('c', 0, 80)]);
    const download = vi.spyOn(aireCache, 'download');
    render(<HumanizeTab region={region} isActive={true} contextKey="test" onSuccess={vi.fn()} />);
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
        render(<HumanizeTab region={region} isActive={true} contextKey="test" onSuccess={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Humanize' }));
    const confirmation = screen.getByRole('alertdialog');
    expect(document.querySelector('.humanize-form')).toHaveAttribute('inert');
    if (method === 'Escape') fireEvent.keyDown(document, { key: 'Escape' });
    else if (method === 'close') fireEvent.click(screen.getByRole('button', { name: 'Close dialog' }));
    else fireEvent.mouseDown(confirmation.parentElement!);
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(screen.getByRole('button', { name: 'Humanize' })).toBeEnabled();
    expect(runAireWorker).not.toHaveBeenCalled();
  });
  it('keeps keyboard focus inside confirmation', () => {
    region.setControllerEvents(1, [new KGMidiControllerEvent('c', 0, 80)]);
    render(<HumanizeTab region={region} isActive={true} contextKey="test" onSuccess={vi.fn()} />);
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
    const success = vi.fn(); render(<HumanizeTab region={region} isActive={true} contextKey="test" onSuccess={success} />);
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
    render(<HumanizeTab region={region} isActive={true} contextKey="test" onSuccess={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Humanize' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('changed'); expect(KGCore.instance().executeCommand).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Humanize' })).toBeEnabled();
  });
  it.each(AIRE_CONTROLLERS)('confirms and applies only CC%i, passing the controller on success', async controller => {
    for (const cc of AIRE_CONTROLLERS) region.setControllerEvents(cc, [new KGMidiControllerEvent(`c-${cc}`, 0, 80)]);
    vi.mocked(KGCore.instance().executeCommand).mockImplementation(command => { command.execute(); });
    const success = vi.fn();
    render(<HumanizeTab region={region} isActive={true} contextKey="test" onSuccess={success} />);
    fireEvent.change(screen.getByRole('combobox', { name: 'Target Controller' }), { target: { value: String(controller) } });
    fireEvent.click(screen.getByRole('button', { name: 'Humanize' }));
    expect(screen.getByRole('alertdialog')).toHaveTextContent(`Replace the existing CC${controller}`);
    expect(runAireWorker).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Yes' }));
    await waitFor(() => expect(success).toHaveBeenCalledExactlyOnceWith(controller));
    expect(region.getControllerEvents(controller)[0].getValue()).toBe(64);
    for (const cc of AIRE_CONTROLLERS.filter(cc => cc !== controller)) expect(region.getControllerEvents(cc)[0].getValue()).toBe(80);
  });
  it('returns to controller selection after No and retains it when reopening', async () => {
    region.setControllerEvents(1, [new KGMidiControllerEvent('c', 0, 80)]);
    const props = { region, isActive: true, contextKey: "test", onSuccess: vi.fn() };
    const view = render(<HumanizeTab {...props} />);
    fireEvent.click(screen.getByRole('button', { name: 'Humanize' }));
    fireEvent.click(screen.getByRole('button', { name: 'No' }));
    fireEvent.change(screen.getByRole('combobox', { name: 'Target Controller' }), { target: { value: '11' } });
    expect(screen.queryByRole('alertdialog')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Humanize' }));
    await waitFor(() => expect(props.onSuccess).toHaveBeenCalledWith(11));
    view.rerender(<HumanizeTab {...props} isActive={false} />);
    view.rerender(<HumanizeTab {...props} isActive={true} />);
    expect(screen.getByRole('combobox', { name: 'Target Controller' })).toHaveValue('11');
    expect(screen.getByRole('combobox', { name: 'Curve Simplification' })).toHaveValue('medium');
  });
  it.each(AIRE_CONTROLLERS)('rejects intervening CC%i edits', async controller => {
    vi.mocked(runAireWorker).mockImplementation(async () => {
      region.setControllerEvents(controller, [new KGMidiControllerEvent('edit', 100, 80)]);
      return [{ tick: 0, value: 64 }];
    });
    render(<HumanizeTab region={region} isActive={true} contextKey="test" onSuccess={vi.fn()} />);
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
    render(<HumanizeTab region={region} isActive={true} contextKey="test" onSuccess={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Humanize' })); await waitFor(() => expect(signal).toBeDefined());
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(signal!.aborted).toBe(true); expect(screen.getByRole('button', { name: 'Humanize' })).toBeEnabled(); expect(runAireWorker).not.toHaveBeenCalled();
  });
  it('renders all configuration directly, keeps it across tab switches, and uses no main dialog', () => {
    const props = { region, isActive: true, contextKey: 'test', onSuccess: vi.fn() };
    const view = render(<HumanizeTab {...props} />);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.queryByText(/Advanced Settings/)).not.toBeInTheDocument();
    expect(screen.getAllByRole('combobox')).toHaveLength(5);
    fireEvent.change(screen.getByLabelText('Instrument Family'), { target: { value: 'W01' } });
    fireEvent.change(screen.getByLabelText('Mood'), { target: { value: 'tragicomic' } });
    fireEvent.change(screen.getByLabelText('Target Controller'), { target: { value: '7' } });
    fireEvent.click(screen.getByLabelText('Use note velocity'));
    view.rerender(<HumanizeTab {...props} isActive={false} />);
    view.rerender(<HumanizeTab {...props} isActive={true} />);
    expect(screen.getByLabelText('Instrument Family')).toHaveValue('W01');
    expect(screen.getByLabelText('Mood')).toHaveValue('tragicomic');
    expect(screen.getByLabelText('Target Controller')).toHaveValue('7');
    expect(screen.getByLabelText('Use note velocity')).not.toBeChecked();
  });

  it.each(['leave', 'region', 'loop', 'project'])('cancels in-flight inference on %s changes', async change => {
    let signal: AbortSignal | undefined;
    let finish!: (value: { tick: number; value: number }[]) => void;
    vi.mocked(runAireWorker).mockImplementation((_request, workerSignal) => {
      signal = workerSignal;
      return new Promise(resolve => { finish = resolve; });
    });
    const props = { region, isActive: true, contextKey: 'test', onSuccess: vi.fn() };
    const view = render(<HumanizeTab {...props} />);
    fireEvent.click(screen.getByRole('button', { name: 'Humanize' }));
    await waitFor(() => expect(signal).toBeDefined());
    if (change === 'project') project = new KGProject();
    view.rerender(<HumanizeTab {...props}
      isActive={change !== 'leave'} region={change === 'region' ? null : region}
      contextKey={change === 'loop' ? 'changed-loop' : 'test'} />);
    expect(signal!.aborted).toBe(true);
    await act(async () => finish([{ tick: 0, value: 90 }]));
    expect(props.onSuccess).not.toHaveBeenCalled();
    expect(KGCore.instance().executeCommand).not.toHaveBeenCalled();
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
  });

  it('does not let a cancelled run clear the next run when its result arrives late', async () => {
    const finishes: Array<(value: { tick: number; value: number }[]) => void> = [];
    vi.mocked(runAireWorker).mockImplementation(() => new Promise(resolve => { finishes.push(resolve); }));
    const props = { region, isActive: true, contextKey: 'test', onSuccess: vi.fn() };
    const view = render(<HumanizeTab {...props} />);
    fireEvent.click(screen.getByRole('button', { name: 'Humanize' }));
    await waitFor(() => expect(finishes).toHaveLength(1));
    view.rerender(<HumanizeTab {...props} isActive={false} />);
    view.rerender(<HumanizeTab {...props} />);
    fireEvent.click(screen.getByRole('button', { name: 'Humanize' }));
    await waitFor(() => expect(finishes).toHaveLength(2));
    await act(async () => finishes[0]([{ tick: 0, value: 70 }]));
    expect(props.onSuccess).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Humanize' })).toBeDisabled();
    await act(async () => finishes[1]([{ tick: 0, value: 80 }]));
    expect(props.onSuccess).toHaveBeenCalledOnce();
    expect(KGCore.instance().executeCommand).toHaveBeenCalledOnce();
    expect(screen.getByRole('button', { name: 'Humanize' })).toBeEnabled();
  });

  it('shows the actual provider reported by inference, including WASM fallback', async () => {
    vi.mocked(runAireWorker).mockImplementation(async (_request, _signal, progress) => {
      progress({ completed: 1, total: 1, provider: 'wasm' });
      return [{ tick: 0, value: 64 }];
    });
    render(<HumanizeTab region={region} isActive={true} contextKey="test" onSuccess={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Humanize' }));
    expect(await screen.findByText('Provider: wasm')).toBeVisible();
  });

  it('redownloads and deletes only the selected family model and refreshes status', async () => {
    const download = vi.spyOn(aireCache, 'download').mockResolvedValue();
    const remove = vi.spyOn(aireCache, 'delete').mockResolvedValue();
    render(<HumanizeTab region={null} isActive={true} contextKey="test" onSuccess={vi.fn()} />);
    await waitFor(() => expect(screen.getByRole('button', { name: 'Redownload Model' })).toBeEnabled());
    fireEvent.click(screen.getByRole('button', { name: 'Redownload Model' }));
    await waitFor(() => expect(download).toHaveBeenCalledOnce());
    expect(download.mock.calls[0][1]).toContain('s03');
    await waitFor(() => expect(screen.getByRole('button', { name: 'Delete Cached Model' })).toBeEnabled());
    vi.mocked(aireCache.exists).mockResolvedValue(false);
    fireEvent.click(screen.getByRole('button', { name: 'Delete Cached Model' }));
    await waitFor(() => expect(remove).toHaveBeenCalledOnce());
    expect(remove.mock.calls[0][0]).toContain('s03');
    expect(await screen.findByRole('button', { name: 'Download Selected Model' })).toBeVisible();
  });

  it.each([
    ['zh_cn', '人性化', 'MIDI 表情人性化', '乐器类别', '弦乐', '情绪', '宁静', '仅 CPU/WASM'],
    ['zh_hk', '人性化', 'MIDI 表情人性化', '樂器類別', '弦樂', '情緒', '寧靜', '僅 CPU/WASM'],
    ['fr_fr', 'Humaniser', 'Humaniser l’expression MIDI', 'Famille d’instruments', 'Cordes', 'Ambiance', 'Paisible', 'CPU/WASM uniquement'],
  ] as const)('renders Humanize in %s without English overriding the translations', async (locale, action, title, family, strings, mood, peaceful, provider) => {
    render(<I18nContext.Provider value={{ languageSetting: locale, resolvedLocale: locale, setLanguageSetting: vi.fn(),
      t: (key, params) => translate(key, params, locale) }}>
      <HumanizeTab region={null} isActive={true} contextKey="test" onSuccess={vi.fn()} />
    </I18nContext.Provider>);
    expect(screen.getByText(title)).toBeVisible();
    expect(screen.getByRole('button', { name: action })).toBeDisabled();
    expect(screen.getByRole('combobox', { name: family })).toHaveDisplayValue(strings);
    expect(screen.getByRole('combobox', { name: mood })).toHaveDisplayValue(peaceful);
    expect(screen.getByText(new RegExp(provider))).toBeVisible();
    for (const key of ['aire.description', 'aire.role', 'aire.targetController', 'aire.simplification', 'aire.simplificationHelp', 'aire.useVelocity', 'aire.useVelocityHelp', 'aire.noTarget']) {
      expect(translate(key, undefined, locale)).not.toBe(translate(key, undefined, 'en_us'));
    }
    expect(await screen.findByRole('button', { name: translate('kgone.separator.local.btn.redownload', undefined, locale) })).toBeEnabled();
  });

});
