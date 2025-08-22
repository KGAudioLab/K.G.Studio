# KGStudio: Digital Audio Workstation (DAW) Project Overview

## Project Introduction

KGStudio is a light-weighted, modern, web-based Digital Audio Workstation (DAW) built with React, TypeScript, and Zustand. The project aims to provide a professional-grade music production environment in the browser, with features comparable to desktop DAWs like Ableton Live, FL Studio, or Logic Pro.

## Ultimate Goals

1. Create a fully-functional DAW that runs in modern web browsers
2. Provide a professional-grade UI with intuitive workflows for music production
3. Support MIDI and audio recording, editing, and playback
4. Implement a plugin system for virtual instruments and effects
5. Enable project saving, loading, and export functionality
6. Optimize for performance to handle complex projects with many tracks

## Current Tech Stack

- **Frontend Framework**: React with TypeScript
- **State Management**: Zustand
- **Build Tool**: Vite
- **UI Components**: Custom components with CSS; icons via React Icons
- **Audio Engine**: Tone.js for Web Audio synthesis and playback (real soundfonts via Sampler)
- **Data Persistence**: IndexedDB using `idb`, class serialization with `class-transformer`
- **AI/Agent**: Configurable LLM provider (OpenAI/Claude/Gemini/compatible) with XML tool execution
- **Architecture Pattern**: Core/UI separation with a domain model and component-based UI

## Project Structure

