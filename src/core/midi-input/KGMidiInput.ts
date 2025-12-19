import { KGAudioInterface } from '../audio-interface/KGAudioInterface';
import { useProjectStore } from '../../stores/projectStore';

/**
 * KGMidiInput - MIDI input manager for the DAW
 * Implements the singleton pattern for global MIDI device management
 * Handles Web MIDI API integration for keyboard input
 */
export class KGMidiInput {
  // Private static instance for singleton pattern
  private static _instance: KGMidiInput | null = null;

  // MIDI state
  private midiAccess: MIDIAccess | null = null;
  private isInitialized: boolean = false;
  private connectedInputs: Map<string, MIDIInput> = new Map();

  // Private constructor to prevent direct instantiation
  private constructor() {
    console.log("KGMidiInput initialized");
  }

  /**
   * Get the singleton instance of KGMidiInput
   * Creates the instance if it doesn't exist yet
   */
  public static instance(): KGMidiInput {
    if (!KGMidiInput._instance) {
      KGMidiInput._instance = new KGMidiInput();
    }
    return KGMidiInput._instance;
  }

  /**
   * Initialize the MIDI input manager
   */
  public async initialize(): Promise<void> {
    if (this.isInitialized) {
      return;
    }

    try {
      console.log("KGMidiInput ready for MIDI access request");
      this.isInitialized = true;
    } catch (error) {
      console.error("Failed to initialize MIDI input manager:", error);
      throw error;
    }
  }

  /**
   * Request MIDI access from browser
   * This must be called after a user gesture (click, keydown, etc.)
   */
  public async requestMIDIAccess(): Promise<void> {
    if (this.midiAccess) {
      console.log("MIDI access already granted");
      return;
    }

    try {
      // Check if Web MIDI API is available
      if (!navigator.requestMIDIAccess) {
        throw new Error("Web MIDI API is not supported in this browser");
      }

      // Request MIDI access
      this.midiAccess = await navigator.requestMIDIAccess();
      console.log("MIDI access granted");

      // Set up device listeners
      this.setupDeviceListeners();

      // Connect to all existing inputs
      this.connectToAllInputs();
    } catch (error) {
      console.error("Failed to request MIDI access:", error);
      throw error;
    }
  }

  /**
   * Set up listeners for MIDI device connection/disconnection
   */
  private setupDeviceListeners(): void {
    if (!this.midiAccess) {
      return;
    }

    this.midiAccess.onstatechange = (event: MIDIConnectionEvent) => {
      const port = event.port;

      if (port && port.type === "input") {
        if (port.state === "connected") {
          console.log(`MIDI device connected: ${port.name}`);
          this.connectToInput(port as MIDIInput);
        } else if (port.state === "disconnected") {
          console.log(`MIDI device disconnected: ${port.name}`);
          this.disconnectFromInput(port.id);
        }
      }
    };
  }

  /**
   * Connect to all available MIDI inputs
   */
  private connectToAllInputs(): void {
    if (!this.midiAccess) {
      return;
    }

    this.midiAccess.inputs.forEach((input) => {
      this.connectToInput(input);
    });

    console.log(`Connected to ${this.connectedInputs.size} MIDI input device(s)`);
  }

  /**
   * Connect to a specific MIDI input
   */
  private connectToInput(input: MIDIInput): void {
    // Set up message handler
    input.onmidimessage = (event: MIDIMessageEvent) => {
      this.handleMIDIMessage(event);
    };

    // Store the input
    this.connectedInputs.set(input.id, input);

    console.log(`Listening to MIDI input: ${input.name} (${input.id})`);
  }

  /**
   * Disconnect from a specific MIDI input
   */
  private disconnectFromInput(inputId: string): void {
    const input = this.connectedInputs.get(inputId);
    if (input) {
      input.onmidimessage = null;
    }
    this.connectedInputs.delete(inputId);
  }

