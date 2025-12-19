import 'reflect-metadata';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App.tsx';
import { KGCore } from './core/KGCore';
import { KGAudioInterface } from './core/audio-interface/KGAudioInterface';
import { KGMidiInput } from './core/midi-input/KGMidiInput';
import { KGDebugger } from './core/KGDebugger';

// Initialize KGCore instance
await KGCore.instance().initialize();

// Initialize KGMidiInput instance
await KGMidiInput.instance().initialize();

// Attach debugger to global window in development mode
if (import.meta.env.DEV) {
  (window as unknown as { KGDebugger: KGDebugger }).KGDebugger = KGDebugger.instance();
  console.log('🔧 KGDebugger attached to window - try: KGDebugger.help()');
}

// Start audio context on first user interaction
let audioContextStarted = false;
const tryStartAudioContext = async () => {
  if (!audioContextStarted) {
    audioContextStarted = true;
    try {
      const audioInterface = KGAudioInterface.instance();
      if (!audioInterface.getIsAudioContextStarted()) {
        await audioInterface.startAudioContext();
        console.log('Audio context started on first user interaction');
      }
    } catch (error) {
      console.log('Audio context start failed:', error);
      audioContextStarted = false; // Allow retry
    }
  }
};

// Request MIDI access on first user interaction
let midiAccessRequested = false;
const tryRequestMIDIAccess = async () => {
  if (!midiAccessRequested) {
    midiAccessRequested = true;
    try {
      const midiInput = KGMidiInput.instance();
      if (!midiInput.getMIDIAccess()) {
        await midiInput.requestMIDIAccess();
        console.log('MIDI access granted on first user interaction');
      }
    } catch (error) {
      console.log('MIDI access failed:', error);
      midiAccessRequested = false; // Allow retry
    }
  }
};

// Combined handler for first user interaction
const handleFirstInteraction = async () => {
  await tryStartAudioContext();
  await tryRequestMIDIAccess();

  // Remove listeners after first attempt
  document.removeEventListener('click', handleFirstInteraction);
  document.removeEventListener('touchstart', handleFirstInteraction);
  document.removeEventListener('keydown', handleFirstInteraction);
};

// Listen for first user interaction
document.addEventListener('click', handleFirstInteraction, { passive: true });
document.addEventListener('touchstart', handleFirstInteraction, { passive: true });
document.addEventListener('keydown', handleFirstInteraction, { passive: true });

// Add event listener for beforeunload event
window.addEventListener('beforeunload', (event) => {
  // Cancel the event
  event.preventDefault();
  // Chrome requires returnValue to be set
  event.returnValue = '';
  
  // The browser will show a standard confirmation dialog
  // with a message like "Changes you made may not be saved."
  // Note: Custom messages are no longer supported in modern browsers for security reasons
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