```
KGStudio/
├── docs/                                # Project documentation
│   ├── USER_GUIDE.md                    # End-user guide
│   └── technical/
│       └── overview.md                  # Technical project overview (this document)
├── public/                               # Static assets
│   ├── apple-touch-icon.png              # PWA icon (Apple)
│   ├── config.json                       # Default application configuration
│   ├── favicon-96x96.png                 # Favicon (96x96)
│   ├── favicon.ico                       # Favicon (ICO)
│   ├── favicon.svg                       # Favicon (SVG)
│   ├── logo.png                          # Application logo
│   ├── logo-kgaudiolab.png               # Alternate brand logo (KGAudioLab)
│   ├── site.webmanifest                  # PWA manifest
│   ├── web-app-manifest-192x192.png      # PWA icon (192x192)
│   ├── web-app-manifest-512x512.png      # PWA icon (512x512)
│   ├── vite.svg                          # Vite logo
│   ├── chat/                             # Chat UI copy and errors
│   │   ├── error_no_openai_compatible_base_url.md
│   │   ├── error_no_openai_compatible_model.md
│   │   ├── error_no_openai_key.md
│   │   ├── error_no_selected_region.md
│   │   ├── welcome_again.md
│   │   ├── welcome_new.md
│   │   ├── custom_instructions_gpt-4o.md # Custom instructions template for GPT-4o
│   │   └── custom_instructions_qwen3-a3b-30b.md # Custom instructions template for Qwen3-A3B-30B
│   ├── demo/                             # Demo assets
│   │   ├── cover-FXgihfAH2vc.png         # Demo cover image
│   │   └── cover-vKbWAQRt0r0.png         # Demo cover image
│   ├── prompts/                          # AI system prompts
│   │   ├── system.md
│   │   ├── system_20250806.md
│   │   ├── user_msg_appendix.md
│   │   └── README.md                     # Prompt set overview
│   └── resources/                        # Application resources
│       ├── icon.png
│       ├── instrument_bg.png
│       ├── instrument_bg_v0.png
│       └── instruments/                  # Instrument icons (General MIDI)
│           ├── bass.png
│           ├── brass_ensemble.png
│           ├── cello.png
│           ├── clarinet.png
│           ├── contrabass.png
│           ├── drawbar_organ.png
│           ├── drums.png
│           ├── electric_guitar.png
│           ├── electric_piano.png
│           ├── flute.png
│           ├── french_horn.png
│           ├── guitar.png
│           ├── harp.png
│           ├── oboe.png
│           ├── orchestra_percussion_kit.png
│           ├── piano.png
│           ├── sax.png
│           ├── string_ensemble.png
│           ├── synth.png
│           ├── trombone.png
│           ├── trumpet.png
│           ├── viola.png
│           └── violin.png
├── src/
│   ├── agent/                            # AI agent system
│   │   ├── core/                         # Agent core components
│   │   │   ├── AgentCore.ts              # Main agent orchestration
│   │   │   ├── AgentState.ts             # Agent state management
│   │   │   ├── SystemPrompts.ts          # System prompts for AI
│   │   │   └── XMLToolExecutor.ts        # XML tool execution engine
│   │   ├── llm/                          # LLM integration
│   │   │   ├── ClaudeProvider.ts
│   │   │   ├── GeminiProvider.ts
│   │   │   ├── LLMProvider.ts            # Abstract LLM provider interface
│   │   │   ├── OpenAIProvider.ts         # OpenAI API integration
│   │   │   └── StreamingTypes.ts         # Streaming response types
│   │   └── tools/                        # Agent tools
│   │       ├── AddNotesTool.ts           # Tool for adding notes
│   │       ├── AttemptCompletionTool.ts  # Mark current task as completed
│   │       ├── BaseTool.ts               # Base tool class
│   │       ├── ReadMusicTool.ts          # Tool for reading music
│   │       ├── RemoveNotesTool.ts        # Tool for removing notes
│   │       ├── ThinkTool.ts              # Background thinking tool
│   │       ├── ThinkingTool.ts           # Alternative thought tool
│   │       └── index.ts                  # Tool exports
│   ├── App.css                           # Main application styles
│   ├── App.tsx                           # Main application component
│   ├── assets/
│   │   └── react.svg                     # React logo
│   ├── components/                       # React UI components
│   │   ├── ChatBox.tsx                   # Chatbox component
│   │   ├── InstrumentSelection.tsx       # Instrument picker
│   │   ├── TrackControl.tsx              # Track control component
│   │   ├── chat/
│   │   │   ├── AssistantMessage.tsx
│   │   │   ├── UserMessage.tsx
│   │   │   └── index.ts
│   │   ├── common/                       # Common reusable components
│   │   │   ├── FileImportModal.tsx
│   │   │   ├── KGDropdown.tsx
│   │   │   ├── LoadingOverlay.tsx
│   │   │   ├── Playhead.tsx
│   │   │   ├── icons/
│   │   │   │   └── PianoIcon.tsx
│   │   │   └── index.ts
│   │   ├── interfaces.ts                 # Shared interfaces
│   │   ├── MainContent.tsx               # Main track display area
│   │   ├── piano-roll/                   # Piano roll related components
│   │   │   ├── PianoGrid.tsx
│   │   │   ├── PianoGridHeader.tsx
│   │   │   ├── PianoKeys.tsx
│   │   │   ├── PianoNote.tsx
│   │   │   ├── PianoRoll.tsx
│   │   │   ├── PianoRollContent.tsx
│   │   │   ├── PianoRollHeader.tsx
│   │   │   ├── PianoRollToolbar.tsx
│   │   │   └── SelectionBox.tsx
│   │   ├── settings/
│   │   │   ├── SettingsPanel.tsx
│   │   │   ├── SettingsSidebar.tsx
│   │   │   ├── index.ts
│   │   │   └── sections/
│   │   │       ├── BehaviorSettings.tsx
│   │   │       ├── GeneralSettings.tsx
│   │   │       └── TemplatesSettings.tsx
│   │   ├── StatusBar.tsx                 # Status bar component
│   │   ├── Toolbar.tsx                   # Top toolbar component
│   │   └── track/
│   │       ├── RegionItem.tsx
│   │       ├── TrackGridItem.tsx
│   │       ├── TrackGridPanel.tsx
│   │       ├── TrackInfoItem.tsx
│   │       └── TrackInfoPanel.tsx
│   ├── constants/                        # Application constants
│   │   ├── coreConstants.ts              # Core application constants (DB, audio, etc.)
│   │   ├── generalMidiConstants.ts       # General MIDI mapping/constants
│   │   ├── index.ts                      # Constants re-export
│   │   ├── midiConstants.ts              # MIDI message constants
│   │   └── uiConstants.ts                # UI-related constants
│   ├── core/                             # Core application logic
│   │   ├── KGCore.ts                     # Main application singleton
│   │   ├── KGDebugger.ts                 # Debug utilities and testing tools
│   │   ├── KGProject.ts                  # Project model
│   │   ├── audio-interface/              # Advanced audio engine integration
│   │   │   ├── KGAudioBus.ts             # Individual track audio bus
│   │   │   ├── KGAudioInterface.ts       # Audio engine coordinator
│   │   │   ├── KGToneBuffersPool.ts      # Soundfont buffers pool
│   │   │   └── KGToneSamplerFactory.ts   # Sampler factory
│   │   ├── commands/                     # Command pattern implementation for undo/redo
│   │   │   ├── KGCommand.ts              # Base command class
│   │   │   ├── KGCommandHistory.ts       # Command history manager
│   │   │   ├── index.ts                  # Command exports
│   │   │   ├── note/
│   │   │   │   ├── CreateNoteCommand.ts
│   │   │   │   ├── CreateNotesCommand.ts
│   │   │   │   ├── DeleteNotesCommand.ts
│   │   │   │   ├── MoveNotesCommand.ts
│   │   │   │   ├── PasteNotesCommand.ts
│   │   │   │   └── ResizeNotesCommand.ts
│   │   │   ├── project/
│   │   │   │   └── ChangeProjectPropertyCommand.ts
│   │   │   ├── track/
│   │   │   │   ├── AddTrackCommand.ts         # Track command: add track
│   │   │   │   ├── RemoveTrackCommand.ts      # Track command: remove track
│   │   │   │   ├── ReorderTracksCommand.ts    # Track command: reorder tracks
│   │   │   │   └── UpdateTrackCommand.ts      # Track command: update track
│   │   │   └── region/
│   │   │       ├── CreateRegionCommand.ts
│   │   │       ├── DeleteRegionCommand.ts
│   │   │       ├── MoveRegionCommand.ts
│   │   │       ├── PasteRegionsCommand.ts
│   │   │       ├── ResizeRegionCommand.ts
│   │   │       └── UpdateRegionCommand.ts
│   │   ├── config/
│   │   │   ├── ConfigManager.ts          # JSON config loading/persistence
│   │   │   └── index.ts
│   │   ├── io/
│   │   │   └── KGStorage.ts              # IndexedDB storage layer
│   │   ├── midi/
│   │   │   └── KGMidiNote.ts
│   │   ├── project-upgrader/
│   │   │   ├── KGProjectUpgrader.ts
│   │   │   └── upgradeToV1.ts
│   │   ├── region/
│   │   │   ├── KGMidiRegion.ts
│   │   │   └── KGRegion.ts
│   │   ├── state/
│   │   │   ├── KGMainContentState.ts
│   │   │   └── KGPianoRollState.ts
│   │   └── track/
│   │       ├── KGMidiTrack.ts
│   │       └── KGTrack.ts
│   ├── hooks/
│   │   ├── useConfig.ts
│   │   ├── useGlobalKeyboardHandler.ts
│   │   ├── useNoteOperations.ts
│   │   ├── useNoteSelection.ts
│   │   └── useRegionOperations.ts
│   ├── index.css                         # Global styles
│   ├── main.tsx                          # Application entry point
│   ├── mock/
│   │   └── mockChat.ts                   # Mock chat data for testing
│   ├── stores/
│   │   └── projectStore.ts               # Project state management (Zustand)
│   ├── types/
│   │   └── projectTypes.ts               # TypeScript types
│   └── util/                             # Utility functions
│       ├── abcNotationUtil.ts
│       ├── chatUtil.ts
│       ├── copyPasteUtil.ts
│       ├── mathUtil.ts
│       ├── messageFilter/
│       │   └── UserMessageFilter.ts
│       ├── midiUtil.ts
│       ├── miscUtil.ts
│       ├── osUtil.ts
│       ├── regionDeleteUtil.ts
│       ├── saveUtil.ts
│       ├── timeUtil.ts
│       └── xmlUtil.ts
│
│   └── vite-env.d.ts                     # Vite environment types
├── CLAUDE.md                             # Claude-specific documentation
├── LICENSE                               # Project license
├── eslint.config.js                      # ESLint configuration
├── index.html                            # HTML entry point
├── package-lock.json                     # NPM lock file
├── package.json                          # NPM dependencies and scripts
├── README.md                             # Project readme
├── tsconfig.app.json                     # App-specific TypeScript config
├── tsconfig.json                         # TypeScript configuration
├── tsconfig.node.json                    # Node-specific TypeScript config
├── vite.config.ts                        # Vite build configuration
└── .gitignore                            # Git ignore rules
```

