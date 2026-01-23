import React from 'react';
import { saveProject } from '../util/saveUtil';
import { KGStorage } from '../core/io/KGStorage';
import { DB_CONSTANTS } from '../constants/coreConstants';
import { KGCore } from '../core/KGCore';
import { useProjectStore } from '../stores/projectStore';
import { DEBUG_MODE } from '../constants/uiConstants';
import { TIME_CONSTANTS } from '../constants/coreConstants';
import { parseTimeSignature, getTimeSignatureErrorMessage } from '../util/timeUtil';
import {
  FaUndo, FaRedo, FaMousePointer, FaStepBackward,
  FaPlay, FaPause, FaComments, FaSync,
  FaFolderOpen, FaSave, FaDownload, FaUpload, FaPlus,
  FaCog
} from 'react-icons/fa';
import { KGProject, type KeySignature } from '../core/KGProject';
import { plainToInstance, instanceToPlain } from 'class-transformer';
import { FaPencil, FaCopy, FaPaste, FaTrash } from 'react-icons/fa6';
import { KGMainContentState } from '../core/state/KGMainContentState';
import { regionDeleteManager } from '../util/regionDeleteUtil';
import { handleCopyOperation, handlePasteOperation } from '../util/copyPasteUtil';
import { convertProjectToMidi, convertMidiToProject } from '../util/midiUtil';
import { KEY_SIGNATURE_MAP } from '../constants/coreConstants';
import KGDropdown from './common/KGDropdown';
import FileImportModal from './common/FileImportModal';
import { clearChatHistoryAndUI } from '../util/chatUtil';
import PianoIcon from './common/icons/PianoIcon';

