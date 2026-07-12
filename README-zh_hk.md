[English](./README.md) | [Français](./README-fr.md) | [简体中文](./README-zh_cn.md) | 繁體中文

<div align="center">
  <img src="./public/logo.png" alt="K.G.Studio Logo" width="160" />
</div>

# K.G.Studio — 一款基於瀏覽器的 DAW，並內建 AI 助手

<div align="center">
  <h3><a href="https://kgaudiolab.github.io/kgstudio"><b>◀ 立即在瀏覽器中線上使用 K.G.Studio ▶</b></a></h3>
</div>

## 什麼是 K.G.Studio？

K.G.Studio 是一款輕量、現代化的 DAW，完全執行於瀏覽器中，並以 **K.G.Studio 音樂創作助手** 為核心。它提供基於 Tone.js sampler 的真實樂器回放、Piano Roll 編輯器、支援完整復原/重做的音軌與區域管理、基於 OPFS（Origin Private File System）的專案持久化、可設定的設定面板，以及可執行工具的內建 AI 助手。

**K.G.Studio 音樂創作助手** 是一款具備專案感知能力的 AI 協同創作助手。它並不直接生成音訊檔案（如 WAV 格式），而是直接在結構化的音軌和音符層級進行操作——幫助您編寫旋律、構建和聲進行以及編輯 MIDI 音符，同時將完整的控制權留給您，方便您後續輕鬆調整、微調和雕琢每一個音樂細節。

<div align="center">
  <img src="./docs/KGOne-Demo-GIF.gif" alt="K.G.One Logo" width="640" />
</div>