## Current Implementation

### Core Architecture

The application follows a core/UI separation pattern:

1. **KGCore** (Singleton): The main application class that manages the audio engine, project state, command history, and provides a global access point.
2. **Command System**: Complete undo/redo implementation using the Command Pattern:
   - **KGCommand**: Abstract base class for all undoable operations
   - **KGCommandHistory**: Manages command history with undo/redo stack and memory limits
   - **Track Commands**: Add, remove, reorder, and update tracks with full undo support
   - **Region Commands**: Create, delete, resize, move, paste, and update regions with undo support
   - **Note Commands**: Create, delete, resize, move, and paste notes with undo support
   - **Project Commands**: Change project properties (name, BPM, time signature) with selective undo
3. **ConfigManager** (Singleton): Manages application configuration including hotkeys, general settings (LLM provider, API keys, soundfont base URL), behavior (e.g., chatbox default open), and templates. Loads defaults from `/public/config.json` (with robust fallback) and persists user customizations via KGStorage.
4. **KGStorage** (Singleton): Generic storage system providing unified access to IndexedDB for projects, configuration, and other data. Replaces individual storage implementations with a centralized, reusable storage layer.
5. **KGAudioInterface** (Singleton): High-level audio engine coordinator that manages track audio buses and orchestrates playback.
6. **KGAudioBus**: Individual track audio processing unit with realistic instrument samples, volume, mute, solo, and effect chain support.
7. **KGToneSamplerFactory** (Singleton): Factory for creating Tone.js samplers loaded with high-quality soundfont samples.
8. **KGToneBuffersPool** (Singleton): Efficient buffer management system that loads and caches soundfont audio data from remote CDNs.
9. **KGProject**: Represents a music project with properties like name, BPM, time signature, and tracks.
10. **KGTrack/KGMidiTrack**: Represents a track in the project with instrument support for MIDI tracks.
11. **Project Upgrader**: On load/import, `upgradeProjectToLatest` migrates legacy projects to the latest `KGProject.CURRENT_PROJECT_STRUCTURE_VERSION` (e.g., instrument mapping in V1).
11. **KGRegion/KGMidiRegion**: Represents a region in a track (a MIDI clip, audio clip, etc.).
12. **KGMidiNote**: Represents a MIDI note with properties like pitch, velocity, start and end beats.

