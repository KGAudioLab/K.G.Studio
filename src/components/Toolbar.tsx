import React from 'react';
import './Toolbar.css';
import { saveProject } from '../util/saveUtil';
import { KGProjectStorage } from '../core/io/KGProjectStorage';
import { isValidProjectName, isReservedProjectName, RESERVED_PROJECT_NAME } from '../util/projectNameUtil';
import { KGCore } from '../core/KGCore';
import { useProjectStore } from '../stores/projectStore';
import { DEBUG_MODE } from '../constants/uiConstants';
import { TIME_CONSTANTS } from '../constants/coreConstants';
import { parseTimeSignature, getTimeSignatureErrorMessage } from '../util/timeUtil';
import {
  FaUndo, FaRedo, FaMousePointer, FaStepBackward,
  FaPlay, FaPause, FaComments, FaSync,
  FaFolderOpen, FaSave, FaDownload, FaUpload, FaPlus,
  FaCog, FaMagnet, FaCut, FaCircle, FaCompress
} from 'react-icons/fa';
import { KGProject, type KeySignature } from '../core/KGProject';
import { GlobalTrackType } from '../core/global-track';
import { KGMidiInput } from '../core/midi-input/KGMidiInput';
import { KGKeySignatureRegion } from '../core/region/KGKeySignatureRegion';
import { KGTempoRegion } from '../core/region/KGTempoRegion';
import { KGMidiRegion } from '../core/region/KGMidiRegion';
import { KGAudioTrack } from '../core/track/KGAudioTrack';
import { plainToInstance } from 'class-transformer';
import { FaPencil, FaCopy, FaPaste, FaTrash, FaWandMagicSparkles, FaListUl } from 'react-icons/fa6';
import { KGMainContentState } from '../core/state/KGMainContentState';
import { regionDeleteManager } from '../util/regionDeleteUtil';
import { handleCopyOperation, handlePasteOperation } from '../util/copyPasteUtil';
import { convertProjectToMidi, convertMidiToProject } from '../util/midiUtil';
import { KGOfflineRenderer } from '../core/audio-interface/KGOfflineRenderer';
import KGDropdown from './common/KGDropdown';
import FloatingPopup from './common/FloatingPopup';
import FileImportModal from './common/FileImportModal';
import LoadingOverlay from './common/LoadingOverlay';
import OpenProjectModal from './common/OpenProjectModal';
import KeySignaturePickerPopup from './KeySignaturePickerPopup';
import { clearChatHistoryAndUI } from '../util/chatUtil';
import PianoIcon from './common/icons/PianoIcon';
import MetronomeIcon from './common/icons/MetronomeIcon';
import { mergeSelectedMidiRegions, splitSelectedRegionAtPlayhead } from '../util/regionEditUtil';
import { showAlert, showChoice, showConfirm, showPrompt, showTimeSigPrompt } from '../util/dialogUtil';
import { UpdateKeySignatureRegionCommand, UpdateTempoRegionCommand } from '../core/commands';
import { useI18n } from '../i18n/useI18n';

