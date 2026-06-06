[English](./README.md) | [Français](./README-fr.md) | 简体中文 | [繁體中文](./README-zh_hk.md)

<div align="center">
  <img src="./public/logo.png" alt="K.G.Studio Logo" width="160" />
</div>

# K.G.Studio — 一款基于浏览器的 DAW，并内置 AI 助手

<div align="center">
  <h3><a href="https://kgaudiolab.github.io/kgstudio"><b>◀ 立即在浏览器中在线使用 K.G.Studio ▶</b></a></h3>
</div>

## 什么是 K.G.Studio？

K.G.Studio 是一款轻量、现代化的 DAW，完全运行于浏览器中，并以 **K.G.Studio 音乐创作助手** 为核心。它提供基于 Tone.js sampler 的真实乐器回放、钢琴卷帘编辑器、支持完整撤销/重做的音轨与区域管理、基于 OPFS（Origin Private File System）的项目持久化、可配置的设置面板，以及可执行工具的内置 AI 助手。

**K.G.Studio 音乐创作助手** 是一款具备项目感知能力的 AI 协同创作助手。它并不直接生成音频文件（如 WAV 格式），而是直接在结构化的音轨和音符层级进行操作——帮助您编写旋律、构建和弦进行以及编辑 MIDI 音符，同时将完整的控制权留给您，方便您后续轻松调整、微调和雕琢每一个音乐细节。

<div align="center">
  <img src="./docs/KGOne-Demo-GIF.gif" alt="K.G.One Logo" width="640" />
</div>