### Component Architecture

The UI follows a hierarchical component-based architecture:

1. **App**: Main container component that orchestrates the overall application layout
2. **Toolbar**: Handles top toolbar functionality including transport controls and project name
3. **MainContent**: Coordinates between track info and grid panels, manages data flow
   - **TrackInfoPanel**: Container for track information panels
     - **TrackInfoItem**: Individual track information panel with controls
   - **TrackGridPanel**: Container for track grid areas
     - **TrackGridItem**: Individual track grid with regions
       - **RegionItem**: Individual region within a track
4. **TrackControl**: Provides controls for adding and managing tracks
5. **StatusBar**: Displays application status information
6. **PianoRoll**: Modal component for MIDI note editing
   - **PianoRollHeader**: Header component with title and close button
   - **PianoRollToolbar**: Toolbar with editing tools and quantization options
   - **PianoRollContent**: Main content area that orchestrates piano roll components
     - **PianoGridHeader**: Bar numbers display at the top of the grid
     - **PianoKeys**: Piano keyboard visualization on the left side
     - **PianoGrid**: Main grid area for note editing
       - **PianoNote**: Individual MIDI note component
       - **SelectionBox**: Box selection UI for selecting multiple notes
7. **Common Components**: Reusable UI components
   - **KGDropdown**: Reusable dropdown component for consistent dropdown behavior

### Settings System

- Dedicated settings UI with sections: `General`, `Behavior`, `Templates`.
- Uses `ConfigManager` and `useConfig` hook for auto-load and debounced save.
- General: LLM provider/model/keys, OpenAI-compatible base URL, soundfont base URL.
- Behavior: chatbox default open at startup.
- Templates: custom instructions for the agent.

### AI Agent & Chat Integration

