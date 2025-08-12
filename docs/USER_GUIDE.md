# K.G.Studio User Guide

A lightweight, browser‑based DAW with an AI Agent "K.G.Studio Musician Assistant". This guide walks you through setup, the interface, and everyday workflows.

## 1. Introduction
- K.G.Studio runs entirely in your browser. It provides track and region editing, a piano‑roll editor, realistic instrument playback (Tone.js samplers with FluidR3 soundfonts), robust undo/redo, and project persistence.
- K.G.Studio Musician Assistant can respond to natural language prompts and execute edit tools on your behalf.

## 2. System Requirements
- Tested on Chrome, Firefox, and Safari. It should work on other modern browsers, but those are not officially tested yet.
- macOS, Windows, or Linux.
- Network access is only needed for downloading instrument sound samples and contacting your selected LLM provider.

## 3. Quick Start
- **Use the hosted app: [K.G.Studio (kgaudiolab.github.io/kgstudio)](https://kgaudiolab.github.io/kgstudio)**
- Or clone and run locally:
  ```bash
  # Make sure you have Node.js >= 20.19.3 installed
  # Clone the repository
  git clone https://github.com/KGAudioLab/KGStudio {your-local-path}
  cd {your-local-path}

  # Install dependencies
  npm install

  # Run the development server
  npm run dev
  ```
- First run:
  - A welcome message will be shown on the K.G.Studio Musician Assistant chatbox, please follow the instructions to configure the LLM provider.
- Your data is stored in your browser’s IndexedDB (on your device).

## 4. Data, Privacy, and Connectivity
- IndexedDB is your browser’s local database for this site; it never leaves your machine and is cleared if you clear the site’s data.
- Per‑origin storage: IndexedDB is not shared across different hosts/origins, across different browsers, or separate browser profiles. To move or share your work, use Export (KGStudio JSON) and Import on the destination.
- K.G.Studio is fully client‑side. It connects to the network only to:
  - Download instrument soundfonts from the configured CDN
  - Communicate with your chosen LLM provider (OpenAI or OpenAI‑compatible)
- API keys are not persisted when running from a non‑local host (to reduce XSS risk). You’ll be prompted to re‑enter them on each start in that scenario.
- Important: While K.G.Studio does not collect your data, different LLM providers may have different data‑retention policies. Review the policy of the provider you select before use.

## 5. User Interface Tour
### Toolbar
- Left
  - Logo
  - Project name (click to rename)
- Center (exact order)
  - New, Load, Save, Export (dropdown), Import
  - Undo, Redo
  - Pointer tool, Pencil tool
  - Copy, Paste, Delete
  - Back to beginning, Play/Pause
  - Piano button (open piano roll for the active/selected region)
- Right
  - Transport readouts: current time | BPM | time signature | key signature
    - Click time to set max bars, BPM to change BPM, time signature to change signature; key signature opens a dropdown.
  - Settings (gear)
  - Chat (speech bubble) — toggles the AI chatbox on the right

### Track Area
- Track info column
  - Solo (S), Mute (M), volume, instrument button (piano icon)
  - Settings button (to the right of the instrument button) with a Delete Track option
- Track grid
  - Regions display as blocks with a header; the small pencil on the top‑left of a region opens its Piano Roll.

### Instrument Selection Panel
- Appears automatically on load/first track creation, or when clicking a track’s instrument button (to the right of “M”).
- Choose instrument groups and individual instruments; a large preview is shown.
- Stays open until you close it (X) or click the same track’s instrument button again.

### Chatbox (AI Assistant)
- Docked on the right; toggle from the toolbar.
- Press Enter to send; Shift+Enter for a new line.

### Status Bar and Loading Overlay
- Status messages appear at the bottom.
- A global loading overlay shows while soundfonts are downloading.

### Piano Roll Window
- Header: close (X) on the left; title (click to rename); tools (Select, Pencil); menus on the right: NO SNAP, Qua. Pos. (quantize start), Qua. Len. (quantize length).
- ESC closes the piano roll.

## 6. Projects
- New, Save (to IndexedDB), Load (from IndexedDB by name).
- Export: KGStudio JSON, MIDI.
- Import: KGStudio JSON (replaces current project state), MIDI (appends tracks/regions into the current project).
- Legacy compatibility: projects are upgraded to the latest structure on load.

## 7. Tracks
- Add, rename, and reorder tracks.
- Change instrument (instrument button in the track info row). Real instruments are powered by Tone.Sampler and FluidR3 soundfonts.
- Solo/Mute/Volume controls for quick mixing.
- Track settings (button to the right of the instrument) provides Delete Track.

## 8. Regions
- Create regions
  - Pointer tool: double‑click; or hold Ctrl/Cmd and click
  - Pencil tool: single‑click to create
- Move/resize by dragging the region or its edges; copy/paste with toolbar buttons or shortcuts.
- Delete selected regions from the toolbar delete button.
- Open Piano Roll via the region’s small pencil on the top‑left.

## 9. Piano Roll (MIDI Editing)
- Tools: Select vs Pencil.
- Create notes: double‑click or Ctrl/Cmd+click (Select); single‑click (Pencil).
- Move/resize notes by dragging; box‑select or Shift‑click for multi‑selection.
- NO SNAP menu controls snapping for create/move/resize.
- Quantize using Qua. Pos. (start) and Qua. Len. (length) menus.
- Close with X or ESC.

## 10. Playback and Transport
- Back to beginning; Play/Pause.
- Set playhead by clicking bar numbers in the main grid; in Piano Roll, click the header timeline (respects snapping).
- Edit time/BPM/time signature/key signature via the toolbar readouts.

## 11. Undo/Redo and Clipboard
- Undo/Redo available for tracks, regions, notes, and project properties.
- Copy/Paste works for regions in the main grid and notes in the piano roll.
- Use toolbar buttons or keyboard shortcuts.

## 12. Instruments and Soundfonts
- Instruments are organized by groups (e.g., Piano & Keyboards, Strings, Brass, Woodwind, Percussion Kit, Synthesizer).
- Playback uses high‑quality FluidR3 soundfonts via Tone.Sampler.
- If loading stalls, the overlay will time out; refresh to retry downloading.

## 13. Settings
- General: LLM provider (OpenAI or OpenAI‑compatible), API key, model, soundfont base URL.
- Behavior: chatbox default open at startup.
- Templates: custom instructions for the AI.
- Settings persist in IndexedDB (local); API keys are not persisted on non‑local hosts.

## 14. AI Agent "K.G.Studio Musician Assistant"
- Open the chat (toolbar). Describe goals in natural language (e.g., “Can you help me write a 4‑bar chord progression for the melody?”).
- The agent executes tools to edit your project. Actions are typically scoped to the selected region.
- Slash‑commands:
  - `/clear` — clear chat history
  - `/welcome` — show the welcome message
- Providers: OpenAI or OpenAI‑compatible (e.g., OpenRouter). Due to CORS, some providers are supported via OpenRouter.
 - Reminder: LLM providers differ in data retention and usage policies. Check your provider’s policy and configure keys/models accordingly.

## 15. Keyboard Shortcuts (defaults)
- Global
  - Play/Pause: Space
  - Undo / Redo: Ctrl/Cmd+Z / Ctrl/Cmd+Shift+Z
  - Copy / Cut / Paste: Ctrl/Cmd+C / Ctrl/Cmd+X / Ctrl/Cmd+V
  - Save: Ctrl/Cmd+S
  - Hold to create region: Ctrl/Cmd
- Piano Roll
  - Tools: Select (Q), Pencil (W)
  - Hold to create note: Ctrl/Cmd
  - Snap: 1(None), 2(1/4), 3(1/8), 4(1/16)
  - Quantize Position: 5(1/4), 6(1/8), 7(1/16)
  - Quantize Length: 8(1/4), 9(1/8), 0(1/16)

## 16. Troubleshooting
- No sound: ensure soundfonts can download; check network; try refreshing.
- Chat/LLM errors: verify provider, base URL (if compatible), API key, and model name; check CORS if using third‑party gateways.
- MIDI import: only valid `.mid/.midi` files; malformed files will show an error.
- Performance: close unused panels; reduce concurrent soundfont loads.

## 17. FAQ
- Where are my projects saved? In your browser’s IndexedDB on your device.
- Can I use the app offline? Yes, core editing works offline; instruments and AI need network when first used.
- Does the app send my projects to a server? No. Only your LLM requests go to your chosen provider.

## 18. Glossary
- Project, Track, Region, Note, Snapping, Quantize, General MIDI (GM), IndexedDB, Soundfont, LLM.

## 19. Known Limitations
- Limited note editing (no velocity editing yet)
- No region duplication shortcut
- Export UI present; audio export not implemented
- No audio recording yet; limited effects processing
- No project browser UI (load by name)

## 20. Credits and Licenses
- Licensed under Apache 2.0 with additional terms (see `LICENSE`).
- Third‑party attributions: FluidR3_GM soundfont, midi‑js‑soundfonts, and prompt structure notes.
