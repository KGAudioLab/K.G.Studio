# K.G.Studio — Release Notes

This file contains the complete release history of K.G.Studio. For a summary of recent highlights, see the [main README](../README.md).

---

- **2026.07.18**: Introduced powerful new MIDI arrangement and editing workflows:
  - **Flexible, key-aware transposition** — apply independent transpose settings at the track or region level, shift material by up to three octaves, and optionally follow key-signature changes. Chord-track content can now be transposed automatically when the project key or a key-signature region changes, preserving harmonic intent across the arrangement.
  - **MIDI Reference mode** — overlay a second MIDI region as a read-only, timeline-aligned reference in the piano roll, making it easier to coordinate melodies, harmonies, voicings, and rhythmic relationships while editing another part.
  - **Miscellaneous enhancements** — refined playhead visibility and navigation, sticky global tracks, configurable track duplication, key-aware staff-notation spelling, and improved editor menu layering.

- **2026.07.12**: Expanded MIDI creation, editing, and playback workflows:
  - **Intelligent Arpeggiator** — learn a pattern from example notes and generate chord- or MIDI-driven variations while preserving chromatic source pitches, with atomic undo support.
  - **Faster MIDI editing and export** — select notes by pitch rank across configurable ranges, and export individual regions, complete tracks, or the full project as standard MIDI files.
  - **Persistent custom instruments** — build reusable instruments from WAV or MP3 samples with per-pitch mapping, previews, configurable ranges, built-in fallbacks, and seamless playback and MIDI export integration.
  - **A more focused editor** — the piano roll now docks beneath the timeline with a resizable layout, while sticky track controls remain accessible during horizontal scrolling.
  - **More reliable playback and notation** — solo now overrides mute, audio tracks can be unmuted during playback, and bass-clef rests render in the correct staff position.

- **2026.06.05**: Significantly expanded the **K.G.Studio Musician Assistant** into a full project-level agent:
  - **Track management tools** — the agent can now list, create, update, and delete tracks, and browse all available instruments, without requiring a region to be selected first.
  - **Global track tools** — full read/write/remove access to all four global tracks: **Chord Progression**, **Tempo (BPM)**, **Key Signature**, and **Markers**. The agent can restructure an entire arrangement's harmonic and rhythmic skeleton in a single conversation.
  - **Tool confirmation** — write operations surface a confirmation step in the chat before executing, giving you a chance to review before anything changes.
  - **Agent todo list** — the assistant now maintains an inline task checklist rendered as live snapshot cards directly in the chat, making multi-step plans transparent and trackable.
  - **Conversation history** — chat sessions are persisted per project and can be resumed across page reloads.
  - **Automatic context compaction** — long conversations are summarised automatically when the context limit approaches, keeping sessions running without manual intervention.
  - **Efficient agent mode** — a streamlined prompt and reduced tool set for smaller / local language models, activated automatically when using the Local Browser LLM.

- **2026.05.30**: Added **internationalization (i18n) support** — K.G.Studio now ships in four languages: **English**, **Simplified Chinese (简体中文)**, **Traditional Chinese (繁體中文)**, and **French (Français)**. The active language can be configured under **Settings ⚙️ → General → Language**, with an `Auto` option that automatically detects your browser's locale.

- **2026.05.27**: 
  - Added **Global Track System** — introduce four global tracks: **Marker**, **Tempo**, **Key Signature**, and **Chord** (chord-symbol span regions). 
  - Added **Audio Chord Detection** feature — open piano roll window for an audio or a MIDI region and click "..." -> **Detect Chords** to automatically analyse the recording and populate the Chord Track using a zero-dependency FFT pipeline with configurable sensitivity, stability, and seventh-chord detection. 
  - Added **Tempo Detection with Auto-Align Beats** feature — open piano roll window for an audio region and click "..." -> **Detect Tempo** in the toolbar to analyse the audio for BPM and optionally realign the project's Tempo Track regions to match. 
  - Added **Demucs 4S** as a second local browser-embedded stem-separation model — the existing two-stem UVR-MDX-NET model is now joined by the four-stem `htdemucs_4s` model (~172 MB, vocals / drums / bass / others), both running entirely in-browser via ONNX Runtime WebGPU.

