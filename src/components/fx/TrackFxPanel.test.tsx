import 'reflect-metadata';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { instanceToPlain, plainToInstance } from 'class-transformer';
import { KGCommandHistory } from '../../core/commands/KGCommandHistory';
import { KGEQFX, KGReverbFX, KGCompressorFX, KGLimiterFX } from '../../core/fx';
import { KGTrack } from '../../core/track/KGTrack';
import { showAlert, showChoice, showConfirm, showPrompt } from '../../util/dialogUtil';
import TrackFxPanel from './TrackFxPanel';
import { ConfigManager } from '../../core/config/ConfigManager';
import config from '../../../public/config.json';
import { useProjectStore } from '../../stores/projectStore';
import { KGMidiTrack } from '../../core/track/KGMidiTrack';
import { KGAudioTrack } from '../../core/track/KGAudioTrack';
import { KGAudioInterface } from '../../core/audio-interface/KGAudioInterface';
import { fxPresetStorage, FXPresetExistsError } from '../../core/io/FXPresetStorage';
import { serializeFXPreset } from '../../core/fx/fxPresets';

vi.mock('../../core/io/FXPresetStorage', async importOriginal => {
  const actual = await importOriginal<typeof import('../../core/io/FXPresetStorage')>();
  return { ...actual, fxPresetStorage: { list: vi.fn(async () => []), read: vi.fn(), save: vi.fn(), delete: vi.fn() } };
});

vi.mock('../../stores/projectStore', async () => {
  const { create } = await import('zustand');
  return { useProjectStore: create(() => ({ tracks: [] as KGTrack[] })) };
});

vi.mock('../../util/dialogUtil', () => ({ showConfirm: vi.fn(), showPrompt: vi.fn(), showChoice: vi.fn(), showAlert: vi.fn() }));

function addEq() {
  fireEvent.click(screen.getByRole('button', { name: 'Add' }));
  fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Add' }));
}

describe('configured FX resets', () => {
  it('uses the loaded factory config for resets without rewriting saved settings on render', () => {
    const configured = structuredClone(config);
    configured.audio.fx_defaults.eq.bands[1] = { frequencyHz: 1200, q: 1.5, gainDb: 3 };
    configured.audio.fx_defaults.reverb.wet = .6;
    configured.audio.fx_defaults.compressor = { thresholdDb: -30, ratio: 8, attackMs: 15, releaseMs: 250, gainDb: 3 };
    configured.audio.fx_defaults.limiter = { thresholdDb: -2, inputGainDb: 4 };
    const spy = vi.spyOn(ConfigManager.instance(), 'getDefaults').mockReturnValue(configured as ReturnType<ConfigManager['getDefaults']>);
    try {
      const track = new KGTrack();
      const eqModel = new KGEQFX(); const bands = eqModel.getBands(); bands[1].q = 2; eqModel.setBands(bands);
      track.setFX([eqModel, new KGReverbFX('spring', .8), new KGCompressorFX({ releaseMs: 400 }), new KGLimiterFX({ thresholdDb: -8 })]);
      render(<TrackFxPanel track={track} hidden={false} />);
      expect((track.getFX()[1] as KGReverbFX).getWet()).toBe(.8);
      expect((track.getFX()[2] as KGCompressorFX).getParameters().releaseMs).toBe(400);
      const eq = within(screen.getByRole('region', { name: 'EQ' }));
      for (const label of ['Freq', 'Q', 'Gain']) fireEvent.doubleClick(eq.getByRole('slider', { name: label }));
      fireEvent.doubleClick(within(screen.getByRole('region', { name: 'Reverb' })).getByRole('slider'));
      const compressor = within(screen.getByRole('region', { name: 'Compressor' }));
      for (const label of ['Threshold', 'Ratio', 'Attack', 'Release', 'Gain']) fireEvent.doubleClick(compressor.getByRole('slider', { name: label }));
      const limiter = within(screen.getByRole('region', { name: 'Limiter' }));
      fireEvent.doubleClick(limiter.getByRole('slider', { name: 'Input Gain' }));
      fireEvent.doubleClick(limiter.getAllByRole('slider', { name: 'Threshold' })[1]);
      expect((track.getFX()[0] as KGEQFX).getBands()[1]).toEqual(configured.audio.fx_defaults.eq.bands[1]);
      expect((track.getFX()[1] as KGReverbFX).getWet()).toBe(.6);
      expect((track.getFX()[2] as KGCompressorFX).getParameters()).toEqual(configured.audio.fx_defaults.compressor);
      expect((track.getFX()[3] as KGLimiterFX).getParameters()).toEqual(configured.audio.fx_defaults.limiter);
    } finally { spy.mockRestore(); }
  });
});

