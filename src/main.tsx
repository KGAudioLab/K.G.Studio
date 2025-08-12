import 'reflect-metadata';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App.tsx';
import { KGCore } from './core/KGCore';
import { KGAudioInterface } from './core/audio-interface/KGAudioInterface';
import { KGDebugger } from './core/KGDebugger';

// Initialize KGCore instance
await KGCore.instance().initialize();

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
    // Remove listeners after first attempt (whether successful or not)
    document.removeEventListener('click', tryStartAudioContext);
    document.removeEventListener('touchstart', tryStartAudioContext);
    document.removeEventListener('keydown', tryStartAudioContext);
  }
};

// Listen for first user interaction
document.addEventListener('click', tryStartAudioContext, { passive: true });
document.addEventListener('touchstart', tryStartAudioContext, { passive: true });
document.addEventListener('keydown', tryStartAudioContext, { passive: true });

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
