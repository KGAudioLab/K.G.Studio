import React from 'react';
import './Toolbar.css';
import { saveProject } from '../util/saveUtil';
import { KGProjectStorage } from '../core/io/KGProjectStorage';
import { isValidProjectName } from '../util/projectNameUtil';
import { KGCore } from '../core/KGCore';
import { useProjectStore } from '../stores/projectStore';
import { DEBUG_MODE } from '../constants/uiConstants';
import { TIME_CONSTANTS } from '../constants/coreConstants';
import { parseTimeSignature, getTimeSignatureErrorMessage } from '../util/timeUtil';
import {
  FaUndo, FaRedo, FaMousePointer, FaStepBackward,
  FaPlay, FaPause, FaComments, FaSync,
  FaFolderOpen, FaSave, FaDownload, FaUpload, FaPlus,
  FaCog, FaMagnet
} from 'react-icons/fa';
import { KGProject, type KeySignature } from '../core/KGProject';
import { plainToInstance } from 'class-transformer';
import { FaPencil, FaCopy, FaPaste, FaTrash } from 'react-icons/fa6';
import { KGMainContentState } from '../core/state/KGMainContentState';
import { regionDeleteManager } from '../util/regionDeleteUtil';
import { handleCopyOperation, handlePasteOperation } from '../util/copyPasteUtil';
import { convertProjectToMidi, convertMidiToProject } from '../util/midiUtil';
import { KEY_SIGNATURE_MAP } from '../constants/coreConstants';
import { KGOfflineRenderer } from '../core/audio-interface/KGOfflineRenderer';
import KGDropdown from './common/KGDropdown';
import FileImportModal from './common/FileImportModal';
import OpenProjectModal from './common/OpenProjectModal';
import { clearChatHistoryAndUI } from '../util/chatUtil';
import PianoIcon from './common/icons/PianoIcon';