> 注意：整曲生成功能和音訊片段生成功能需要整合 [**K.G.One Music Studio**](https://github.com/KGAudioLab/K.G.One)。

## 最新更新

- **2026.07.12**: 全面增強 MIDI 創作、編輯與播放工作流：
  - **智能琶音器** — 從範例音符中學習模式，並根據和弦或 MIDI 生成變奏，同時保留原始半音音高，支援原子化復原。
  - **更高效的 MIDI 編輯與匯出** — 可在自訂範圍內按音高層級選取音符，並將單個區域、完整音軌或整個專案匯出為標準 MIDI 檔案。
  - **持久化自訂樂器** — 使用 WAV 或 MP3 取樣建立可重用樂器，支援逐音高對應、試聽、可設定音域、內建後備樂器，並無縫整合播放與 MIDI 匯出。
  - **更專注的編輯體驗** — 鋼琴卷簾現可停靠在時間線下方並調整高度；水平捲動時，音軌控制區仍會固定顯示。
  - **更可靠的播放與記譜** — 獨奏現在可覆蓋靜音狀態，音訊軌可在播放期間即時取消靜音，低音譜號休止符也能顯示在正確位置。

- **2026.06.05**: 大幅擴展 **K.G.Studio 音樂創作助手**，升級為完整的專案級 AI Agent：
  - **音軌管理工具** — Agent 現在無需選取區域，即可列出、建立、更新和刪除音軌，以及瀏覽所有可用樂器。
  - **全域軌工具** — 完整讀取/寫入/刪除四條全域軌：**和弦進行**、**速度（BPM）**、**調號** 和 **Marker**。Agent 可在一次對話中重構整首編曲的和聲與節奏骨架。
  - **工具確認機制** — 寫操作在執行前會在聊天中顯示確認步驟，讓您在修改生效前有機會審查。
  - **Agent 待辦清單** — 助手現在會在聊天中維護內聯任務清單，以即時快照卡片的形式呈現，讓多步驟計劃一目了然。
  - **對話歷史** — 聊天會話會按專案持久化保存，並可跨頁面重新整理恢復。
  - **自動上下文壓縮** — 當對話接近上下文限制時，舊訊息會自動摘要壓縮，保證長對話持續運作。
  - **高效 Agent 模式** — 為較小/本地語言模型提供精簡提示詞與工具集，使用 Local Browser LLM 時自動啟用。

- **2026.05.30**: 新增 **國際化（i18n）支援** — K.G.Studio 現已提供四種語言版本：**English**、**简体中文**、**繁體中文** 和 **Français**。可在 **設定 ⚙️ → 通用 → 語言** 中設定偏好語言，選擇 `Auto` 時將自動偵測瀏覽器語言。

- **2026.05.27**:
  - 新增 **全域軌系統**，引入四條全域軌：**Marker**、**Tempo**、**Key Signature** 和 **Chord**（和弦符號跨度區段）。
  - 新增 **音訊和弦檢測** 功能。您可以為音訊區域或 MIDI 區域開啟鋼琴卷簾視窗，然後點擊「...」 -> **Detect Chords**，即可透過零依賴 FFT 流水線自動分析錄音內容，並將結果寫入 Chord Track；支援靈敏度、穩定性與七和弦檢測設定。
  - 新增 **帶自動對齊拍點的速度檢測** 功能。您可以為音訊區域開啟鋼琴卷簾視窗，然後在工具列點擊「...」 -> **Detect Tempo**，分析音訊 BPM，並可選擇將專案中的 Tempo Track 區段自動重新對齊。
  - 新增 **Demucs 4S** 作為第二個本地瀏覽器內嵌分軌模型。現有的雙 stem UVR-MDX-NET 模型之外，又加入了四 stem 的 `htdemucs_4s` 模型（約 172 MB，vocals / drums / bass / others），兩者都可透過 ONNX Runtime WebGPU 完全在瀏覽器中執行。

- **2026.05.15**: 新增 **瀏覽器內嵌 AI 模型**。現在有兩個 AI 模型可完全在瀏覽器中執行，無需外部服務、無需 API Key，也無需 K.G.One 伺服器。**K.G.Studio 音樂創作助手** 新增 **Local LLM (Browser)** 提供方，由 **Gemma 4 E4B** 驅動，並透過 LiteRT-LM 與 WebGPU 加速執行；模型只需下載一次，隨後會快取在 OPFS 中，後續啟動幾乎可即時使用，同時支援可設定的上下文長度（32 k / 64 k / 128 k tokens）與即時推理效能統計。**Stem separation** 也支援本地執行，基於瀏覽器內嵌的 **UVR-MDX-NET-Inst_HQ_3** ONNX 模型並使用 WebGPU 加速。您可以開啟 **Music Generator** 面板（✦ 按鈕），下載模型一次後，即可完全在本機將人聲與伴奏分離。以上兩項功能都要求瀏覽器支援 WebGPU（Chrome 113+ 或 Edge 113+）並執行在安全上下文中（HTTPS 或 localhost）。推薦硬體：至少 8 GB 顯存的 GPU，或至少 16 GB 統一記憶體的系統。

- **2026.05.10**: 新增 **五線譜視圖**。鋼琴卷簾現已支援完整的標準樂譜顯示模式。您可以透過鋼琴卷簾工具列中的切換按鈕在 Piano Roll 和 Sheet Music 視圖之間切換。在五線譜模式下，音符會透過 VexFlow 排版，並支援基於目前樂器自動選擇譜號（高音或低音）、顯示調號、自動符槓分組、跨小節連音線，以及可設定的音值量化。啟用 **Track Scope** 後，整條音軌上的所有 MIDI 區域會以連續譜面的形式顯示，而不再侷限於單個區域。

- **2026.05.09**: 新增 **音訊錄音**。您現在可以直接從麥克風錄製到音訊軌。錄音時會即時增長顯示波形預覽，停止後該錄音會作為標準音訊區域寫入時間線。另新增 **音訊 I/O 裝置選擇**，您可以在設定中選擇偏好的麥克風輸入裝置和音訊輸出裝置。

- **2026.05.08**: 新增 **MIDI 自動化**。您可以在鋼琴網格下方的可編輯自動化區域中繪製和編輯 pitch bend 與 MIDI CC 曲線（CC1 Modulation、CC2 Breath、CC7 Volume、CC11 Expression、CC64 Sustain）。同時新增 **軌道級自動化**：每條音軌現在都有專用自動化面板，您可以直接在時間線上查看和編輯同樣的曲線。即時 MIDI 控制器輸入（如 pitch wheel、CC 踏板）也支援錄製與按軌回放，並帶有每條自動化軌的插值處理。另新增 **事件列表面板**，這是一個帶分頁的側邊欄（Notes / Pitch Bend / Controller），可用於查看與內聯編輯目前 MIDI 區域中的全部事件。還新增了 **區域多選**（支援套索與批次移動/縮放）以及 **合併 MIDI 區域**。
<div align="center">
  <img src="./public/snapshots/2026-05-08-automations.png" alt="K.G.Studio Logo" width="640" />
</div>

查看完整版本歷史，請參閱 [**發佈說明**](./docs/RELEASE_NOTES.md)。

## 專案狀態

**K.G.Studio 是一個仍處於早期開發階段的實驗性專案。** 我們正在探索如何將 AI agent 與 LLM 融入音樂製作工作流，本質上是在建構一種面向 DAW 的「Cursor 或 Claude Code」體驗。

該專案關注 AI 與人類協作如何增強音樂創作過程，從智慧和聲建議到自動化編輯任務都在探索範圍內。作為實驗平台，專案會頻繁變化，功能將持續演進，並且在我們推進 AI 輔助音樂製作邊界的過程中，偶爾出現不穩定情況也是可以預期的。

## 演示影片

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
        <br><b>短演示（僅 DAW）</b>
      </td>
      <td align="center">
        <a href="https://youtu.be/vKbWAQRt0r0" target="_blank">
          <img src="./public/demo/cover-vKbWAQRt0r0.png" alt="Full Demo" width="400"/>
        </a>
        <br><b>完整演示（僅 DAW）</b>
      </td>
    </tr>
  </table>
</div>

## 快速開始

### 設定 K.G.Studio 音樂創作助手

使用 K.G.Studio 音樂創作助手有兩種方式：一種是 **Local LLM (Browser)**，完全在瀏覽器中執行，無需 API Key、無需費用，且資料不會離開您的裝置；另一種是使用 **外部 LLM 提供方**，以獲得更高品質的回覆。

#### 方案 A：Local LLM (Browser) — 無需 API Key ✦

K.G.Studio 可以藉助 WebGPU 加速，在瀏覽器中直接執行 **Gemma 4 E4B**。不會產生 API 呼叫，不會產生費用，您的資料也不會離開本機。

  - 點擊這裡開始線上使用應用：[K.G.Studio (kgaudiolab.github.io/kgstudio)](https://kgaudiolab.github.io/kgstudio)
  - 在 **設定 ⚙️ → 通用 → LLM 提供方** 中選擇 **本地 LLM（瀏覽器）**（預設選項）。
  - 第一次開啟聊天時，模型（約 2.8 GB）會自動下載，並快取在瀏覽器的 OPFS（Origin Private File System）中，後續啟動幾乎可即時使用。
  - 您也可以選擇設定 **上下文長度**（32k / 64k / 128k tokens）；數值越大，對顯存要求越高。
  - 現在就可以開始聊天。除首次下載模型外，無需 Key、無需帳號，也無需持續連網。

**Local LLM 的要求：** 需要支援 WebGPU 的瀏覽器（Chrome 113+ 或 Edge 113+），並執行在安全上下文中（HTTPS 或 localhost）。推薦硬體為至少 8 GB 顯存的 GPU，或至少 16 GB 統一記憶體的系統。

> **注意：** 本地模型的品質無法與 GPT 或 Claude 系列商業模型相比。對於複雜的音樂編輯任務，外部提供方通常會產生更好的結果。

#### 方案 B：外部 LLM 提供方（更高品質）

  - 點擊這裡開始線上使用應用：[K.G.Studio (kgaudiolab.github.io/kgstudio)](https://kgaudiolab.github.io/kgstudio)
  - [點擊這裡取得免費 OpenRouter API Key](https://openrouter.ai/keys)（您可能需要一個 OpenRouter 帳號）。
  - 在 **設定 ⚙️ → 通用 → LLM 提供方** 中選擇 **OpenAI Compatible**。
  - 在 **OpenAI Compatible Server → 密鑰** 中貼上您的 Key。（注意：在非 localhost 環境中，出於安全原因，您的 Key 預設不會被持久化；您可以在設定中啟用「Persist API Keys on Non-Localhost」以允許持久化，但這可能增加 XSS 風險。）
  - 在 **OpenAI Compatible Server → 模型** 中輸入 `openai/gpt-oss-120b:free`。（注意：這是一個免費模型；非免費模型可能需要付費；免費模型提供方可能會蒐集您的資料，請查看模型頁面中的說明；本專案與 OpenRouter 或任何模型提供方 **沒有關聯關係**。）
  - 在 **OpenAI Compatible Server → 基礎 URL** 中輸入 `https://openrouter.ai/api/v1`。

**提示：**
- 您也可以使用官方 OpenAI API、其他 OpenAI 相容服務，或自行託管的 LLM 伺服器（如 Ollama、vLLM）。請注意，不同模型的品質差異較大，並非所有模型都同樣適合音樂編輯任務。對於自託管/本地部署（需要約 24G 顯存或 24-32GB 統一記憶體），我們推薦：`qwen/qwen3.6-35b-a3b`、`google/gemma-4-26b-a4b-it` 或 `google/gemma-4-31b-it`。
- 如果您已訂閱 OpenAI 或其他 LLM 提供方，可以使用 [CLIProxyAPI](https://github.com/router-for-me/CLIProxyAPI) 執行一個本地代理伺服器，透過現有訂閱轉發請求，而無需另外準備 API Key。

### 基本 DAW 操作
  - 在音軌上雙擊（或按住 Ctrl/Cmd 並點擊）可建立區域。
  - 拖動區域邊緣可調整長度；拖動區域主體可移動。
  - 點擊區域左上角的小鉛筆即可開啟鋼琴卷簾。
  - 在鋼琴卷簾中，雙擊（或 Ctrl/Cmd+點擊）可建立音符。
  - 單擊可選取；Shift+單擊可多選；拖曳可框選。
  - 拖動音符邊緣可調整長度；拖動音符主體可移動已選音符。
  - 使用鋼琴卷簾工具列右上角的 Snapping 功能可將編輯量化到網格。

### 使用 K.G.Studio 音樂創作助手
  - 選取您希望助手處理的音樂區域，在聊天框中輸入提示詞；按 Enter 傳送，按 Shift+Enter 插入換行。
  - agent 會自動處理您的請求，並呼叫工具，在所選區域範圍內執行修改。某些任務可能需要一輪或多輪對話才能完成。
  - 請注意，AI 也可能出錯，因此您應始終檢查結果，並在必要時自行調整。您也可以透過復原/重做回退修改。
  - 點擊「+」按鈕或輸入 `/clear` 指令可清空聊天歷史。

### 更多說明

您可以在[這裡](./docs/USER_GUIDE.md)查看詳細使用者指南。

### 亮點功能
- **K.G.Studio 音樂創作助手**：與由 LLM 驅動的 AI agent 進行對話；它會自動執行工具，對您所選區域內的音樂內容進行編輯。
- **瀏覽器內嵌 LLM，無需 API Key**：透過 WebGPU（LiteRT-LM）在瀏覽器中直接執行 **Gemma 4 E4B**。無 API 呼叫、無費用、資料不離開您的裝置。模型只需下載一次，隨後會快取在本地。
- **瀏覽器內嵌分軌，無需伺服器**：使用 **UVR-MDX-NET-Inst_HQ_3**（2-stem：Vocals / Instrumental）或 **Demucs htdemucs_4s**（4-stem：Vocals / Drums / Bass / Others）將任意音訊區域拆分為 stems。兩者都完全在瀏覽器中透過 ONNX Runtime WebGPU 執行，無需 K.G.One 伺服器。
- **音訊和弦檢測**：為音訊區域開啟 Piano Roll 後執行 **Detect Chords**，即可透過零依賴 FFT 流水線自動分析錄音並填充全域 Chord Track，同時支援靈敏度、穩定性和七和弦檢測等設定。
- **帶自動對齊拍點的速度檢測**：在 Piano Roll 工具列執行 **Detect Tempo**，即可分析音訊區域的 BPM，並可選擇自動重新對齊專案的 Tempo Track。
- **全域軌系統**：四條持久存在的全域軌 **Marker**、**Tempo**、**Key Signature** 和 **Chord** 共同提供專案級結構，所有功能（播放時序、和弦檢測、五線譜顯示）都會參考它們。
- **K.G.One Music Studio 整合**：連接本地 [K.G.One](https://github.com/KGAudioLab/K.G.One) 伺服器後，可解鎖 GPU 加速的 **Full Song Generation**（ACE-Step 1.5）、**Clip & MIDI Loop Generation**（Foundation-1）以及更多 **Stem Separation** 模型。
- **多種 LLM 提供方**：支援 OpenAI、Claude / Gemini（透過 OpenRouter）、OpenAI 相容服務（Ollama、vLLM 等），或內建的本地瀏覽器 LLM，無需 Key。
- **音軌與區域編輯**：支援新增/重排音軌、建立/移動/縮放區域、套索多選、批次移動/縮放、合併與拆分區域，以及完整復原/重做。
- **Piano Roll**：支援音符、pitch bend 和 MIDI CC 自動化軌；支援基於 VexFlow 的五線譜視圖；支援音訊到 MIDI 參考用途的頻譜疊加層。
- **真實樂器**：基於 Tone.js 的 sampler，搭配高品質 FluidR3 soundfonts。您還可以直接從麥克風錄製到音訊軌。
- **智慧和弦助手**：基於功能和聲（T/S/D）提供即時和弦建議，並支援可視預覽與一鍵建立和弦。
- **兼顧持久化與隱私**：專案和設定完全儲存在您的瀏覽器中（OPFS / IndexedDB）。專案本身不依賴第一方伺服器。

如需更深入的技術概覽，請參閱 [overview.md](./docs/technical/overview.md)。

## 開始使用

### 或者在本地複製並執行：
```bash
# 請確認已安裝 Node.js >= 20.19.3
# 複製倉庫
git clone https://github.com/KGAudioLab/KGStudio {your-local-path}
cd {your-local-path}

# 安裝依賴
npm install

# 啟動開發伺服器
npm run dev
```

## 設定

K.G.Studio 會從 `./public/config.json` 載入預設設定（內部也提供回退預設值），並透過 `ConfigManager` + IndexedDB 將使用者修改持久化到瀏覽器中。IndexedDB 是瀏覽器在您裝置上的本地資料庫；資料不會離開您的機器，如果您清除此站點的資料，它也會被清除。請透過應用程式內的設定面板修改設定。

- **通用**
  - LLM 提供方：OpenAI，或 OpenAI 相容服務
  - 目前所選提供方對應的 API Key 與模型
  - 在非 localhost 環境持久化 API Key：啟用後，可在非 localhost 環境中持久化 API Key（屬於安全風險自擔選項，不建議在共享或生產環境中開啟）
  - OpenAI 相容服務的基礎 URL（適用於自託管閘道）
  - Soundfont 基礎 URL（樂器採樣 CDN）
- **行為**
  - 啟動時預設開啟聊天框
- **模板**
  - AI 助手使用的自訂指令

### 連線性與隱私

- K.G.Studio 完全在客戶端執行。執行應用不需要任何第一方伺服器。
- 專案和音訊檔案儲存在瀏覽器的 OPFS（Origin Private File System）中；設定儲存在 IndexedDB 中。所有資料都留在您的裝置上。
- 網路存取僅用於：
  - 從設定的 soundfont CDN 下載樂器採樣
  - 與您選擇的 LLM 提供方通訊（例如 OpenAI 或 OpenAI 相容服務）
- 除上述兩種情況外，應用均可在本地工作。即使您阻止這些端點，應用仍可載入；但在網路恢復之前，樂器回放和 AI 功能將無法使用。
- 出於安全考量，當應用執行在非本地主機環境中時，我們預設不會將您的 API Key 持久化到 IndexedDB（以降低 XSS 風險）。這表示您每次啟動 K.G.Studio 時都需要重新輸入。如需在非本地主機環境中啟用持久化，請在設定中開啟「Persist API Keys on Non-Localhost」（不建議在共享或生產環境中啟用）。

## 使用應用

您可以在[這裡](./docs/USER_GUIDE.md)查看詳細使用者指南。

- 音軌
  - 在軌道資訊面板中新增、重新命名和重排音軌。
  - 透過樂器按鈕（鋼琴圖示）切換樂器；可調整 Solo（S）、Mute（M）和 Volume。
  - 透過音軌設定選單刪除音軌（位於樂器按鈕右側）。

- 區域
  - 建立區域：使用 Pointer 工具時可雙擊，或按住 Ctrl/Cmd 再點擊；使用 Pencil 工具時單擊即可。
  - 移動/縮放：拖動區域主體可移動，拖動邊緣可調整長度。
  - 透過區域左上角的小鉛筆開啟 Piano Roll。

- 鋼琴卷簾（MIDI 音符）
  - 工具：Select 與 Pencil。
  - 建立音符：在 Select 模式下雙擊或 Ctrl/Cmd+點擊；在 Pencil 模式下單擊。
  - 選取音符：單擊；Shift+單擊多選；拖曳框選。
  - 移動/縮放：拖動音符主體可移動已選音符；拖動邊緣可調整長度。
  - **五線譜視圖**：可在鋼琴卷簾工具列中切換 Piano Roll 與 Staff Notation 視圖。支援自動譜號選擇、調號顯示、符槓分組、連音線和可設定量化。啟用 **Track Scope** 後會將整條音軌上的所有區域連續渲染為譜面。
  - **自動化軌道**：可在鋼琴網格下方的可編輯區域中繪製和編輯 pitch bend 與 MIDI CC 曲線（Modulation、Breath、Volume、Expression、Sustain）。
  - **頻譜模式**：可在鋼琴卷簾中查看音訊區域的頻譜，並將其作為編輯 MIDI 音符時的參考層。
  - 可透過 X 或 ESC 關閉鋼琴卷簾視窗。

- 智慧和弦助手（新增於 2025-12-15）
  - 在鋼琴卷簾工具列中啟用和弦指導：選擇 T（Tonic）、S（Subdominant）或 D（Dominant）功能。
  - 將滑鼠懸停在任意琴鍵上時，會以紅色高亮顯示與上下文相關的和弦建議，並匹配您目前選擇的調號與調式。
  - 按 Tab 可在同一和聲功能下循環切換不同和弦轉位。
  - 雙擊（或 Ctrl/Cmd+點擊）高亮和弦可一次性建立整組音符。
  - 和弦長度會自動匹配您最近編輯的音符長度，以保持節奏一致。

- 吸附與量化
  - 在右上角的 NO SNAP 選單中設定吸附。
  - 使用 Qua. Pos.（起始）和 Qua. Len.（長度）進行量化。

- 播放與播放頭
  - 可透過工具列回到開頭，並執行 Play/Pause。
  - 在主時間網格點擊小節編號可設定播放頭；在鋼琴卷簾中點擊頂部時間軸也可設定，並遵守目前吸附設定。
  - BPM、拍號和調號都可以透過工具列中的數值進行修改。

## 鍵盤快捷鍵

- 主介面
  - 播放/暫停：Space
  - 復原 / 重做：Ctrl/Cmd+Z / Ctrl/Cmd+Shift+Z
  - 複製 / 剪下 / 貼上：Ctrl/Cmd+C / Ctrl/Cmd+X / Ctrl/Cmd+V
  - 儲存：Ctrl/Cmd+S
  - 按住以建立區域：Ctrl/Cmd
- 鋼琴卷簾
  - 工具：Select（Q）、Pencil（W）
  - 按住以建立音符：Ctrl/Cmd
  - 吸附：1(None), 2(1/4), 3(1/8), 4(1/16)
  - 位置量化：5(1/4), 6(1/8), 7(1/16)
  - 長度量化：8(1/4), 9(1/8), 0(1/16)

## AI 助手

### 使用 K.G.Studio 音樂創作助手

- 請先按照前文說明完成 LLM 提供方設定。
- 您可以在右側找到 K.G.Studio 音樂創作助手聊天框。如果目前未顯示，可點擊工具列中的 Chat 🗨️ 按鈕開啟。
- 選取您希望助手處理的區域，在聊天框中輸入提示詞；按 Enter 傳送，按 Shift+Enter 插入換行。
- agent 會自動處理您的請求，並呼叫工具，在所選區域範圍內執行修改。某些任務可能需要一輪或多輪對話才能完成。
- 請注意，AI 也可能出錯，因此您應始終檢查結果，並在必要時自行調整。您也可以透過復原/重做回退修改。
- 點擊「+」按鈕或輸入 `/clear` 指令可清空聊天歷史。

### 設定您的 LLM 提供方

進入 **設定 ⚙️ → 通用 → LLM 提供方**。根據您選擇的提供方，您需要填寫對應的 API Key，並在需要時填寫自訂基礎 URL（適用於 Ollama、OpenRouter 等非官方 OpenAI 相容服務）。

注意：由於部分提供方存在 CORS 限制，Google Gemini 和 Anthropic Claude 目前僅支援透過 OpenRouter 使用。

### 使用 OpenAI 模型

1. 在 [**OpenAI**](https://platform.openai.com/account/api-keys) 取得 OpenAI API Key。您可能需要先註冊帳號並新增付款方式，才能生成 API Key。
2. 在 **設定 ⚙️ → 通用 → LLM 提供方** 中選擇 **OpenAI** 作為提供方。
3. 在 **OpenAI → 密鑰** 中輸入您的 API Key。
4. 在 **OpenAI → 模型** 下拉中選擇您偏好的模型。若希望在效能與成本之間取得較好平衡，我們推薦 `gpt-5.4`。
5. 您也可以選擇是否在 **OpenAI → Flex 模式** 中啟用 Flex Mode。Flex Mode 可以降低價格，但也可能帶來更慢的回應時間或更多伺服器端錯誤。

### 使用 OpenRouter

OpenRouter 是一個統一接入平台，可讓您存取來自多個提供方的大量語言模型，其中也包含免費選項，便於比較並找到最適合您需求的模型。

1. 在 [**OpenRouter**](https://openrouter.ai/keys) 取得 API Key。需要註冊；若使用付費模型，可能還需要綁定付款方式。
2. 在 **設定 ⚙️ → 通用 → LLM 提供方** 中選擇 **OpenAI Compatible** 作為提供方。
3. 在 **OpenAI Compatible Server → 密鑰** 中輸入您的 API Key。
4. 在 [**OpenRouter Models Page**](https://openrouter.ai/models) 瀏覽可用模型。您可以使用「Prompt Pricing」篩選免費模型。  
   **注意：** 不同模型提供方的資料保留與隱私政策可能不同，請在使用前自行查看。
5. 在 **OpenAI Compatible Server → 模型** 中輸入您所選的模型名。推薦系列包括：
    - `Anthropic: Claude Sonnet 4.6` (`anthropic/claude-sonnet-4.6`: [Link](https://openrouter.ai/anthropic/claude-sonnet-4.6)) — Claude 系列中品質與成本平衡較好的選擇
    - 免費模型：
        - `OpenAI: GPT-OSS 120B`（免費模型：`openai/gpt-oss-120b:free`: [Link](https://openrouter.ai/openai/gpt-oss-120b:free)）
        - `Google: Gemma 4 26B A4B IT`（免費模型：`google/gemma-4-26b-a4b-it:free`: [Link](https://openrouter.ai/google/gemma-4-26b-a4b-it:free)）
        - `Google: Gemma 4 31B IT`（免費模型：`google/gemma-4-31b-it:free`: [Link](https://openrouter.ai/google/gemma-4-31b-it:free)）
    - 對於自託管/本地部署（需要約 24G 顯存或 24-32GB 統一記憶體），我們推薦：
        - `Qwen: Qwen3.6 35B A3B` (`qwen/qwen3.6-35b-a3b`: [Link](https://openrouter.ai/qwen/qwen3.6-35b-a3b))
        - `Google: Gemma 4 26B A4B IT` (`google/gemma-4-26b-a4b-it`: [Link](https://openrouter.ai/google/gemma-4-26b-a4b-it))
        - `Google: Gemma 4 31B IT` (`google/gemma-4-31b-it`: [Link](https://openrouter.ai/google/gemma-4-31b-it))
    - 注意：免費模型提供方可能會蒐集您的資料，使用前請先查看模型頁面說明
    - 注意：免費模型的可用性變化頻繁。如需查看最新免費選項，請造訪 [OpenRouter Models Page](https://openrouter.ai/models)，並使用 **Prompt Pricing** 過濾目前免費模型
6. 在 **OpenAI Compatible Server → 基礎 URL** 中填入 `https://openrouter.ai/api/v1`。

### 關於 agent 與 LLM 提供方

出於安全考量，當您從非本地主機環境使用 K.G.Studio 時，API Key 預設不會持久化到 IndexedDB 中；這表示您每次啟動 K.G.Studio 時都需要重新輸入。如需在非本地主機環境中啟用持久化，請在設定中開啟「Persist API Keys on Non-Localhost」（不建議在共享或生產環境中啟用）。

K.G.Studio 不提供也不託管上述任何模型，也不隸屬於任何模型提供方。所有資料都儲存在您的本地裝置中；K.G.Studio 不會蒐集或傳輸您的資料。若您向第三方模型提供方傳送任何資料，相關責任由您自行承擔。

## K.G.One Music Generator

> **需要 [K.G.One Music Studio](https://github.com/KGAudioLab/K.G.One) 整合。** 只有當 K.G.Studio 連線到正在執行的 K.G.One 伺服器時，K.G.One Music Generator 面板才會可用。設定說明請參閱 [K.G.One 儲存庫](https://github.com/KGAudioLab/K.G.One)。

**K.G.One Music Generator** 面板提供三項經 GPU 加速的 AI 工具，用於音樂生成與音訊處理。點擊工具列中的 **✦（魔杖）** 按鈕即可開啟。該面板與 AI Assistant 聊天框互斥，開啟其中一個時，另一個會自動關閉。

> **注意：** 您首次使用每個工具時，伺服器都需要載入對應 AI 模型，這可能需要 60 秒甚至更久，具體取決於您的硬體。切換分頁時，也可能觸發模型重新載入。

### Full Song Generation

根據文字描述和可選歌詞生成一首完整歌曲。由 [ACE-Step 1.5](https://github.com/ace-step/ACE-Step-1.5) 驅動。

- 在 **Full Song** 分頁中，於 **Caption** 中輸入自然語言描述，說明所需風格、情緒、速度、配器和結構。例如：`Genre: Eurodance, 90s dance-pop, upbeat electronic. Tempo: ~130 BPM. Instrumentation: driving kick drum, eurodance bassline...`
- 您也可以填寫 **Lyrics**。可使用 `[Intro]`、`[Verse]`、`[Chorus]`、`[Bridge]` 等標籤標記段落。若勾選 **Instrumental**，則會完全跳過人聲。
- 點擊 **Generate Song**。介面會即時顯示生成階段與百分比進度。
- 生成完成後，會顯示預覽播放器。您可以將其拖曳到 **audio track**，作為區域匯入。
- 目前不支援將整曲生成結果拖放到 MIDI track。
- **Advanced Settings**（可展開）：Inference Steps、Guidance Scale、Seed，以及 Thinking（CoT metadata generation）。

### Clip Generation

根據文字描述生成短樂器片段和 MIDI loops。由 [Foundation-1](https://huggingface.co/RoyalCities/Foundation-1) 驅動。

- 在 **Clip** 分頁中，於 **Prompt** 中輸入逗號分隔的標籤，描述樂器類別、子類型、音色、效果、長度、BPM 和調性。例如：`Gritty, Acid, Bassline, 303, Synth Lead, FM, Sub, High Reverb, 8 Bars, 140 BPM, E minor`
- 您也可以填寫 **Negative Prompt**，以避免生成某些不希望出現的特徵（例如 `distortion, noise`）。
- 選擇 **Bars**：4 或 8。BPM 與調號會根據專案設定預填，您也可以在 **Advanced Settings** 中調整。
- 點擊 **Generate Clip**。生成完成後，會出現一個預覽播放器，左側帶拖曳手把，右側帶下載按鈕。
- **匯入方式**：將播放器拖曳到時間線中的音軌上。
  - 拖放到 **audio track** 時，會作為 WAV 音訊區域匯入（推薦）。
  - 拖放到 **MIDI track** 時，會作為 MIDI 區域匯入。請注意，此 MIDI 是從音訊轉錄而來，可能並非完全準確。
- **Advanced Settings**（可展開）：Note、Scale、BPM、Steps、CFG Scale、Seed（`-1` 表示隨機）、Sampler Type、Sigma Min/Max，以及 CFG Rescale。

### Stem Separation

將現有音訊區域拆分為獨立 stems（例如人聲、伴奏、鼓組等）。

K.G.Studio 支援 **兩種模式** 的分軌：

#### 本地瀏覽器模式 — 無需伺服器 ✦

兩個 ONNX 模型可完全在瀏覽器中執行，無 API 呼叫、無費用，資料也不會離開您的裝置。模型只需下載一次，隨後會快取在本地。

- **Vocal and Instrument (Medium Accuracy)**（`UVR-MDX-NET-Inst_HQ_3`，約 64 MB）— 雙 stem 分離（Vocals / Instrumental）。由 [UVR-MDX-NET](https://github.com/nomadkaraoke/python-audio-separator) 驅動。
- **Vocal, Drums, Bass, and Others**（`htdemucs_4s`，約 172 MB）— 四 stem 分離（Vocals / Drums / Bass / Others）。由 [Demucs](https://github.com/facebookresearch/demucs) 驅動。

開啟 **Music Generator** 面板（工具列中的 ✦ 按鈕），選擇模型，先點擊一次 **Download Selected Model**，然後點擊 **Separate Stems**，所有處理都會在您的瀏覽器中本機完成。

**要求：** 需要支援 WebGPU 的瀏覽器（Chrome 113+ 或 Edge 113+），並執行在安全上下文中（HTTPS 或 localhost）。若可用，會優先使用 WebGPU 加速；否則會回退到 CPU（處理期間可能降低頁面回應性）。推薦硬體為至少 8 GB 顯存的 GPU，或至少 16 GB 統一記憶體的系統。

#### K.G.One 伺服器模式

當連線到 [K.G.One Music Studio](https://github.com/KGAudioLab/K.G.One) 伺服器後，可使用另外三種 GPU 加速模型。由 [python-audio-separator (UVR5)](https://github.com/nomadkaraoke/python-audio-separator) 驅動。

- **Vocal and Instrument (Medium Accuracy)**（`UVR-MDX-NET-Inst_HQ_3`）— 快速雙 stem 分離（vocal / instrumental）。
- **Vocal and Instrument (High Accuracy)**（`MDX23C-8KFFT-InstVoc_HQ`）— 更高品質的雙 stem 分離，但更慢。
- **Vocal, Drums, Bass, Guitar, Piano, and Others**（`htdemucs_6s`）— 完整六 stem 分離。

#### 使用方式（兩種模式通用）

- 在開啟此分頁之前，請先在時間線上**選取一個音訊區域**。**Separator** 分頁頂部會顯示目前所選區域及其音軌名稱。僅支援音訊區域，不支援分離 MIDI 區域。
- 點擊 **Separate Stems**。如果目前所選區域帶有 clip start offset 或已被裁剪，系統會先自動按該區域範圍切出對應音訊，再進行處理。
- 處理完成後，每個 stem 都會以帶標籤的預覽播放器顯示，並附帶拖曳手把。您可以在匯入前分別試聽每個 stem。
- **匯入 stems：**
  - 可將每個 stem 播放器分別拖曳到 **audio track** 上，放到您希望的位置。
  - 或點擊 **Import All Stems to Timeline**，系統會自動為每個 stem 新建一條音訊軌，並將其放置在源音軌下方，與原始區域的起始拍點對齊。該操作可透過一次復原完整回退。

## 即將推出的功能

功能優先級可能會變化。

### 1.0

- [X] 更多樂器
- [X] 自動化測試（單元測試、整合測試等）
- [X] 帶功能和聲指導（T/S/D）的智慧和弦助手
- [X] 支援軌道控制自動化（例如 sustain、volume、pan 等）
- [X] 支援 MIDI 控制事件（例如 CC、pitch bend 等）
- [X] 支援 WAV 音訊軌
- [X] 錄音
- [X] 事件列表
- [X] 支援 OpenAI 的開源模型（`gpt-oss-20b` 和 `gpt-oss-120b`）
- [X] 五線譜
- [X] K.G.One Music Studio 整合
- [X] 瀏覽器內嵌 AI 模型（基於 Gemma 4 E4B 的本機 LLM；基於 UVR-MDX-NET-Inst_HQ_3 與 htdemucs_4s 的本機分軌）
- [X] 全域軌系統（Marker、Tempo、Key Signature、Chord）
- [X] 音訊和弦檢測（零依賴 FFT，並將結果寫入 Chord Track）
- [X] 帶自動對齊拍點的速度檢測
- [X] 頻譜可視化與 Piano Roll hybrid mode

### 1.0 之後

- [X] 擴展 AI agent 工具，直接透過聊天操作區域、音軌與全域軌（和弦進行、速度、調性）
- [ ] Mixer 視圖，提供專用面板顯示每軌推桿、send、return bus 與 master channel
- [ ] EQ 與通道條，為每條音軌提供參數均衡器與壓縮器
- [ ] 濾波器與效果器，如混響、延遲及其他基於 WebAudio 的原生插入效果
- [ ] 音訊 time-stretch / warp，使音訊區域自動匹配專案速度
- [ ] MIDI 效果器，如琶音器、音階量化器、和弦記憶
- [ ] 虛擬 MIDI 裝置輸出

## 需要幫助

我們正在尋找貢獻者，一起讓 K.G.Studio 變得更好。無論您是開發者、音樂人還是設計師，您的專長都能帶來實際價值。

### 您可以如何參與

**🎵 音樂人 / 音樂製作人**
- 使用真實音樂製作流程測試這款 DAW
- 回饋樂器音色品質與真實感
- 提出音樂創作中不可或缺但目前缺失的功能
- 幫助提升 AI 助手的音樂理解能力

**💻 開發者**
- 根據路線圖實作新功能
- 修復 bug 並最佳化效能
- 增強 Web Audio 整合
- 改進 AI 助手能力

**🎨 UI/UX 設計師**
- 最佳化介面和工作流
- 設計更適合音樂編輯的視覺回饋
- 打造更直觀的互動方式

### 參與方式

如果您有興趣貢獻，我們很願意聽到您的想法。

- **給我們發郵件**：[kgstudio@duck.com](mailto:kgstudio@duck.com)
- **查看 Issues**：瀏覽帶有 `help wanted` 或 `good first issue` 標籤的公開問題
- **參與討論**：在 GitHub Discussions 中分享想法與回饋

每一份貢獻都很重要。無論是回報 bug，還是提出新功能建議，都會推動專案繼續前進。

### 免責聲明

K.G.Studio 是一個處於早期開發階段的實驗性專案。我們正在探索如何將 AI agent 與 LLM 融入音樂製作工作流，本質上是在建構一種面向 DAW 的「Cursor 或 Claude Code」體驗。

該專案關注 AI 與人類協作如何增強音樂創作過程，從智慧和聲建議到自動化編輯任務都在探索範圍內。作為實驗平台，專案會頻繁變化，功能將持續演進，並且在我們推進 AI 輔助音樂製作邊界的過程中，偶爾出現不穩定情況也是可以預期的。

K.G.Studio 不提供也不託管任何 LLM 模型，也不隸屬於任何模型提供方。所有資料都儲存在您的本地裝置中；K.G.Studio 不會蒐集或傳輸您的資料。若您向第三方模型提供方傳送任何資料，相關責任由您自行承擔。

## 授權條款

本專案基於 Apache License, Version 2.0 授權，並附帶額外條款（參見 `LICENSE`）：
- 不得使用本軟體或相關素材申請專利
- 當用於公開或商業產品時需要署名（「Powered by K.G.Studio」）

第三方聲明（FluidR3_GM SoundFont、midi-js-soundfonts、VexFlow、prompt structure notes、Gemma 4 E4B、UVR-MDX-NET-Inst_HQ_3、MediaPipe、Meyda、web-audio-beat-detector、tonal、htdemucs_4s、onnxruntime-web 和 demucs-web）已包含在 `LICENSE` 中。