- `ChatBox` integrates an `AgentCore` with pluggable LLM providers (OpenAI, Claude, Gemini, OpenAI-compatible) selected via settings.
- User messages pass through `UserMessageFilter` supporting slash-commands: `/clear`, `/welcome` and context validation (e.g., require a selected region).
- Agent responses can include XML tool calls executed by `XMLToolExecutor` with tools such as `AddNotesTool`, `RemoveNotesTool`, `ReadMusicTool`, `ThinkTool`.
- System and user prompt appendix are loaded from `/public/prompts` for richer context.

### Instrument & Soundfont System

- Instrument selection panel with groups and previews using `FLUIDR3_INSTRUMENT_MAP` and General MIDI groupings.
- Realistic playback via Tone.Sampler created by `KGToneSamplerFactory` and buffers from `KGToneBuffersPool` (downloaded from a configurable CDN).
- Global loading overlay shows while instrument buffers are loading; auto-hides and warns if loading takes too long.

### Keyboard Shortcuts

- Shortcuts are configurable via `config.json` and `ConfigManager`.
- Global: play/pause, undo/redo, copy/cut/paste, save, hold-to-create-region.
- Piano roll: tool switching (select/pencil), hold-to-create-note, snapping presets and quantize position/length presets.

This structure provides clear separation of concerns and improves maintainability.

### Custom Hooks

The application uses custom hooks to extract and reuse complex logic:

1. **useNoteOperations**: Manages note creation, resizing, and dragging operations
2. **useNoteSelection**: Manages note selection, including individual selection and box selection
3. **useGlobalKeyboardHandler**: Handles global keyboard shortcuts for copy/paste functionality across the application

### State Management

Zustand is used for state management with a primary store, complemented by singleton state classes:

1. **projectStore**: Manages the project state including project name, tracks, BPM, time signature, and provides actions for modifying the project.
2. **KGPianoRollState**: Singleton state management for piano roll settings including active tool, snapping options, and quantization preferences.

### Current Features

1. **Project Management**:
   - Create and load projects
   - Set project properties (name, BPM, time signature)
   - **Project persistence**: Save and load projects using IndexedDB with automatic serialization
   - **File operations**: New, Load, Save, and Export buttons in toolbar with confirmation dialogs
   - **Automatic data model serialization**: All project data (tracks, regions, notes) automatically preserved

2. **Track Management**:
   - Add tracks with realistic instrument selection (Piano, Guitar, Bass, Drums)
   - Rename tracks
   - Reorder tracks via drag and drop
   - Advanced track controls (volume, solo, mute) with real-time audio processing
   - **Modular Audio Bus Architecture**: Each track gets a dedicated KGAudioBus with realistic instrument samples
   - **Async Track Creation**: Tracks load high-quality soundfont samples on creation
   - **Instrument Switching**: Change track instruments with seamless audio transitions

3. **Region Management**:
   - Create regions by double-clicking on track grid
   - Regions display with headers and content areas
   - Regions are tied to the data model (KGMidiRegion)
   - Regions maintain proper positioning when tracks are reordered
   - Resize regions from both start and end edges with bar snapping
   - **Expand from beginning**: Left edge resize properly adjusts note positions to maintain absolute timing
   - Move regions horizontally within tracks and vertically between tracks via drag and drop
   - Visual feedback during resize and drag operations (cursor changes, animation effects)
   - **Canvas-based note visualization**: Real-time display of MIDI notes as white horizontal lines within regions
   - **Dynamic pitch centering**: Automatically centers display around note content or C4 as fallback
   - **Adaptive pitch spacing**: Compresses note spacing when range is large to ensure all notes are visible

4. **Piano Roll**:
   - Draggable/resizable panel
   - Piano keyboard visualization
   - Grid visualization for note editing
   - Auto-scroll to middle C
   - Toolbar with editing tools (pointer, pencil)
   - Snapping options with triplet support for note positioning during drag operations
   - Quantization options for note position and length with triplet support
   - Keyboard shortcut (ESC) to close the piano roll
   - Rename dialog prevention during drag operations
   - Note creation with double-click
   - Note resizing from both edges with minimum length constraint
   - Note dragging with horizontal snapping and vertical movement
   - Multi-note operations: resize and drag deltas applied to all selected notes
   - Visual feedback during resize and drag operations
   - Note selection with click and shift+click for multi-selection
   - Box selection with shift+drag toggle behavior for multi-selection
   - Quantize position: snap selected notes to nearest beat grid based on time signature
   - Quantize length: adjust note durations with smart extension for short notes
   - Integration with core selection system and singleton state management
   - **Note Preview with Real Instruments**: Immediate audio feedback when creating notes using authentic instrument samples

