import 'reflect-metadata';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { instanceToPlain, plainToInstance } from 'class-transformer';
import { KGCommandHistory } from '../../core/commands/KGCommandHistory';
import { KGEQFX, KGReverbFX, KGCompressorFX, KGLimiterFX } from '../../core/fx';
import { KGTrack } from '../../core/track/KGTrack';
import { showConfirm } from '../../util/dialogUtil';
import TrackFxPanel from './TrackFxPanel';
import { ConfigManager } from '../../core/config/ConfigManager';
import config from '../../../public/config.json';

vi.mock('../../util/dialogUtil', () => ({ showConfirm: vi.fn() }));

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
