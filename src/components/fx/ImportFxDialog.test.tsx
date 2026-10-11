import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import ImportFxDialog from './ImportFxDialog';
import { KGTrack, TrackType } from '../../core/track/KGTrack';
import { KGMidiTrack } from '../../core/track/KGMidiTrack';
import { KGAudioTrack } from '../../core/track/KGAudioTrack';
import { KGEQFX, KGReverbFX, KGCompressorFX, KGLimiterFX } from '../../core/fx';
import { fxParameterSummary } from './fxParameterSummary';
import { translate } from '../../i18n/translate';

const t = (key: string, params?: Record<string, string | number>) => translate(key, params, 'en_us');

describe('ImportFxDialog', () => {
  it('starts unselected, keeps headers visible, lists MIDI/audio in order and handles empty tracks', () => {
    const midi = new KGMidiTrack('Lead with a very long name', 1); const audio = new KGAudioTrack('Audio', 2);
    render(<ImportFxDialog tracks={[midi, new KGTrack('Chord', 3, TrackType.Chords), audio]} onClose={vi.fn()} onImport={vi.fn()} />);
    expect(screen.getByText('Select a track to view its FX.')).toBeInTheDocument();
    expect(screen.getAllByRole('columnheader').map(node => node.textContent)).toEqual(['FX Name', 'Parameters']);
    const buttons = screen.getAllByRole('button');
    expect(buttons.slice(1).map(node => node.textContent)).toEqual(['Lead with a very long nameMIDI Track', 'AudioAudio Track']);
    expect(buttons[1]).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByText(midi.getName())).toHaveAttribute('title', midi.getName());
    fireEvent.click(buttons[2]);
    expect(screen.getByText('This track has no FX.')).toBeInTheDocument();
  });
  it('shows complete summaries in hover text and activates the precise row with Space', () => {
    const track = new KGMidiTrack('Lead', 1); const onImport = vi.fn();
    const first = new KGReverbFX('hall', .2); const second = new KGReverbFX('plate', .6); second.setEnabled(false);
    track.setFX([first, second]);
    render(<ImportFxDialog tracks={[track]} onClose={vi.fn()} onImport={onImport} />);
    fireEvent.click(screen.getByRole('button', { name: 'Lead MIDI Track' }));
    const rows = screen.getAllByRole('row');
    expect(within(rows[2]).getAllByRole('cell')[1]).toHaveAttribute('title', 'Bypassed · Reverb type: Plate · Dry/Wet: 60%');
    fireEvent.keyDown(rows[2], { key: ' ' });
    expect(onImport).toHaveBeenCalledExactlyOnceWith(track, second.getId());
  });
  it('traps focus, isolates shortcuts, and restores focus after Escape', () => {
    const source = new KGMidiTrack('Lead', 1); source.setFX([new KGReverbFX()]);
    const onClose = vi.fn();
    const previous = document.createElement('button'); document.body.append(previous); previous.focus();
    const view = render(<ImportFxDialog tracks={[source]} onClose={onClose} onImport={vi.fn()} />);
    const close = screen.getByRole('button', { name: 'Close dialog' });
    expect(close).toHaveFocus();
    fireEvent.click(screen.getByRole('button', { name: 'Lead MIDI Track' }));
    const row = screen.getAllByRole('row')[1]; row.focus();
    fireEvent.keyDown(row, { key: 'Tab' }); expect(close).toHaveFocus();
    fireEvent.keyDown(close, { key: 'Tab', shiftKey: true }); expect(row).toHaveFocus();
    const shortcut = vi.fn(); window.addEventListener('keydown', shortcut);
    fireEvent.keyDown(row, { key: 'Delete' }); expect(shortcut).not.toHaveBeenCalled();
    fireEvent.keyDown(row, { key: 'Escape' }); expect(onClose).toHaveBeenCalledOnce();
    window.removeEventListener('keydown', shortcut);
    view.unmount(); expect(previous).toHaveFocus(); previous.remove();
  });
  it('dismisses with X or a complete backdrop click, but not a drag from inside', () => {
    const onClose = vi.fn();
    render(<ImportFxDialog tracks={[]} onClose={onClose} onImport={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Close dialog' })); expect(onClose).toHaveBeenCalledTimes(1);
    const dialog = screen.getByRole('dialog'); const backdrop = dialog.parentElement!;
    fireEvent.mouseDown(dialog); fireEvent.click(backdrop); expect(onClose).toHaveBeenCalledTimes(1);
    fireEvent.mouseDown(backdrop); fireEvent.click(backdrop); expect(onClose).toHaveBeenCalledTimes(2);
  });
  it('clears the displayed source when it is removed', () => {
    const source = new KGMidiTrack('Lead', 1); source.setFX([new KGLimiterFX()]);
    const view = render(<ImportFxDialog tracks={[source]} onClose={vi.fn()} onImport={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Lead MIDI Track' }));
    view.rerender(<ImportFxDialog tracks={[]} onClose={vi.fn()} onImport={vi.fn()} />);
    expect(screen.getByText('Select a track to view its FX.')).toBeInTheDocument();
    expect(screen.getAllByRole('row')).toHaveLength(1);
  });
  it('formats every parameter for EQ and dynamics and localizes labels', () => {
    const eq = fxParameterSummary(new KGEQFX(), t);
    for (const band of ['Band 1:', 'Band 2:', 'Band 3:']) expect(eq).toContain(band);
    expect(eq.match(/Q:/g)).toHaveLength(3); expect(eq.match(/Gain:/g)).toHaveLength(3);
    const compressor = fxParameterSummary(new KGCompressorFX({ thresholdDb: -30, ratio: 4, attackMs: 5, releaseMs: 200, gainDb: 2 }), t);
    expect(compressor).toBe('Enabled · Threshold: -30.0 dB · Ratio: 4.0:1 · Attack: 5.0 ms · Release: 200 ms · Gain: 2.0 dB');
    expect(fxParameterSummary(new KGLimiterFX({ inputGainDb: 3, thresholdDb: -2 }), t)).toBe('Enabled · Input Gain: 3.0 dB · Threshold: -2.0 dB');
    for (const locale of ['fr_fr', 'zh_cn', 'zh_hk'] as const) {
      const localized = fxParameterSummary(new KGReverbFX(), (key, params) => translate(key, params, locale));
      expect(localized).not.toContain('fx.'); expect(localized).not.toContain('Enabled');
    }
  });
});
