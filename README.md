<div align="center">
  <img src="./public/logo.png" alt="K.G.Studio Logo" width="160" />
</div>

## K.G.Studio — Browser-based DAW (Digital Audio Workstation)

K.G.Studio is a lightweight, modern DAW that runs entirely in the browser with **K.G.Studio Musician Assistant** at its core. It features realistic instrument playback via Tone.js samplers, a piano‑roll editor, track and region management with full undo/redo, project persistence to IndexedDB, a configurable settings panel, and an integrated AI assistant with tool execution.

**K.G.Studio Musician Assistant** is an AI assistance agent for harmony, arrangement, and note editing — but not full auto‑composition.

### Highlights
- **K.G.Studio Musician Assistant**: Chat with the LLM‑powered K.G.Studio Musician Assistant AI Agent; it can automatically execute tools to make music edits.
- **Multiple LLM providers**: OpenAI, Claude (via OpenRouter), Gemini (via OpenRouter), or OpenAI‑compatible (e.g., Ollama, OpenRouter).
- **Track & Region editing**: Add/reorder tracks, create/move/resize regions, copy/paste regions, and more.
- **Piano roll**: Create and edit notes with snapping/quantization support.
- **Real instruments**: Tone.js‑based Sampler with high‑quality FluidR3 soundfonts.
- **Undo/Redo everywhere**: Command pattern for tracks, regions, notes, and project properties
- **Persistence with privacy**: Save/load projects and configuration in your browser’s IndexedDB (on your device).
- **Export/Import**: Export your project as a MIDI file, or import a MIDI file into your project.
- **Settings**: LLM provider, AI agent custom instructions, app behavior, and more.

For a deeper technical overview, see `res/overview.md`.

## Getting Started

### Prerequisites
- Node.js 20.19.3+

### Install & Run
```bash
git clone https://github.com/Xiaohan-Tian/KGSP {your-local-path}
cd {your-local-path}

npm install
npm run dev
```

## Configuration

K.G.Studio loads defaults from `./public/config.json` (with an internal fallback) and persists user edits in the browser via `ConfigManager` + IndexedDB. IndexedDB is your browser’s own local database stored on your device; it does not leave your machine and is cleared if you clear this site’s data. Modify settings via the in‑app Settings panel.

- **General**
  - LLM provider: OpenAI, or OpenAI‑compatible
  - API keys and models for the selected provider
  - OpenAI‑compatible base URL (for self‑hosted gateways)
  - Soundfont base URL (CDN for instrument samples)
- **Behavior**
  - Chatbox default open on startup
- **Templates**
  - Custom instructions used by the AI assistant

### Connectivity & Privacy

- K.G.Studio is fully client‑side. No first‑party servers are required to run the app.
- All projects, configuration, and UI state are stored in your browser’s IndexedDB (on your device).
- Network access is only used for:
  - Downloading instrument sound samples from the configured soundfont CDN
  - Communicating with the LLM provider you select (e.g., OpenAI or OpenAI‑compatible services)
- Outside of the two cases above, the app functions locally. If you block those endpoints, the app still loads; instrument playback and AI features will not function until network access is restored.
- For security, when running from a non‑local host we do not persist your API key in IndexedDB (to reduce XSS risk). You’ll be prompted to enter it each time you start K.G.Studio.

## Using the App

1. Start the app and a default project will load. A default “Melody” MIDI track is ensured on load.
2. Add tracks, rename and reorder them. Click or drag in the track grid to create and arrange regions.
3. Add a region by double‑clicking or holding Ctrl/Cmd and clicking. Drag the edges to resize a region; drag the center to move it. Use Ctrl/Cmd+C and Ctrl/Cmd+V to copy/paste regions.
4. Open a MIDI region to edit notes in the Piano Roll window (click the pencil icon on the region’s top‑left corner, or click the Piano icon on the toolbar).
5. Double‑click or hold Ctrl/Cmd and click to create a note. Drag the edges to change its length, or drag the center to move it. Use box selection or hold Shift to multi‑select.
6. Quantize note length/position using the Quantize dropdowns at the top‑right of the piano roll.
7. Change instruments via the Instrument Selection panel; samples are downloaded on demand.
8. Save projects to your browser’s IndexedDB and load by name from the toolbar. Export your project as a MIDI file, or import a MIDI file into your project.

## Keyboard Shortcuts (defaults)

- Main
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

## AI Assistant

### Quick Start

