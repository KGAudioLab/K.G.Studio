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

**K.G.Studio 音乐创作助手** 帮助您通过自然语言创作旋律、构建和弦进行，以及编辑音轨和 MIDI 音符。您可以接入外部 LLM API，或使用内置的 **Gemma 4 E4B** 作为后备方案，借助 WebGPU 加速完全在浏览器中运行，无需 API Key。

<div align="center">
  <img src="./docs/KGStudio-Demo-20261010.gif" alt="K.G.Studio 演示动画" width="640" />
</div>

### AI 音乐工具

这两项工具均可在支持的硬件上借助 **WebGPU 加速**，完全在浏览器内运行，MIDI 和音频处理均在本地完成。

- **人性化** — 使用 [AIRE](https://huggingface.co/KGAudioLab/instrument-aire-models)，根据音乐角色和情绪为弦乐、铜管和木管生成富有表现力的 MIDI 控制器曲线。塑造调制、气息、音量或表情，同时保留音符的时序和力度。
- **音轨分离** — 将音频分离为人声与伴奏，或人声、鼓、贝斯及其他乐器。试听分离结果，并直接导入编曲继续编辑。

## 最新更新

- **2026.10.11**: 新增音轨效果器（FX），用于音色塑造与混音：
  - **灵活的效果链** — 为 MIDI 和音频轨添加均衡器（EQ）、混响、压缩器和限制器，支持参数调整、效果旁路、拖拽排序及完整撤销/重做。
  - **实时可视化反馈** — 通过交互式频率响应曲线和实时频谱调整 EQ，并在播放时监测压缩器与限制器的电平和增益衰减。
  - **可复用的 FX 设置** — 保存和加载效果链预设，在音轨间复制单个效果器，并在复制音轨时选择包含 FX。效果器设置随项目一同保存。

<div align="center">
  <img src="./docs/KGStudio-FX-Demo-20261011.gif" alt="K.G.Studio 音轨效果器演示动画" width="420" />
</div>

- **2026.10.10**: 新增富有表现力的 MIDI 人性化功能，并扩展 AI Agent 编辑能力：
  - **AIRE 人性化** — 借助 WebGPU 加速，完全在浏览器中为弦乐、铜管和木管生成可编辑的 MIDI 表现曲线。可选择音乐角色、情绪及目标控制器（CC1、CC2、CC7 或 CC11），并支持可选的力度条件输入和曲线简化。音符的时序和力度保持不变。
  - **高级 Agent 模式** — 使用结构化 JSON 音乐工具和精确的 tick 时序进行细致的编曲编辑。助手可更新或删除音量、声像、弯音及 MIDI CC 自动化，并支持将批量控制点更新作为一次可撤销操作。结构化的音轨和乐器列表提供更丰富的项目上下文。

- **2026.07.18**: 推出强大的 MIDI 编曲与编辑新工作流：
  - **灵活且感知调性的移调能力** — 可在音轨或区域层级独立设置移调，支持最高三个八度的升降，并可选择跟随调号变化。当项目调性或调号区域发生变化时，系统还可自动移调和弦轨内容，在整个编曲中保持一致的和声意图。
  - **MIDI 参考模式** — 可在钢琴卷帘中将第二个 MIDI 区域作为只读参考层叠加显示，并与时间线精准对齐；编辑当前声部时，可以更高效地协调旋律、和声、声部排列与节奏关系。
  - **其他体验增强** — 优化播放头的可见性与导航体验，支持全局轨固定显示和可配置的音轨复制，改进五线谱中感知调性的等音拼写，并完善编辑器菜单的层级显示。

- **2026.07.12**: 全面增强 MIDI 创作、编辑与播放工作流：
  - **智能琶音器** — 从示例音符中学习模式，并根据和弦或 MIDI 生成变奏，同时保留原始半音音高，支持原子化撤销。
  - **更高效的 MIDI 编辑与导出** — 可在自定义范围内按音高层级选择音符，并将单个区域、完整音轨或整个项目导出为标准 MIDI 文件。
  - **持久化自定义乐器** — 使用 WAV 或 MP3 采样创建可复用乐器，支持逐音高映射、试听、可配置音域、内置后备乐器，并无缝集成播放与 MIDI 导出。
  - **更专注的编辑体验** — 钢琴卷帘现可停靠在时间线下方并调整高度；横向滚动时，音轨控制区仍会固定显示。
  - **更可靠的播放与记谱** — 独奏现在可覆盖静音状态，音频轨可在播放期间实时取消静音，低音谱号休止符也能显示在正确位置。

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

查看完整版本历史，请参阅 [**发布说明**](./docs/RELEASE_NOTES.md)。

## 项目状态

**K.G.Studio 是一个仍处于早期开发阶段的实验性项目。** 我们正在探索如何将 AI agent 与 LLM 融入音乐制作工作流，本质上是在构建一种面向 DAW 的 “Cursor 或 Claude Code” 体验。

该项目关注 AI 与人类协作如何增强音乐创作过程，从智能和声建议到自动化编辑任务都在探索范围内。作为实验平台，项目会频繁变化，功能将持续演进，并且在我们推进 AI 辅助音乐制作边界的过程中，偶尔出现不稳定情况也是可以预期的。

## 演示视频

<div align="center">
  <table>
    <tr>
      <td align="center">
        <a href="https://youtu.be/FXgihfAH2vc" target="_blank">
          <img src="./public/demo/cover-FXgihfAH2vc.png" alt="Short Demo" width="400"/>
        </a>
        <br><b>短演示（仅 DAW）</b>
      </td>
      <td align="center">
        <a href="https://www.youtube.com/watch?v=W25buhoeYN0" target="_blank">
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
  - 在 **设置 ⚙️ → 音乐创作助手 → LLM 提供方** 中选择 **本地 LLM（浏览器）**（默认选项）。
  - 第一次打开聊天时，模型（约 2.8 GB）会自动下载，并缓存在浏览器的 OPFS（Origin Private File System）中，后续启动几乎可即时使用。
  - 您也可以选择配置 **上下文长度**（32k / 64k / 128k tokens）；数值越大，对显存要求越高。
  - 现在就可以开始聊天。除首次下载模型外，无需 Key、无需账号，也无需持续联网。

**Local LLM 的要求：** 需要支持 WebGPU 的浏览器（Chrome 113+ 或 Edge 113+），并运行在安全上下文中（HTTPS 或 localhost）。推荐硬件为至少 8 GB 显存的 GPU，或至少 16 GB 统一内存的系统。

> **注意：** 本地模型的质量无法与 GPT 或 Claude 系列商业模型相比。对于复杂的音乐编辑任务，外部提供方通常会产生更好的结果。

#### 方案 B：外部 LLM 提供方（更高质量）

  - 点击这里开始在线使用应用：[K.G.Studio (kgaudiolab.github.io/kgstudio)](https://kgaudiolab.github.io/kgstudio)
  - [获取 OpenRouter API Key](https://openrouter.ai/keys)（需要一个 OpenRouter 账号）。
  - 在 **设置 ⚙️ → 音乐创作助手 → LLM 提供方** 中选择 **OpenAI Compatible**。
  - 在 **LLM 提供方（OpenAI 兼容） → 密钥** 中粘贴您的 Key。（注意：在非 localhost 环境中，出于安全原因，您的 Key 默认不会被持久化；您可以在设置中启用 “Persist API Keys on Non-Localhost” 以允许持久化，但这可能增加 XSS 风险。）
  - 在 **LLM 提供方（OpenAI 兼容） → 模型** 中输入您从 [OpenRouter 模型页面](https://openrouter.ai/models) 选择的模型 ID。使用前请查看其价格和数据政策；K.G.Studio 与 OpenRouter 或任何模型提供方 **没有关联关系**。
  - 在 **LLM 提供方（OpenAI 兼容） → 基础 URL** 中输入 `https://openrouter.ai/api/v1`。

**提示：**
- 您也可以使用官方 OpenAI API、其他 LLM 提供方（OpenAI 兼容），或自托管 LLM 服务器（如 Ollama、vLLM）。请注意，不同模型的质量差异较大，并非所有模型都同样适合音乐编辑任务。我们推荐 GPT 6.1 Sol，因为它在质量与成本之间取得了良好的平衡。
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
- **浏览器内嵌分轨，无需服务器**：使用 **UVR-MDX-NET-Inst_HQ_3**（2-stem：Vocals / Instrumental）或 **Demucs htdemucs_4s**（4-stem：Vocals / Drums / Bass / Others）将任意音频区域拆分为 stems。两者都完全在浏览器中通过 ONNX Runtime WebGPU 运行。
- **音频和弦检测**：为音频区域打开钢琴卷帘后运行 **Detect Chords**，即可通过零依赖 FFT 流水线自动分析录音并填充全局 Chord Track，同时支持灵敏度、稳定性和七和弦检测等配置。
- **带自动对齐拍点的速度检测**：在钢琴卷帘工具栏运行 **Detect Tempo**，即可分析音频区域的 BPM，并可选择自动重新对齐项目的 Tempo Track。
- **全局轨系统**：四条持久存在的全局轨 **Marker**、**Tempo**、**Key Signature** 和 **Chord** 共同提供项目级结构，所有功能（播放时序、和弦检测、五线谱显示）都会参考它们。
- **多种 LLM 提供方**：支持 OpenAI、Claude / Gemini（通过 OpenRouter）、LLM 提供方（OpenAI 兼容）（Ollama、vLLM 等），或内置的本地浏览器 LLM，无需 Key。
- **音轨与区域编辑**：支持添加/重排音轨、创建/移动/缩放区域、套索多选、批量移动/缩放、合并与拆分区域，以及完整撤销/重做。
- **钢琴卷帘**：支持音符、pitch bend 和 MIDI CC 自动化轨；支持基于 VexFlow 的五线谱视图；支持音频到 MIDI 参考用途的频谱叠加层。
- **真实乐器**：基于 Tone.js 的 sampler，搭配高质量 FluidR3 soundfonts。您还可以直接从麦克风录制到音频轨。
- **智能和弦助手**：基于功能和声（T/S/D）提供实时和弦建议，并支持可视预览与一键创建和弦。
- **兼顾持久化与隐私**：项目和配置完全保存在您的浏览器中（OPFS / IndexedDB）。项目本身不依赖第一方服务器。

如需更深入的技术概览，请参阅 [overview.md](./docs/technical/overview.md)。

## 开始使用

### 或者在本地克隆并运行：
```bash
# 请确保已安装 Node.js 24.22.0 LTS (npm 11.19.1)
# 克隆仓库
git clone https://github.com/KGAudioLab/KGStudio {your-local-path}
cd {your-local-path}

# 安装依赖
npm ci

# 启动开发服务器
npm run dev
```

### 本地 MCP 服务器（Codex、Claude Code、OpenCode 和 Pi）

K.G.Studio 可以通过 **Streamable HTTP，使用 MCP `2025-11-25` 版本**向外部 MCP 客户端提供音乐工具。

**必须同时满足以下两个条件：**

1. **在您的本地计算机上**运行启用了 MCP 的 K.G.Studio 服务器。
2. **在浏览器中**打开本地 K.G.Studio 网页，并保持该标签页打开。工具使用该标签页中的当前项目、选择范围和撤销历史。仅启动服务器还不够。

安装依赖后，选择以下一种方式：

```bash
# 开发模式：支持热更新的 Vite + MCP
npm run dev:mcp

# 或提供构建后的文件 + MCP（先执行构建）
npm run build
npm run preview:mcp
```

| 命令 | 在浏览器中打开的网页 | MCP 端点 |
| --- | --- | --- |
| `dev:mcp` | `http://127.0.0.1:5173/kgstudio/` | `http://127.0.0.1:5173/mcp` |
| `preview:mcp` | `http://127.0.0.1:4173/kgstudio/` | `http://127.0.0.1:4173/mcp` |

这些命令仅绑定回环接口，如果端口已被占用则会启动失败。终端会打印网页 URL 和 MCP 端点。**无需令牌、环境变量或身份验证请求头。** 在 MCP 客户端中配置本地 HTTP 端点即可；请求仍受回环接口和允许的本地来源限制。

对于使用 JSON 配置 MCP 的客户端，HTTP 服务器条目通常如下（请根据客户端调整外层配置结构）：

```json
{
  "mcpServers": {
    "kgstudio": {
      "type": "http",
      "url": "http://127.0.0.1:5173/mcp"
    }
  }
}
```

对于 Codex，请将以下内容添加到本地 `config.toml`：

```toml
[mcp_servers.kgstudio]
url = "http://127.0.0.1:5173/mcp"
```

使用 `preview:mcp` 时，请改用端口 `4173`。对于 OpenCode V2，请使用该 URL 配置 `remote` 服务器，并将协议保持为 `legacy`（`oauth: false` 可关闭不必要的 OAuth 发现）。Claude Code 和 Pi 可以直接使用 HTTP URL，无需身份验证；具体配置方式请参阅各客户端的文档。

**工具与模式切换：**

- MCP 遵循应用**实际生效的 Agent 模式**（常规、高级或高效）。与内部助手一样，使用 Local LLM (Browser) 提供方时会强制启用高效模式。
- 切换模式会更新工具目录并发送 MCP 工具列表变更通知，无需重启服务器。如果客户端未自动刷新，请重新连接。
- 如果工具在不同模式下的接口不兼容，其名称会包含模式前缀，例如 `regular_add_notes`、`advanced_add_notes` 和 `efficient_add_notes`。高级模式工具使用**每四分音符 960 tick** 的时间单位；常规／高效模式工具以四分音符为时间单位。通用工具保留原名。
- `update_todo_list` 专供 K.G.Studio 内部助手使用，绝不会通过 MCP 提供。
- 仅当当前浏览器标签页已连接本地 MCP 服务时，才会显示 MCP 设置页面；静态托管或服务不可用时会隐藏该页面。**MCP 请求默认禁用。** 请在**设置 → MCP → 允许 MCP 请求**中选择**启用**，以允许外部工具操作。此选择会保存在当前浏览器中。禁用时，请求会返回错误，要求调用方告知用户启用 MCP，同时会弹出提示，指引用户前往设置 → MCP；提示窗口打开期间，重复请求不会产生更多弹窗。启用后，请求无需逐次确认，与内部助手的批准设置相互独立。禁用 MCP 会使排队中的调用失效。
- 音乐编辑操作使用现有命令系统，支持与对应应用内工具相同的撤销行为。
- 同一时间只能有**一个浏览器标签页**控制 MCP。其他标签页会显示状态消息；请先关闭当前控制 MCP 的标签页，再重新加载希望连接的标签页。关闭该标签页后，工具将不可用。浏览器挂起标签页可能导致执行延迟。
- 调用会在两分钟后过期。如果请求超时或连接中断，请先检查项目，再重试编辑操作，因为已经开始执行的编辑可能已完成。如果模式或项目在执行前发生变化，待处理的调用会被拒绝。

**MCP 专用项目工具**在所有 Agent 模式下均可使用：

| 工具 | 行为 |
| --- | --- |
| `get_current_project_info` | 读取当前项目的名称、已保存快照状态、音乐设置、音轨数量和实际生效的模式。 |
| `create_project` | 必须提供 `name`。创建并激活未保存的新项目，丢弃当前未保存的更改。名称无效、使用保留名称 `Untitled Project` 或存储中已存在同名项目时返回错误。 |
| `list_projects` | 列出已保存且未删除的项目，以及创建／更新时间。 |
| `save_project` | 使用当前名称原样保存，不重命名或自动添加后缀。保存 `Untitled Project` 或覆盖其他项目时返回错误。 |
| `open_project` | 必须提供 `name`。按完整名称激活已保存的项目，丢弃当前未保存的更改。项目不存在、已删除或无法加载时返回错误。 |

项目存储在控制 MCP 的浏览器的 OPFS 中。不同浏览器配置文件、主机名或端口（包括开发模式和预览模式）可能拥有各自独立的项目库。创建／打开项目会重置编辑器和撤销历史；丢弃的更改无法撤销。切换项目前请先停止录制。创建项目不会自动保存，请调用 `save_project` 将其持久化。

外部客户端必须运行在同一台计算机上，或能够访问其回环接口；云端 Agent 无法直接访问此 localhost 端点。执行 MCP 工具不需要 K.G.Studio 的 LLM API Key，外部 Agent 会使用自己的模型。

**仍然支持静态托管。** 常规的 `dev`、`build` 和 `preview` 命令不会启用 MCP 端点。`npm run build` 仍会生成可独立部署到 GitHub Pages 等静态托管服务的 `dist/`，GitHub Pages 部署工作流保持不变。公开网页不会连接 localhost。只有启用了 MCP 的本地命令才会提供这个可选服务器。

## 配置

K.G.Studio 会从 `./public/config.json` 加载默认配置（内部也提供回退默认值），并通过 `ConfigManager` + IndexedDB 将用户修改持久化到浏览器中。IndexedDB 是浏览器在您设备上的本地数据库；数据不会离开您的机器，如果您清除此站点的数据，它也会被清除。请通过应用内的设置面板修改配置。

- **通用**
  - Soundfont 基础 URL（乐器采样 CDN）
- **音乐创作助手**
  - LLM 提供方：OpenAI，或 LLM 提供方（OpenAI 兼容）
  - 当前所选提供方对应的 API Key 与模型
  - 在非 localhost 环境持久化 API Key：启用后，可在非 localhost 环境中持久化 API Key（属于安全风险自担选项，不建议在共享或生产环境中开启）
  - LLM 提供方（OpenAI 兼容）的基础 URL（适用于自托管网关）
- **行为**
  - 启动时默认打开聊天框
- **模板**
  - AI 助手使用的自定义指令

### 连接性与隐私

- K.G.Studio 完全在客户端运行。运行应用不需要任何第一方服务器。
- 项目和音频文件保存在浏览器的 OPFS（Origin Private File System）中；配置保存在 IndexedDB 中。所有数据都留在您的设备上。
- 网络访问仅用于：
  - 从配置的 soundfont CDN 下载乐器采样
  - 与您选择的 LLM 提供方通信（例如 OpenAI 或 LLM 提供方（OpenAI 兼容））
  - 通过 `dev:mcp` 或 `preview:mcp` 显式启用后，与本地 MCP 桥接服务通信，让外部 Agent 能够使用浏览器中的音乐工具
- 除上述情况外，应用均可在本地工作。如果您阻止采样或 LLM 端点，应用仍可加载；受影响的回放和 AI 功能需要这些端点可用。
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

进入 **设置 ⚙️ → 音乐创作助手 → LLM 提供方**。根据您选择的提供方，您需要填写对应的 API Key，并在需要时填写自定义基础 URL（适用于 Ollama、OpenRouter 等非官方 LLM 提供方（OpenAI 兼容））。

注意：由于部分提供方存在 CORS 限制，Google Gemini 和 Anthropic Claude 当前仅支持通过 OpenRouter 使用。

### 使用 OpenAI 模型

1. 在 [**OpenAI**](https://platform.openai.com/account/api-keys) 获取 OpenAI API Key。您可能需要先注册账号并添加支付方式，才能生成 API Key。
2. 打开 **设置 ⚙️ → 音乐创作助手**，点击 **LLM 提供方（OpenAI 兼容）** 下的 **OpenAI** 预设。它会填写连接字段并切换到 **OpenAI 兼容** 模式。
3. 在 **LLM 提供方（OpenAI 兼容）→ 密钥** 中输入您的 API Key。
4. 预设会将模型设为 `gpt-6.1-sol`，您也可以填写账户可用的其他模型。

可用预设包括 OpenAI、Claude（通过 OpenRouter）、OpenRouter、Ollama、llama.cpp 和 CLIProxyAPI。点击预设会替换密钥、基础 URL 和模型，并切换到 OpenAI 兼容模式。对于受支持的 ChatGPT 或 Claude 订阅，[CLIProxyAPI](https://github.com/router-for-me/CLIProxyAPI) 可提供本地兼容连接，使用订阅所提供的模型访问权限。所有预设都会清空密钥。如果需要身份验证，请输入提供方或服务器的密钥。

### 使用 OpenRouter

OpenRouter 是一个统一接入平台，可让您访问来自多个提供方的大量语言模型，便于比较并找到最适合您需求的模型。

1. 在 [**OpenRouter**](https://openrouter.ai/keys) 获取 API Key。需要注册；若使用付费模型，可能还需要绑定支付方式。
2. 打开 **设置 ⚙️ → 音乐创作助手**，点击 **LLM 提供方（OpenAI 兼容）** 下的 **OpenRouter** 预设。
3. 在 **LLM 提供方（OpenAI 兼容） → 密钥** 中输入您的 API Key。
4. 在 [**OpenRouter 模型页面**](https://openrouter.ai/models) 浏览可用模型，并比较其价格和功能。
   **注意：** 不同模型提供方的数据保留与隐私政策可能不同，请在使用前自行查看。
5. 在 **LLM 提供方（OpenAI 兼容） → 模型** 中输入您所选的模型名。
6. 在 **LLM 提供方（OpenAI 兼容） → 基础 URL** 中填写 `https://openrouter.ai/api/v1`。

您也可以在 [OpenRouter 模型页面](https://openrouter.ai/models) 浏览当前可用的免费模型。可用性会随时间变化；K.G.Studio 不再推荐用于音乐编辑的特定免费模型。

### 关于 agent 与 LLM 提供方

出于安全考虑，当您从非本地主机环境使用 K.G.Studio 时，API Key 默认不会持久化到 IndexedDB 中；这意味着您每次启动 K.G.Studio 时都需要重新输入。如需在非本地主机环境中启用持久化，请在设置中打开 “Persist API Keys on Non-Localhost”（不建议在共享或生产环境中启用）。

K.G.Studio 不提供也不托管上述任何模型，也不隶属于任何模型提供方。所有数据都保存在您的本地设备中；K.G.Studio 不会收集或传输您的数据。若您向第三方模型提供方发送任何数据，相关责任由您自行承担。

## AI 音乐工具

**AI 音乐工具** 面板直接在浏览器中提取音轨。点击工具栏中的 **✦（魔杖）** 按钮即可打开。面板包含 **音轨提取** 和 **人性化** 标签页。打开此面板会关闭 AI Assistant 聊天框。

### Stem Separation

将现有音频区域拆分为独立 stems（例如人声、伴奏、鼓组等）。

两个 ONNX 模型可完全在浏览器中运行，无 API 调用、无费用，数据也不会离开您的设备。模型只需下载一次，随后会缓存在本地。

- **Vocal and Instrument (Medium Accuracy)**（`UVR-MDX-NET-Inst_HQ_3`，约 64 MB）— 双 stem 分离（Vocals / Instrumental）。由 [UVR-MDX-NET](https://github.com/nomadkaraoke/python-audio-separator) 驱动。
- **Vocal, Drums, Bass, and Others**（`htdemucs_4s`，约 172 MB）— 四 stem 分离（Vocals / Drums / Bass / Others）。由 [Demucs](https://github.com/facebookresearch/demucs) 驱动。

打开 **AI 音乐工具** 面板（工具栏中的 ✦ 按钮），选择模型，先点击一次 **Download Selected Model**，然后点击 **Separate Stems**，所有处理都会在您的浏览器中本地完成。

**要求：** 需要支持 WebGPU 的浏览器（Chrome 113+ 或 Edge 113+），并运行在安全上下文中（HTTPS 或 localhost）。若可用，会优先使用 WebGPU 加速；否则会回退到 CPU（处理期间可能降低页面响应性）。推荐硬件为至少 8 GB 显存的 GPU，或至少 16 GB 统一内存的系统。

#### 使用方式

- 在打开此标签页之前，请先在时间线上**选中一个音频区域**。**音轨提取** 标签页顶部会显示当前所选区域及其音轨名称。仅支持音频区域，不支持分离 MIDI 区域。
- 点击 **Separate Stems**。如果当前所选区域带有 clip start offset 或已被裁剪，系统会先自动按该区域范围切出对应音频，再进行处理。
- 处理完成后，每个 stem 都会以带标签的预览播放器显示，并附带拖拽手柄。您可以在导入前分别试听每个 stem。
- **导入 stems：**
  - 可将每个 stem 播放器分别拖拽到 **audio track** 上，放到您希望的位置。
  - 或点击 **Import All Stems to Timeline**，系统会自动为每个 stem 新建一条音频轨，并将其放置在源音轨下方，与原始区域的起始拍点对齐。该操作可通过一次撤销完整回退。

### 人性化

在波形或频谱视图中，选择 **… → 音轨提取…** 可打开此标签页。

在时间线上选择 MIDI 区域，然后选择 **… → 人性化…**，即可打开 **AI 音乐工具 → 人性化**。所有设置均直接显示在标签页中。AIRE 为 **CC1、CC2、CC7 或 CC11** 生成可编辑的表现曲线，同时保留音符的时序和力度。已启用的循环将处理范围限制在其与区域的交集内。设置在本次应用会话中保留；离开标签页会取消处理。完成后，钢琴卷帘将显示生成的控制器轨道。标签页跟随时间线选择，显示推理后端和模型缓存状态，并提供下载、重新下载及删除所选模型的按钮。

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
- [X] 浏览器内嵌 AI 模型（基于 Gemma 4 E4B 的本机 LLM；基于 UVR-MDX-NET-Inst_HQ_3 与 htdemucs_4s 的本机分轨）
- [X] 全局轨系统（Marker、Tempo、Key Signature、Chord）
- [X] 音频和弦检测（零依赖 FFT，并将结果写入 Chord Track）
- [X] 带自动对齐拍点的速度检测
- [X] 频谱可视化与 Piano Roll hybrid mode

### 1.0 之后

- [X] 扩展 AI agent 工具，直接通过聊天操作区域、音轨与全局轨（和弦进行、速度、调性）
- [X] 音轨效果器（FX）— 均衡器（EQ）、混响、压缩器和限制器，支持自定义效果链顺序
- [ ] Mixer 视图，提供专用面板显示每轨推子、send、return bus 与 master channel
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

第三方声明（FluidR3_GM SoundFont、midi-js-soundfonts、VexFlow、Hopkins Media Services、prompt structure notes、Gemma 4 E4B、UVR-MDX-NET-Inst_HQ_3、MediaPipe、Meyda、web-audio-beat-detector、tonal、htdemucs_4s、onnxruntime-web、AIRE 和 demucs-web）已包含在 `LICENSE` 中。
