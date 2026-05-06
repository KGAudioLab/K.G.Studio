import { beforeEach, describe, expect, it, vi } from 'vitest';

const { getStateMock, audioInterfaceMock } = vi.hoisted(() => ({
  getStateMock: vi.fn(),
  audioInterfaceMock: {
    getIsInitialized: vi.fn(),
    getIsAudioContextStarted: vi.fn(),
    startAudioContext: vi.fn(),
    triggerLiveMidiNoteAttack: vi.fn(),
    releaseLiveMidiNote: vi.fn(),
    setLiveMidiPitchBend: vi.fn(),
  },
}));

vi.mock('../../stores/projectStore', () => ({
  useProjectStore: {
    getState: getStateMock,
  },
}));

vi.mock('../audio-interface/KGAudioInterface', () => ({
  KGAudioInterface: {
    instance: () => audioInterfaceMock,
  },
}));

import { KGMidiInput } from './KGMidiInput';

describe('KGMidiInput pitch bend', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getStateMock.mockReturnValue({ selectedTrackId: 'track-1' });
    audioInterfaceMock.getIsInitialized.mockReturnValue(true);
    audioInterfaceMock.getIsAudioContextStarted.mockReturnValue(true);
    audioInterfaceMock.startAudioContext.mockResolvedValue(undefined);
    (KGMidiInput as unknown as { _instance: KGMidiInput | null })._instance = null;
  });

  it('routes live MIDI note on/off through the live monitoring path', () => {
    const midiInput = KGMidiInput.instance() as unknown as {
      handleMIDIMessage: (event: { data: Uint8Array }) => void;
    };

    midiInput.handleMIDIMessage({ data: new Uint8Array([0x90, 60, 100]) });
    midiInput.handleMIDIMessage({ data: new Uint8Array([0x80, 60, 0]) });

    expect(audioInterfaceMock.triggerLiveMidiNoteAttack).toHaveBeenCalledWith('track-1', 60, 100);
    expect(audioInterfaceMock.releaseLiveMidiNote).toHaveBeenCalledWith('track-1', 60);
  });

  it('normalizes MIDI pitch bend and forwards it to the selected track', () => {
    const midiInput = KGMidiInput.instance() as unknown as {
      handleMIDIMessage: (event: { data: Uint8Array }) => void;
    };

    midiInput.handleMIDIMessage({ data: new Uint8Array([0xe0, 0x00, 0x40]) });
    midiInput.handleMIDIMessage({ data: new Uint8Array([0xe0, 0x7f, 0x7f]) });

    expect(audioInterfaceMock.setLiveMidiPitchBend).toHaveBeenNthCalledWith(1, 'track-1', 0);
    expect(audioInterfaceMock.setLiveMidiPitchBend).toHaveBeenCalledTimes(2);
    expect(audioInterfaceMock.setLiveMidiPitchBend.mock.calls[1]?.[0]).toBe('track-1');
    expect(audioInterfaceMock.setLiveMidiPitchBend.mock.calls[1]?.[1]).toBeCloseTo(8191 / 8192, 5);
  });
});
