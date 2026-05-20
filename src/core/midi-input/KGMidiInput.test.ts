import { beforeEach, describe, expect, it, vi } from 'vitest';
import { KGAudioTrack } from '../track/KGAudioTrack';
import { KGMidiTrack } from '../track/KGMidiTrack';

type TestMidiEvent = { data: Uint8Array };
type TestLiveNoteActivityListener = (...args: [{ pitch: number; isNoteOn: boolean }]) => void;

const { getStateMock, audioInterfaceMock } = vi.hoisted(() => ({
  getStateMock: vi.fn(),
  audioInterfaceMock: {
    getIsInitialized: vi.fn(),
    getIsAudioContextStarted: vi.fn(),
    startAudioContext: vi.fn(),
    triggerLiveMidiNoteAttack: vi.fn(),
    releaseLiveMidiNote: vi.fn(),
    setLiveMidiPitchBend: vi.fn(),
    setLiveMidiExpression: vi.fn(),
    setLiveMidiSustain: vi.fn(),
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
    getStateMock.mockReturnValue({
      selectedTrackId: '1',
      tracks: [new KGMidiTrack('Track 1', 1)],
    });
    audioInterfaceMock.getIsInitialized.mockReturnValue(true);
    audioInterfaceMock.getIsAudioContextStarted.mockReturnValue(true);
    audioInterfaceMock.startAudioContext.mockResolvedValue(undefined);
    (KGMidiInput as unknown as { _instance: KGMidiInput | null })._instance = null;
  });

  it('routes live MIDI note on/off through the live monitoring path', () => {
    const midiInput = KGMidiInput.instance() as unknown as {
      handleMIDIMessage: (...args: [TestMidiEvent]) => void;
      addLiveNoteActivityListener: (...args: [TestLiveNoteActivityListener]) => void;
    };
    const listener = vi.fn();

    midiInput.addLiveNoteActivityListener(listener);

    midiInput.handleMIDIMessage({ data: new Uint8Array([0x90, 60, 100]) });
    midiInput.handleMIDIMessage({ data: new Uint8Array([0x80, 60, 0]) });

    expect(audioInterfaceMock.triggerLiveMidiNoteAttack).toHaveBeenCalledWith('1', 60, 100);
    expect(audioInterfaceMock.releaseLiveMidiNote).toHaveBeenCalledWith('1', 60);
    expect(listener).toHaveBeenNthCalledWith(1, { pitch: 60, isNoteOn: true });
    expect(listener).toHaveBeenNthCalledWith(2, { pitch: 60, isNoteOn: false });
  });

  it('stops notifying removed live note activity listeners', () => {
    const midiInput = KGMidiInput.instance() as unknown as {
      handleMIDIMessage: (...args: [TestMidiEvent]) => void;
      addLiveNoteActivityListener: (...args: [TestLiveNoteActivityListener]) => void;
      removeLiveNoteActivityListener: (...args: [TestLiveNoteActivityListener]) => void;
    };
    const listener = vi.fn();

    midiInput.addLiveNoteActivityListener(listener);
    midiInput.removeLiveNoteActivityListener(listener);
    midiInput.handleMIDIMessage({ data: new Uint8Array([0x90, 60, 100]) });

    expect(listener).not.toHaveBeenCalled();
  });

  it('latches live note ownership to the note-on track', () => {
    const midiInput = KGMidiInput.instance() as unknown as {
      handleMIDIMessage: (...args: [TestMidiEvent]) => void;
    };

    midiInput.handleMIDIMessage({ data: new Uint8Array([0x90, 60, 100]) });
    getStateMock.mockReturnValue({
      selectedTrackId: '2',
      tracks: [new KGMidiTrack('Track 1', 1), new KGMidiTrack('Track 2', 2)],
    });

    midiInput.handleMIDIMessage({ data: new Uint8Array([0x80, 60, 0]) });

    expect(audioInterfaceMock.releaseLiveMidiNote).toHaveBeenCalledWith('1', 60);
  });

  it('normalizes MIDI pitch bend and forwards it to the selected track', () => {
    const midiInput = KGMidiInput.instance() as unknown as {
      handleMIDIMessage: (...args: [TestMidiEvent]) => void;
    };

    midiInput.handleMIDIMessage({ data: new Uint8Array([0xe0, 0x00, 0x40]) });
    midiInput.handleMIDIMessage({ data: new Uint8Array([0xe0, 0x7f, 0x7f]) });

    expect(audioInterfaceMock.setLiveMidiPitchBend).toHaveBeenNthCalledWith(1, '1', 0);
    expect(audioInterfaceMock.setLiveMidiPitchBend).toHaveBeenCalledTimes(2);
    expect(audioInterfaceMock.setLiveMidiPitchBend.mock.calls[1]?.[0]).toBe('1');
    expect(audioInterfaceMock.setLiveMidiPitchBend.mock.calls[1]?.[1]).toBeCloseTo(8191 / 8192, 5);
  });

  it('maps supported CC messages to live expression and sustain for standard pedals', () => {
    const midiInput = KGMidiInput.instance() as unknown as {
      handleMIDIMessage: (...args: [TestMidiEvent]) => void;
    };

    midiInput.handleMIDIMessage({ data: new Uint8Array([0xb0, 0x01, 0x20]) });
    midiInput.handleMIDIMessage({ data: new Uint8Array([0xb0, 0x02, 0x30]) });
    midiInput.handleMIDIMessage({ data: new Uint8Array([0xb0, 0x07, 0x40]) });
    midiInput.handleMIDIMessage({ data: new Uint8Array([0xb0, 0x0b, 0x50]) });
    midiInput.handleMIDIMessage({ data: new Uint8Array([0xb0, 0x40, 0x7f]) });
    midiInput.handleMIDIMessage({ data: new Uint8Array([0xb0, 0x40, 0x00]) });

    expect(audioInterfaceMock.setLiveMidiExpression).toHaveBeenCalledTimes(4);
    expect(audioInterfaceMock.setLiveMidiExpression).toHaveBeenNthCalledWith(1, '1', 0x20 / 127);
    expect(audioInterfaceMock.setLiveMidiExpression).toHaveBeenNthCalledWith(4, '1', 0x50 / 127);
    expect(audioInterfaceMock.setLiveMidiSustain).toHaveBeenNthCalledWith(1, '1', true);
    expect(audioInterfaceMock.setLiveMidiSustain).toHaveBeenNthCalledWith(2, '1', false);
  });

  it('calibrates inverted sustain pedals from the first observed CC64 message', () => {
    const midiInput = KGMidiInput.instance() as unknown as {
      handleMIDIMessage: (...args: [TestMidiEvent]) => void;
    };

    midiInput.handleMIDIMessage({ data: new Uint8Array([0xb0, 0x40, 0x00]) });
    midiInput.handleMIDIMessage({ data: new Uint8Array([0xb0, 0x40, 0x7f]) });

    expect(audioInterfaceMock.setLiveMidiSustain).toHaveBeenNthCalledWith(1, '1', true);
    expect(audioInterfaceMock.setLiveMidiSustain).toHaveBeenNthCalledWith(2, '1', false);
  });

  it('ignores live MIDI input when the selected track is not a MIDI track', () => {
    getStateMock.mockReturnValue({
      selectedTrackId: '1',
      tracks: [new KGAudioTrack('Audio Track', 1)],
    });

    const midiInput = KGMidiInput.instance() as unknown as {
      handleMIDIMessage: (...args: [TestMidiEvent]) => void;
    };

    midiInput.handleMIDIMessage({ data: new Uint8Array([0x90, 60, 100]) });
    midiInput.handleMIDIMessage({ data: new Uint8Array([0xe0, 0x00, 0x40]) });
    midiInput.handleMIDIMessage({ data: new Uint8Array([0xb0, 0x40, 0x7f]) });

    expect(audioInterfaceMock.triggerLiveMidiNoteAttack).not.toHaveBeenCalled();
    expect(audioInterfaceMock.setLiveMidiPitchBend).not.toHaveBeenCalled();
    expect(audioInterfaceMock.setLiveMidiSustain).not.toHaveBeenCalled();
  });
});
