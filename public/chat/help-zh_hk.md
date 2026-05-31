## 幫助

歡迎使用 **K.G.Studio 音樂創作助手**。這是您的 AI 音樂創作與編曲助手，可以幫助您構思、編排和修改音樂內容。

您可以選擇使用 **內建本地瀏覽器 LLM**（無需 API Key），也可以設定外部 LLM 提供方。下面是常用的入門方式。

---

### 使用本地 LLM（瀏覽器）——無需 API Key

K.G.Studio 可以通過 WebGPU 在瀏覽器中直接運行 **Gemma 4 E4B**。不會產生外部 API 呼叫費用，資料也不會離開您的裝置。

1. 進入 **設定 ⚙️ → 通用 → LLM 提供方**，選擇 **本地 LLM（瀏覽器）**（預設選項）。
2. 第一次開啟聊天時會自動下載模型（約 2.8 GB），後續會快取在本地瀏覽器中。
3. 可選設定 **上下文長度**（32k / 64k / 128k tokens）；越大越佔顯存。
4. 現在就可以開始聊天，無需 Key、帳號或持續聯網。

**要求：** Chrome 113+ 或 Edge 113+，安全上下文（HTTPS 或 localhost），以及至少 8 GB 顯存的 GPU 或至少 16 GB 統一記憶體的系統。

> 注意：本地模型效果無法與 GPT 或 Claude 這類商業模型完全相比。複雜任務通常更適合外部提供方。

---

### 配置外部 LLM 提供方

進入 **設定 ⚙️ → 通用 → LLM 提供方**。根據所選提供方，您需要填寫對應的 API Key，以及在需要時填寫 Base URL（例如 Ollama、OpenRouter 等 OpenAI 兼容服務）。

---

### 使用 OpenAI GPT 系列