> 注意：整曲生成功能和音频片段生成功能需要集成 [**K.G.One Music Studio**](https://github.com/KGAudioLab/K.G.One)。

## 最新更新

- **2026.06.05**: 大幅扩展 **K.G.Studio 音乐创作助手**，升级为完整的项目级 AI Agent：
  - **音轨管理工具** — Agent 现在无需选择区域，即可列出、创建、更新和删除音轨，以及浏览所有可用乐器。
  - **全局轨工具** — 完整读取/写入/删除四条全局轨：**和弦进行**、**速度（BPM）**、**调号** 和 **Marker**。Agent 可在一次对话中重构整首编曲的和声与节奏骨架。
  - **工具确认机制** — 写操作在执行前会在聊天中显示确认步骤，让您在修改生效前有机会审查。
  - **Agent 待办清单** — 助手现在会在聊天中维护内联任务清单，以实时快照卡片的形式呈现，让多步骤计划一目了然。
  - **对话历史** — 聊天会话会按项目持久化保存，并可跨页面刷新恢复。
  - **自动上下文压缩** — 当对话接近上下文限制时，旧消息会自动摘要压缩，保证长会话持续运转。
  - **高效 Agent 模式** — 为较小/本地语言模型提供精简提示词与工具集，使用 Local Browser LLM 时自动启用。

- **2026.05.30**: 新增 **国际化（i18n）支持** — K.G.Studio 现已提供四种语言版本：**English**、**简体中文**、**繁體中文** 和 **Français**。可在 **设置 ⚙️ → 通用 → 语言** 中配置首选语言，选择 `Auto` 时将自动检测浏览器语言。

- **2026.05.27**:
  - 新增 **全局轨系统**，引入四条全局轨：**Marker**、**Tempo**、**Key Signature** 和 **Chord**（和弦符号跨度区段）。
  - 新增 **音频和弦检测** 功能。您可以为音频区域或 MIDI 区域打开钢琴卷帘窗口，然后点击“...” -> **Detect Chords**，即可通过零依赖 FFT 流水线自动分析录音内容，并将结果写入 Chord Track；支持灵敏度、稳定性与七和弦检测配置。
  - 新增 **带自动对齐拍点的速度检测** 功能。您可以为音频区域打开钢琴卷帘窗口，然后在工具栏点击“...” -> **Detect Tempo**，分析音频 BPM，并可选择将项目中的 Tempo Track 区段自动重新对齐。
  - 新增 **Demucs 4S** 作为第二个本地浏览器内嵌分轨模型。现有的双 stem UVR-MDX-NET 模型之外，又加入了四 stem 的 `htdemucs_4s` 模型（约 172 MB，vocals / drums / bass / others），两者都可通过 ONNX Runtime WebGPU 完全在浏览器中运行。

- **2026.05.15**: 新增 **浏览器内嵌 AI 模型**。现在有两个 AI 模型可完全在浏览器中运行，无需外部服务、无需 API Key，也无需 K.G.One 服务器。**K.G.Studio 音乐创作助手** 新增 **Local LLM (Browser)** 提供方，由 **Gemma 4 E4B** 驱动，并通过 LiteRT-LM 与 WebGPU 加速运行；模型只需下载一次，随后会缓存在 OPFS 中，后续启动几乎可即时使用，同时支持可配置的上下文长度（32 k / 64 k / 128 k tokens）与实时推理性能统计。**Stem separation** 也支持本地运行，基于浏览器内嵌的 **UVR-MDX-NET-Inst_HQ_3** ONNX 模型并使用 WebGPU 加速。您可以打开 **Music Generator** 面板（✦ 按钮），下载模型一次后，即可完全在本机将人声与伴奏分离。以上两项功能都要求浏览器支持 WebGPU（Chrome 113+ 或 Edge 113+）并运行在安全上下文中（HTTPS 或 localhost）。推荐硬件：至少 8 GB 显存的 GPU，或至少 16 GB 统一内存的系统。

- **2026.05.10**: 新增 **五线谱视图**。钢琴卷帘现已支持完整的标准乐谱显示模式。您可以通过钢琴卷帘工具栏中的切换按钮在 Piano Roll 和 Sheet Music 视图之间切换。在五线谱模式下，音符会通过 VexFlow 排版，并支持基于当前乐器自动选择谱号（高音或低音）、显示调号、自动符杠分组、跨小节连音线，以及可配置的音值量化。启用 **Track Scope** 后，整条音轨上的所有 MIDI 区域会以连续谱面的形式显示，而不再局限于单个区域。

- **2026.05.09**: 新增 **音频录音**。您现在可以直接从麦克风录制到音频轨。录音时会实时增长显示波形预览，停止后该录音会作为标准音频区域写入时间线。另新增 **音频 I/O 设备选择**，您可以在设置中选择偏好的麦克风输入设备和音频输出设备。

- **2026.05.08**: 新增 **MIDI 自动化**。您可以在钢琴网格下方的可编辑自动化区域中绘制和编辑 pitch bend 与 MIDI CC 曲线（CC1 Modulation、CC2 Breath、CC7 Volume、CC11 Expression、CC64 Sustain）。同时新增 **轨道级自动化**：每条音轨现在都有专用自动化面板，您可以直接在时间线上查看和编辑同样的曲线。实时 MIDI 控制器输入（如 pitch wheel、CC 踏板）也支持录制与按轨回放，并带有每条自动化轨的插值处理。另新增 **事件列表面板**，这是一个带标签页的侧边栏（Notes / Pitch Bend / Controller），可用于查看与内联编辑当前 MIDI 区域中的全部事件。还新增了 **区域多选**（支持套索与批量移动/缩放）以及 **合并 MIDI 区域**。
<div align="center">
  <img src="./public/snapshots/2026-05-08-automations.png" alt="K.G.Studio Logo" width="640" />
</div>

- **2026.05.02**: 新增 **音频轨频谱可视化**。音频区域现在会在时间网格中显示实时频谱叠加层。另新增 **Piano Roll hybrid mode**：当您在 MIDI 区域中打开钢琴卷帘时，可将相邻音频区域的频谱作为参考层显示，从而参照音频形状编辑 MIDI 音符。新增 **钢琴卷帘缩放**，并保留当前视口位置，使画面始终锚定在当前播放头附近。还新增 **区域微调位置**，可用小步长推动区域以实现精确摆放；同时新增跨组件的播放头滚动同步，使主网格与钢琴卷帘在播放期间保持联动。

查看完整版本历史，请参阅 [**发布说明**](./docs/RELEASE_NOTES.md)。

## 项目状态

**K.G.Studio 是一个仍处于早期开发阶段的实验性项目。** 我们正在探索如何将 AI agent 与 LLM 融入音乐制作工作流，本质上是在构建一种面向 DAW 的 “Cursor 或 Claude Code” 体验。

该项目关注 AI 与人类协作如何增强音乐创作过程，从智能和声建议到自动化编辑任务都在探索范围内。作为实验平台，项目会频繁变化，功能将持续演进，并且在我们推进 AI 辅助音乐制作边界的过程中，偶尔出现不稳定情况也是可以预期的。

## 演示视频

<div align="center">
  <table>
    <tr>
      <td align="center">
        <a href="https://youtu.be/F1JWjK84zwc" target="_blank">
          <img src="./public/demo/demo-cover.png" alt="K.G.One Music Studio" width="400"/>
        </a>
        <br><b>K.G.One Music Studio</b>
      </td>
      <td align="center">
        <a href="https://youtu.be/FXgihfAH2vc" target="_blank">
          <img src="./public/demo/cover-FXgihfAH2vc.png" alt="Short Demo" width="400"/>
        </a>
        <br><b>短演示（仅 DAW）</b>
      </td>
      <td align="center">
        <a href="https://youtu.be/vKbWAQRt0r0" target="_blank">
          <img src="./public/demo/cover-vKbWAQRt0r0.png" alt="Full Demo" width="400"/>
        </a>
        <br><b>完整演示（仅 DAW）</b>
      </td>
    </tr>
  </table>
</div>

## 快速开始

### 配置 K.G.Studio 音乐创作助手

使用 K.G.Studio 音乐创作助手有两种方式：一种是 **Local LLM (Browser)**，完全在浏览器中运行，无需 API Key、无需费用，且数据不会离开您的设备；另一种是使用 **外部 LLM 提供方**，以获得更高质量的回复。

#### 方案 A：Local LLM (Browser) — 无需 API Key ✦

K.G.Studio 可以借助 WebGPU 加速，在浏览器中直接运行 **Gemma 4 E4B**。不会产生 API 调用，不会产生费用，您的数据也不会离开本机。

  - 点击这里开始在线使用应用：[K.G.Studio (kgaudiolab.github.io/kgstudio)](https://kgaudiolab.github.io/kgstudio)
  - 在 **设置 ⚙️ → 通用 → LLM 提供方** 中选择 **本地 LLM（浏览器）**（默认选项）。
  - 第一次打开聊天时，模型（约 2.8 GB）会自动下载，并缓存在浏览器的 OPFS（Origin Private File System）中，后续启动几乎可即时使用。
  - 您也可以选择配置 **上下文长度**（32k / 64k / 128k tokens）；数值越大，对显存要求越高。
  - 现在就可以开始聊天。除首次下载模型外，无需 Key、无需账号，也无需持续联网。

**Local LLM 的要求：** 需要支持 WebGPU 的浏览器（Chrome 113+ 或 Edge 113+），并运行在安全上下文中（HTTPS 或 localhost）。推荐硬件为至少 8 GB 显存的 GPU，或至少 16 GB 统一内存的系统。

> **注意：** 本地模型的质量无法与 GPT 或 Claude 系列商业模型相比。对于复杂的音乐编辑任务，外部提供方通常会产生更好的结果。

#### 方案 B：外部 LLM 提供方（更高质量）

  - 点击这里开始在线使用应用：[K.G.Studio (kgaudiolab.github.io/kgstudio)](https://kgaudiolab.github.io/kgstudio)
  - [点击这里获取免费 OpenRouter API Key](https://openrouter.ai/keys)（您可能需要一个 OpenRouter 账号）。
  - 在 **设置 ⚙️ → 通用 → LLM 提供方** 中选择 **OpenAI Compatible**。
  - 在 **OpenAI Compatible Server → 密钥** 中粘贴您的 Key。（注意：在非 localhost 环境中，出于安全原因，您的 Key 默认不会被持久化；您可以在设置中启用 “Persist API Keys on Non-Localhost” 以允许持久化，但这可能增加 XSS 风险。）
  - 在 **OpenAI Compatible Server → 模型** 中输入 `openai/gpt-oss-120b:free`。（注意：这是一个免费模型；非免费模型可能需要付费；免费模型提供方可能会收集您的数据，请查看模型页面中的说明；本项目与 OpenRouter 或任何模型提供方 **没有关联关系**。）
  - 在 **OpenAI Compatible Server → 基础 URL** 中输入 `https://openrouter.ai/api/v1`。

**提示：**
- 您也可以使用官方 OpenAI API、其他 OpenAI 兼容服务，或自托管 LLM 服务器（如 Ollama、vLLM）。请注意，不同模型的质量差异较大，并非所有模型都同样适合音乐编辑任务。对于自托管/本地部署（需要约 24G 显存或 24-32GB 统一内存），我们推荐：`qwen/qwen3.6-35b-a3b`、`google/gemma-4-26b-a4b-it` 或 `google/gemma-4-31b-it`。
- 如果您已订阅 OpenAI 或其他 LLM 提供方，可以使用 [CLIProxyAPI](https://github.com/router-for-me/CLIProxyAPI) 运行一个本地代理服务器，通过现有订阅转发请求，而无需单独准备 API Key。

### 基本 DAW 操作

  - 在音轨上双击（或按住 Ctrl/Cmd 并点击）可创建区域。
  - 拖动区域边缘可调整长度；拖动区域主体可移动。
  - 点击区域左上角的小铅笔即可打开钢琴卷帘。
  - 在钢琴卷帘中，双击（或 Ctrl/Cmd+点击）可创建音符。
  - 单击可选择；Shift+单击可多选；拖拽可框选。
  - 拖动音符边缘可调整长度；拖动音符主体可移动已选音符。
  - 使用钢琴卷帘工具栏右上角的 Snapping 功能可将编辑量化到网格。

### 使用 K.G.Studio 音乐创作助手

  - 选中您希望助手处理的音乐区域，在聊天框中输入提示词；按 Enter 发送，按 Shift+Enter 插入换行。
  - agent 会自动处理您的请求，并调用工具，在所选区域范围内执行修改。某些任务可能需要一轮或多轮对话才能完成。
  - 请注意，AI 也可能出错，因此您应始终检查结果，并在必要时自行调整。您也可以通过撤销/重做回退修改。
  - 点击 “+” 按钮或输入 `/clear` 命令可清空聊天历史。

### 更多说明

您可以在[这里](./docs/USER_GUIDE.md)查看详细用户指南。

### 亮点功能
- **K.G.Studio 音乐创作助手**：与由 LLM 驱动的 AI agent 进行对话；它会自动执行工具，对您所选区域内的音乐内容进行编辑。
- **浏览器内嵌 LLM，无需 API Key**：通过 WebGPU（LiteRT-LM）在浏览器中直接运行 **Gemma 4 E4B**。无 API 调用、无费用、数据不离开您的设备。模型只需下载一次，随后会缓存在本地。
- **浏览器内嵌分轨，无需服务器**：使用 **UVR-MDX-NET-Inst_HQ_3**（2-stem：Vocals / Instrumental）或 **Demucs htdemucs_4s**（4-stem：Vocals / Drums / Bass / Others）将任意音频区域拆分为 stems。两者都完全在浏览器中通过 ONNX Runtime WebGPU 运行，无需 K.G.One 服务器。
- **音频和弦检测**：为音频区域打开钢琴卷帘后运行 **Detect Chords**，即可通过零依赖 FFT 流水线自动分析录音并填充全局 Chord Track，同时支持灵敏度、稳定性和七和弦检测等配置。
- **带自动对齐拍点的速度检测**：在钢琴卷帘工具栏运行 **Detect Tempo**，即可分析音频区域的 BPM，并可选择自动重新对齐项目的 Tempo Track。
- **全局轨系统**：四条持久存在的全局轨 **Marker**、**Tempo**、**Key Signature** 和 **Chord** 共同提供项目级结构，所有功能（播放时序、和弦检测、五线谱显示）都会参考它们。
- **K.G.One Music Studio 集成**：连接本地 [K.G.One](https://github.com/KGAudioLab/K.G.One) 服务器后，可解锁 GPU 加速的 **Full Song Generation**（ACE-Step 1.5）、**Clip & MIDI Loop Generation**（Foundation-1）以及更多 **Stem Separation** 模型。
- **多种 LLM 提供方**：支持 OpenAI、Claude / Gemini（通过 OpenRouter）、OpenAI 兼容服务（Ollama、vLLM 等），或内置的本地浏览器 LLM，无需 Key。
- **音轨与区域编辑**：支持添加/重排音轨、创建/移动/缩放区域、套索多选、批量移动/缩放、合并与拆分区域，以及完整撤销/重做。
- **钢琴卷帘**：支持音符、pitch bend 和 MIDI CC 自动化轨；支持基于 VexFlow 的五线谱视图；支持音频到 MIDI 参考用途的频谱叠加层。
- **真实乐器**：基于 Tone.js 的 sampler，搭配高质量 FluidR3 soundfonts。您还可以直接从麦克风录制到音频轨。
- **智能和弦助手**：基于功能和声（T/S/D）提供实时和弦建议，并支持可视预览与一键创建和弦。
- **兼顾持久化与隐私**：项目和配置完全保存在您的浏览器中（OPFS / IndexedDB）。项目本身不依赖第一方服务器。

如需更深入的技术概览，请参阅 [overview.md](./docs/technical/overview.md)。

## 开始使用

### 或者在本地克隆并运行：
```bash
# 请确保已安装 Node.js >= 20.19.3
# 克隆仓库
git clone https://github.com/KGAudioLab/KGStudio {your-local-path}
cd {your-local-path}

# 安装依赖
npm install

# 启动开发服务器
npm run dev
```

## 配置

K.G.Studio 会从 `./public/config.json` 加载默认配置（内部也提供回退默认值），并通过 `ConfigManager` + IndexedDB 将用户修改持久化到浏览器中。IndexedDB 是浏览器在您设备上的本地数据库；数据不会离开您的机器，如果您清除此站点的数据，它也会被清除。请通过应用内的设置面板修改配置。

- **通用**
  - LLM 提供方：OpenAI，或 OpenAI 兼容服务
  - 当前所选提供方对应的 API Key 与模型
  - 在非 localhost 环境持久化 API Key：启用后，可在非 localhost 环境中持久化 API Key（属于安全风险自担选项，不建议在共享或生产环境中开启）
  - OpenAI 兼容服务的基础 URL（适用于自托管网关）
  - Soundfont 基础 URL（乐器采样 CDN）
- **行为**
  - 启动时默认打开聊天框
- **模板**
  - AI 助手使用的自定义指令

### 连接性与隐私

- K.G.Studio 完全在客户端运行。运行应用不需要任何第一方服务器。
- 项目和音频文件保存在浏览器的 OPFS（Origin Private File System）中；配置保存在 IndexedDB 中。所有数据都留在您的设备上。
- 网络访问仅用于：
  - 从配置的 soundfont CDN 下载乐器采样
  - 与您选择的 LLM 提供方通信（例如 OpenAI 或 OpenAI 兼容服务）
- 除上述两种情况外，应用均可在本地工作。即使您阻止这些端点，应用仍可加载；但在网络恢复之前，乐器回放和 AI 功能将无法使用。
- 出于安全考虑，当应用运行在非本地主机环境中时，我们默认不会将您的 API Key 持久化到 IndexedDB（以降低 XSS 风险）。这意味着您每次启动 K.G.Studio 时都需要重新输入。如需在非本地主机环境中启用持久化，请在设置中开启 “Persist API Keys on Non-Localhost”（不建议在共享或生产环境中启用）。

## 使用应用

您可以在[这里](./docs/USER_GUIDE.md)查看详细用户指南。

- 音轨
  - 在轨道信息面板中添加、重命名和重排音轨。
  - 通过乐器按钮（钢琴图标）切换乐器；可调整 Solo（S）、Mute（M）和 Volume。
  - 通过音轨设置菜单删除音轨（位于乐器按钮右侧）。

- 区域
  - 创建区域：使用 Pointer 工具时可双击，或按住 Ctrl/Cmd 再点击；使用 Pencil 工具时单击即可。
  - 移动/缩放：拖动区域主体可移动，拖动边缘可调整长度。
  - 通过区域左上角的小铅笔打开 Piano Roll。

- 钢琴卷帘（MIDI 音符）
  - 工具：Select 与 Pencil。
  - 创建音符：在 Select 模式下双击或 Ctrl/Cmd+点击；在 Pencil 模式下单击。
  - 选择音符：单击；Shift+单击多选；拖拽框选。
  - 移动/缩放：拖动音符主体可移动已选音符；拖动边缘可调整长度。
  - **五线谱视图**：可在钢琴卷帘工具栏中切换 Piano Roll 与 Staff Notation 视图。支持自动谱号选择、调号显示、符杠分组、连音线和可配置量化。启用 **Track Scope** 后会将整条音轨上的所有区域连续渲染为谱面。
  - **自动化轨道**：可在钢琴网格下方的可编辑区域中绘制和编辑 pitch bend 与 MIDI CC 曲线（Modulation、Breath、Volume、Expression、Sustain）。
  - **频谱模式**：可在钢琴卷帘中查看音频区域的频谱，并将其作为编辑 MIDI 音符时的参考层。
  - 可通过 X 或 ESC 关闭钢琴卷帘窗口。

- 智能和弦助手（新增于 2025-12-15）
  - 在钢琴卷帘工具栏中启用和弦指导：选择 T（Tonic）、S（Subdominant）或 D（Dominant）功能。
  - 将鼠标悬停在任意琴键上时，会以红色高亮显示上下文相关的和弦建议，并匹配您当前选择的调号与调式。
  - 按 Tab 可在同一和声功能下循环切换不同和弦转位。
  - 双击（或 Ctrl/Cmd+点击）高亮和弦可一次性创建整组音符。
  - 和弦长度会自动匹配您最近编辑的音符长度，以保持节奏一致。

- 吸附与量化
  - 在右上角的 NO SNAP 菜单中设置吸附。
  - 使用 Qua. Pos.（起始）和 Qua. Len.（长度）进行量化。

- 播放与播放头
  - 可通过工具栏回到开头，并执行 Play/Pause。
  - 在主时间网格点击小节编号可设置播放头；在钢琴卷帘中点击顶部时间轴也可设置，并遵守当前吸附设置。
  - BPM、拍号和调号都可以通过工具栏中的数值进行修改。

## 键盘快捷键

- 主界面
  - 播放/暂停：Space
  - 撤销 / 重做：Ctrl/Cmd+Z / Ctrl/Cmd+Shift+Z
  - 复制 / 剪切 / 粘贴：Ctrl/Cmd+C / Ctrl/Cmd+X / Ctrl/Cmd+V
  - 保存：Ctrl/Cmd+S
  - 按住以创建区域：Ctrl/Cmd
- 钢琴卷帘
  - 工具：Select（Q）、Pencil（W）
  - 按住以创建音符：Ctrl/Cmd
  - 吸附：1(None), 2(1/4), 3(1/8), 4(1/16)
  - 位置量化：5(1/4), 6(1/8), 7(1/16)
  - 长度量化：8(1/4), 9(1/8), 0(1/16)

## AI 助手

### 使用 K.G.Studio 音乐创作助手

- 请先按照前文说明完成 LLM 提供方设置。
- 您可以在右侧找到 K.G.Studio 音乐创作助手聊天框。如果当前未显示，可点击工具栏中的 Chat 🗨️ 按钮打开。
- 选中您希望助手处理的区域，在聊天框中输入提示词；按 Enter 发送，按 Shift+Enter 插入换行。
- agent 会自动处理您的请求，并调用工具，在所选区域范围内执行修改。某些任务可能需要一轮或多轮对话才能完成。
- 请注意，AI 也可能出错，因此您应始终检查结果，并在必要时自行调整。您也可以通过撤销/重做回退修改。
- 点击 “+” 按钮或输入 `/clear` 命令可清空聊天历史。

### 配置您的 LLM 提供方

进入 **设置 ⚙️ → 通用 → LLM 提供方**。根据您选择的提供方，您需要填写对应的 API Key，并在需要时填写自定义基础 URL（适用于 Ollama、OpenRouter 等非官方 OpenAI 兼容服务）。

注意：由于部分提供方存在 CORS 限制，Google Gemini 和 Anthropic Claude 当前仅支持通过 OpenRouter 使用。

### 使用 OpenAI 模型

1. 在 [**OpenAI**](https://platform.openai.com/account/api-keys) 获取 OpenAI API Key。您可能需要先注册账号并添加支付方式，才能生成 API Key。
2. 在 **设置 ⚙️ → 通用 → LLM 提供方** 中选择 **OpenAI** 作为提供方。
3. 在 **OpenAI → 密钥** 中输入您的 API Key。
4. 在 **OpenAI → 模型** 下拉中选择您偏好的模型。若希望在性能与成本之间取得较好平衡，我们推荐 `gpt-5.4`。
5. 您也可以选择是否在 **OpenAI → Flex 模式** 中启用 Flex Mode。Flex Mode 可以降低价格，但也可能带来更慢的响应时间或更多服务端错误。

### 使用 OpenRouter

OpenRouter 是一个统一接入平台，可让您访问来自多个提供方的大量语言模型，其中也包含免费选项，便于比较并找到最适合您需求的模型。

1. 在 [**OpenRouter**](https://openrouter.ai/keys) 获取 API Key。需要注册；若使用付费模型，可能还需要绑定支付方式。
2. 在 **设置 ⚙️ → 通用 → LLM 提供方** 中选择 **OpenAI Compatible** 作为提供方。
3. 在 **OpenAI Compatible Server → 密钥** 中输入您的 API Key。
4. 在 [**OpenRouter Models Page**](https://openrouter.ai/models) 浏览可用模型。您可以使用 “Prompt Pricing” 筛选免费模型。  
   **注意：** 不同模型提供方的数据保留与隐私政策可能不同，请在使用前自行查看。
5. 在 **OpenAI Compatible Server → 模型** 中输入您所选的模型名。推荐系列包括：
    - `Anthropic: Claude Sonnet 4.6` (`anthropic/claude-sonnet-4.6`: [Link](https://openrouter.ai/anthropic/claude-sonnet-4.6)) — Claude 系列中质量与成本平衡较好的选择
    - 免费模型：
        - `OpenAI: GPT-OSS 120B`（免费模型：`openai/gpt-oss-120b:free`: [Link](https://openrouter.ai/openai/gpt-oss-120b:free)）
        - `Google: Gemma 4 26B A4B IT`（免费模型：`google/gemma-4-26b-a4b-it:free`: [Link](https://openrouter.ai/google/gemma-4-26b-a4b-it:free)）
        - `Google: Gemma 4 31B IT`（免费模型：`google/gemma-4-31b-it:free`: [Link](https://openrouter.ai/google/gemma-4-31b-it:free)）
    - 对于自托管/本地部署（需要约 24G 显存或 24-32GB 统一内存），我们推荐：
        - `Qwen: Qwen3.6 35B A3B` (`qwen/qwen3.6-35b-a3b`: [Link](https://openrouter.ai/qwen/qwen3.6-35b-a3b))
        - `Google: Gemma 4 26B A4B IT` (`google/gemma-4-26b-a4b-it`: [Link](https://openrouter.ai/google/gemma-4-26b-a4b-it))
        - `Google: Gemma 4 31B IT` (`google/gemma-4-31b-it`: [Link](https://openrouter.ai/google/gemma-4-31b-it))
    - 注意：免费模型提供方可能会收集您的数据，使用前请先查看模型页面说明
    - 注意：免费模型的可用性变化频繁。如需查看最新免费选项，请访问 [OpenRouter Models Page](https://openrouter.ai/models)，并使用 **Prompt Pricing** 过滤当前免费模型
6. 在 **OpenAI Compatible Server → 基础 URL** 中填写 `https://openrouter.ai/api/v1`。

### 关于 agent 与 LLM 提供方

出于安全考虑，当您从非本地主机环境使用 K.G.Studio 时，API Key 默认不会持久化到 IndexedDB 中；这意味着您每次启动 K.G.Studio 时都需要重新输入。如需在非本地主机环境中启用持久化，请在设置中打开 “Persist API Keys on Non-Localhost”（不建议在共享或生产环境中启用）。

K.G.Studio 不提供也不托管上述任何模型，也不隶属于任何模型提供方。所有数据都保存在您的本地设备中；K.G.Studio 不会收集或传输您的数据。若您向第三方模型提供方发送任何数据，相关责任由您自行承担。

## K.G.One Music Generator

> **需要 [K.G.One Music Studio](https://github.com/KGAudioLab/K.G.One) 集成。** 只有当 K.G.Studio 连接到正在运行的 K.G.One 服务器时，K.G.One Music Generator 面板才会可用。设置说明请参阅 [K.G.One 仓库](https://github.com/KGAudioLab/K.G.One)。

**K.G.One Music Generator** 面板提供三项经 GPU 加速的 AI 工具，用于音乐生成与音频处理。点击工具栏中的 **✦（魔杖）** 按钮即可打开。该面板与 AI Assistant 聊天框互斥，打开其中一个时，另一个会自动关闭。

> **注意：** 您首次使用每个工具时，服务器都需要加载对应 AI 模型，这可能需要 60 秒甚至更久，具体取决于您的硬件。切换标签页时，也可能触发模型重新加载。

### Full Song Generation

根据文本描述和可选歌词生成一首完整歌曲。由 [ACE-Step 1.5](https://github.com/ace-step/ACE-Step-1.5) 驱动。

- 在 **Full Song** 标签页中，于 **Caption** 中输入自然语言描述，说明所需风格、情绪、速度、配器和结构。例如：`Genre: Eurodance, 90s dance-pop, upbeat electronic. Tempo: ~130 BPM. Instrumentation: driving kick drum, eurodance bassline...`
- 您也可以填写 **Lyrics**。可使用 `[Intro]`、`[Verse]`、`[Chorus]`、`[Bridge]` 等标签标记段落。若勾选 **Instrumental**，则会完全跳过人声。
- 点击 **Generate Song**。界面会实时显示生成阶段与百分比进度。
- 生成完成后，会显示预览播放器。您可以将其拖拽到 **audio track**，作为区域导入。
- 目前不支持将整曲生成结果拖放到 MIDI track。
- **Advanced Settings**（可展开）：Inference Steps、Guidance Scale、Seed，以及 Thinking（CoT metadata generation）。

### Clip Generation

根据文本描述生成短乐器片段和 MIDI loops。由 [Foundation-1](https://huggingface.co/RoyalCities/Foundation-1) 驱动。

- 在 **Clip** 标签页中，于 **Prompt** 中输入逗号分隔的标签，描述乐器类别、子类型、音色、效果、长度、BPM 和调性。例如：`Gritty, Acid, Bassline, 303, Synth Lead, FM, Sub, High Reverb, 8 Bars, 140 BPM, E minor`
- 您也可以填写 **Negative Prompt**，以避免生成某些不希望出现的特征（例如 `distortion, noise`）。
- 选择 **Bars**：4 或 8。BPM 与调号会根据项目设置预填，您也可以在 **Advanced Settings** 中调整。
- 点击 **Generate Clip**。生成完成后，会出现一个预览播放器，左侧带拖拽手柄，右侧带下载按钮。
- **导入方式**：将播放器拖拽到时间线中的音轨上。
  - 拖放到 **audio track** 时，会作为 WAV 音频区域导入（推荐）。
  - 拖放到 **MIDI track** 时，会作为 MIDI 区域导入。请注意，此 MIDI 是从音频转录而来，可能并非完全准确。
- **Advanced Settings**（可展开）：Note、Scale、BPM、Steps、CFG Scale、Seed（`-1` 表示随机）、Sampler Type、Sigma Min/Max，以及 CFG Rescale。

### Stem Separation

将现有音频区域拆分为独立 stems（例如人声、伴奏、鼓组等）。

K.G.Studio 支持 **两种模式** 的分轨：

#### 本地浏览器模式 — 无需服务器 ✦

两个 ONNX 模型可完全在浏览器中运行，无 API 调用、无费用，数据也不会离开您的设备。模型只需下载一次，随后会缓存在本地。

- **Vocal and Instrument (Medium Accuracy)**（`UVR-MDX-NET-Inst_HQ_3`，约 64 MB）— 双 stem 分离（Vocals / Instrumental）。由 [UVR-MDX-NET](https://github.com/nomadkaraoke/python-audio-separator) 驱动。
- **Vocal, Drums, Bass, and Others**（`htdemucs_4s`，约 172 MB）— 四 stem 分离（Vocals / Drums / Bass / Others）。由 [Demucs](https://github.com/facebookresearch/demucs) 驱动。

打开 **Music Generator** 面板（工具栏中的 ✦ 按钮），选择模型，先点击一次 **Download Selected Model**，然后点击 **Separate Stems**，所有处理都会在您的浏览器中本地完成。

**要求：** 需要支持 WebGPU 的浏览器（Chrome 113+ 或 Edge 113+），并运行在安全上下文中（HTTPS 或 localhost）。若可用，会优先使用 WebGPU 加速；否则会回退到 CPU（处理期间可能降低页面响应性）。推荐硬件为至少 8 GB 显存的 GPU，或至少 16 GB 统一内存的系统。

#### K.G.One 服务器模式

当连接到 [K.G.One Music Studio](https://github.com/KGAudioLab/K.G.One) 服务器后，可使用另外三种 GPU 加速模型。由 [python-audio-separator (UVR5)](https://github.com/nomadkaraoke/python-audio-separator) 驱动。

- **Vocal and Instrument (Medium Accuracy)**（`UVR-MDX-NET-Inst_HQ_3`）— 快速双 stem 分离（vocal / instrumental）。
- **Vocal and Instrument (High Accuracy)**（`MDX23C-8KFFT-InstVoc_HQ`）— 更高质量的双 stem 分离，但更慢。
- **Vocal, Drums, Bass, Guitar, Piano, and Others**（`htdemucs_6s`）— 完整六 stem 分离。

#### 使用方式（两种模式通用）

- 在打开此标签页之前，请先在时间线上**选中一个音频区域**。**Separator** 标签页顶部会显示当前所选区域及其音轨名称。仅支持音频区域，不支持分离 MIDI 区域。
- 点击 **Separate Stems**。如果当前所选区域带有 clip start offset 或已被裁剪，系统会先自动按该区域范围切出对应音频，再进行处理。
- 处理完成后，每个 stem 都会以带标签的预览播放器显示，并附带拖拽手柄。您可以在导入前分别试听每个 stem。
- **导入 stems：**
  - 可将每个 stem 播放器分别拖拽到 **audio track** 上，放到您希望的位置。
  - 或点击 **Import All Stems to Timeline**，系统会自动为每个 stem 新建一条音频轨，并将其放置在源音轨下方，与原始区域的起始拍点对齐。该操作可通过一次撤销完整回退。

## 即将推出的功能

功能优先级可能会变化。

### 1.0

- [X] 更多乐器
- [X] 自动化测试（单元测试、集成测试等）
- [X] 带功能和声指导（T/S/D）的智能和弦助手
- [X] 支持轨道控制自动化（例如 sustain、volume、pan 等）
- [X] 支持 MIDI 控制事件（例如 CC、pitch bend 等）
- [X] 支持 WAV 音频轨
- [X] 录音
- [X] 事件列表
- [X] 支持 OpenAI 的开源模型（`gpt-oss-20b` 和 `gpt-oss-120b`）
- [X] 五线谱
- [X] K.G.One Music Studio 集成
- [X] 浏览器内嵌 AI 模型（基于 Gemma 4 E4B 的本机 LLM；基于 UVR-MDX-NET-Inst_HQ_3 与 htdemucs_4s 的本机分轨）
- [X] 全局轨系统（Marker、Tempo、Key Signature、Chord）
- [X] 音频和弦检测（零依赖 FFT，并将结果写入 Chord Track）
- [X] 带自动对齐拍点的速度检测
- [X] 频谱可视化与 Piano Roll hybrid mode

### 1.0 之后

- [X] 扩展 AI agent 工具，直接通过聊天操作区域、音轨与全局轨（和弦进行、速度、调性）
- [ ] Mixer 视图，提供专用面板显示每轨推子、send、return bus 与 master channel
- [ ] EQ 与通道条，为每条音轨提供参数均衡器与压缩器
- [ ] 滤波器与效果器，如混响、延迟及其他基于 WebAudio 的原生插入效果
- [ ] 音频 time-stretch / warp，使音频区域自动匹配项目速度
- [ ] MIDI 效果器，如琶音器、音阶量化器、和弦记忆
- [ ] 虚拟 MIDI 设备输出

## 需要帮助

我们正在寻找贡献者，一起让 K.G.Studio 变得更好。无论您是开发者、音乐人还是设计师，您的专长都能带来实际价值。

### 您可以如何参与

**🎵 音乐人 / 音乐制作人**
- 使用真实音乐制作流程测试这款 DAW
- 反馈乐器音色质量与真实感
- 提出音乐创作中不可或缺但目前缺失的功能
- 帮助提升 AI 助手的音乐理解能力

**💻 开发者**
- 根据路线图实现新功能
- 修复 bug 并优化性能
- 增强 Web Audio 集成
- 改进 AI 助手能力

**🎨 UI/UX 设计师**
- 优化界面和工作流
- 设计更适合音乐编辑的视觉反馈
- 打造更直观的交互方式

### 参与方式

如果您有兴趣贡献，我们很愿意听到您的想法。

- **给我们发邮件**：[kgstudio@duck.com](mailto:kgstudio@duck.com)
- **查看 Issues**：浏览带有 `help wanted` 或 `good first issue` 标签的公开问题
- **参与讨论**：在 GitHub Discussions 中分享想法与反馈

每一份贡献都很重要。无论是报告 bug，还是提出新功能建议，都会推动项目继续前进。

### 免责声明

K.G.Studio 是一个处于早期开发阶段的实验性项目。我们正在探索如何将 AI agent 与 LLM 融入音乐制作工作流，本质上是在构建一种面向 DAW 的 “Cursor 或 Claude Code” 体验。

该项目关注 AI 与人类协作如何增强音乐创作过程，从智能和声建议到自动化编辑任务都在探索范围内。作为实验平台，项目会频繁变化，功能将持续演进，并且在我们推进 AI 辅助音乐制作边界的过程中，偶尔出现不稳定情况也是可以预期的。

K.G.Studio 不提供也不托管任何 LLM 模型，也不隶属于任何模型提供方。所有数据都保存在您的本地设备中；K.G.Studio 不会收集或传输您的数据。若您向第三方模型提供方发送任何数据，相关责任由您自行承担。

## 许可证

本项目基于 Apache License, Version 2.0 授权，并附带额外条款（参见 `LICENSE`）：
- 不得使用本软件或相关素材申请专利
- 当用于公开或商业产品时需要署名（“Powered by K.G.Studio”）

第三方声明（FluidR3_GM SoundFont、midi-js-soundfonts、VexFlow、prompt structure notes、Gemma 4 E4B、UVR-MDX-NET-Inst_HQ_3、MediaPipe、Meyda、web-audio-beat-detector、tonal、htdemucs_4s、onnxruntime-web 和 demucs-web）已包含在 `LICENSE` 中。
