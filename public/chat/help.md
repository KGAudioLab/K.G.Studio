## Help

Welcome to **K.G.Studio Musician Assistant**—your AI-powered agent for music composition and arrangement. Harnessing advanced language models, I am here to help you create, arrange, and refine your musical ideas with ease and intelligence.

To get started, you can either use the **built-in browser LLM** (no API key required) or configure an external LLM provider. Follow the instructions below for your preferred option.

---

### Using Local LLM (Browser) — No API Key Required

K.G.Studio can run **Gemma 4 E4B** entirely inside your browser using WebGPU acceleration. No API calls are made, no cost is incurred, and your data never leaves your machine.

1. In **Settings ⚙️ → General → LLM Provider**, select **Local LLM (Browser)** (this is the default).
2. The model (~2.8 GB) downloads automatically the first time you open the chat and is cached locally for instant subsequent launches.
3. Optionally configure the **Context Length** (32k / 64k / 128k tokens) — larger values require more VRAM.
4. Start chatting! No key, no account, no network traffic after the initial model download.

**Requirements:** Chrome 113+ or Edge 113+, a secure context (HTTPS or localhost), and a GPU with at least 8 GB VRAM or a system with at least 16 GB unified RAM.

> Note: The local model's quality cannot match commercial models like GPT or Claude. For complex tasks, an external provider will produce better results.

---

### Configuring an External LLM Provider

Navigate to **Settings ⚙️ → General → LLM Provider**. Depending on your chosen provider, you will need to supply the appropriate API Key and, if applicable, a custom base URL (for non-official OpenAI-compatible services such as Ollama, OpenRouter, etc.).

---

### Using the OpenAI GPT Model Series