5. **Configuration & Storage Management**:
   - **JSON-based configuration**: Default settings loaded from `/public/config.json` including hotkeys and general preferences
   - **User customization persistence**: ConfigManager maintains user overrides while preserving defaults
   - **Generic storage layer**: KGStorage provides unified IndexedDB access for all data types (projects, config, etc.)
   - **Centralized constants**: All database and storage constants managed in `coreConstants.ts`
   - **Type-safe configuration**: Full TypeScript interfaces for configuration structure validation

6. **Data Persistence**:
   - **Automatic serialization/deserialization**: Uses class-transformer for seamless data conversion
   - **Class instance preservation**: All objects maintain their methods and inheritance after save/load
   - **Browser-based storage**: Projects stored locally using IndexedDB for offline capability
   - **Type-safe data handling**: Full TypeScript support with proper class instantiation

7. **Advanced Audio Engine & Realistic Instruments**:
   - **Professional Soundfont Integration**: High-quality instrument samples from FluidR3_GM soundfonts via remote CDN loading
   - **Realistic Instrument Library**: Authentic piano, guitar, bass, and drum sounds replacing synthetic oscillators
   - **Modular Audio Bus System**: Each track operates through a dedicated KGAudioBus with complete audio processing chain
   - **Intelligent Buffer Management**: KGToneBuffersPool efficiently loads and caches audio samples (A0-C8 range) on-demand
   - **Async Audio Factory Pattern**: KGToneSamplerFactory creates fully-loaded samplers with proper error handling
   - **Real-time Audio Playback**: Full project playback with BPM-accurate timing using realistic instrument samples
   - **Automatic Audio Context Management**: Browser autoplay policy compliance with graceful fallback
   - **Advanced Track Controls**: Individual track volume, mute, solo with sophisticated audio routing
   - **Note Preview with Real Instruments**: Immediate audio feedback using actual instrument samples with proper durations
   - **Future-Ready Architecture**: Prepared for audio effects, filters, and advanced routing capabilities

8. **Playhead & Transport Controls**:
   - **Visual playhead indicator**: Blue-green vertical line with triangular marker showing current position
   - **Interactive timeline navigation**: Click on bar numbers to jump playhead to nearest bar start
   - **Dual-context rendering**: Playhead appears in both main track view and piano roll with proper positioning
   - **Play/pause functionality**: Transport controls with state management and visual feedback
   - **Timer-based playback**: BPM-accurate playhead movement during playback
   - **Back to beginning**: Quick reset button to return playhead to project start
   - **Automatic reset**: Playhead resets to position 0 when loading projects
   - **Reactive state management**: Real-time UI updates synchronized between core engine and interface

9. **Comprehensive Undo/Redo System**:
   - **Command Pattern Architecture**: All operations implemented as undoable commands
   - **Full Operation Coverage**: Undo/redo support for tracks, regions, notes, and project properties
   - **Selective Property Tracking**: Only modified properties are tracked for efficient undo operations
   - **Keyboard Shortcuts**: Ctrl/Cmd+Z for undo, Ctrl/Cmd+Y for redo with visual feedback
   - **UI Integration**: Real-time undo/redo state displayed in toolbar with operation descriptions
   - **Memory Management**: Configurable command history limits to prevent memory leaks
   - **State Consistency**: Proper UI synchronization after undo/redo operations
   - **Multi-Selection Support**: Batch operations on multiple selected items with single undo entry

10. **Copy & Paste System**:
   - **Keyboard shortcuts**: Ctrl/Cmd+C and Ctrl/Cmd+V for copy/paste operations
   - **Toolbar buttons**: Dedicated Copy and Paste buttons in the main toolbar
   - **Context-aware pasting**: Intelligent paste behavior based on current context (regions vs. notes)
   - **Region copy/paste**: Copy and paste MIDI regions between tracks at playhead position with undo support
   - **Note copy/paste**: Copy and paste MIDI notes within piano roll editor with undo support
   - **Reusable utilities**: Centralized copy/paste logic in `copyPasteUtil.ts` for consistent behavior
   - **Status feedback**: Real-time status messages showing copy/paste operation results

