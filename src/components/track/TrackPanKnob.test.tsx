import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import TrackPanKnob from './TrackPanKnob';
import { KGMidiTrack } from '../../core/track/KGMidiTrack';
import { KGAudioTrack } from '../../core/track/KGAudioTrack';
import type { KGTrack } from '../../core/track/KGTrack';

const mocks = vi.hoisted(() => ({ audio: vi.fn(), update: vi.fn(), tracks: [] as KGTrack[] }));
vi.mock('../../core/audio-interface/KGAudioInterface', () => ({ KGAudioInterface: { instance: () => ({ setTrackPan: mocks.audio }) } }));
vi.mock('../../stores/projectStore', () => ({ useProjectStore: Object.assign(
  // eslint-disable-next-line no-unused-vars
  (selector: (state: { tracks: KGTrack[] }) => unknown) => selector({ tracks: mocks.tracks }),
  { getState: () => ({ updateTrackProperties: mocks.update }) },
) }));
vi.mock('../../i18n/useI18n', () => ({ useI18n: () => ({ t: (key: string, params?: { value: string }) => `${key}${params ? ` ${params.value}` : ''}` }) }));

describe('TrackPanKnob', () => {
  let track: KGMidiTrack;
  beforeEach(() => {
    vi.clearAllMocks();
    track = new KGMidiTrack('Lead', 1);
    mocks.tracks = [track];
    mocks.update.mockImplementation(async (_id: number, props: { pan: number }) => { track.setPan(props.pan); });
    // jsdom does not provide PointerEvent or pointer capture.
    class TestPointerEvent extends MouseEvent {
      pointerId: number;
      constructor(type: string, init: PointerEventInit = {}) { super(type, init); this.pointerId = init.pointerId ?? 1; }
    }
    vi.stubGlobal('PointerEvent', TestPointerEvent);
  });

  function knob() {
    const button = screen.getByRole('slider');
    Object.assign(button, { setPointerCapture: vi.fn(), hasPointerCapture: () => true, releasePointerCapture: vi.fn() });
    return button;
  }
  function down(button: HTMLElement) {
    fireEvent.pointerDown(button, { pointerId: 1, button: 0, clientX: 100, clientY: 100 });
  }

  it.each([new KGMidiTrack('MIDI', 1), new KGAudioTrack('Audio', 2)])('renders on track %j with centered indicator', target => {
    render(<TrackPanKnob track={target} />);
    expect(knob()).toHaveAttribute('aria-valuenow', '0');
    expect(knob().firstElementChild).toHaveStyle({ transform: 'rotate(0deg)' });
  });

  it.each([
    [150, 100, 0.5], [50, 100, -0.5], [100, 50, 0.5], [100, 150, -0.5],
    [120, 40, 0.6], [160, 120, 0.6], [400, 100, 1], [-200, 100, -1],
  ])('drags to (%s, %s) using the dominant axis and commits %s once', async (clientX, clientY, value) => {
    render(<TrackPanKnob track={track} />);
    const button = knob();
    down(button);
    fireEvent.pointerMove(button, { pointerId: 1, clientX, clientY });
    expect(mocks.audio).toHaveBeenLastCalledWith('1', value);
    expect(track.getPan()).toBe(0);
    expect(button).toHaveAttribute('aria-valuenow', String(value));
    expect(button.firstElementChild).toHaveStyle({ transform: `rotate(${value * 135}deg)` });
    expect(mocks.update).not.toHaveBeenCalled();
    await act(async () => { fireEvent.pointerUp(button, { pointerId: 1 }); });
    expect(mocks.update).toHaveBeenCalledExactlyOnceWith(1, { pan: value });
    expect(track.getPan()).toBe(value);
  });

  it('does not commit clicks or drags that return to the starting value', async () => {
    render(<TrackPanKnob track={track} />);
    const button = knob();
    await act(async () => { down(button); fireEvent.pointerUp(button, { pointerId: 1 }); });
    down(button);
    fireEvent.pointerMove(button, { pointerId: 1, clientX: 150, clientY: 100 });
    fireEvent.pointerMove(button, { pointerId: 1, clientX: 100, clientY: 100 });
    await act(async () => { fireEvent.pointerUp(button, { pointerId: 1 }); });
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it.each(['pointerCancel', 'lostPointerCapture'] as const)('restores base pan on %s without a command', event => {
    render(<TrackPanKnob track={track} />);
    const button = knob();
    down(button);
    fireEvent.pointerMove(button, { pointerId: 1, clientX: 170, clientY: 100 });
    fireEvent[event](button, { pointerId: 1 });
    expect(mocks.audio).toHaveBeenLastCalledWith('1', 0);
    expect(button).toHaveAttribute('aria-valuenow', '0');
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it('restores preview and releases capture when unmounted', () => {
    const view = render(<TrackPanKnob track={track} />);
    const button = knob();
    down(button);
    fireEvent.pointerMove(button, { pointerId: 1, clientX: 170, clientY: 100 });
    view.unmount();
    expect(mocks.audio).toHaveBeenLastCalledWith('1', 0);
    expect(button.releasePointerCapture).toHaveBeenCalledWith(1);
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it('resets on double-click and skips a reset when already centered', async () => {
    track.setPan(0.5);
    render(<TrackPanKnob track={track} />);
    const button = knob();
    await act(async () => { fireEvent.doubleClick(button); });
    expect(mocks.update).toHaveBeenCalledExactlyOnceWith(1, { pan: 0 });
    expect(button).toHaveAttribute('aria-valuenow', '0');
    await act(async () => { fireEvent.doubleClick(button); });
    expect(mocks.update).toHaveBeenCalledTimes(1);
  });

  it.each([['ArrowRight', 0.01], ['ArrowUp', 0.01], ['ArrowLeft', -0.01], ['ArrowDown', -0.01], ['Home', -1], ['End', 1]])('supports %s to set %s', async (key, value) => {
    render(<TrackPanKnob track={track} />);
    await act(async () => { fireEvent.keyDown(knob(), { key }); });
    expect(mocks.update).toHaveBeenCalledWith(1, { pan: value });
  });

  it('syncs external model changes, including undo/redo', () => {
    const view = render(<TrackPanKnob track={track} />);
    for (const value of [1, 0, -1]) {
      track.setPan(value);
      mocks.tracks = [track];
      view.rerender(<TrackPanKnob track={track} />);
      expect(knob()).toHaveAttribute('aria-valuenow', String(value));
    }
  });

  it('adds exactly 0.01 to an existing fractional base value', async () => {
    track.setPan(0.125);
    render(<TrackPanKnob track={track} />);
    await act(async () => { fireEvent.keyDown(knob(), { key: 'ArrowRight' }); });
    expect(track.getPan()).toBe(0.135);
  });

  it('restores model/audio state after a rejected commit', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    mocks.update.mockRejectedValueOnce(new Error('Cannot commit'));
    render(<TrackPanKnob track={track} />);
    const button = knob();
    down(button);
    fireEvent.pointerMove(button, { pointerId: 1, clientX: 150, clientY: 100 });
    await act(async () => { fireEvent.pointerUp(button, { pointerId: 1 }); });
    expect(button).toHaveAttribute('aria-valuenow', '0');
    expect(mocks.audio).toHaveBeenLastCalledWith('1', 0);
    error.mockRestore();
  });

  it('isolates dragging, clicking, reset and keyboard events from track handlers', async () => {
    const parent = vi.fn();
    render(<div onPointerDown={parent} onPointerMove={parent} onPointerUp={parent} onMouseDown={parent} onClick={parent} onDoubleClick={parent} onKeyDown={parent} onDragStart={parent}><TrackPanKnob track={track} /></div>);
    const button = knob();
    await act(async () => {
      down(button);
      fireEvent.pointerUp(button, { pointerId: 1 });
      fireEvent.mouseDown(button);
      fireEvent.click(button);
      fireEvent.doubleClick(button);
      fireEvent.keyDown(button, { key: 'ArrowUp' });
      fireEvent.dragStart(button);
    });
    expect(parent).not.toHaveBeenCalled();
  });
});