1. Obtain an OpenAI API Key from [**OpenAI**](https://platform.openai.com/account/api-keys). You may need to create an account and add a payment method to generate an API Key.
2. In **Settings ⚙️ → General → LLM Provider**, select **OpenAI** as your provider.
3. Enter your API Key in **OpenAI → Key**.
4. Select your preferred model from the **OpenAI → Model** dropdown. For a good balance between performance and cost, we recommend `gpt-5.4-mini`.
5. Optionally, choose whether to enable Flex Mode in **OpenAI → Flex Mode**. Flex Mode offers discounted pricing, but may result in slower response times or server-side errors.

---

### Using OpenRouter

OpenRouter is a platform that provides unified access to a wide range of language models—including free options—from various providers. This makes it easy to experiment and find the model that best suits your needs.

1. Obtain an API Key from [**OpenRouter**](https://openrouter.ai/keys). Registration is required; for paid models, a payment method may also be necessary.
2. In **Settings ⚙️ → General → LLM Provider**, select **OpenAI Compatible** as your provider.
3. Enter your API Key in **OpenAI Compatible Server → Key**.
4. Browse available models on the [**OpenRouter Models Page**](https://openrouter.ai/models). Use the "Prompt Pricing" filter to identify free models.  
   **Note:** Each model provider may have different data retention and privacy policies. Please review these policies before use.
5. Enter your chosen model name in **OpenAI Compatible Server → Model**. Recommended model series include:
    - `Anthropic: Claude Sonnet 4.6` (`anthropic/claude-sonnet-4.6`: [Link](https://openrouter.ai/anthropic/claude-sonnet-4.6)) — best balance of quality and cost for the Claude series
    - Free Models:
        - `OpenAI: GPT-OSS 120B` (FREE MODEL: `openai/gpt-oss-120b:free`: [Link](https://openrouter.ai/openai/gpt-oss-120b:free))
        - `Google: Gemma 4 26B A4B IT` (FREE MODEL: `google/gemma-4-26b-a4b-it:free`: [Link](https://openrouter.ai/google/gemma-4-26b-a4b-it:free))
        - `Google: Gemma 4 31B IT` (FREE MODEL: `google/gemma-4-31b-it:free`: [Link](https://openrouter.ai/google/gemma-4-31b-it:free))
    - For self-deployment (requiring ~24G VRAM or 24-32GB Unified Memory), we recommend:
        - `Qwen: Qwen3.6 35B A3B` (`qwen/qwen3.6-35b-a3b`: [Link](https://openrouter.ai/qwen/qwen3.6-35b-a3b))
        - `Google: Gemma 4 26B A4B IT` (`google/gemma-4-26b-a4b-it`: [Link](https://openrouter.ai/google/gemma-4-26b-a4b-it))
        - `Google: Gemma 4 31B IT` (`google/gemma-4-31b-it`: [Link](https://openrouter.ai/google/gemma-4-31b-it))
    - Note: free model availability changes frequently — for the latest free options, visit the [OpenRouter Models Page](https://openrouter.ai/models) and use the **Prompt Pricing** filter
    - Note: free model providers may collect your data; check the model page for details before use
6. Input the base URL `https://openrouter.ai/api/v1` in **OpenAI Compatible Server → Base URL**.

### Basic DAW Operations

Chat commands: `/clear`, `/welcome`, `/help`, `/hotkeys`

- Tracks
  - Add, rename, and reorder tracks from the track info panel.
  - Change instrument using the instrument button (piano icon); adjust Solo (S), Mute (M), and Volume.
  - Delete a track from the track's settings menu (button to the right of the instrument).
  - **Audio recording**: click the Rec button in the toolbar to record directly from your microphone into an audio track.

- Regions
  - Create region: with the Pointer tool, double‑click; or hold Ctrl/Cmd and click. With the Pencil tool, single‑click.
  - Move/resize: drag the body to move; drag edges to resize.
  - Open Piano Roll via the small pencil at a region's top‑left.

- Piano Roll (MIDI notes)
  - Tools: Select vs Pencil.
  - Create notes: double‑click or Ctrl/Cmd+click (Select); single‑click (Pencil).
  - Select notes: click; Shift+click for multi‑select; drag to box‑select.
  - Move/resize: drag note body to move selected notes; drag edges to resize.
  - **Sheet music view**: toggle between Piano Roll and Staff Notation views from the piano roll toolbar. Supports automatic clef selection, key signature rendering, beam grouping, and ties. Enable **Track Scope** to render all regions on the track as a continuous score.
  - **Automation lanes**: draw and edit pitch bend and MIDI CC curves (Modulation, Breath, Volume, Expression, Sustain) in the editable lane below the piano grid.
  - **Spectrogram mode**: view an audio region's spectrogram inside the piano roll as a reference layer while editing MIDI notes.
  - **Event List Panel**: tabbed panel (Notes / Pitch Bend / Controller) for inspecting and inline-editing all events in the active MIDI region.
  - Close the piano roll with X or ESC.

- Intelligent Chord Assistant
  - Enable chord guide from the piano roll toolbar with `⊘`, `T`, `S`, or `D`.
  - Chord-guide candidates follow the effective key signature at the playhead: major uses Ionian, minor uses Aeolian.
  - Hover over any key to see context-aware chord suggestions highlighted in red.
  - Press `g` to cycle chord-guide state, `Tab` to move to the next candidate chord, and `Shift+Tab` to move to the previous one.
  - Double-click (or Ctrl/Cmd+click) on a highlighted chord to create all notes at once.
  - Chord length automatically matches your last edited note for consistent rhythm.

- Global Track System
  - Four persistent tracks at the top of the timeline: **Marker** (label spans), **Tempo** (BPM regions), **Key Signature**, and **Chord** (chord-symbol spans).
  - Create a global region: double‑click or Ctrl/Cmd+click in a global track row; drag to move, drag edges to resize.
  - These tracks drive playback timing, chord guide suggestions, sheet music key rendering, and chord detection results.

- Audio Analysis Features
  - **Detect Chords**: open the piano roll on an audio region and click **...** → **Detect Chords** to automatically analyse the recording and populate the global Chord Track. Configurable sensitivity, stability, and seventh-chord detection.
  - **Detect Tempo**: open the piano roll on an audio region and click **...** → **Detect Tempo** to analyse the audio for BPM; optionally auto-aligns the project's Tempo Track regions to match detected beats.

- K.G.One Music Generator
  - Click the **✦** (magic wand) button in the toolbar to open the Music Generator panel.
  - **Full Song Generation**: generate a complete song from a text caption and optional lyrics (requires K.G.One server).
  - **Clip Generation**: generate short instrument clips and MIDI loops from text prompts (requires K.G.One server).
  - **Stem Separation (browser)**: split any audio region into stems entirely in-browser — no server needed. Two models available: **UVR-MDX-NET-Inst_HQ_3** (2-stem: Vocals / Instrumental, ~64 MB) and **Demucs htdemucs_4s** (4-stem: Vocals / Drums / Bass / Others, ~172 MB). Download the model once from the Generator panel, then click **Separate Stems**. Requires WebGPU (Chrome 113+ / Edge 113+).

- Snapping and Quantize
  - Set snapping from the NO SNAP menu (top‑right).
  - Quantize timing with Qua. Pos. (start) and Qua. Len. (length).

- Playback & Playhead
  - Back to beginning; Play/Pause from the toolbar.
  - Set the playhead by clicking bar numbers in the main grid; in Piano Roll, click the header timeline (respects snapping).
  - Change BPM, time signature, and key signature via the toolbar readouts.

---

### Note

For security, when running from a non-local host we do not persist your API key in IndexedDB by default (to reduce XSS risk). You'll be prompted to enter it each time you start K.G.Studio. To opt-in to persistence on non-local hosts, enable "Persist API Keys on Non-Localhost" in Settings (not recommended for shared/production environments).

### Disclaimer

K.G.Studio does not provide or host any of the models listed above, nor is it affiliated with any model provider. All data is stored locally on your device; K.G.Studio does not collect or transmit your data. You are solely responsible for any data you provide to third-party model providers.

We hope you enjoy using K.G.Studio Musician Assistant!