const Toolbar: React.FC = () => {
  const {
    projectName, setProjectName,
    savedProjectName, setSavedProjectName,
    bpm, timeSignature, keySignature, setStatus,
    isPlaying, startPlaying, stopPlaying, setPlayheadPosition,
    currentTime, setBpm, setTimeSignature, setKeySignature,
    maxBars, setMaxBars,
    barWidthMultiplier, setBarWidthMultiplier,
    isLooping, toggleLoop,
    canUndo, canRedo, undoDescription, redoDescription, undo, redo,
    toggleChatBox, toggleSettings, cleanupProjectState,
    // Piano roll state/actions
    showPianoRoll, setShowPianoRoll, activeRegionId, setActiveRegionId,
    // Selection state
    selectedRegionIds
  } = useProjectStore();

  // State for main content tools
  const [activeMainTool, setActiveMainTool] = React.useState<'pointer' | 'pencil'>('pointer');
  const [isSnapping, setIsSnapping] = React.useState(true);

  // State for key signature dropdown
  const [showKeySignatureDropdown, setShowKeySignatureDropdown] = React.useState(false);
  
  // State for export dropdown
  const [showExportDropdown, setShowExportDropdown] = React.useState(false);
  
  // State for import modal
  const [showImportModal, setShowImportModal] = React.useState(false);

  // State for zoom slider popup
  const [showZoomSlider, setShowZoomSlider] = React.useState(false);
  const zoomSliderRef = React.useRef<HTMLDivElement>(null);

  // State for open project modal
  const [showOpenProject, setShowOpenProject] = React.useState(false);
  
  // Close zoom slider on click outside
  React.useEffect(() => {
    if (!showZoomSlider) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (zoomSliderRef.current && !zoomSliderRef.current.contains(e.target as Node)) {
        setShowZoomSlider(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showZoomSlider]);

  // Key signature options
  const keySignatureOptions = Object.keys(KEY_SIGNATURE_MAP) as KeySignature[];
  
  // Export options
  const exportOptions = ["Export to KGStudio file", "Export to MIDI file", "Export to WAV"];

  const handleProjectNameClick = () => {
    const newName = prompt("Enter project name:", projectName);
    if (newName) {
      if (!isValidProjectName(newName)) {
        window.alert("Invalid project name. Only letters, numbers, spaces, hyphens, underscores, periods, and parentheses are allowed.");
        return;
      }
      setProjectName(newName);
    }
  };

  // Common project loading logic extracted for reuse
  const loadProjectFromData = async (project: KGProject, sourceDescription: string, savedName?: string) => {
    try {
      // Clean up UI state first
      cleanupProjectState();

      // Automatically clear chat history when loading a project
      clearChatHistoryAndUI();

      // Load the project using the store's loadProject method
      const { loadProject: storeLoadProject } = useProjectStore.getState();
      await storeLoadProject(project, savedName);

      // Clean up orphan media files (only on open, not on save)
      if (savedName) {
        const storage = KGProjectStorage.getInstance();
        await storage.cleanupOrphanMedia(savedName, project);
      }

      // Update status to indicate project loaded
      setStatus(`${sourceDescription} loaded successfully`);

      if (DEBUG_MODE.TOOLBAR) {
        console.log(`project loaded successfully from ${sourceDescription}`);
      }

    } catch (error) {
      console.error(`Error loading project from ${sourceDescription}:`, error);
      setStatus(`Failed to load project: ${error}`);
      window.alert(`An error occurred while loading the project: ${error}`);
    }
  };

  // Core logic for creating a new project (no confirmation dialog)
  const createNewProject = () => {
    if (DEBUG_MODE.TOOLBAR) {
      console.log("creating new project");
    }

    cleanupProjectState();
    clearChatHistoryAndUI();

    const newProject = new KGProject();
    const { loadProject: storeLoadProject } = useProjectStore.getState();
    storeLoadProject(newProject);

    setStatus(`New project "${newProject.getName()}" created`);

    if (DEBUG_MODE.TOOLBAR) {
      console.log("new project created successfully");
    }
  };

  // Handler functions for file operations
  const handleNewProject = () => {
    const confirmed = window.confirm("Are you sure you want to create a new project? Any unsaved changes will be lost.");
    if (confirmed) {
      createNewProject();
    }
  };

  const handleLoadProject = () => {
    if (DEBUG_MODE.TOOLBAR) {
      console.log("user clicked load button");
    }
    setShowOpenProject(true);
  };

  const handleOpenProjectSelect = async (projectNameToLoad: string) => {
    try {
      const storage = KGProjectStorage.getInstance();
      const loadedProject = await storage.load(projectNameToLoad);

      if (!loadedProject) {
        window.alert(`Project "${projectNameToLoad}" not found.`);
        return;
      }

      await loadProjectFromData(loadedProject, `Project "${projectNameToLoad}"`, projectNameToLoad);
    } catch (error) {
      console.error("Error loading project:", error);
      window.alert(`An error occurred while loading the project: ${error}`);
    }
  };

  const handleSaveProject = async () => {
    if (DEBUG_MODE.TOOLBAR) {
      console.log("user clicked save button");
    }

    await saveProject(projectName, savedProjectName, setStatus, (finalName) => {
      setSavedProjectName(finalName);
      if (finalName !== projectName) {
        setProjectName(finalName);
      }
    });
  };

  const handleExportProject = (exportType: string) => {
    if (DEBUG_MODE.TOOLBAR) {
      console.log("user selected export option:", exportType);
    }
    
    if (exportType === "Export to KGStudio file") {
      handleExportKGStudio();
    } else if (exportType === "Export to MIDI file") {
      handleExportMIDI();
    } else if (exportType === "Export to WAV") {
      handleBounceToWav();
    }
    
    setShowExportDropdown(false);
  };

  const handleExportKGStudio = async () => {
    if (DEBUG_MODE.TOOLBAR) {
      console.log("exporting to KGStudio file");
    }

    try {
      // First save the current project to OPFS so the export reflects the latest state
      const storage = KGProjectStorage.getInstance();
      await storage.save(projectName, KGCore.instance().getCurrentProject(), true);

      // Bundle the project folder into a zip
      const blob = await storage.exportAsZip(projectName);

      // Trigger download
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${projectName}.kgstudio`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      setStatus(`Project "${projectName}" exported as KGStudio file`);

      if (DEBUG_MODE.TOOLBAR) {
        console.log("KGStudio export completed successfully");
      }

    } catch (error) {
      console.error("Error exporting KGStudio file:", error);
      setStatus(`Error exporting project: ${error}`);
      window.alert(`Failed to export project: ${error}`);
    }
  };

  const handleExportMIDI = () => {
    if (DEBUG_MODE.TOOLBAR) {
      console.log("exporting to MIDI file");
    }
    
    try {
      // Get the current project from KGCore
      const currentProject = KGCore.instance().getCurrentProject();
      
      // Convert project to MIDI format
      const midiData = convertProjectToMidi(currentProject);
      
      // Create a downloadable blob
      const blob = new Blob([midiData.buffer as ArrayBuffer], { type: 'audio/midi' });
      
      // Create a temporary download link
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${projectName}.mid`;
      
      // Trigger download
      document.body.appendChild(link);
      link.click();
      
      // Cleanup
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      
      setStatus(`Project "${projectName}" exported as MIDI file`);
      
      if (DEBUG_MODE.TOOLBAR) {
        console.log("MIDI export completed successfully");
      }
      
    } catch (error) {
      console.error("Error exporting MIDI:", error);
      setStatus(`Error exporting MIDI: ${error}`);
      window.alert(`Failed to export project as MIDI: ${error}`);
    }
  };

  const handleBounceToWav = async () => {
    if (DEBUG_MODE.TOOLBAR) {
      console.log("bouncing to WAV");
    }

    try {
      const currentProject = KGCore.instance().getCurrentProject();
      await KGOfflineRenderer.instance().bounceToWav(currentProject, projectName);
      setStatus(`Project "${projectName}" exported as WAV file`);
    } catch (error) {
      console.error("Error bouncing to WAV:", error);
      setStatus(`Error exporting WAV: ${error}`);
      window.alert(`Failed to export project as WAV: ${error}`);
    }
  };

  const handleImportProject = () => {
    if (DEBUG_MODE.TOOLBAR) {
      console.log("user clicked import button");
    }
    setShowImportModal(true);
  };

  const handleFileImport = async (file: File) => {
    if (DEBUG_MODE.TOOLBAR) {
      console.log("file selected for import:", file.name);
    }
    
    // Get file extension
    const fileExtension = '.' + file.name.split('.').pop()?.toLowerCase();
    
    try {
      if (fileExtension === '.kgstudio') {
        // Handle KGStudio bundle import
        await handleKGStudioFileImport(file);
      } else if (fileExtension === '.json') {
        // Handle legacy KGStudio JSON import
        await handleKGStudioJSONImport(file);
      } else if (fileExtension === '.mid' || fileExtension === '.midi') {
        // Handle MIDI import
        await handleMIDIImport(file);
      } else {
        throw new Error(`Unsupported file type: ${fileExtension}`);
      }
      
    } catch (error) {
      console.error("Error importing file:", error);
      setStatus(`Failed to import file: ${error}`);
      window.alert(`Failed to import project file: ${error}`);
    }
  };

  const handleKGStudioFileImport = async (file: File) => {
    const storage = KGProjectStorage.getInstance();

    try {
      const projectName = await storage.importFromZip(file);

      // Load the project from OPFS (this runs the upgrader)
      const loaded = await storage.load(projectName);
      if (!loaded) {
        throw new Error('Failed to load imported project');
      }

      await loadProjectFromData(loaded, `KGStudio file "${file.name}"`, projectName);

      if (DEBUG_MODE.TOOLBAR) {
        console.log("KGStudio file imported successfully:", projectName);
      }
    } catch (error) {
      window.alert(`The .kgstudio file is corrupted or invalid: ${error}`);
      throw error;
    }
  };

  const handleKGStudioJSONImport = async (file: File) => {
    try {
      const fileContent = await file.text();
      const projectData = JSON.parse(fileContent);

      // Deserialize and handle potential array return
      const deserializedResult = plainToInstance(KGProject, projectData);
      const project = Array.isArray(deserializedResult)
        ? deserializedResult[0] || null
        : deserializedResult;

      if (!project) {
        throw new Error("Failed to deserialize project data");
      }

      // Use the project's name for the OPFS folder, auto-rename if it already exists
      const storage = KGProjectStorage.getInstance();
      const importedName = await storage.resolveUniqueName(project.getName() || 'Imported Project');

      // Save to OPFS as a proper folder-based project
      project.setName(importedName);
      await storage.save(importedName, project, false);

      // Load back from OPFS so the upgrader runs
      const loaded = await storage.load(importedName);
      if (!loaded) {
        throw new Error('Failed to load imported project from storage');
      }

      await loadProjectFromData(loaded, `JSON file "${file.name}"`, importedName);

      if (DEBUG_MODE.TOOLBAR) {
        console.log("KGStudio JSON project imported and saved to OPFS:", importedName);
      }

    } catch (error) {
      throw new Error(`Invalid KGStudio JSON file: ${error}`);
    }
  };

  const handleMIDIImport = async (file: File) => {
    try {
      if (DEBUG_MODE.TOOLBAR) {
        console.log("Starting MIDI file import:", file.name);
      }
      
      // Show loading status
      setStatus(`Importing MIDI file "${file.name}"...`);
      
      // Read the MIDI file as binary data
      const arrayBuffer = await file.arrayBuffer();
      const midiData = new Uint8Array(arrayBuffer);
      
      if (DEBUG_MODE.TOOLBAR) {
        console.log("MIDI file read successfully, size:", midiData.length, "bytes");
      }
      
      // Get current project to append MIDI tracks to it
      const currentProject = KGCore.instance().getCurrentProject();
      
      // Convert MIDI data and append to current project
      const updatedProject = convertMidiToProject(midiData, currentProject);
      
      if (DEBUG_MODE.TOOLBAR) {
        console.log("MIDI conversion successful, tracks added to existing project");
      }
      
      // Load the updated project using common loading logic
      await loadProjectFromData(updatedProject, `MIDI file "${file.name}"`);
      
      if (DEBUG_MODE.TOOLBAR) {
        console.log("MIDI file imported successfully:", file.name);
      }
      
    } catch (error) {
      console.error("Error importing MIDI file:", error);
      const errorMessage = error instanceof Error ? error.message : String(error);
      setStatus(`Failed to import MIDI file: ${errorMessage}`);
      throw new Error(`Invalid MIDI file: ${errorMessage}`);
    }
  };

  // Handler functions for playback control
  const handlePlayClick = async () => {
    if (DEBUG_MODE.TOOLBAR) {
      console.log("Play button clicked");
    }
    try {
      await startPlaying();
    } catch (error) {
      console.error("Failed to start playback:", error);
      setStatus("Playback failed to start");
    }
  };

  const handlePauseClick = async () => {
    if (DEBUG_MODE.TOOLBAR) {
      console.log("Pause button clicked");
    }
    try {
      await stopPlaying();
    } catch (error) {
      console.error("Failed to stop playback:", error);
      setStatus("Failed to stop playback");
    }
  };

  const handleBackToBeginningClick = () => {
    if (DEBUG_MODE.TOOLBAR) {
      console.log("Back to beginning button clicked");
    }
    setPlayheadPosition(0);
  };

  const handleLoopToggle = () => {
    toggleLoop();
    if (DEBUG_MODE.TOOLBAR) {
      console.log("Loop toggle clicked");
    }
  };

  // Prompt to change max bars when clicking on current-time display
  const handleCurrentTimeClick = () => {
    const MIN_BARS = 16;
    const newMaxBarsStr = prompt(`Enter new max bars (>= ${MIN_BARS}):`, String(maxBars ?? 32));
    if (newMaxBarsStr === null) {
      return; // cancelled
    }
    const parsed = parseInt(newMaxBarsStr.trim(), 10);
    if (isNaN(parsed)) {
      alert('Invalid input. Please enter a valid number.');
      return;
    }
    if (parsed < MIN_BARS) {
      alert(`Invalid value. Please enter a number >= ${MIN_BARS}.`);
      return;
    }
    setMaxBars(parsed);
    setStatus(`Max bars changed to ${parsed}`);
  };

  const handleBpmClick = () => {
    if (DEBUG_MODE.TOOLBAR) {
      console.log("BPM clicked, current BPM:", bpm);
    }
    
    const newBpmStr = prompt(`Enter new BPM (${TIME_CONSTANTS.MIN_BPM}-${TIME_CONSTANTS.MAX_BPM}):`, bpm.toString());
    
    // Check if user cancelled
    if (newBpmStr === null) {
      return;
    }
    
    // Validate input
    const newBpm = parseInt(newBpmStr.trim());
    
    // Check if it's a valid number
    if (isNaN(newBpm)) {
      alert("Invalid input. Please enter a valid number.");
      return;
    }
    
    // Check if it's within valid range
    if (newBpm <= TIME_CONSTANTS.MIN_BPM || newBpm >= TIME_CONSTANTS.MAX_BPM) {
      alert(`Invalid BPM. Please enter a value between ${TIME_CONSTANTS.MIN_BPM} and ${TIME_CONSTANTS.MAX_BPM}.`);
      return;
    }
    
    // Update BPM
    setBpm(newBpm);
    setStatus(`BPM changed to ${newBpm}`);
    
    if (DEBUG_MODE.TOOLBAR) {
      console.log(`BPM updated from ${bpm} to ${newBpm}`);
    }
  };

  const handleTimeSignatureClick = () => {
    if (DEBUG_MODE.TOOLBAR) {
      console.log("Time signature clicked, current:", `${timeSignature.numerator}/${timeSignature.denominator}`);
    }
    
    const currentTimeSignatureStr = `${timeSignature.numerator}/${timeSignature.denominator}`;
    const newTimeSignatureStr = prompt(`Enter new time signature (numerator/denominator):`, currentTimeSignatureStr);
    
    // Check if user cancelled
    if (newTimeSignatureStr === null) {
      return;
    }
    
    // Parse and validate time signature
    const newTimeSignature = parseTimeSignature(newTimeSignatureStr);
    
    if (newTimeSignature === null) {
      alert(getTimeSignatureErrorMessage());
      return;
    }
    
    // Update time signature
    setTimeSignature(newTimeSignature);
    setStatus(`Time signature changed to ${newTimeSignature.numerator}/${newTimeSignature.denominator}`);
    
    if (DEBUG_MODE.TOOLBAR) {
      console.log(`Time signature updated from ${currentTimeSignatureStr} to ${newTimeSignature.numerator}/${newTimeSignature.denominator}`);
    }
  };

  const handleKeySignatureChange = (newKeySignature: string) => {
    if (DEBUG_MODE.TOOLBAR) {
      console.log("Key signature changed from", keySignature, "to", newKeySignature);
    }
    
    setKeySignature(newKeySignature as KeySignature);
    setStatus(`Key signature changed to ${newKeySignature}`);
    setShowKeySignatureDropdown(false);
  };

  // Handle main content tool selection
  const handleMainToolSelect = (tool: 'pointer' | 'pencil') => {
    setActiveMainTool(tool);
    KGMainContentState.instance().setActiveTool(tool);
    if (DEBUG_MODE.TOOLBAR) {
      console.log(`Selected main content tool: ${tool}`);
    }
  };

  // Handle snapping toggle
  const handleSnappingToggle = () => {
    const newValue = !isSnapping;
    setIsSnapping(newValue);
    KGMainContentState.instance().setSnapping(newValue);
    if (DEBUG_MODE.TOOLBAR) {
      console.log(`Snapping ${newValue ? 'enabled' : 'disabled'}`);
    }
  };

  // Handle copy button click
  const handleCopyClick = () => {
    if (DEBUG_MODE.TOOLBAR) {
      console.log("Copy button clicked");
    }
    
    const copied = handleCopyOperation();
    
    if (copied) {
      setStatus("Items copied to clipboard");
      if (DEBUG_MODE.TOOLBAR) {
        console.log("Items copied successfully");
      }
    } else {
      setStatus("No items selected to copy");
      if (DEBUG_MODE.TOOLBAR) {
        console.log("No items were selected for copying");
      }
    }
  };

  // Handle paste button click
  const handlePasteClick = () => {
    if (DEBUG_MODE.TOOLBAR) {
      console.log("Paste button clicked");
    }
    
    const pasted = handlePasteOperation();
    
    if (pasted) {
      setStatus("Items pasted from clipboard");
      if (DEBUG_MODE.TOOLBAR) {
        console.log("Items pasted successfully");
      }
    } else {
      setStatus("Cannot paste - no valid clipboard content or context");
      if (DEBUG_MODE.TOOLBAR) {
        console.log("Paste operation failed or no valid context");
      }
    }
  };

  // Handle delete button click
  const handleDeleteClick = () => {
    if (DEBUG_MODE.TOOLBAR) {
      console.log("Delete button clicked");
    }
    
    const deleted = regionDeleteManager.deleteSelectedRegions();
    
    if (deleted) {
      setStatus("Selected regions deleted");
      if (DEBUG_MODE.TOOLBAR) {
        console.log("Regions deleted successfully");
      }
    } else {
      setStatus("No regions selected for deletion");
      if (DEBUG_MODE.TOOLBAR) {
        console.log("No regions were selected for deletion");
      }
    }
  };

  // Handle undo button click
  const handleUndoClick = () => {
    if (DEBUG_MODE.TOOLBAR) {
      console.log("Undo button clicked");
    }
    
    if (!canUndo) {
      alert("Nothing to undo");
      return;
    }
    
    undo();
    const description = undoDescription || "action";
    setStatus(`Undid: ${description}`);
    
    if (DEBUG_MODE.TOOLBAR) {
      console.log(`Undo successful: ${description}`);
    }
  };

  // Handle redo button click
  const handleRedoClick = () => {
    if (DEBUG_MODE.TOOLBAR) {
      console.log("Redo button clicked");
    }
    
    if (!canRedo) {
      alert("Nothing to redo");
      return;
    }
    
    redo();
    const description = redoDescription || "action";
    setStatus(`Redid: ${description}`);
    
    if (DEBUG_MODE.TOOLBAR) {
      console.log(`Redo successful: ${description}`);
    }
  };

  // Handle chat button click
  const handleChatClick = () => {
    if (DEBUG_MODE.TOOLBAR) {
      console.log("Chat button clicked");
    }
    
    toggleChatBox();
    setStatus("Chat toggled");
  };

  // Handle settings button click
  const handleSettingsClick = () => {
    if (DEBUG_MODE.TOOLBAR) {
      console.log("Settings button clicked");
    }
    
    toggleSettings();
    setStatus("Settings toggled");
  };

  // Handle Piano button click: open piano roll if closed, targeting active or selected region
  const handlePianoButtonClick = () => {
    if (DEBUG_MODE.TOOLBAR) {
      console.log('Piano button clicked');
    }
    // Only open if not already open
    if (showPianoRoll) {
      if (DEBUG_MODE.TOOLBAR) {
        console.log('Piano roll already open; no action');
      }
      return;
    }

    // Prefer current active region; otherwise, first selected region
    const candidateRegionId = activeRegionId || (selectedRegionIds && selectedRegionIds.length > 0 ? selectedRegionIds[0] : null);

    if (!candidateRegionId) {
      if (DEBUG_MODE.TOOLBAR) {
        console.log('No active or selected region; piano roll will not open');
      }
      return;
    }

    setActiveRegionId(candidateRegionId);
    setShowPianoRoll(true);
    if (DEBUG_MODE.TOOLBAR) {
      console.log(`Opening piano roll for region ${candidateRegionId}`);
    }
  };

  return (
    <>
      <div className="toolbar">
        <div className="toolbar-left">
          <div className="logo-container">
            <img src={`${import.meta.env.BASE_URL}logo.png`} alt="DAW Logo" className="logo" />
          </div>
          <div 
            className="project-name" 
            onClick={handleProjectNameClick}
          >
            {projectName}
          </div>
        </div>
      
      <div className="toolbar-center">
        <button title="New" onClick={handleNewProject}><FaPlus /></button>
        <button title="Load" onClick={handleLoadProject}><FaFolderOpen /></button>
        <button title="Save" onClick={handleSaveProject}><FaSave /></button>
        <div style={{ position: 'relative', display: 'inline-block' }}>
          <button 
            title="Export" 
            onClick={() => setShowExportDropdown(!showExportDropdown)}
            style={{ display: 'flex', alignItems: 'center', gap: '4px' }}
          >
            <FaDownload />
          </button>
          <div style={{ position: 'absolute', top: '100%', left: 0, zIndex: 10000 }}>
            <KGDropdown
              options={exportOptions}
              value={exportOptions[0]}
              onChange={handleExportProject}
              label="Export"
              hideButton={true}
              isOpen={showExportDropdown}
              onToggle={setShowExportDropdown}
              className="export-dropdown"
            />
          </div>
        </div>
        <button title="Import" onClick={handleImportProject}><FaUpload /></button>
        <div className="toolbar-separator"></div>
        <button title="Undo" onClick={handleUndoClick}><FaUndo /></button>
        <button title="Redo" onClick={handleRedoClick}><FaRedo /></button>
        <div className="toolbar-separator"></div>
        <button 
          title="Select" 
          className={`tool-button ${activeMainTool === 'pointer' ? 'active' : ''}`}
          onClick={() => handleMainToolSelect('pointer')}
        >
          <FaMousePointer />
        </button>
        <button
          title="Pencil"
          className={`tool-button ${activeMainTool === 'pencil' ? 'active' : ''}`}
          onClick={() => handleMainToolSelect('pencil')}
        >
          <FaPencil />
        </button>
        <button
          title="Snap to Grid"
          className={`tool-button ${isSnapping ? 'active' : ''}`}
          onClick={handleSnappingToggle}
        >
          <FaMagnet />
        </button>
        <div className="toolbar-separator"></div>
        <button title="Copy" onClick={handleCopyClick}><FaCopy /></button>
        <button title="Paste" onClick={handlePasteClick}><FaPaste /></button>
        <button title="Delete" onClick={handleDeleteClick}><FaTrash /></button>
        <div className="toolbar-separator"></div>
        <button title="Back to beginning" className="button-back-to-beginning" onClick={handleBackToBeginningClick}><FaStepBackward /></button>
        {!isPlaying ? (
          <button title="Play" className="button-play" onClick={handlePlayClick}><FaPlay /></button>
        ) : (
          <button title="Pause" className="button-pause" onClick={handlePauseClick}><FaPause /></button>
        )}
        <button
          title="Loop"
          className={`tool-button ${isLooping ? 'active' : ''}`}
          onClick={handleLoopToggle}
        >
          <FaSync />
        </button>
        <div className="toolbar-separator"></div>
        <button title="Piano" onClick={handlePianoButtonClick}><PianoIcon /></button>
        {/* <button title="Record"><FaCircle className="record-btn" /></button>
        <button title="Metronome">🎵</button> */}
      </div>
      
      <div className="toolbar-right">
        <div className="transport-control">
          <div className="transport-item" style={{ position: 'relative' }} ref={zoomSliderRef}>
            <span
              className='current-zoom'
              onClick={() => setShowZoomSlider(!showZoomSlider)}
              style={{ cursor: 'pointer' }}
            >
              {barWidthMultiplier}x
            </span>
            {showZoomSlider && (
              <div className="zoom-slider-popup">
                <input
                  type="range"
                  min="1"
                  max="8"
                  step="1"
                  value={barWidthMultiplier}
                  onChange={(e) => setBarWidthMultiplier(parseInt(e.target.value))}
                />
                <span className="zoom-slider-label">{barWidthMultiplier}x</span>
              </div>
            )}
          </div>
          <div className="transport-item">
            <span className='current-time' onClick={handleCurrentTimeClick} style={{ cursor: 'pointer' }}>{currentTime}</span>
          </div>
          <div className="transport-item">
            <span className='current-bpm' onClick={handleBpmClick} style={{ cursor: 'pointer' }}>{bpm}</span>
          </div>
          <div className="transport-item">
            <span className='current-time-signature' onClick={handleTimeSignatureClick} style={{ cursor: 'pointer' }}>{timeSignature.numerator + "/" + timeSignature.denominator}</span>
          </div>
          <div className="transport-item" style={{ position: 'relative' }}>
            <span 
              className='current-key-signature' 
              onClick={() => setShowKeySignatureDropdown(!showKeySignatureDropdown)} 
              style={{ cursor: 'pointer' }}
            >
              {keySignature}
            </span>
            <div style={{ position: 'absolute', top: '100%', left: 0, zIndex: 10000 }}>
              <KGDropdown
                options={keySignatureOptions}
                value={keySignature}
                onChange={handleKeySignatureChange}
                label="Key Signature"
                hideButton={true}
                isOpen={showKeySignatureDropdown}
                onToggle={setShowKeySignatureDropdown}
                className="key-signature-dropdown"
              />
            </div>
          </div>
        </div>
        <button title="Settings" onClick={handleSettingsClick}><FaCog /></button>
        <button title="Chat" onClick={handleChatClick}><FaComments /></button>
      </div>
    </div>
    
    <FileImportModal
      isVisible={showImportModal}
      onClose={() => setShowImportModal(false)}
      onFileImport={handleFileImport}
      acceptedTypes={['.kgstudio', '.json', '.mid', '.midi']}
      title="Import Project"
      description="Drag and drop your project file here"
    />

    {showOpenProject && (
      <OpenProjectModal
        onClose={() => setShowOpenProject(false)}
        onOpenProject={handleOpenProjectSelect}
        currentProjectName={savedProjectName}
        onCreateNewProject={createNewProject}
      />
    )}
    </>
  );
};

export default Toolbar; 