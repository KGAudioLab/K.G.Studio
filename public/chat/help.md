## Help

Welcome to **K.G.Studio Musician Assistant**—your AI-powered agent for music composition and arrangement. Harnessing advanced language models, I am here to help you create, arrange, and refine your musical ideas with ease and intelligence.

To get started, you will need to configure an LLM (Large Language Model) Provider in the application settings. Please follow the instructions below to ensure proper setup:

---

### Configuring Your LLM Provider

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
    - `Qwen: Qwen3.5-35B-A3B` (`qwen/qwen3.5-35b-a3b`: [Link](https://openrouter.ai/qwen/qwen3.5-35b-a3b)) — recommended open source model
    - `Qwen: Qwen3.6 Plus` (FREE MODEL: `qwen/qwen3.6-plus:free`: [Link](https://openrouter.ai/qwen/qwen3.6-plus:free)) — recommended free model; note that free model providers may collect your data, check the model page for details
6. Input the base URL `https://openrouter.ai/api/v1` **OpenAI Compatible Server → Base URL**.

### Basic DAW Operations

- Tracks
  - Add, rename, and reorder tracks from the track info panel.
  - Change instrument using the instrument button (piano icon); adjust Solo (S), Mute (M), and Volume.
  - Delete a track from the track’s settings menu (button to the right of the instrument).

- Regions
  - Create region: with the Pointer tool, double‑click; or hold Ctrl/Cmd and click. With the Pencil tool, single‑click.
  - Move/resize: drag the body to move; drag edges to resize.
  - Open Piano Roll via the small pencil at a region’s top‑left.

- Piano Roll (MIDI notes)
  - Tools: Select vs Pencil.
  - Create notes: double‑click or Ctrl/Cmd+click (Select); single‑click (Pencil).
  - Select notes: click; Shift+click for multi‑select; drag to box‑select.
  - Move/resize: drag note body to move selected notes; drag edges to resize.
  - Close the piano roll with X or ESC.

- Intelligent Chord Assistant
  - Enable chord guide from the piano roll toolbar: select T (Tonic), S (Subdominant), or D (Dominant) function.
  - Hover over any key to see context-aware chord suggestions highlighted in red, matching your selected key signature and mode.
  - Press Tab to cycle through different chord voicings for the same harmonic function.
  - Double-click (or Ctrl/Cmd+click) on a highlighted chord to create all notes at once.
  - Chord length automatically matches your last edited note for consistent rhythm.

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