- First, select an LLM provider in **Settings ⚙️ → General → LLM Provider**. If you are using OpenAI (e.g., GPT‑4o), get your API key from [**OpenAI**](https://platform.openai.com/account/api-keys) and paste it in **OpenAI → Key**.
- You can find the K.G.Studio Musician Assistant chatbox on the right. If you don't see it, you can click the Chat 🗨️ button on the toolbar.
- Type your message in the chatbox; press Enter to send, Shift+Enter to insert a new line.
- The agent will automatically process your request and invoke tools to make modifications scoped to the selected region. It may take one or more turns to complete a task.
- Note that the AI could make mistakes, so you should always check the result and make adjustments if necessary. You can also use undo/redo to revert the changes.
- Click the "+" button or `/clear` command to clear the chat history.

### Configuring Your LLM Provider

Navigate to **Settings ⚙️ → General → LLM Provider**. Depending on your chosen provider, you will need to supply the appropriate API Key and, if applicable, a custom base URL (for non-official OpenAI-compatible services such as Ollama, OpenRouter, etc.).

Note: due to CORS limitations with some providers, Google Gemini and Anthropic Claude are currently supported via OpenRouter only.

### Using OpenAI models

1. Obtain an OpenAI API Key from [**OpenAI**](https://platform.openai.com/account/api-keys). You may need to create an account and add a payment method to generate an API Key.
2. In **Settings ⚙️ → General → LLM Provider**, select **OpenAI** as your provider.
3. Enter your API Key in **OpenAI → Key**.
4. Select your preferred model from the **OpenAI → Model** dropdown. For optimal performance, we recommend `gpt‑4o`. (`gpt‑5` is still being evaluated.)
5. Optionally, choose whether to enable Flex Mode in **OpenAI → Flex Mode**. Flex Mode offers discounted pricing, but may result in slower response times or server-side errors.

### Using OpenRouter

OpenRouter is a platform that provides unified access to a wide range of language models—including free options—from various providers. This makes it easy to experiment and find the model that best suits your needs.

1. Obtain an API Key from [**OpenRouter**](https://openrouter.ai/keys). Registration is required; for paid models, a payment method may also be necessary.
2. In **Settings ⚙️ → General → LLM Provider**, select **OpenAI Compatible** as your provider.
3. Enter your API Key in **OpenAI Compatible Server → Key**.
4. Browse available models on the [**OpenRouter Models Page**](https://openrouter.ai/models). Use the "Prompt Pricing" filter to identify free models.  
   **Note:** Each model provider may have different data retention and privacy policies. Please review these policies before use.
5. Enter your chosen model name in **OpenAI Compatible Server → Model**. Recommended model series include:
    - `Google: gemini-2.5-pro`
    - `Anthropic: claude-4-sonnet`
    - `DeepSeek: deepseek-r1` (free: `deepseek/deepseek-r1-0528:free`)
    - `DeepSeek: deepseek-v3` (free: `deepseek/deepseek-chat-v3-0324:free`)
    - `Qwen: qwen3-235b-a22b` (free: `qwen/qwen3-235b-a22b:free`)
6. Input the base URL `https://openrouter.ai/api/v1/chat/completions` **OpenAI Compatible Server → Base URL**.

### About the agent and LLM providers

Currently, based on our evaluation, OpenAI’s open‑source models (`gpt‑oss‑20b` and `gpt‑oss‑120b`) are not yet compatible with the current agent implementation; support is planned.

For security, when using K.G.Studio from a non‑local host, API keys are not persisted in IndexedDB; you will need to input your API key each time you start K.G.Studio.

K.G.Studio does not provide or host any of the models listed above, nor is it affiliated with any model provider. All data is stored locally on your device; K.G.Studio does not collect or transmit your data. You are solely responsible for any data you provide to third‑party model providers.

## Upcoming Features

- [ ] More instruments
- [ ] Support track control automations (e.g. sustain, volume, pan, etc.)
- [ ] Support MIDI control events (e.g. CC, pitch bend, etc.)
- [ ] Support WAV audio tracks
- [ ] MCP Support
- [ ] Add support for OpenAI's open source models (`gpt-oss-20b` and `gpt-oss-120b`)
- [ ] Automatically compact conversations when the context window runs low on space

## License

Licensed under the Apache License, Version 2.0, with additional terms (see `LICENSE`):
- No patent applications using this software or assets
- Attribution required when used in public/commercial products (“Powered by K.G.Studio”)  

Third‑party notices (e.g., FluidR3_GM SoundFont, midi‑js‑soundfonts, and prompt structure notes) are included in `LICENSE`.