- **2026.05.15**: Added **browser-embedded AI models** — two AI models now run entirely in the browser with no external service, no API key, and no K.G.One server required. The **K.G.Studio Musician Assistant** gains a new **Local LLM (Browser)** provider powered by **Gemma 4 E4B** via LiteRT-LM with WebGPU acceleration; the model is downloaded once and cached in OPFS for instant subsequent launches, with configurable context length (32 k / 64 k / 128 k tokens) and live inference performance statistics. **Stem separation** now also runs locally through a browser-embedded **UVR-MDX-NET-Inst_HQ_3** ONNX model with WebGPU acceleration — open the **Music Generator** panel (✦ button), download the model once, and separate vocals from instruments entirely on-device. Both features require a WebGPU-capable browser (Chrome 113+ or Edge 113+) and a secure context (HTTPS or localhost). Recommended hardware: a GPU with at least 8 GB VRAM or a system with at least 16 GB unified RAM.

- **2026.05.10**: Added **staff notation (sheet music) view** — the piano roll now offers a full standard notation mode. Switch between Piano Roll and Sheet Music views using the toggle in the piano roll toolbar. In sheet music mode, notes are engraved via VexFlow with automatic clef selection (treble or bass) based on the active instrument, key signature rendering, automatic beam grouping, ties across bar lines, and configurable quantization for note-value resolution. Enable **Track Scope** to render all MIDI regions on the track as a continuous score rather than a single isolated region.

- **2026.05.09**: Added **audio recording** — record directly from your microphone into an audio track. A live waveform preview grows in real time as you record, and the region is committed to the timeline as a standard audio region when you stop. Added **audio I/O device selection** in Settings so you can choose your preferred microphone input and audio output device.

- **2026.05.08**: Added **MIDI automation** — draw and edit pitch bend and MIDI CC curves (CC1 Modulation, CC2 Breath, CC7 Volume, CC11 Expression, CC64 Sustain) in an editable automation lane below the piano grid. Added **track-level automation**: each track now has a dedicated automation panel where you can view and edit the same curves directly on the timeline. Real-time MIDI controller input (pitch wheel, CC pedals) is recorded and played back with per-lane interpolation. Added the **Event List Panel** — a tabbed sidebar (Notes / Pitch Bend / Controller) for inspecting and inline-editing all events in the active MIDI region. Added **region multi-select** with lasso and bulk move/resize, and **merge MIDI regions**.
<div align="center">
  <img src="../public/snapshots/2026-05-08-automations.png" alt="K.G.Studio Logo" width="640" />
</div>

- **2026.04.29**: Added **Remix** and **Repaint** to the K.G.One Music Generator panel (powered by ACE-Step 1.5). **Remix** lets you cover an existing audio region in a new style — select an audio region, describe the target style and optionally provide new lyrics, and ACE-Step will re-perform the song with the prompted instrumentation and feel. **Repaint** lets you surgically re-generate a specific section of a song — set a loop range on the timeline to define the repaint window, then describe what you want that section to sound like; the rest of the song stays untouched. Both tools support the same import workflow as the other K.G.One tabs: preview the result in the built-in player, drag it onto a track, or click **Import Aligned to Source** to automatically place it below the original region in a new track.

- **2026.04.24**: Added [**K.G.One Music Studio**](https://github.com/KGAudioLab/K.G.One) integration! When K.G.Studio connects to a local K.G.One server, the **K.G.One Music Generator** panel (magic wand button ✦ in the toolbar) becomes available with three AI-powered tools: **Full Song Generation** (powered by ACE-Step 1.5 — generate full-length songs from text prompts), **Clip Generation** (powered by Foundation-1 — generate instrument clips and MIDI loops from text), and **Stem Separation** (powered by python-audio-separator — split any audio into vocals, instrumentals, and more). Generated audio and MIDI can be previewed instantly and dragged directly onto your tracks. K.G.One runs entirely on your own machine (Windows/Linux, CUDA GPU required); see the [K.G.One repository](https://github.com/KGAudioLab/K.G.One) for setup instructions.

- **2026.04.11**: Migrated project storage from IndexedDB to OPFS (Origin Private File System) with a folder-based structure for better media file handling. Added audio track support with WAV/MP3 import, playback, looping, and non-destructive region trimming. Added bounce-to-WAV/MP3 export via offline rendering.

- **2026.04.05**: Migrated the AI agent from XML-based tool calling to native OpenAI SDK function calling for improved reliability and compatibility. Added new LLM model options including GPT-5.4 series.

- **2026.01.23**: Implemented seamless loop playback! Drag on the bar numbers to set loop range, or toggle loop mode with the Loop button in the toolbar. Loop playback uses `Tone.js`'s native looping for sample-accurate, gap-free looping.

- **2025.12.21**: Implemented MIDI keyboard support! You can now connect a MIDI keyboard and use it to play sounds. Please note that this feature may not work optimally in Safari and some other browsers that lack complete Web MIDI interface support.

- **2025.12.15**: Added Intelligent Chord Assistant with functional harmony guidance (T/S/D). Hover over piano keys to see context-aware chord suggestions and create full chords with one click!
