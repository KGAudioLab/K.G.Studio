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

Example:
- For best results, break more complex requests into smaller steps.
- For example, if you want the model to write a chord progression based on the current music, first ask: `Please read the current music.`
- Once that is complete, follow up with: `Please write a chord progression based on it.`
- This incremental workflow is generally more reliable in local LLM mode.
- Keep the MIDI region you want the agent to update selected throughout the workflow.
- You do not need to switch the selection to another region just for `read_music`, because `read_music` can fetch music across all tracks.

### Use an External LLM Instead
- If you want a larger cloud or self-hosted model, open **Settings -> General -> LLM Provider** and switch away from **Local LLM (Browser)**.
- For a cloud model, you can use **OpenAI**, or choose **OpenAI Compatible** and enter a provider such as OpenRouter.
- For a self-hosted model, choose **OpenAI Compatible** and enter your server's **Base URL** and **Model**.
- After switching providers, start a new conversation so the chat uses the new model cleanly.