describe('FX removal', () => {
  beforeEach(() => { KGCommandHistory.instance().clear(); vi.mocked(showConfirm).mockReset(); });
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

  it('writes card controls into saved models and restores them after loading', () => {
    const track = new KGTrack();
    track.setFX([new KGEQFX(), new KGReverbFX(), new KGCompressorFX(), new KGLimiterFX()]);
    const { rerender } = render(<TrackFxPanel track={track} hidden={false} />);
    const eq = within(screen.getByRole('region', { name: 'EQ' }));
    fireEvent.keyDown(eq.getByRole('slider', { name: 'Gain' }), { key: 'End' });
    const reverb = within(screen.getByRole('region', { name: 'Reverb' }));
    fireEvent.keyDown(reverb.getByRole('slider'), { key: 'End' });
    const compressor = within(screen.getByRole('region', { name: 'Compressor' }));
    fireEvent.keyDown(compressor.getByRole('slider', { name: 'Attack' }), { key: 'End' });
    const limiter = within(screen.getByRole('region', { name: 'Limiter' }));
    fireEvent.keyDown(limiter.getAllByRole('slider', { name: 'Threshold' })[1], { key: 'Home' });
    expect((track.getFX()[0] as KGEQFX).getBands()[1].gainDb).toBe(18);
    expect((track.getFX()[1] as KGReverbFX).getWet()).toBe(1);
    expect((track.getFX()[2] as KGCompressorFX).getParameters().attackMs).toBe(1000);
    expect((track.getFX()[3] as KGLimiterFX).getParameters().thresholdDb).toBe(-100);
    const restored = plainToInstance(KGTrack, JSON.parse(JSON.stringify(instanceToPlain(track))) as Record<string, unknown>);
    rerender(<TrackFxPanel track={restored} hidden={false} />);
    expect(within(screen.getByRole('region', { name: 'EQ' })).getByRole('slider', { name: 'Gain' })).toHaveAttribute('aria-valuetext', '18.0 dB');
    expect(within(screen.getByRole('region', { name: 'Limiter' })).getAllByRole('slider', { name: 'Threshold' })[0]).toHaveAttribute('aria-valuenow', '-100');
  });

  it('prevents frequency knobs, graph keyboard moves, and resets from crossing neighboring bands', () => {
    const track = new KGTrack();
    track.addFX(new KGEQFX([100, 150, 200].map(frequencyHz => ({ frequencyHz, q: 0.5, gainDb: 0 }))));
    render(<TrackFxPanel track={track} hidden={false} />);
    const frequencies = () => (track.getFX()[0] as KGEQFX).getBands().map(band => band.frequencyHz);
    fireEvent.click(screen.getByRole('button', { name: 'Band 1' }));
    expect(screen.getByRole('slider', { name: 'Q' })).toBeDisabled();
    expect(screen.getByRole('slider', { name: 'Q' })).toHaveAttribute('aria-valuetext', '--');
    fireEvent.keyDown(screen.getByRole('slider', { name: 'Freq' }), { key: 'End' });
    expect(frequencies()).toEqual([149, 150, 200]);
    fireEvent.keyDown(screen.getByRole('button', { name: 'Band 1' }), { key: 'ArrowRight' });
    expect(frequencies()).toEqual([149, 150, 200]);
    fireEvent.click(screen.getByRole('button', { name: 'Band 3' }));
    expect(screen.getByRole('slider', { name: 'Q' })).toBeDisabled();
    expect(screen.getByRole('slider', { name: 'Q' })).toHaveAttribute('aria-valuetext', '--');
    fireEvent.keyDown(screen.getByRole('slider', { name: 'Freq' }), { key: 'Home' });
    expect(frequencies()).toEqual([149, 150, 151]);
    fireEvent.click(screen.getByRole('button', { name: 'Band 2' }));
    expect(screen.getByRole('slider', { name: 'Q' })).toBeEnabled();
    fireEvent.doubleClick(screen.getByRole('slider', { name: 'Freq' }));
    expect(frequencies()).toEqual([149, 150, 151]);
  });

  it('persists reordered cards, keeps UI changes out of history, and supports undo/redo', () => {
    const track = new KGTrack();
    const { rerender, unmount } = render(<TrackFxPanel track={track} hidden={false} />);
    addEq();
    const id = track.getFX()[0].getId();
    fireEvent.click(screen.getByRole('button', { name: 'Collapse FX' }));
    KGCommandHistory.instance().undo();
    rerender(<TrackFxPanel track={track} hidden={false} />);
    expect(track.getFX()).toHaveLength(0);
    expect(screen.queryByRole('region', { name: 'EQ' })).not.toBeInTheDocument();
    KGCommandHistory.instance().redo();
    rerender(<TrackFxPanel track={track} hidden={false} />);
    expect(track.getFX()[0].getId()).toBe(id);
    addEq();
    fireEvent.keyDown(screen.getAllByRole('button', { name: 'Reorder EQ' })[1], { key: 'ArrowUp', altKey: true });
    expect(track.getFX()[1].getId()).toBe(id);
    unmount();
    render(<TrackFxPanel track={track} hidden={false} />);
    expect(screen.getAllByRole('region', { name: 'EQ' })).toHaveLength(2);
    expect(track.getFX()[1].getId()).toBe(id);
  });
});


