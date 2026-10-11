import { act, render } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import type { LimiterLevel, LimiterMonitor } from '../../core/audio-interface/limiterPeakMonitor';
import LimiterHistory from './LimiterHistory';
import DynamicsHistory from './DynamicsHistory';
import { limiterHistoryPath } from './limiterHistoryPath';
const mocks = vi.hoisted(() => ({ open: vi.fn() }));
vi.mock('../../core/audio-interface/KGAudioInterface', () => ({ KGAudioInterface: { instance: () => ({ openLimiterMonitor: mocks.open, openCompressorMonitor: mocks.open }) } }));
const settings = { fps: 10, historySeconds: 5, minDb: -100, maxDb: 0 };
afterEach(() => { vi.useRealTimers(); vi.clearAllMocks(); });
it('renders incoming peaks and releases monitoring when collapsed', async () => {
  vi.useFakeTimers();
  let receive!: (level: LimiterLevel) => void;
  const dispose = vi.fn();
  mocks.open.mockImplementation(async (_track, _effect, _fps, callback) => {
    receive = callback; return { closed: false, dispose };
  });
  const props = { trackId: '1', effectId: 2, active: true, settings };
  const view = render(<div><LimiterHistory {...props} /></div>);
  await act(async () => {});
  expect(mocks.open).toHaveBeenCalledWith('1', 2, 10, expect.any(Function));
  act(() => { receive({ time: 1, peakDb: -20, reductionDb: -4 }); receive({ time: 1.1, peakDb: -10, reductionDb: -5 }); });
  expect(view.container.querySelector('path')?.getAttribute('d')).toContain('600.00,11.00');
  expect(view.container.querySelector('output')?.textContent).toBe('5.0 dB');
  view.rerender(<div><LimiterHistory {...props} active={false} /></div>);
  expect(dispose).toHaveBeenCalledOnce();
  expect(view.container.querySelector('path')?.hasAttribute('d')).toBe(false);
  expect(view.container.querySelector('output')?.textContent).toBe('0.0 dB');
});
it('disposes a monitor whose async module load finishes after track switching', async () => {
  vi.useFakeTimers();
  let resolve!: (monitor: LimiterMonitor) => void;
  mocks.open.mockReturnValueOnce(new Promise<LimiterMonitor>(done => { resolve = done; })).mockResolvedValue(null);
  const props = { trackId: '1', effectId: 2, active: true, settings };
  const view = render(<div><LimiterHistory {...props} /></div>);
  view.rerender(<div><LimiterHistory {...props} trackId="3" /></div>);
  const dispose = vi.fn();
  await act(async () => resolve({ closed: false, dispose }));
  expect(dispose).toHaveBeenCalledOnce();
});
it('maps levels and time to independent axes without invalid silence coordinates', () => {
  const d = limiterHistoryPath([{ time: 0, peakDb: -Infinity, reductionDb: 0 }, { time: 5, peakDb: -50, reductionDb: 0 }], settings);
  expect(d).toContain('L0.00,110.00');
  expect(d).toContain('L600.00,55.00');
  expect(d).not.toMatch(/Infinity|NaN/);
});

it('draws compressor reduction downward on its own scale and restarts on config changes', async () => {
  vi.useFakeTimers();
  let receive!: (level: LimiterLevel) => void;
  const dispose = vi.fn();
  mocks.open.mockImplementation(async (_track, _effect, _fps, callback) => {
    receive = callback; return { closed: false, dispose };
  });
  const props = { kind: 'compressor' as const, trackId: '1', effectId: 2, active: true,
    settings: { ...settings, reductionRangeDb: 30 } };
  const view = render(<div><DynamicsHistory {...props} /></div>);
  await act(async () => {});
  act(() => { receive({ time: 1, peakDb: -20, reductionDb: -15 }); });
  expect(view.container.querySelector('.dynamics-reduction-history')?.getAttribute('d')).toContain('L600.00,55.00');
  view.rerender(<div><DynamicsHistory {...props} settings={{ ...props.settings, fps: 20, reductionRangeDb: 15 }} /></div>);
  await act(async () => {});
  expect(dispose).toHaveBeenCalledOnce();
  expect(mocks.open).toHaveBeenLastCalledWith('1', 2, 20, expect.any(Function));
  act(() => { receive({ time: 1, peakDb: -20, reductionDb: -15 }); });
  expect(view.container.querySelector('.dynamics-reduction-history')?.getAttribute('d')).toContain('L600.00,110.00');
});

it('keeps both traces anchored at the left boundary after a full history window', async () => {
  vi.useFakeTimers();
  let receive!: (level: LimiterLevel) => void;
  mocks.open.mockImplementation(async (_track, _effect, _fps, callback) => {
    receive = callback; return { closed: false, dispose: vi.fn() };
  });
  const view = render(<div><DynamicsHistory kind="compressor" trackId="1" effectId={2} active
    settings={{ ...settings, historySeconds: 8, reductionRangeDb: 30 }} /></div>);
  await act(async () => {});
  // Include fractional sample-clock drift: the boundary generally falls between samples.
  for (let i = 0; i < 100; i++) {
    act(() => receive({ time: i * 0.10001, peakDb: -20, reductionDb: -15 }));
    if (i > 80) {
      expect(view.container.querySelector('path')?.getAttribute('d')).toMatch(/^M0\.00,110 L0\.00,22\.00/);
      expect(view.container.querySelector('.dynamics-reduction-history')?.getAttribute('d')).toMatch(/^M0\.00,0 L0\.00,55\.00/);
    }
  }
});
