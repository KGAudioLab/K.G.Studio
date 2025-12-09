import { useEffect } from 'react';
import './App.css';
import { useProjectStore } from './stores/projectStore';
import { useGlobalKeyboardHandler } from './hooks/useGlobalKeyboardHandler';
import Toolbar from './components/Toolbar';
import StatusBar from './components/StatusBar';
import TrackControl from './components/TrackControl';
import MainContent from './components/MainContent';
import InstrumentSelection from './components/InstrumentSelection';
import ChatBox from './components/ChatBox';
import { SettingsPanel } from './components/settings';
import LoadingOverlay from './components/common/LoadingOverlay';
import { useEffect as useEffectReact, useState, useRef } from 'react';
import { KGToneBuffersPool } from './core/audio-interface/KGToneBuffersPool';
import { KGPianoRollState } from './core/state/KGPianoRollState';

function App() {
  // Enable global keyboard handler for copy/paste and undo/redo
  useGlobalKeyboardHandler();
  
  // Use project store instead of local state for project name and tracks
  const { 
    refreshStatus,
    loadProject, maxBars, showChatBox, showSettings, setShowSettings, initializeFromConfig,
    showInstrumentSelection
  } = useProjectStore();

  // Load project when component mounts
  useEffect(() => {
    const initializeApp = async () => {
      // Load the current project from KGCore
      loadProject(null);

      // Initialize store from config after ConfigManager is ready
      await initializeFromConfig();

      // Load mode list from JSON
      try {
        const response = await fetch(`${import.meta.env.BASE_URL}resources/modes/mode_list.json`);
        const data = await response.json();
        const modeNames = data.modes.map((mode: { name: string; steps: number[] }) => mode.name);
        KGPianoRollState.MODE_OPTIONS = modeNames;
        console.log(`Loaded ${modeNames.length} modes:`, modeNames);
      } catch (error) {
        console.error('Failed to load mode list:', error);
        // Fallback to default mode
        KGPianoRollState.MODE_OPTIONS = ['ionian'];
      }

      // Log maxBars to console
      console.log(`Project max bars: ${maxBars}`);
    };

    initializeApp();
  }, [loadProject, maxBars, initializeFromConfig]);

  // Refresh status periodically to ensure UI is in sync with KGCore
  useEffect(() => {
    // Initial refresh
    refreshStatus();
    
    // Set up interval to refresh status every second
    const intervalId = setInterval(() => {
      refreshStatus();
    }, 1000);
    
    // Clean up interval on unmount
    return () => clearInterval(intervalId);
  }, [refreshStatus]);

  return (
    <div className="daw-container">
      {/* Top Toolbar */}
      <Toolbar />

      {/* Main Display Area containing MainContent, ChatBox, and Settings */}
      <div className="main-display-area">
        {showSettings && <SettingsPanel onClose={() => setShowSettings(false)} />}
        {!showSettings && (
          <>
            {showInstrumentSelection && <InstrumentSelection />}
            <MainContent />
          </>
        )}
        <ChatBox isVisible={showChatBox && !showSettings} />
      </div>

      {/* Track Control */}
      <TrackControl />

      {/* Status Bar */}
      <StatusBar />

      {/* Global Loading Overlay for instrument buffer loading */}
      <GlobalLoadingOverlayContainer />
    </div>
  );
}

export default App;

// Local component to subscribe to pool events and manage a counter
const GlobalLoadingOverlayContainer: React.FC = () => {
  const [loadingCount, setLoadingCount] = useState<number>(() => KGToneBuffersPool.instance().getActiveLoadCount());
  const [overdue, setOverdue] = useState<boolean>(false);
  const timeoutRef = useRef<number | null>(null);

  useEffectReact(() => {
    const pool = KGToneBuffersPool.instance();
    const listener = (evt: { type: 'start' | 'end'; instrument: string }) => {
      setLoadingCount(prev => {
        if (evt.type === 'start') return prev + 1;
        return Math.max(0, prev - 1);
      });
    };
    pool.addLoadingListener(listener);
    return () => {
      pool.removeLoadingListener(listener);
    };
  }, []);

  // Handle long-running overlay: after 10s, hide and alert the user, but allow future loads to show overlay again
  useEffectReact(() => {
    // When loading starts, start a 30s timer if not already overdue/timed
    if (loadingCount > 0 && !overdue && timeoutRef.current === null) {
      timeoutRef.current = window.setTimeout(() => {
        // Only trigger if still loading
        if (loadingCount > 0) {
          setOverdue(true);
          // Friendly alert to the user
          window.alert(
            'Loading resources is taking longer than expected and may have partially failed. If you notice any playback issues, please refresh the page to retry downloading the audio files.'
          );
        }
        // Clear the timeout handle
        timeoutRef.current = null;
      }, 10000);
    }

    // When loading finishes, clear timer and reset overdue state
    if (loadingCount === 0) {
      if (timeoutRef.current !== null) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
      if (overdue) setOverdue(false);
    }

    // Cleanup on unmount: clear any pending timer
    return () => {
      if (timeoutRef.current !== null) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
    };
  }, [loadingCount, overdue]);

  return (
    <LoadingOverlay
      visible={loadingCount > 0 && !overdue}
      message={loadingCount > 1 ? `Loading ... (${loadingCount})` : 'Loading ...'}
    />
  );
};