const Toolbar: React.FC = () => {
  const { t } = useI18n();
  const {
    projectName, setProjectName,
    savedProjectName, setSavedProjectName,
    bpm, timeSignature, keySignature, setStatus,
    isPlaying, isPreparingPlayback, startPlaying, stopTransport, setPlayheadPosition,
    currentTime, setBpm, setTimeSignature, setKeySignature,
    maxBars, setMaxBars,
    barWidthMultiplier, setBarWidthMultiplier,
    isLooping, toggleLoop,
    globalTracks,
    canUndo, canRedo, undoDescription, redoDescription, undo, redo,
    toggleChatBox, toggleSettings, toggleKGOnePanel, toggleEventListPanel, activateSidePanel, showKGOnePanel, showEventListPanel, showChatBox, showSettings, setShowSettings, cleanupProjectState, toggleMetronome, isMetronomeEnabled,
    isRecording, startRecording, stopRecording,
    // Piano roll state/actions
    showPianoRoll, setShowPianoRoll, activeRegionId, setActiveRegionId,
    // Selection state
    selectedRegionIds, selectedTrackId,
    // Playhead and refresh
    playheadPosition, refreshProjectState,
    requestMainContentScroll, requestPianoRollScroll, bumpAudioWaveformRedrawVersion
  } = useProjectStore();

  // State for main content tools
  const [activeMainTool, setActiveMainTool] = React.useState<'pointer' | 'pencil'>('pointer');
  const [isSnapping, setIsSnapping] = React.useState(true);

  // State for key signature dropdown
  const [showKeySignatureDropdown, setShowKeySignatureDropdown] = React.useState(false);

  const signatureTrack = globalTracks.find(track => track.getType() === GlobalTrackType.Signature) ?? null;
  const signatureRegions = (signatureTrack?.getRegions() ?? [])
    .filter((region): region is KGKeySignatureRegion => region instanceof KGKeySignatureRegion)
    .sort((left, right) => left.getStartBar() - right.getStartBar());
  const tempoTrack = globalTracks.find(track => track.getType() === GlobalTrackType.Tempo) ?? null;
  const tempoRegions = (tempoTrack?.getRegions() ?? [])
    .filter((region): region is KGTempoRegion => region instanceof KGTempoRegion)
    .sort((left, right) => left.getStartBar() - right.getStartBar());
  const playheadBar = Math.floor(playheadPosition / timeSignature.numerator);
  const activeKeySignatureRegion = signatureRegions.find(
    region => playheadBar >= region.getStartBar() && playheadBar < region.getEndBar()
  ) ?? null;
  const activeTempoRegion = tempoRegions.find(
    region => playheadBar >= region.getStartBar() && playheadBar < region.getEndBar()
  ) ?? null;
  const displayedBpm = activeTempoRegion?.getBpm() ?? bpm;
  const displayedKeySignature = activeKeySignatureRegion?.getKeySignature() ?? keySignature;

  // State for export dropdown
  const [showExportDropdown, setShowExportDropdown] = React.useState(false);

  // State for import modal
  const [showImportModal, setShowImportModal] = React.useState(false);

  // State for zoom slider popup
  const [showZoomSlider, setShowZoomSlider] = React.useState(false);
  const zoomSliderRef = React.useRef<HTMLDivElement>(null);

  // State for open project modal
  const [showOpenProject, setShowOpenProject] = React.useState(false);
  const [isOpeningProject, setIsOpeningProject] = React.useState(false);

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

  // Export options
  const exportOptions = [
    { label: t('toolbar.export.kgstudio'), value: 'kgstudio' },
    { label: t('toolbar.export.midi'), value: 'midi' },
    { label: t('toolbar.export.wav'), value: 'wav' },
    { label: t('toolbar.export.mp3'), value: 'mp3' },
  ];
  const lastSelectedRegionId = selectedRegionIds[selectedRegionIds.length - 1] ?? null;

  const handleProjectNameClick = async () => {
    const newName = await showPrompt(t('toolbar.projectName.prompt'), projectName);
    if (!newName) return;
    if (!isValidProjectName(newName)) {
      await showAlert(t('toolbar.projectName.invalid'));
      return;
    }
    if (isReservedProjectName(newName)) {
      await showAlert(t('toolbar.projectName.reserved', { name: RESERVED_PROJECT_NAME }));
      return;
    }

    // If the name hasn't changed from the saved state, just save without prompting
    if (newName === savedProjectName) {
      setProjectName(newName);
      await saveProject(newName, savedProjectName, setStatus, (finalName) => {
        setSavedProjectName(finalName);
        if (finalName !== newName) setProjectName(finalName);
      });
      return;
    }

    // Untitled Project is ephemeral — no existing save to preserve, so rename directly
    if (savedProjectName === RESERVED_PROJECT_NAME) {
      const storage = KGProjectStorage.getInstance();
      const exists = await storage.exists(newName);
      if (exists) {
        const confirmed = await showConfirm(
          t('toolbar.projectName.overwrite', { name: newName })
        );
        if (!confirmed) return;
        setProjectName(newName);
        await saveProject(newName, savedProjectName, setStatus, (finalName) => {
          setSavedProjectName(finalName);
          if (finalName !== newName) setProjectName(finalName);
        }, true /* forceOverwrite */);
        return;
      }
      setProjectName(newName);
      await saveProject(newName, savedProjectName, setStatus, (finalName) => {
        setSavedProjectName(finalName);
        if (finalName !== newName) setProjectName(finalName);
      });
      return;
    }

    // Ask whether the user wants to rename or save as a copy
      const choice = await showChoice(
      t('toolbar.projectName.renameOrCopy'),
      [
        { label: t('toolbar.projectName.saveAsCopy'), value: 'saveas' },
        { label: t('toolbar.projectName.rename'), value: 'rename' },
      ]
    );
    if (!choice) return;

    if (choice === 'rename') {
      // Conflict check: only relevant when targeting a different OPFS folder
      const storage = KGProjectStorage.getInstance();
      const exists = await storage.exists(newName);
      if (exists) {
        const confirmed = await showConfirm(
          t('toolbar.projectName.overwrite', { name: newName })
        );
        if (!confirmed) return;
        setProjectName(newName);
        await saveProject(newName, savedProjectName, setStatus, (finalName) => {
          setSavedProjectName(finalName);
          if (finalName !== newName) setProjectName(finalName);
        }, true /* forceOverwrite */);
        return;
      }
      setProjectName(newName);
      await saveProject(newName, savedProjectName, setStatus, (finalName) => {
        setSavedProjectName(finalName);
        if (finalName !== newName) setProjectName(finalName);
      });
    } else {
      // Save as Copy: save current state under a unique new name, then switch to it
      const storage = KGProjectStorage.getInstance();
      const finalName = await storage.resolveUniqueName(newName);
      try {
        await storage.saveAs(savedProjectName, finalName, KGCore.instance().getCurrentProject());
        setProjectName(finalName);
        setSavedProjectName(finalName);
        setStatus(t('toolbar.projectName.saveAsCopy') + ` "${finalName}"`);
      } catch (error) {
        console.error('Error saving project as copy:', error);
        await showAlert(t('toolbar.save.error', { error: String(error) }));
      }
    }
  };

  // Common project loading logic extracted for reuse
  const loadProjectFromData = async (project: KGProject, sourceDescription: string, savedName?: string): Promise<boolean> => {
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
      setStatus(t('toolbar.status.projectLoaded', { description: sourceDescription }));

      if (DEBUG_MODE.TOOLBAR) {
        console.log(`project loaded successfully from ${sourceDescription}`);
      }

      return true;

    } catch (error) {
      console.error(`Error loading project from ${sourceDescription}:`, error);
      setStatus(t('toolbar.status.loadFailed', { error: String(error) }));
      await showAlert(t('toolbar.load.error', { error: String(error) }));
      return false;
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

    setStatus(t('toolbar.status.newProjectCreated', { name: newProject.getName() }));

    if (DEBUG_MODE.TOOLBAR) {
      console.log("new project created successfully");
    }
  };

  // Handler functions for file operations
  const handleNewProject = async () => {
    const confirmed = await showConfirm(t('toolbar.newProject.confirm'));
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
    setIsOpeningProject(true);

    try {
      const storage = KGProjectStorage.getInstance();
      const loadedProject = await storage.load(projectNameToLoad);

      if (!loadedProject) {
        await showAlert(t('toolbar.project.notFound', { name: projectNameToLoad }));
        return;
      }

      const didLoadProject = await loadProjectFromData(
        loadedProject,
        `Project "${projectNameToLoad}"`,
        projectNameToLoad
      );

      if (didLoadProject && showSettings) {
        setShowSettings(false);
      }
    } catch (error) {
      console.error("Error loading project:", error);
      await showAlert(t('toolbar.load.error', { error: String(error) }));
    } finally {
      setIsOpeningProject(false);
    }
  };

  const handleConfirmOpenProject = async () => {
    const confirmed = await showConfirm(
      t('toolbar.openProject.confirm')
    );
    return confirmed;
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

    if (exportType === 'kgstudio') {
      handleExportKGStudio();
    } else if (exportType === 'midi') {
      handleExportMIDI();
    } else if (exportType === 'wav') {
      handleBounceToWav();
    } else if (exportType === 'mp3') {
      handleBounceToMp3();
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

      setStatus(t('toolbar.status.projectExportedKgstudio', { name: projectName }));

      if (DEBUG_MODE.TOOLBAR) {
        console.log("KGStudio export completed successfully");
      }

    } catch (error) {
      console.error("Error exporting KGStudio file:", error);
      setStatus(t('toolbar.status.exportProjectError', { error: String(error) }));
      await showAlert(t('toolbar.export.failedProject', { error: String(error) }));
    }
  };

  const handleExportMIDI = async () => {
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

      setStatus(t('toolbar.status.projectExportedMidi', { name: projectName }));

      if (DEBUG_MODE.TOOLBAR) {
        console.log("MIDI export completed successfully");
      }

    } catch (error) {
      console.error("Error exporting MIDI:", error);
      setStatus(t('toolbar.status.exportMidiError', { error: String(error) }));
      await showAlert(t('toolbar.export.failedMidi', { error: String(error) }));
    }
  };

  const handleBounceToWav = async () => {
    if (DEBUG_MODE.TOOLBAR) {
      console.log("bouncing to WAV");
    }

    try {
      const currentProject = KGCore.instance().getCurrentProject();
      await KGOfflineRenderer.instance().bounceToWav(currentProject, projectName);
      setStatus(t('toolbar.status.projectExportedWav', { name: projectName }));
    } catch (error) {
      console.error("Error bouncing to WAV:", error);
      setStatus(t('toolbar.status.exportWavError', { error: String(error) }));
      await showAlert(t('toolbar.export.failedWav', { error: String(error) }));
    }
  };

  const handleBounceToMp3 = async () => {
    if (DEBUG_MODE.TOOLBAR) {
      console.log("bouncing to MP3");
    }

    try {
      const currentProject = KGCore.instance().getCurrentProject();
      await KGOfflineRenderer.instance().bounceToMp3(currentProject, projectName);
      setStatus(t('toolbar.status.projectExportedMp3', { name: projectName }));
    } catch (error) {
      console.error("Error bouncing to MP3:", error);
      setStatus(t('toolbar.status.exportMp3Error', { error: String(error) }));
      await showAlert(t('toolbar.export.failedMp3', { error: String(error) }));
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
      setStatus(t('toolbar.status.importFailed', { error: String(error) }));
      await showAlert(t('toolbar.import.failedProjectFile', { error: String(error) }));
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
      await showAlert(t('toolbar.import.corruptedKgstudio', { error: String(error) }));
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
      setStatus(t('toolbar.status.importingMidi', { name: file.name }));

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
      setStatus(t('toolbar.status.failedImportMidi', { error: errorMessage }));
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
      setStatus(t('toolbar.status.playbackFailedStart'));
    }
  };

  const handlePauseClick = async () => {
    if (DEBUG_MODE.TOOLBAR) {
      console.log("Pause button clicked");
    }
    try {
      await stopTransport();
      if (isRecording) {
        setStatus(t('toolbar.status.recordingStoppedCommitted'));
      }
    } catch (error) {
      console.error("Failed to stop playback:", error);
      setStatus(t('toolbar.status.failedStopPlayback'));
    }
  };

  const handleBackToBeginningClick = () => {
    if (DEBUG_MODE.TOOLBAR) {
      console.log("Back to beginning button clicked");
    }
    setPlayheadPosition(0);
    requestMainContentScroll(0);
    requestPianoRollScroll(0);
  };

  const handleLoopToggle = () => {
    toggleLoop();
    if (DEBUG_MODE.TOOLBAR) {
      console.log("Loop toggle clicked");
    }
  };

  // Prompt to change max bars when clicking on current-time display
  const handleCurrentTimeClick = async () => {
    const MIN_BARS = 16;
    const newMaxBarsStr = await showPrompt(t('toolbar.maxBars.prompt', { min: MIN_BARS }), String(maxBars ?? 32));
    if (newMaxBarsStr === null) {
      return; // cancelled
    }
    const parsed = parseInt(newMaxBarsStr.trim(), 10);
    if (isNaN(parsed)) {
      await showAlert(t('toolbar.input.invalidNumber'));
      return;
    }
    if (parsed < MIN_BARS) {
      await showAlert(t('toolbar.maxBars.invalid', { min: MIN_BARS }));
      return;
    }
    setMaxBars(parsed);
    setStatus(t('toolbar.status.maxBarsChanged', { value: parsed }));
  };

  const handleBpmClick = async () => {
    if (DEBUG_MODE.TOOLBAR) {
      console.log("BPM clicked, current BPM:", bpm);
    }

    const newBpmStr = await showPrompt(t('toolbar.bpm.prompt', { min: TIME_CONSTANTS.MIN_BPM, max: TIME_CONSTANTS.MAX_BPM }), displayedBpm.toString());

    // Check if user cancelled
    if (newBpmStr === null) {
      return;
    }

    // Validate input
    const newBpm = parseInt(newBpmStr.trim());

    // Check if it's a valid number
    if (isNaN(newBpm)) {
      await showAlert(t('toolbar.input.invalidNumber'));
      return;
    }

    // Check if it's within valid range
    if (newBpm <= TIME_CONSTANTS.MIN_BPM || newBpm >= TIME_CONSTANTS.MAX_BPM) {
      await showAlert(t('toolbar.bpm.invalid', { min: TIME_CONSTANTS.MIN_BPM, max: TIME_CONSTANTS.MAX_BPM }));
      return;
    }

    // Update BPM
    if (activeTempoRegion) {
      KGCore.instance().executeCommand(new UpdateTempoRegionCommand(activeTempoRegion.getId(), newBpm));
      bumpAudioWaveformRedrawVersion();
      refreshProjectState();
    } else {
      setBpm(newBpm);
    }
    setStatus(t('toolbar.status.bpmChanged', { value: newBpm }));

    if (DEBUG_MODE.TOOLBAR) {
      console.log(`BPM updated from ${displayedBpm} to ${newBpm}`);
    }
  };

  const handleTimeSignatureClick = async () => {
    if (DEBUG_MODE.TOOLBAR) {
      console.log("Time signature clicked, current:", `${timeSignature.numerator}/${timeSignature.denominator}`);
    }

    const result = await showTimeSigPrompt(t('toolbar.timeSignature.prompt'), timeSignature);
    if (result === null) return;

    const newTimeSignature = parseTimeSignature(`${result.numerator}/${result.denominator}`);
    if (newTimeSignature === null) {
      await showAlert(getTimeSignatureErrorMessage());
      return;
    }

    setTimeSignature(newTimeSignature);
    setStatus(t('toolbar.status.timeSignatureChanged', { value: `${newTimeSignature.numerator}/${newTimeSignature.denominator}` }));

    if (DEBUG_MODE.TOOLBAR) {
      console.log(`Time signature updated to ${newTimeSignature.numerator}/${newTimeSignature.denominator}`);
    }
  };

  const handleKeySignatureChange = (newKeySignature: string) => {
    if (DEBUG_MODE.TOOLBAR) {
      console.log("Key signature changed from", displayedKeySignature, "to", newKeySignature);
    }

    if (activeKeySignatureRegion) {
      KGCore.instance().executeCommand(new UpdateKeySignatureRegionCommand(
        activeKeySignatureRegion.getId(),
        newKeySignature as KeySignature
      ));
      refreshProjectState();
    } else {
      setKeySignature(newKeySignature as KeySignature);
    }
    setStatus(t('toolbar.status.keySignatureChanged', { value: newKeySignature }));
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
      setStatus(t('toolbar.status.copied'));
      if (DEBUG_MODE.TOOLBAR) {
        console.log("Items copied successfully");
      }
    } else {
      setStatus(t('toolbar.status.copyNone'));
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

    const pasteResult = handlePasteOperation();

    if (pasteResult.success) {
      setStatus(t('toolbar.status.pasted'));
      if (DEBUG_MODE.TOOLBAR) {
        console.log("Items pasted successfully");
      }
    } else if (!pasteResult.failureMessageShown) {
      setStatus(t('toolbar.status.pasteFailed'));
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
      setStatus(t('toolbar.status.deleted'));
      if (DEBUG_MODE.TOOLBAR) {
        console.log("Regions deleted successfully");
      }
    } else {
      setStatus(t('toolbar.status.deleteNone'));
      if (DEBUG_MODE.TOOLBAR) {
        console.log("No regions were selected for deletion");
      }
    }
  };

  // Handle split region button click
  const handleSplitClick = async () => {
    if (DEBUG_MODE.TOOLBAR) {
      console.log("Split button clicked");
    }

    const status = await splitSelectedRegionAtPlayhead({
      selectedRegionIds,
      playheadPosition,
      refreshProjectState,
    });
    if (!status) {
      return;
    }

    setStatus(status);

    if (DEBUG_MODE.TOOLBAR) {
      console.log(`Split selected region at beat ${playheadPosition}`);
    }
  };

  const handleMergeClick = async () => {
    if (DEBUG_MODE.TOOLBAR) {
      console.log('Merge button clicked');
    }

    const status = await mergeSelectedMidiRegions({
      selectedRegionIds,
      refreshProjectState,
    });
    if (!status) {
      return;
    }

    setStatus(status);
  };

  // Handle undo button click
  const handleUndoClick = async () => {
    if (DEBUG_MODE.TOOLBAR) {
      console.log("Undo button clicked");
    }

    if (!canUndo) {
      await showAlert(t('toolbar.undo.none'));
      return;
    }

    undo();
    const description = undoDescription || t('toolbar.action');
    setStatus(t('toolbar.status.undid', { description }));

    if (DEBUG_MODE.TOOLBAR) {
      console.log(`Undo successful: ${description}`);
    }
  };

  // Handle redo button click
  const handleRedoClick = async () => {
    if (DEBUG_MODE.TOOLBAR) {
      console.log("Redo button clicked");
    }

    if (!canRedo) {
      await showAlert(t('toolbar.redo.none'));
      return;
    }

    redo();
    const description = redoDescription || t('toolbar.action');
    setStatus(t('toolbar.status.redid', { description }));

    if (DEBUG_MODE.TOOLBAR) {
      console.log(`Redo successful: ${description}`);
    }
  };

  // Handle chat button click
  const handleChatClick = () => {
    if (DEBUG_MODE.TOOLBAR) {
      console.log("Chat button clicked");
    }

    if (showSettings) {
      activateSidePanel('chat');
    } else {
      toggleChatBox();
    }
    setStatus(t('toolbar.status.chatToggled'));
  };

  // Handle settings button click
  const handleSettingsClick = () => {
    if (DEBUG_MODE.TOOLBAR) {
      console.log("Settings button clicked");
    }

    toggleSettings();
    setStatus(t('toolbar.status.settingsToggled'));
  };

  // K.G.One panel toggle
  const handleKGOneClick = () => {
    if (DEBUG_MODE.TOOLBAR) {
      console.log("K.G.One button clicked");
    }

    if (showSettings) {
      activateSidePanel('kgone');
      return;
    }

    toggleKGOnePanel();
  };

  const handleEventListClick = () => {
    if (DEBUG_MODE.TOOLBAR) {
      console.log("Event List button clicked");
    }

    if (showSettings) {
      activateSidePanel('eventList');
      return;
    }

    toggleEventListPanel();
  };

  // Handle Piano button click: open piano roll if closed, targeting active or selected region
  const handlePianoButtonClick = async () => {
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
    const candidateRegionId = activeRegionId || lastSelectedRegionId;

    if (!candidateRegionId) {
      if (DEBUG_MODE.TOOLBAR) {
        console.log('No active or selected region; piano roll will not open');
      }
      await showAlert(t('toolbar.pianoRoll.selectMidiRegion'));
      return;
    }

    setActiveRegionId(candidateRegionId);
    setShowPianoRoll(true);
    if (DEBUG_MODE.TOOLBAR) {
      console.log(`Opening piano roll for region ${candidateRegionId}`);
    }
  };

  const handleMetronomeToggle = () => {
    toggleMetronome();
    if (DEBUG_MODE.TOOLBAR) {
      console.log('Metronome toggled');
    }
  };

  const handleRecordClick = async () => {
    if (isRecording) {
      await stopRecording();
      setStatus(t('toolbar.status.recordingStopped'));
      return;
    }

    const selectedTrack = useProjectStore.getState().tracks.find(track => track.getId().toString() === selectedTrackId) ?? null;
    if (selectedTrack instanceof KGAudioTrack) {
      await startRecording();
      setStatus(t('toolbar.status.audioRecordingStarted'));
      return;
    }

    // Require an active or selected MIDI region
    const candidateId = activeRegionId ?? lastSelectedRegionId;
    if (!candidateId) {
      await showAlert(t('toolbar.recording.openMidiRegion'));
      return;
    }
    const tracks = KGCore.instance().getCurrentProject().getTracks();
    let isMidi = false;
    for (const track of tracks) {
      const region = track.getRegions().find(r => r.getId() === candidateId);
      if (region) { isMidi = region instanceof KGMidiRegion; break; }
    }
    if (!isMidi) {
      await showAlert(t('toolbar.recording.selectMidiRegion'));
      return;
    }

    // Require at least one connected MIDI device
    if (KGMidiInput.instance().getConnectedInputCount() === 0) {
      await showAlert(t('toolbar.recording.noMidiDevice'));
      return;
    }

    // Ensure the piano roll is open showing the target region
    if (!activeRegionId) {
      setActiveRegionId(candidateId);
      setShowPianoRoll(true);
    }

    await startRecording();
    setStatus(t('toolbar.status.recordingStarted'));
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
            title={projectName}
          >
            {projectName}
          </div>
        </div>

        <div className="toolbar-center">
          <button title={t('toolbar.button.new')} onClick={handleNewProject}><FaPlus /></button>
          <button title={t('toolbar.button.load')} onClick={handleLoadProject}><FaFolderOpen /></button>
          <button title={t('toolbar.button.save')} onClick={handleSaveProject}><FaSave /></button>
          <div style={{ position: 'relative', display: 'inline-block' }}>
            <button
              title={t('toolbar.button.export')}
              onClick={() => setShowExportDropdown(!showExportDropdown)}
              style={{ display: 'flex', alignItems: 'center', gap: '4px' }}
            >
              <FaDownload />
            </button>
            <div style={{ position: 'absolute', top: '100%', left: 0, zIndex: 10000 }}>
              <KGDropdown
                options={exportOptions}
                value={exportOptions[0].value}
                onChange={handleExportProject}
                label={t('toolbar.export.label')}
                hideButton={true}
                isOpen={showExportDropdown}
                onToggle={setShowExportDropdown}
                className="export-dropdown"
              />
            </div>
          </div>
          <button title={t('toolbar.button.import')} onClick={handleImportProject}><FaUpload /></button>
          <button
            title={t('toolbar.button.settings')}
            className={`tool-button ${showSettings ? 'active' : ''}`}
            onClick={handleSettingsClick}
          >
            <FaCog />
          </button>
          <div className="toolbar-separator"></div>
          <button title={t('toolbar.button.undo')} onClick={handleUndoClick}><FaUndo /></button>
          <button title={t('toolbar.button.redo')} onClick={handleRedoClick}><FaRedo /></button>
          <div className="toolbar-separator"></div>
          <button
            title={t('toolbar.button.select')}
            className={`tool-button ${activeMainTool === 'pointer' ? 'active' : ''}`}
            onClick={() => handleMainToolSelect('pointer')}
          >
            <FaMousePointer />
          </button>
          <button
            title={t('toolbar.button.pencil')}
            className={`tool-button ${activeMainTool === 'pencil' ? 'active' : ''}`}
            onClick={() => handleMainToolSelect('pencil')}
          >
            <FaPencil />
          </button>
          <button
            title={t('toolbar.button.splitRegion')}
            onClick={handleSplitClick}
          >
            <FaCut />
          </button>
          <button
            title={t('toolbar.button.mergeRegions')}
            onClick={handleMergeClick}
          >
            <FaCompress />
          </button>
          <button
            title={t('toolbar.button.snapToGrid')}
            className={`tool-button ${isSnapping ? 'active' : ''}`}
            onClick={handleSnappingToggle}
          >
            <FaMagnet />
          </button>
          <div className="toolbar-separator"></div>
          <button title={t('toolbar.button.copy')} onClick={handleCopyClick}><FaCopy /></button>
          <button title={t('toolbar.button.paste')} onClick={handlePasteClick}><FaPaste /></button>
          <button title={t('toolbar.button.delete')} onClick={handleDeleteClick}><FaTrash /></button>
          <div className="toolbar-separator"></div>
          <button title={t('toolbar.button.backToBeginning')} className="button-back-to-beginning" onClick={handleBackToBeginningClick}><FaStepBackward /></button>
          {!isPlaying ? (
            <button title={t('toolbar.button.play')} className="button-play" onClick={handlePlayClick} disabled={isPreparingPlayback}><FaPlay /></button>
          ) : (
            <button title={t('toolbar.button.pause')} className="tool-button button-pause active" onClick={handlePauseClick}><FaPause /></button>
          )}
          <button
            title={isRecording ? t('toolbar.button.stopRecording') : t('toolbar.button.record')}
            className={`tool-button record-button ${isRecording ? 'active' : ''}`}
            onClick={handleRecordClick}
          >
            <FaCircle />
          </button>
          <button
            title={t('toolbar.button.loop')}
            className={`tool-button ${isLooping ? 'active' : ''}`}
            onClick={handleLoopToggle}
          >
            <FaSync />
          </button>
          <div className="toolbar-separator"></div>
          <button
            title={t('toolbar.button.metronome')}
            className={`tool-button ${isMetronomeEnabled ? 'active' : ''}`}
            onClick={handleMetronomeToggle}
          >
            <MetronomeIcon />
          </button>
          <button title={t('toolbar.button.piano')} onClick={handlePianoButtonClick}><PianoIcon /></button>
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
              <span className='current-bpm' onClick={handleBpmClick} style={{ cursor: 'pointer' }}>{displayedBpm}</span>
            </div>
            <div className="transport-item">
              <span className='current-time-signature' onClick={handleTimeSignatureClick} style={{ cursor: 'pointer' }}>{timeSignature.numerator + "/" + timeSignature.denominator}</span>
            </div>
            <div className="transport-item" style={{ position: 'relative' }}>
              <FloatingPopup
                isOpen={showKeySignatureDropdown}
                onClose={() => setShowKeySignatureDropdown(false)}
                placement="bottom"
                className="key-signature-popup-anchor"
                contentClassName="key-signature-popup-surface"
                panelClassName="key-signature-popup-panel"
                arrowClassName="key-signature-popup-arrow"
                trigger={(
                  <button
                    type="button"
                    className='current-key-signature'
                    onClick={() => setShowKeySignatureDropdown((current) => !current)}
                    aria-haspopup="dialog"
                    aria-expanded={showKeySignatureDropdown}
                    aria-label={t('toolbar.keySignatureChooser', { value: displayedKeySignature })}
                  >
                    {displayedKeySignature}
                  </button>
                )}
              >
                <KeySignaturePickerPopup value={displayedKeySignature} onChange={handleKeySignatureChange} />
              </FloatingPopup>
            </div>
          </div>
          <button
            title={t('toolbar.button.kgone')}
            onClick={handleKGOneClick}
            className={!showSettings && showKGOnePanel ? 'active' : ''}
          >
            <FaWandMagicSparkles />
          </button>
          <button
            title={t('toolbar.button.chat')}
            onClick={handleChatClick}
            className={!showSettings && showChatBox ? 'active' : ''}
          >
            <FaComments />
          </button>
          <button
            title={t('toolbar.button.eventList')}
            onClick={handleEventListClick}
            className={!showSettings && showEventListPanel ? 'active' : ''}
          >
            <FaListUl />
          </button>
        </div>
      </div>

      <FileImportModal
        isVisible={showImportModal}
        onClose={() => setShowImportModal(false)}
        onFileImport={handleFileImport}
        acceptedTypes={['.kgstudio', '.json', '.mid', '.midi']}
        title={t('toolbar.importProject.title')}
        description={t('toolbar.importProject.description')}
      />

      <LoadingOverlay
        visible={isOpeningProject}
        message={t('toolbar.openingProject')}
      />

      {showOpenProject && (
        <OpenProjectModal
          onClose={() => setShowOpenProject(false)}
          onConfirmOpenProject={handleConfirmOpenProject}
          onOpenProject={handleOpenProjectSelect}
          currentProjectName={savedProjectName}
          onCreateNewProject={createNewProject}
        />
      )}
    </>
  );
};

export default Toolbar; 
