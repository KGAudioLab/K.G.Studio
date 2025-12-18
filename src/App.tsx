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
import { KGCore } from './core/KGCore';
import { ConfigManager } from './core/config/ConfigManager';
import { validateFunctionalChordsJSON } from './util/scaleUtil';

function App() {
  // Enable global keyboard handler for copy/paste and undo/redo
  useGlobalKeyboardHandler();
  
  // Use project store instead of local state for project name and tracks
  const {
    refreshStatus,
    loadProject, showChatBox, showSettings, setShowSettings, initializeFromConfig,
    showInstrumentSelection
  } = useProjectStore();

  // Track if app has been initialized to prevent multiple initializations
  const hasInitialized = useRef(false);

  // Load project when component mounts
  useEffect(() => {
    // Guard against multiple initializations (can happen due to React Strict Mode or rerenders)
    if (hasInitialized.current) {
      return;
    }
    hasInitialized.current = true;

    const initializeApp = async () => {
      // Load the current project from KGCore
      loadProject(null);

      // Initialize ConfigManager first to load config.json and user settings
      await ConfigManager.instance().initialize();

      // Initialize store from config after ConfigManager is ready
      await initializeFromConfig();

      // Load all mode and chord data files in parallel
      try {
        const [functionalChordsResponse] = await Promise.all([
          fetch(`${import.meta.env.BASE_URL}resources/modes/functional_chords.json`)
        ]);

        const [functionalChordsData] = await Promise.all([
          functionalChordsResponse.json()
        ]);

        // Store original functional chords data
        KGCore.ORIGINAL_FUNCTIONAL_CHORDS_DATA = functionalChordsData;
        console.log(`Loaded original functional chords for ${Object.keys(functionalChordsData).length} modes`);

        // Check if custom chord definition exists and is valid
        const configManager = ConfigManager.instance();
        const customDefinition = configManager.get('chord_guide.chord_definition') as string;

        if (customDefinition && customDefinition.trim()) {
          const validationResult = validateFunctionalChordsJSON(customDefinition);
          if (validationResult.valid) {
            KGCore.FUNCTIONAL_CHORDS_DATA = JSON.parse(customDefinition);
            console.log('Using custom chord definition from settings');
          } else {
            KGCore.FUNCTIONAL_CHORDS_DATA = functionalChordsData;
            console.log('Custom chord definition invalid, using original');
          }
        } else {
          KGCore.FUNCTIONAL_CHORDS_DATA = functionalChordsData;
          console.log('No custom chord definition, using original');
        }
      } catch (error) {
        console.error('Failed to load mode/chord data:', error);
        // Fallback to defaults
        const fallbackData = {
          ionian: {
            name: 'Ionian',
            steps: [2, 2, 1, 2, 2, 2, 1],
            T: [],
            S: [],
            D: [],
            chords: {}
          }
        };
        KGCore.ORIGINAL_FUNCTIONAL_CHORDS_DATA = fallbackData;
        KGCore.FUNCTIONAL_CHORDS_DATA = fallbackData;
      }

      // Log maxBars after initialization completes
      const currentMaxBars = useProjectStore.getState().maxBars;
      console.log(`Project max bars: ${currentMaxBars}`);
    };

    initializeApp();
  }, [loadProject, initializeFromConfig]);

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
