import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import PianoKeys from './PianoKeys';
import { createMockMidiNote, createMockMidiRegion, createMockMidiTrack } from '../../test/utils/mock-data';

type TestLiveNoteActivityListener = (...args: [{ pitch: number; isNoteOn: boolean }]) => void;

const storeState = {
  tracks: [createMockMidiTrack({ id: 1 })],
  playheadPosition: 0,
  isPlaying: false,
};

const audioInterfaceMock = {
  getIsInitialized: vi.fn(),
  getIsAudioContextStarted: vi.fn(),
  startAudioContext: vi.fn(),
  triggerNoteAttack: vi.fn(),
  releaseNote: vi.fn(),
};

let liveNoteActivityListener: TestLiveNoteActivityListener | null = null;
const midiInputMock = {
  addLiveNoteActivityListener: vi.fn((listener: TestLiveNoteActivityListener) => {
    liveNoteActivityListener = listener;
  }),
  removeLiveNoteActivityListener: vi.fn((listener: TestLiveNoteActivityListener) => {
    if (liveNoteActivityListener === listener) {
      liveNoteActivityListener = null;
    }
  }),
};

vi.mock('../../stores/projectStore', () => ({
  useProjectStore: (selector: (...args: [typeof storeState]) => unknown) => selector(storeState),
}));

vi.mock('../../core/audio-interface/KGAudioInterface', () => ({
  KGAudioInterface: {
    instance: () => audioInterfaceMock,
  },
}));

vi.mock('../../core/midi-input/KGMidiInput', () => ({
  KGMidiInput: {
    instance: () => midiInputMock,
  },
}));

describe('PianoKeys', () => {
  const activeRegion = createMockMidiRegion({
    trackId: '1',
    notes: [createMockMidiNote({ id: 'note-c4', pitch: 60, startBeat: 0, endBeat: 2 })],
  });

  beforeEach(() => {
    storeState.tracks = [createMockMidiTrack({ id: 1 })];
    storeState.playheadPosition = 0;
    storeState.isPlaying = false;
    liveNoteActivityListener = null;
    vi.clearAllMocks();
    audioInterfaceMock.getIsInitialized.mockReturnValue(true);
    audioInterfaceMock.getIsAudioContextStarted.mockReturnValue(true);
    audioInterfaceMock.startAudioContext.mockResolvedValue(undefined);
  });

  it('shows dot and background feedback for mouse preview while held', () => {
    const { container } = render(<PianoKeys activeRegion={activeRegion} />);
    const key = container.querySelector('[data-note="C4"]') as HTMLElement;

    fireEvent.mouseDown(key);

    expect(key.className).toContain('visual-active');
    expect(screen.getByTestId('piano-key-dot-C4')).toBeInTheDocument();

    fireEvent.mouseUp(key);

    expect(key.className).not.toContain('visual-active');
    expect(screen.queryByTestId('piano-key-dot-C4')).not.toBeInTheDocument();
  });

  it('shows MIDI activity dot without background feedback', () => {
    const { container } = render(<PianoKeys activeRegion={activeRegion} />);
    const key = container.querySelector('[data-note="C4"]') as HTMLElement;
    expect(midiInputMock.addLiveNoteActivityListener).toHaveBeenCalledTimes(1);

    act(() => {
      liveNoteActivityListener?.({ pitch: 60, isNoteOn: true });
    });

    expect(screen.getByTestId('piano-key-dot-C4')).toBeInTheDocument();
    expect(key.className).not.toContain('visual-active');

    act(() => {
      liveNoteActivityListener?.({ pitch: 60, isNoteOn: false });
    });

    expect(screen.queryByTestId('piano-key-dot-C4')).not.toBeInTheDocument();
  });

  it('shows playback background feedback without dot for sounding notes in the active region', () => {
    storeState.isPlaying = true;
    storeState.playheadPosition = 1;

    const { container } = render(<PianoKeys activeRegion={activeRegion} />);
    const key = container.querySelector('[data-note="C4"]') as HTMLElement;

    expect(key.className).toContain('playback-active');
    expect(key.className).toContain('visual-active');
    expect(screen.queryByTestId('piano-key-dot-C4')).not.toBeInTheDocument();
  });

  it('preserves source-specific feedback while mouse, MIDI, and playback overlap', () => {
    storeState.isPlaying = true;
    storeState.playheadPosition = 1;

    const { container, rerender } = render(<PianoKeys activeRegion={activeRegion} />);
    const key = container.querySelector('[data-note="C4"]') as HTMLElement;

    fireEvent.mouseDown(key);
    act(() => {
      liveNoteActivityListener?.({ pitch: 60, isNoteOn: true });
    });

    expect(key.className).toContain('visual-active');
    expect(screen.getByTestId('piano-key-dot-C4')).toBeInTheDocument();

    storeState.isPlaying = false;
    rerender(<PianoKeys activeRegion={activeRegion} />);

    expect(key.className).toContain('visual-active');
    expect(screen.getByTestId('piano-key-dot-C4')).toBeInTheDocument();

    fireEvent.mouseUp(key);

    expect(key.className).not.toContain('visual-active');
    expect(screen.getByTestId('piano-key-dot-C4')).toBeInTheDocument();

    act(() => {
      liveNoteActivityListener?.({ pitch: 60, isNoteOn: false });
    });

    expect(screen.queryByTestId('piano-key-dot-C4')).not.toBeInTheDocument();
  });
});