  /**
   * Handle incoming MIDI messages
   */
  private handleMIDIMessage(event: MIDIMessageEvent): void {
    if (!event.data) {
      return;
    }

    const [status, pitch, velocity] = event.data;

    // Extract command (high nibble) and channel (low nibble)
    const command = status & 0xf0;
    const channel = status & 0x0f;

    // Note On: command = 0x90 (144)
    if (command === 0x90 && velocity > 0) {
      console.log(`MIDI Note On: pitch=${pitch}, velocity=${velocity}, channel=${channel}`);
      this.triggerNoteOn(pitch, velocity);
    }
    // Note Off: command = 0x80 (128) or Note On with velocity 0
    else if (command === 0x80 || (command === 0x90 && velocity === 0)) {
      console.log(`MIDI Note Off: pitch=${pitch}, channel=${channel}`);
      this.triggerNoteOff(pitch);
    }
    // Control Change: command = 0xB0 (176)
    else if (command === 0xb0) {
      console.log(`MIDI Control Change: controller=${pitch}, value=${velocity}, channel=${channel}`);
      // TODO: Handle control changes (modulation, sustain pedal, etc.)
    }
    // Pitch Bend: command = 0xE0 (224)
    else if (command === 0xe0) {
      const pitchBendValue = (velocity << 7) | pitch;
      console.log(`MIDI Pitch Bend: value=${pitchBendValue}, channel=${channel}`);
      // TODO: Handle pitch bend
    }
  }

  /**
   * Trigger note on - play sound for MIDI note
   */
  private triggerNoteOn(pitch: number, velocity: number): void {
    try {
      // Get the selected track ID from the store
      const selectedTrackId = useProjectStore.getState().selectedTrackId;

      // Don't play if no track is selected
      if (!selectedTrackId) {
        console.log('No track selected - MIDI input ignored');
        return;
      }

      // Get audio interface and start playing the note
      const audioInterface = KGAudioInterface.instance();
      if (audioInterface.getIsInitialized()) {
        // Try to start audio context if not started yet
        if (!audioInterface.getIsAudioContextStarted()) {
          audioInterface.startAudioContext().catch(() => {
            // Silently fail if still not allowed - browser policy
          });
        }

        // Trigger note attack if audio context is ready
        if (audioInterface.getIsAudioContextStarted()) {
          audioInterface.triggerNoteAttack(selectedTrackId, pitch, velocity);
          console.log(`MIDI triggered note attack: pitch=${pitch}, velocity=${velocity}, track=${selectedTrackId}`);
        }
      }
    } catch (error) {
      console.error(`Error triggering MIDI note on (pitch ${pitch}):`, error);
    }
  }

  /**
   * Trigger note off - stop sound for MIDI note
   */
  private triggerNoteOff(pitch: number): void {
    try {
      // Get the selected track ID from the store
      const selectedTrackId = useProjectStore.getState().selectedTrackId;

      // Don't try to release if no track is selected
      if (!selectedTrackId) {
        return;
      }

      // Get audio interface and stop playing the note
      const audioInterface = KGAudioInterface.instance();
      if (audioInterface.getIsInitialized() && audioInterface.getIsAudioContextStarted()) {
        audioInterface.releaseNote(selectedTrackId, pitch);
        console.log(`MIDI released note: pitch=${pitch}, track=${selectedTrackId}`);
      }
    } catch (error) {
      console.error(`Error triggering MIDI note off (pitch ${pitch}):`, error);
    }
  }

  /**
   * Clean up MIDI resources
   */
  public async dispose(): Promise<void> {
    try {
      // Disconnect from all inputs
      this.connectedInputs.forEach((input, inputId) => {
        this.disconnectFromInput(inputId);
      });
      this.connectedInputs.clear();

      // Clear MIDI access
      if (this.midiAccess) {
        this.midiAccess.onstatechange = null;
        this.midiAccess = null;
      }

      this.isInitialized = false;

      console.log("MIDI resources disposed successfully");
    } catch (error) {
      console.error("Error disposing MIDI resources:", error);
    }
  }

  // ===== GETTERS =====

  public getIsInitialized(): boolean {
    return this.isInitialized;
  }

  public getMIDIAccess(): MIDIAccess | null {
    return this.midiAccess;
  }

  public getConnectedInputs(): MIDIInput[] {
    return Array.from(this.connectedInputs.values());
  }

  public getConnectedInputCount(): number {
    return this.connectedInputs.size;
  }
}