describe('FX import', () => {
  beforeEach(() => { KGCommandHistory.instance().clear(); useProjectStore.setState({ tracks: [] }); });
  const open = (source: KGTrack) => {
    fireEvent.click(screen.getByRole('button', { name: 'Import' }));
    const dialog = within(screen.getByRole('dialog'));
    fireEvent.click(dialog.getByRole('button', { name: new RegExp(source.getName()) }));
    return dialog;
  };
  it.each(['eq', 'reverb', 'compressor', 'limiter'] as const)('copies %s independently across track types, with undo/redo and save/load', type => {
    const source = new KGMidiTrack('Source', 101);
    const destination = new KGAudioTrack('Destination', 102);
    const effect = { eq: new KGEQFX([{ frequencyHz: 90, q: .7, gainDb: 4 }, { frequencyHz: 1600, q: 2, gainDb: -3 }, { frequencyHz: 11000, q: .8, gainDb: 5 }]),
      reverb: new KGReverbFX('plate', .73), compressor: new KGCompressorFX({ thresholdDb: -31, ratio: 7, attackMs: 22, releaseMs: 333, gainDb: 2 }),
      limiter: new KGLimiterFX({ thresholdDb: -7, inputGainDb: 3 }) }[type];
    effect.setEnabled(false);
    source.setFX([effect]);
    destination.setFX([new KGLimiterFX()]);
    const beforeId = destination.getFX()[0].getId();
    useProjectStore.setState({ tracks: [source, destination] });
    render(<TrackFxPanel track={destination} hidden={false} />);
    const audio = vi.spyOn(KGAudioInterface.instance(), 'setTrackFX');
    fireEvent.click(open(source).getAllByRole('row')[1]);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    const imported = destination.getFX()[1];
    const settings = instanceToPlain(effect); delete settings.id;
    const copySettings = instanceToPlain(imported); delete copySettings.id;
    expect(copySettings).toEqual(settings);
    expect(imported.getId()).not.toBe(effect.getId());
    expect(destination.getFX()[0].getId()).toBe(beforeId);
    expect(audio).toHaveBeenCalledWith('102', destination.getFX());
    effect.setEnabled(true);
    expect(imported.getEnabled()).toBe(false);
    act(() => { KGCommandHistory.instance().undo(); });
    expect(destination.getFX()).toHaveLength(1);
    act(() => { KGCommandHistory.instance().redo(); });
    expect(destination.getFX()[1].getId()).toBe(imported.getId());
    const restored = plainToInstance(KGAudioTrack, instanceToPlain(destination));
    expect(instanceToPlain(restored.getFX())).toEqual(instanceToPlain(destination.getFX()));
    audio.mockRestore();
  });
  it('imports the chosen duplicate from the current track and reads latest settings and chain', () => {
    const track = new KGAudioTrack('Current', 103);
    track.setFX([new KGReverbFX('room', .2), new KGReverbFX('spring', .8)]);
    useProjectStore.setState({ tracks: [track] });
    render(<TrackFxPanel track={track} hidden={false} />);
    const dialog = open(track);
    expect(dialog.getAllByRole('cell', { name: 'Reverb' })).toHaveLength(2);
    const selected = track.getFX()[1] as KGReverbFX;
    selected.setWet(.6);
    track.addFX(new KGLimiterFX());
    fireEvent.keyDown(dialog.getAllByRole('row')[2], { key: 'Enter' });
    expect(track.getFX()).toHaveLength(4);
    const imported = track.getFX()[3] as KGReverbFX;
    expect(imported.getReverbType()).toBe('spring'); expect(imported.getWet()).toBe(.6);
    expect(new Set(track.getFX().map(fx => fx.getId())).size).toBe(4);
    selected.setWet(.1); expect(imported.getWet()).toBe(.6);
  });
  it('imports from an audio track into a MIDI track', () => {
    const source = new KGAudioTrack('Audio source', 108); const target = new KGMidiTrack('MIDI destination', 109);
    source.setFX([new KGCompressorFX({ ratio: 6, gainDb: 4 })]);
    useProjectStore.setState({ tracks: [source, target] });
    render(<TrackFxPanel track={target} hidden={false} />);
    fireEvent.click(open(source).getAllByRole('row')[1]);
    expect((target.getFX()[0] as KGCompressorFX).getParameters()).toEqual((source.getFX()[0] as KGCompressorFX).getParameters());
    expect(target.getFX()[0].getId()).not.toBe(source.getFX()[0].getId());
  });
  it('does not import removed source FX or tracks', () => {
    const source = new KGMidiTrack('Source', 104); const target = new KGMidiTrack('Target', 105);
    source.setFX([new KGReverbFX()]);
    useProjectStore.setState({ tracks: [source, target] });
    render(<TrackFxPanel track={target} hidden={false} />);
    const row = open(source).getAllByRole('row')[1];
    source.setFX([]); fireEvent.click(row);
    expect(target.getFX()).toHaveLength(0); expect(screen.getByRole('dialog')).toBeInTheDocument();
    act(() => useProjectStore.setState({ tracks: [source] }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(target.getFX()).toHaveLength(0);
  });
  it('closes when the destination changes or the panel is hidden', () => {
    const first = new KGMidiTrack('First', 106); const second = new KGAudioTrack('Second', 107);
    useProjectStore.setState({ tracks: [first, second] });
    const view = render(<TrackFxPanel track={first} hidden={false} />);
    open(first); view.rerender(<TrackFxPanel track={second} hidden={false} />);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    open(second); view.rerender(<TrackFxPanel track={second} hidden />);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});


describe('FX presets in the track panel', () => {
  let track: KGMidiTrack;
  beforeEach(() => {
    KGCommandHistory.instance().clear();
    track = new KGMidiTrack('Destination', 200);
    useProjectStore.setState({ tracks: [track] });
    vi.mocked(fxPresetStorage.list).mockResolvedValue([]);
    vi.mocked(fxPresetStorage.save).mockReset(); vi.mocked(fxPresetStorage.save).mockResolvedValue();
    vi.mocked(showPrompt).mockReset(); vi.mocked(showConfirm).mockReset(); vi.mocked(showChoice).mockReset();
  });
  it('saves the click-time snapshot and starts with a blank name', async () => {
    const reverb = new KGReverbFX('spring', .8); reverb.setEnabled(false); track.setFX([reverb]);
    const expected = serializeFXPreset(track.getFX());
    let resolve!: (name: string) => void;
    vi.mocked(showPrompt).mockReturnValue(new Promise(done => { resolve = done; }));
    render(<TrackFxPanel track={track} hidden={false} />);
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    track.setFX([]);
    await act(async () => resolve('My Chain'));
    expect(showPrompt).toHaveBeenCalledWith('Enter a name for this FX preset:', '', { confirmLabel: 'Save', cancelLabel: 'Cancel' });
    expect(fxPresetStorage.save).toHaveBeenCalledWith('My Chain', expected);
  });
  it.each([true, false])('only overwrites when confirmed: %s', async confirmed => {
    vi.mocked(showPrompt).mockResolvedValue('Existing'); vi.mocked(showConfirm).mockResolvedValue(confirmed);
    vi.mocked(fxPresetStorage.save).mockRejectedValueOnce(new FXPresetExistsError('Existing'));
    render(<TrackFxPanel track={track} hidden={false} />);
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(showConfirm).toHaveBeenCalled());
    if (confirmed) await waitFor(() => expect(fxPresetStorage.save).toHaveBeenLastCalledWith('Existing', { version: 1, effects: [] }, true));
    else expect(fxPresetStorage.save).toHaveBeenCalledTimes(1);
  });
  it.each([' DEFAULT ', '.hidden', 'bad/name'])('rejects invalid or reserved preset name %s', async name => {
    vi.mocked(showPrompt).mockResolvedValue(name);
    render(<TrackFxPanel track={track} hidden={false} />);
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(showAlert).toHaveBeenCalled()); expect(fxPresetStorage.save).not.toHaveBeenCalled();
  });
  it('loads Default into an empty track without prompting and supports undo/redo', async () => {
    render(<TrackFxPanel track={track} hidden={false} />);
    fireEvent.click(screen.getByRole('button', { name: 'Load' }));
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Load' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(track.getFX().map(effect => effect.getType())).toEqual(['eq', 'reverb']); expect(showChoice).not.toHaveBeenCalled();
    act(() => { KGCommandHistory.instance().undo(); }); expect(track.getFX()).toEqual([]);
    act(() => { KGCommandHistory.instance().redo(); }); expect(track.getFX()).toHaveLength(2);
  });
  it.each(['replace', 'append', 'cancel'])('offers replace/append/cancel and honors %s', async action => {
    const existing = new KGLimiterFX(); track.setFX([existing]); vi.mocked(showChoice).mockResolvedValue(action === 'cancel' ? null : action);
    render(<TrackFxPanel track={track} hidden={false} />);
    fireEvent.click(screen.getByRole('button', { name: 'Load' }));
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Load' }));
    await waitFor(() => expect(showChoice).toHaveBeenCalled());
    await waitFor(() => expect(track.getFX().map(effect => effect.getType())).toEqual(action === 'replace' ? ['eq', 'reverb'] : action === 'append' ? ['limiter', 'eq', 'reverb'] : ['limiter']));
    expect(showChoice).toHaveBeenCalledWith(expect.any(String), [{ label: 'Replace', value: 'replace' }, { label: 'Append', value: 'append' }]);
    if (action === 'cancel') expect(screen.getByRole('dialog')).toBeInTheDocument();
  });
  it('does not apply a preset if the target changes during the choice', async () => {
    track.setFX([new KGLimiterFX()]); const other = new KGMidiTrack('Other', 201);
    useProjectStore.setState({ tracks: [track, other] });
    let resolve!: (action: string) => void; vi.mocked(showChoice).mockReturnValue(new Promise(done => { resolve = done; }));
    const view = render(<TrackFxPanel track={track} hidden={false} />);
    fireEvent.click(screen.getByRole('button', { name: 'Load' }));
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Load' }));
    await waitFor(() => expect(showChoice).toHaveBeenCalled());
    view.rerender(<TrackFxPanel track={other} hidden={false} />);
    await act(async () => resolve('replace'));
    expect(track.getFX().map(effect => effect.getType())).toEqual(['limiter']); expect(other.getFX()).toEqual([]);
  });
});