11. **UI/UX**:
    - Responsive layout
    - Status bar with system messages
    - Transport display (position, BPM, time signature)
    - Component-based architecture for better maintainability
    - Interactive cursors for different operations (grab/grabbing for moving, resize cursors for edges)
    - Reusable UI components for consistent behavior (KGDropdown)
    - Proper z-index management for overlapping UI elements
    - Custom hooks for complex UI logic

12. **Settings Panel**:
    - General, Behavior, Templates sections with persistent config and debounced saves
    - LLM provider switching without reload

13. **AI Assistant**:
    - Chat with slash-commands (`/clear`, `/welcome`)
    - Region-aware messaging; tool-execution pipeline for music edits

14. **Instrument Library**:
    - General MIDI-based instrument browsing with icons and real soundfonts
    - Instant note preview using the selected instrument

15. **Project Upgrader**:
    - Automatic migration of legacy projects to the latest structure version

16. **Global Loading Overlay**:
    - Shows while soundfonts download; safety timeout with user guidance if loading stalls

## Features To Be Implemented

1. **Audio Engine Enhancement**:
   - Audio recording capabilities  
   - MIDI input/output support
   - Real-time audio processing and effects
   - Audio effects and plugin support

2. **Advanced Playback Features**:
   - Loop regions and loop playback
   - Tempo automation and tempo changes during playback
   - Audio-visual waveform synchronization
   - Latency compensation and high-precision timing

3. **Advanced Region Features**:
   - Region splitting and merging
   - Audio waveform visualization for audio regions

4. **Advanced Track Features**:
   - Track types (MIDI, audio, instrument, etc.)
   - Track effects and processing
   - Track automation

5. **MIDI Editing**:
   - Velocity editing
   - MIDI CC automation

6. **Audio Editing**:
   - Waveform visualization
   - Audio clip editing
   - Audio effects

7. **Advanced Project Management**:
   - Export to audio formats
   - Project templates

8. **Performance Optimizations**:
   - Virtualized track rendering
   - Audio buffer management
   - Worker threads for processing

9. **Plugin System**:
   - Virtual instrument support
   - Effect plugin support
   - Plugin browser and management

## Development Guidelines

1. **Architecture**:
   - Maintain separation between core logic and UI
   - Use TypeScript interfaces for all models
   - Follow the singleton pattern for global services
   - Implement Command Pattern for all undoable operations
   - Structure UI as modular, self-contained components
   - Follow component hierarchy with clear responsibilities
   - Extract complex logic to custom hooks

2. **State Management**:
   - Keep UI state in Zustand stores
   - Sync UI state with core models
   - Use command pattern for all data modifications
   - Execute commands through KGCore for undo/redo support
   - Keep component state local when appropriate
   - Use refs for tracking async state updates

3. **UI Development**:
   - Follow existing CSS patterns and variables
   - Maintain responsive design
   - Optimize for performance with React best practices
   - Extract reusable components to improve maintainability
   - Keep related functionality together in the same component
   - Ensure proper z-index management for overlapping UI elements
   - Organize components by functionality (piano, track, etc.)

4. **Component Communication**:
   - Parent components provide data via props
   - Child components notify parents via callbacks
   - UI components handle their own interactions
   - Parent components coordinate data model updates
   - Use custom hooks to share logic between components

5. **Configuration and Constants**:
   - Use centralized constants in the constants folder (`coreConstants.ts` for core, `uiConstants.ts` for UI)
   - Default application settings defined in `/public/config.json`
   - ConfigManager handles user customizations with persistent storage
   - KGStorage provides generic access to IndexedDB for all storage needs
   - Debug mode flags control console logging for different components
   - Use refs for tracking async state updates
   - Verify model updates after they occur

6. **Testing**:
   - Write unit tests for core logic
   - Write integration tests for UI components
   - Test audio processing with specialized audio testing tools

## Current Limitations

1. Limited keyboard shortcuts
2. Limited note editing capabilities (no velocity editing)
3. Export functionality UI only (no actual export implementation)
4. No audio recording capabilities yet
5. Limited audio effects and processing
6. No project browser UI (projects load/save by typing names)

This document serves as a high-level overview of the KGStudio project, its architecture, current implementation, and future development plans. It should be updated as the project evolves to reflect the current state and goals.
