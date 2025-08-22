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
4. Select your preferred model from the **OpenAI → Model** dropdown. For optimal performance, we recommend `gpt-5` or `gpt-4o`.
5. Optionally, choose whether to enable Flex Mode in **OpenAI → Flex Mode**. Flex Mode offers discounted pricing, but may result in slower response times.

---

### Using OpenRouter

OpenRouter is a platform that provides unified access to a wide range of language models—including free options—from various providers. This makes it easy to experiment and find the model that best suits your needs.

1. Obtain an API Key from [**OpenRouter**](https://openrouter.ai/keys). Registration is required; for paid models, a payment method may also be necessary.
2. In **Settings ⚙️ → General → LLM Provider**, select **OpenAI Compatible** as your provider.
3. Enter your API Key in **OpenAI Compatible Server → Key**.
4. Browse available models on the [**OpenRouter Models Page**](https://openrouter.ai/models). Use the "Prompt Pricing" filter to identify free models.  
   **Note:** Each model provider may have different data retention and privacy policies. Please review these policies before use.
5. Enter your chosen model name in **OpenAI Compatible Server → Model**. Recommended model series include:
    - `Anthropic: claude-4-sonnet` (`anthropic/claude-sonnet-4`: [Link](https://openrouter.ai/anthropic/claude-sonnet-4))
    - `Qwen: qwen3-30b-a3b` (FREE MODEL: `qwen/qwen3-30b-a3b:free`: [Link](https://openrouter.ai/qwen/qwen3-30b-a3b:free))
    - `Qwen: qwen3-235b-a22b` (FREE MODEL: `qwen/qwen3-235b-a22b:free`: [Link](https://openrouter.ai/qwen/qwen3-235b-a22b:free))
6. Input the base URL `https://openrouter.ai/api/v1/chat/completions` of the OpenAI Compatible Server in **OpenAI Compatible Server → Base URL**.

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

- Snapping and Quantize
  - Set snapping from the NO SNAP menu (top‑right).
  - Quantize timing with Qua. Pos. (start) and Qua. Len. (length).

- Playback & Playhead
  - Back to beginning; Play/Pause from the toolbar.
  - Set the playhead by clicking bar numbers in the main grid; in Piano Roll, click the header timeline (respects snapping).
  - Change BPM, time signature, and key signature via the toolbar readouts.

---

### Note

Due to security reasons, if you are using K.G.Studio from a non-local hosted environment, we won't persist your API Key in your browser's IndexedDB in order to prevent potential XSS attack, you will need to input your API Key every time you start K.G.Studio.

### Disclaimer

K.G.Studio does not provide or host any of the models listed above, nor is it affiliated with any model provider. All data is stored locally on your device; K.G.Studio does not collect or transmit your data. You are solely responsible for any data you provide to third-party model providers.

We hope you enjoy using K.G.Studio Musician Assistant!