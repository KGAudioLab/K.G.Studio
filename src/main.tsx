import 'reflect-metadata';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './styles/variables.css';
import './index.css';
import App from './App.tsx';
import DialogProvider from './components/common/DialogProvider';
import { KGCore } from './core/KGCore';
import { KGAudioInterface } from './core/audio-interface/KGAudioInterface';
import { KGMidiInput } from './core/midi-input/KGMidiInput';
import { KGDebugger } from './core/KGDebugger';

const root = createRoot(document.getElementById('root')!);

// OPFS requires a secure context (HTTPS or localhost). Show a clear error instead of crashing.
if (!window.isSecureContext) {
  root.render(
    <StrictMode>
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          height: '100vh',
          gap: '16px',
          padding: '32px',
          textAlign: 'center',
          color: 'rgba(255,255,255,0.87)',
          background: '#1e1e1e',
          fontFamily: "'Segoe UI', Tahoma, Geneva, Verdana, sans-serif",
        }}
      >
        <div style={{ fontSize: '48px' }}>🔒</div>
        <h1 style={{ fontSize: '22px', fontWeight: 600, margin: 0 }}>Secure Context Required</h1>
        <p style={{ fontSize: '14px', color: 'rgba(255,255,255,0.55)', maxWidth: '480px', lineHeight: 1.6 }}>
          K.G.Studio uses the browser&apos;s Origin Private File System (OPFS) to store projects,
          which requires a <strong style={{ color: 'rgba(255,255,255,0.8)' }}>secure context</strong>.
        </p>
        <div
          style={{
            background: '#2a2a2a',
            border: '1px solid #444',
            borderRadius: '8px',
            padding: '16px 24px',
            fontSize: '13px',
            lineHeight: 2,
            color: 'rgba(255,255,255,0.7)',
          }}
        >
          <div>Use <code style={{ color: '#7cb8ff' }}>https://</code> instead of <code style={{ color: '#f28b82' }}>http://</code></div>
          <div>or access via <code style={{ color: '#7cb8ff' }}>localhost</code> / <code style={{ color: '#7cb8ff' }}>127.0.0.1</code></div>
        </div>
      </div>
    </StrictMode>,
  );
} else {
// Initialize KGCore instance
await KGCore.instance().initialize();

// Initialize KGMidiInput instance
await KGMidiInput.instance().initialize();

// Attach debugger to global window in development mode
if (import.meta.env.DEV) {
  const dbg = KGDebugger.instance();
  (window as unknown as { KGDebugger: KGDebugger; sh: () => Promise<void> }).KGDebugger = dbg;
  (window as unknown as { sh: () => Promise<void> }).sh = () => dbg.startShell();
  console.log('🔧 KGDebugger attached to window - try: KGDebugger.help() or sh()');
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

  root.render(
    <StrictMode>
      <DialogProvider>
        <App />
      </DialogProvider>
    </StrictMode>,
  );
} // end isSecureContext else