1. 在 [**OpenAI**](https://platform.openai.com/account/api-keys) 取得 API Key。您可能需要先註冊帳號並新增付款方式。
2. 在 **設定 ⚙️ → 通用 → LLM 提供方** 中選擇 **OpenAI**。
3. 在 **OpenAI → 密鑰** 中填入 API Key。
4. 在 **OpenAI → 模型** 下拉中選擇模型。若希望在成本和效果之間取得平衡，推薦 `gpt-5.4-mini`。
5. 可選：在 **OpenAI → Flex 模式** 中啟用 Flex Mode。它可能降低成本，但也可能帶來更高延遲或更多服務端錯誤。

---

### 使用 OpenRouter

OpenRouter 提供統一接口，可訪問多個語言模型提供方的模型，其中也包含免費選項，適合比較不同模型表現。

1. 在 [**OpenRouter**](https://openrouter.ai/keys) 取得 API Key。需要註冊；使用付費模型時可能還需要綁定付款方式。
2. 在 **設定 ⚙️ → 通用 → LLM 提供方** 中選擇 **OpenAI 兼容服務**。
3. 在 **OpenAI 兼容服務 → 密鑰** 中填入 API Key。
4. 在 [**OpenRouter Models Page**](https://openrouter.ai/models) 瀏覽可用模型，並可使用 "Prompt Pricing" 過濾免費模型。  
   **注意：** 各模型提供方的資料保留與隱私策略可能不同，使用前請自行查看。
5. 在 **OpenAI 兼容服務 → 模型** 中填入模型名。推薦系列包括：
   - `Anthropic: Claude Sonnet 4.6`（`anthropic/claude-sonnet-4.6`）—— Claude 系列裡質量和成本平衡較好
   - `Qwen: Qwen3.5-35B-A3B`（`qwen/qwen3.5-35b-a3b`）—— 推薦開源模型
   - `Qwen: Qwen3-Next-80B-A3B`（免費：`qwen/qwen3-next-80b-a3b-instruct:free`）—— 推薦免費模型
   - `OpenAI: GPT-OSS 120B`（免費：`openai/gpt-oss-120b:free`）—— 推薦免費模型
   - 注意：免費模型會經常變化，請以 OpenRouter 模型頁中的 **Prompt Pricing** 過濾結果為準
   - 注意：免費模型提供方可能會收集您的資料，使用前請先查看模型頁面說明
6. 在 **OpenAI 兼容服務 → 基礎 URL** 中填寫 `https://openrouter.ai/api/v1`。

### 基本 DAW 操作

聊天命令：`/clear`、`/welcome`、`/help`、`/hotkeys`

- 音軌
  - 在軌道資訊面板中新增、重命名和重排音軌。
  - 通過樂器按鈕（鋼琴圖示）切換樂器；可調整 Solo（S）、Mute（M）和 Volume。
  - 通過音軌設定選單刪除音軌（位於樂器按鈕右側）。
  - **音訊錄音**：點擊工具列裡的 Rec 按鈕，可直接從麥克風錄到音訊軌。

- 區域
  - 建立區域：使用 Pointer 工具時可雙擊，或按住 Ctrl/Cmd 再點擊；使用 Pencil 工具時單擊即可。
  - 移動/縮放：拖動區域主體可移動，拖動邊緣可調整長度。
  - 通過區域左上角的小鉛筆開啟 Piano Roll。

- Piano Roll（MIDI 音符）
  - 工具：Select 與 Pencil。
  - 建立音符：在 Select 模式下雙擊或 Ctrl/Cmd+點擊；在 Pencil 模式下單擊。
  - 選取音符：單擊；Shift+單擊多選；拖曳框選。
  - 移動/縮放：拖動音符主體可移動已選音符；拖動邊緣可調整長度。
  - **五線譜視圖**：可在 Piano Roll 工具列中切換 Piano Roll 與五線譜視圖。支援自動譜號、調號顯示、連音線和符槓分組。啟用 **Track Scope** 後會連續顯示整條 MIDI 音軌上的內容。
  - **自動化軌道**：可在下方自動化區域繪製和編輯 Pitch Bend 與 MIDI CC 曲線（Modulation、Breath、Volume、Expression、Sustain）。
  - **頻譜模式**：可在 Piano Roll 中查看音訊區域的頻譜，作為 MIDI 編輯參考層。
  - **事件列表面板**：提供 Notes / Pitch Bend / Controller 標籤頁，用於查看並內聯編輯當前 MIDI 區域中的事件。
  - 可通過 X 或 ESC 關閉 Piano Roll 視窗。

- 智能和弦助手
  - 在 Piano Roll 工具列中使用 `⊘`、`T`、`S`、`D` 啟用和弦指導。
  - 和弦候選會根據播放頭當前位置的有效調號來推斷：大調使用 Ionian，小調使用 Aeolian。
  - 將滑鼠懸停在任意琴鍵上時，會以紅色高亮顯示上下文相關的和弦建議。
  - 按 `g` 循環切換和弦指導模式，按 `Tab` 切換到下一個候選和弦，按 `Shift+Tab` 切換到上一個。
  - 雙擊（或 Ctrl/Cmd+點擊）高亮和弦可一次性建立整組音符。
  - 和弦長度會自動匹配您最近編輯的音符長度，以保持節奏一致。

- 全域軌系統
  - 時間線上方固定有四條軌道：**Marker**、**Tempo**、**Key Signature**、**Chord**。
  - 建立全域區域：在全域軌中雙擊或 Ctrl/Cmd+點擊；拖動可移動，拖動邊緣可調整長度。
  - 這些軌道會影響播放時序、和弦指導、五線譜調號顯示，以及和弦檢測結果。

- 音訊分析功能
  - **Detect Chords**：在音訊區域開啟 Piano Roll 後，點擊 **...** → **Detect Chords**，即可自動分析並把結果寫入全域 Chord Track。可設定靈敏度、穩定性和七和弦檢測。
  - **Detect Tempo**：在音訊區域開啟 Piano Roll 後，點擊 **...** → **Detect Tempo**，即可分析 BPM，並可選擇自動對齊專案中的 Tempo Track。

- K.G.One 音樂生成器
  - 點擊工具列中的 **✦**（魔杖）按鈕開啟生成器面板。
  - **Full Song Generation**：根據文本描述和可選歌詞生成整首歌曲（需要 K.G.One 伺服器）。
  - **Clip Generation**：根據文本提示生成短音訊片段和 MIDI loop（需要 K.G.One 伺服器）。
  - **Stem Separation（瀏覽器）**：可完全在瀏覽器中把任意音訊區域分離成 stems，無需伺服器。支援兩種模型：**UVR-MDX-NET-Inst_HQ_3**（2 stem：Vocals / Instrumental，約 64 MB）和 **Demucs htdemucs_4s**（4 stem：Vocals / Drums / Bass / Others，約 172 MB）。在生成器面板中下載模型後，點擊 **Separate Stems** 即可。需要 WebGPU（Chrome 113+ / Edge 113+）。

- 吸附與量化
  - 在右上角的 NO SNAP 選單中設定吸附。
  - 使用 Qua. Pos.（起始）和 Qua. Len.（長度）進行量化。

- 播放與播放頭
  - 工具列可回到開頭，並執行 Play/Pause。
  - 在主時間網格點擊小節編號可設定播放頭；在 Piano Roll 中點擊頂部時間軸也可設定，並遵守目前吸附設定。
  - BPM、拍號和調號都可以通過工具列中的數值直接調整。

---

### 說明

出於安全考慮，在非本地主機場景下，K.G.Studio 預設不會把 API Key 持久化到 IndexedDB 中（以降低 XSS 風險）。您每次開啟 K.G.Studio 時都需要重新輸入。若您確實需要在非本地主機場景下持久化，請在設定中啟用 "Persist API Keys on Non-Localhost"（不建議在共享或生產環境下啟用）。

### 免責聲明

K.G.Studio 不提供也不託管上述任何模型，也不隸屬於任何模型提供方。所有資料預設都儲存在您的本地裝置中；您向第三方模型提供方發送的任何資料，都由您自行負責。

祝您使用 K.G.Studio 音樂創作助手創作愉快！