const Toolbar: React.FC = () => {
  const {
    projectName, setProjectName,
    bpm, timeSignature, keySignature, setStatus,
    isPlaying, startPlaying, stopPlaying, setPlayheadPosition,
    currentTime, setBpm, setTimeSignature, setKeySignature,
    maxBars, setMaxBars,
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

  // State for key signature dropdown
  const [showKeySignatureDropdown, setShowKeySignatureDropdown] = React.useState(false);
  
  // State for export dropdown
  const [showExportDropdown, setShowExportDropdown] = React.useState(false);
  
  // State for import modal
  const [showImportModal, setShowImportModal] = React.useState(false);
  
  // Key signature options
  const keySignatureOptions = Object.keys(KEY_SIGNATURE_MAP) as KeySignature[];
  
  // Export options
  const exportOptions = ["Export to KGStudio JSON file", "Export to MIDI file"];

  const handleProjectNameClick = () => {
    const newName = prompt("Enter project name:", projectName);
    if (newName) setProjectName(newName);
  };

  // Common project loading logic extracted for reuse
  const loadProjectFromData = async (project: KGProject, sourceDescription: string) => {
    try {
      // Clean up UI state first
      cleanupProjectState();
      
      // Automatically clear chat history when loading a project
      clearChatHistoryAndUI();
      
      // Load the project using the store's loadProject method
      const { loadProject: storeLoadProject } = useProjectStore.getState();
      await storeLoadProject(project);
      
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

  // Handler functions for file operations
  const handleNewProject = () => {
    const confirmed = window.confirm("Are you sure you want to create a new project? Any unsaved changes will be lost.");
    if (confirmed) {
      if (DEBUG_MODE.TOOLBAR) {
        console.log("user clicked new button");
      }
      
      // Clean up UI state first
      cleanupProjectState();
      
      // Automatically clear chat history when creating a new project
      clearChatHistoryAndUI();
      
      // Create a new project with default parameters
      const newProject = new KGProject();
      
      // Load the new project using the store's loadProject method
      const { loadProject: storeLoadProject } = useProjectStore.getState();
      storeLoadProject(newProject);
      
      // Default track creation is handled centrally in the store's loadProject
      
      // Update status to indicate new project created
      setStatus(`New project "${newProject.getName()}" created`);
      
      if (DEBUG_MODE.TOOLBAR) {
        console.log("new project created successfully");
      }
    }
  };

  const handleLoadProject = async () => {
    const confirmed = window.confirm("Are you sure you want to load another project? Any unsaved changes will be lost.");
    if (confirmed) {
      if (DEBUG_MODE.TOOLBAR) {
        console.log("user clicked load button");
      }
      
      // Ask user for project name
      const projectNameToLoad = window.prompt("Enter the project name to load:");
      
      // Check if user input is empty or null (user cancelled)
      if (!projectNameToLoad || projectNameToLoad.trim() === '') {
        if (projectNameToLoad !== null) { // Only show error if user didn't cancel
          window.alert("Project name cannot be empty. Please enter a valid project name.");
        }
        return;
      }
      
      try {
        // Try to load the project from storage
        const storage = KGStorage.getInstance();
        const loadedProject = await storage.load(
          DB_CONSTANTS.DB_NAME,
          DB_CONSTANTS.PROJECTS_STORE_NAME,
          projectNameToLoad.trim(),
          KGProject,
          DB_CONSTANTS.DB_VERSION
        );
        
        if (!loadedProject) {
          window.alert(`Project "${projectNameToLoad}" not found. Please check the project name and try again.`);
          return;
        }
        
        // Use common loading logic
        await loadProjectFromData(loadedProject, `Project "${projectNameToLoad}"`);
        
      } catch (error) {
        console.error("Error loading project:", error);
        window.alert(`An error occurred while loading the project: ${error}`);
      }
    }
  };

  const handleSaveProject = async () => {
    if (DEBUG_MODE.TOOLBAR) {
      console.log("user clicked save button");
    }

    await saveProject(projectName, setStatus);
  };

  const handleExportProject = (exportType: string) => {
    if (DEBUG_MODE.TOOLBAR) {
      console.log("user selected export option:", exportType);
    }
    
    if (exportType === "Export to KGStudio JSON file") {
      handleExportKGStudioJSON();
    } else if (exportType === "Export to MIDI file") {
      handleExportMIDI();
    }
    
    setShowExportDropdown(false);
  };

  const handleExportKGStudioJSON = () => {
    if (DEBUG_MODE.TOOLBAR) {
      console.log("exporting to KGStudio JSON file");
    }
    
    try {
      // Get the current project from KGCore
      const currentProject = KGCore.instance().getCurrentProject();
      
      // Serialize the project to JSON (same format as saved to IndexedDB)
      // Use instanceToPlain to include type information for class-transformer
      const projectData = JSON.stringify(instanceToPlain(currentProject), null, 2);
      
      // Create a downloadable blob
      const blob = new Blob([projectData], { type: 'application/json' });
      
      // Create a temporary download link
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${projectName}.json`;
      
      // Trigger download
      document.body.appendChild(link);
      link.click();
      
      // Cleanup
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      
      setStatus(`Project "${projectName}" exported as JSON file`);
      
      if (DEBUG_MODE.TOOLBAR) {
        console.log("KGStudio JSON export completed successfully");
      }
      
    } catch (error) {
      console.error("Error exporting KGStudio JSON:", error);
      setStatus(`Error exporting project: ${error}`);
      window.alert(`Failed to export project as JSON: ${error}`);
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
      const blob = new Blob([midiData], { type: 'audio/midi' });
      
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
      if (fileExtension === '.json') {
        // Handle KGStudio JSON import
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

  const handleKGStudioJSONImport = async (file: File) => {
    try {
      // Read the file content
      const fileContent = await file.text();
      
      const projectData = JSON.parse(fileContent);
      
      // Deserialize the project data using class-transformer (same as KGStorage)
      const deserializedResult = plainToInstance(KGProject, projectData);
      
      // Handle case where plainToInstance might return an array
      const deserializedProject = Array.isArray(deserializedResult) 
        ? deserializedResult[0] || null 
        : deserializedResult;
      
      if (!deserializedProject) {
        throw new Error("Failed to deserialize project data");
      }
      
      // Load the project using common loading logic
      await loadProjectFromData(deserializedProject, `File "${file.name}"`);
      
      if (DEBUG_MODE.TOOLBAR) {
        console.log("KGStudio JSON project imported successfully:", deserializedProject);
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
      acceptedTypes={['.json', '.mid', '.midi']}
      title="Import Project"
      description="Drag and drop your project file here"
    />
    </>
  );
};

export default Toolbar; 