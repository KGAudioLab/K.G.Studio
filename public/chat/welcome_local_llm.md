## Local LLM Mode

Welcome to **K.G.Studio Musician Assistant** in local LLM mode.

- No external API calls are required. Everything runs directly in your browser, with no extra API cost.
- This mode uses **Gemma 4 E4B** through **LiteRT-LM** with **WebGPU** acceleration.
- Recommended hardware: a GPU with at least **8 GB VRAM** or a system with at least **16 GB unified RAM**.
- Performance is more limited than larger cloud-hosted models, especially on harder planning, editing, and multi-step tasks.

### Recommended Workflow
- Keep requests small and focused.
- Guide the model step by step toward the final goal.
- Work on smaller music regions instead of large full-song edits.
- Prefer simpler music arrangements when possible.
- Start a new conversation for each standalone task.

### Use an External LLM Instead
- If you want a larger cloud or self-hosted model, open **Settings -> General -> LLM Provider** and switch away from **Local LLM (Browser)**.
- For a cloud model, you can use **OpenAI**, or choose **OpenAI Compatible** and enter a provider such as OpenRouter.
- For a self-hosted model, choose **OpenAI Compatible** and enter your server's **Base URL** and **Model**.
- After switching providers, start a new conversation so the chat uses the new model cleanly.
