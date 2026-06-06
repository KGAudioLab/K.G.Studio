## 帮助

欢迎使用 **K.G.Studio 音乐创作助手**。这是您的 AI 音乐创作与编曲助手，可以帮助您构思、编排和修改音乐内容。

您可以选择使用 **内置本地浏览器 LLM**（无需 API Key），也可以配置外部 LLM 提供方。下面是常用的入门方式。

---

### 使用本地 LLM（浏览器）——无需 API Key

K.G.Studio 可以通过 WebGPU 在浏览器中直接运行 **Gemma 4 E4B**。不会产生外部 API 调用费用，数据也不会离开您的设备。

1. 进入 **设置 ⚙️ → 通用 → LLM 提供方**，选择 **本地 LLM（浏览器）**（默认选项）。
2. 第一次打开聊天时会自动下载模型（约 2.8 GB），后续会缓存在本地浏览器中。
3. 可选设置 **上下文长度**（32k / 64k / 128k tokens）；越大越占显存。
4. 现在就可以开始聊天，无需 Key、账号或持续联网。

**要求：** Chrome 113+ 或 Edge 113+，安全上下文（HTTPS 或 localhost），以及至少 8 GB 显存的 GPU 或至少 16 GB 统一内存的系统。

> 注意：本地模型效果无法与 GPT 或 Claude 这类商业模型完全相比。复杂任务通常更适合外部提供方。

---

### 配置外部 LLM 提供方

进入 **设置 ⚙️ → 通用 → LLM 提供方**。根据所选提供方，您需要填写对应的 API Key，以及在需要时填写 Base URL（例如 Ollama、OpenRouter 等 OpenAI 兼容服务）。

---

### 使用 OpenAI GPT 系列

1. 在 [**OpenAI**](https://platform.openai.com/account/api-keys) 获取 API Key。您可能需要先注册账号并添加支付方式。
2. 在 **设置 ⚙️ → 通用 → LLM 提供方** 中选择 **OpenAI**。
3. 在 **OpenAI → 密钥** 中填入 API Key。
4. 在 **OpenAI → 模型** 下拉中选择模型。若希望在成本和效果之间取得平衡，推荐 `gpt-5.4-mini`。
5. 可选：在 **OpenAI → Flex 模式** 中启用 Flex Mode。它可能降低成本，但也可能带来更高延迟或更多服务端错误。

---

### 使用 OpenRouter

OpenRouter 提供统一接口，可访问多个语言模型提供方的模型，其中也包含免费选项，适合比较不同模型表现。

1. 在 [**OpenRouter**](https://openrouter.ai/keys) 获取 API Key。需要注册；使用付费模型时可能还需要绑定支付方式。
2. 在 **设置 ⚙️ → 通用 → LLM 提供方** 中选择 **OpenAI 兼容服务**。
3. 在 **OpenAI 兼容服务 → 密钥** 中填入 API Key。
4. 在 [**OpenRouter Models Page**](https://openrouter.ai/models) 浏览可用模型，并可使用 “Prompt Pricing” 过滤免费模型。  
   **注意：** 各模型提供方的数据保留与隐私策略可能不同，使用前请自行查看。
5. 在 **OpenAI 兼容服务 → 模型** 中填入模型名。推荐系列包括：
   - `Anthropic: Claude Sonnet 4.6`（`anthropic/claude-sonnet-4.6`）—— Claude 系列里质量和成本平衡较好
   - 免费模型：
     - `OpenAI: GPT-OSS 120B`（免费：`openai/gpt-oss-120b:free`）
     - `Google: Gemma 4 26B A4B IT`（免费：`google/gemma-4-26b-a4b-it:free`）
     - `Google: Gemma 4 31B IT`（免费：`google/gemma-4-31b-it:free`）
   - 对于自托管/本地部署（需要约 24G 显存或 24-32GB 统一内存），我们推荐：
     - `Qwen: Qwen3.6 35B A3B`（`qwen/qwen3.6-35b-a3b`）
     - `Google: Gemma 4 26B A4B IT`（`google/gemma-4-26b-a4b-it`）
     - `Google: Gemma 4 31B IT`（`google/gemma-4-31b-it`）
   - 注意：免费模型会经常变化，请以 OpenRouter 模型页中的 **Prompt Pricing** 过滤结果为准
   - 注意：免费模型提供方可能会收集您的数据，使用前请先查看模型页面说明
6. 在 **OpenAI 兼容服务 → 基础 URL** 中填写 `https://openrouter.ai/api/v1`。

### 基本 DAW 操作

聊天命令：`/clear`、`/welcome`、`/help`、`/hotkeys`

- 音轨
  - 在轨道信息面板中添加、重命名和重排音轨。
  - 通过乐器按钮（钢琴图标）切换乐器；可调整 Solo（S）、Mute（M）和 Volume。
  - 通过音轨设置菜单删除音轨（位于乐器按钮右侧）。
  - **音频录音**：点击工具栏里的 Rec 按钮，可直接从麦克风录到音频轨。

- 区域
  - 创建区域：使用 Pointer 工具时可双击，或按住 Ctrl/Cmd 再点击；使用 Pencil 工具时单击即可。
  - 移动/缩放：拖动区域主体可移动，拖动边缘可调整长度。
  - 通过区域左上角的小铅笔打开钢琴卷帘窗口。

- 钢琴卷帘（MIDI 音符）
  - 工具：Select 与 Pencil。
  - 创建音符：在 Select 模式下双击或 Ctrl/Cmd+点击；在 Pencil 模式下单击。
  - 选择音符：单击；Shift+单击多选；拖拽框选。
  - 移动/缩放：拖动音符主体可移动已选音符；拖动边缘可调整长度。
  - **五线谱视图**：可在钢琴卷帘工具栏中切换钢琴卷帘与五线谱视图。支持自动谱号、调号显示、连音线和符杠分组。启用 **Track Scope** 后会连续显示整条 MIDI 音轨上的内容。
  - **自动化轨道**：可在下方自动化区域绘制和编辑 Pitch Bend 与 MIDI CC 曲线（Modulation、Breath、Volume、Expression、Sustain）。
  - **频谱模式**：可在钢琴卷帘中查看音频区域的频谱，作为 MIDI 编辑参考层。
  - **事件列表面板**：提供 Notes / Pitch Bend / Controller 标签页，用于查看并内联编辑当前 MIDI 区域中的事件。
  - 可通过 X 或 ESC 关闭钢琴卷帘窗口。

- 智能和弦助手
  - 在钢琴卷帘工具栏中使用 `⊘`、`T`、`S`、`D` 启用和弦指导。
  - 和弦候选会根据播放头当前位置的有效调号来推断：大调使用 Ionian，小调使用 Aeolian。
  - 将鼠标悬停在任意琴键上时，会以红色高亮显示上下文相关的和弦建议。
  - 按 `g` 循环切换和弦指导模式，按 `Tab` 切换到下一个候选和弦，按 `Shift+Tab` 切换到上一个。
  - 双击（或 Ctrl/Cmd+点击）高亮和弦可一次性创建整组音符。
  - 和弦长度会自动匹配您最近编辑的音符长度，以保持节奏一致。

- 全局轨系统
  - 时间线上方固定有四条轨道：**Marker**、**Tempo**、**Key Signature**、**Chord**。
  - 创建全局区域：在全局轨中双击或 Ctrl/Cmd+点击；拖动可移动，拖动边缘可调整长度。
  - 这些轨道会影响播放时序、和弦指导、五线谱调号显示，以及和弦检测结果。

- 音频分析功能
  - **Detect Chords**：在音频区域打开钢琴卷帘窗口后，点击 **...** → **Detect Chords**，即可自动分析并把结果写入全局 Chord Track。可配置灵敏度、稳定性和七和弦检测。
  - **Detect Tempo**：在音频区域打开钢琴卷帘窗口后，点击 **...** → **Detect Tempo**，即可分析 BPM，并可选择自动对齐项目中的 Tempo Track。

- K.G.One 音乐生成器
  - 点击工具栏中的 **✦**（魔杖）按钮打开生成器面板。
  - **Full Song Generation**：根据文本描述和可选歌词生成整首歌曲（需要 K.G.One 服务器）。
  - **Clip Generation**：根据文本提示生成短音频片段和 MIDI loop（需要 K.G.One 服务器）。
  - **Stem Separation（浏览器）**：可完全在浏览器中把任意音频区域分离成 stems，无需服务器。支持两种模型：**UVR-MDX-NET-Inst_HQ_3**（2 stem：Vocals / Instrumental，约 64 MB）和 **Demucs htdemucs_4s**（4 stem：Vocals / Drums / Bass / Others，约 172 MB）。在生成器面板中下载模型后，点击 **Separate Stems** 即可。需要 WebGPU（Chrome 113+ / Edge 113+）。

- 吸附与量化
  - 在右上角的 NO SNAP 菜单中设置吸附。
  - 使用 Qua. Pos.（起始）和 Qua. Len.（长度）进行量化。

- 播放与播放头
  - 工具栏可回到开头，并执行 Play/Pause。
  - 在主时间网格点击小节编号可设置播放头；在钢琴卷帘中点击顶部时间轴也可设置，并遵守当前吸附设置。
  - BPM、拍号和调号都可以通过工具栏中的数值直接调整。

---

### 说明

出于安全考虑，在非本地主机场景下，K.G.Studio 默认不会把 API Key 持久化到 IndexedDB 中（以降低 XSS 风险）。您每次打开 K.G.Studio 时都需要重新输入。若您确实需要在非本地主机场景下持久化，请在设置中启用 “Persist API Keys on Non-Localhost”（不建议在共享或生产环境下启用）。

### 免责声明

K.G.Studio 不提供也不托管上述任何模型，也不隶属于任何模型提供方。所有数据默认都保存在您的本地设备中；您向第三方模型提供方发送的任何数据，都由您自行负责。

祝您使用 K.G.Studio 音乐创作助手创作愉快！
