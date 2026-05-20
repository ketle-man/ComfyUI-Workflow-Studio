# ComfyUI-Workflow-Studio

A comprehensive workflow management and generation UI plugin for [ComfyUI](https://github.com/comfyanonymous/ComfyUI).

Browse, organize, and execute workflows directly from a dedicated studio interface — without switching between windows or manually editing JSON.

![Workflow Studio](https://img.shields.io/badge/ComfyUI-Custom_Node-blue)
![Version](https://img.shields.io/badge/version-0.3.16-green)

## Screenshots

| Workflow Tab | Models Tab |
|:---:|:---:|
| ![Workflow Tab](docs/1_workflowtab.png) | ![Models Tab](docs/2_modelstab.png) |

| Prompt Input Assistance | Gen UI Feeder |
|:---:|:---:|
| ![Prompt Input Assistance](docs/3_PromptInputAssistance.png) | ![Gen UI Feeder](docs/4_GenUI_feeder.png) |

| Top Bar | WS Library |
|:---:|:---:|
| ![Top Bar](docs/5_topbar.png) | ![WS Library](docs/6_ws_library.png) |

| Library Information | Customize |
|:---:|:---:|
| ![Library Information](docs/7_library_Infomation.png) | ![Customize](docs/8_Customize.png) |

---

## Features

### Workflow Tab
- **Thumbnail / Card / Table views** — switch between view modes to browse your workflow library
- **Thumbnail side panel** — preview workflow canvas snapshots in the side panel
- **Badge filtering** — filter by user-defined badges (free labels you assign to each workflow)
- **Search** — full-text search across workflow names and metadata
- **Side panel tabs** — Thumbnail preview, JSON viewer with syntax highlighting, and Group management
- **Badge management** — add, rename, delete badges with custom colors shared with the Models tab (⚙ Badge button)
- **AI summary** — generate workflow descriptions using Ollama
- **Import / Export** — import workflows from files or clipboard, open in ComfyUI directly
- **Default view setting** — persist your preferred view mode (Thumbnail / Card / Table)

### Canvas Snapshot (v0.1.2)
- **One-click capture** — click the camera button in ComfyUI's top bar to snapshot the current workflow canvas
- **Auto-save as thumbnail** — the snapshot is saved directly to the workflow data folder as a PNG thumbnail
- **Embedded workflow metadata** — workflow JSON is embedded in the PNG (tEXt chunk), compatible with ComfyUI's drag-and-drop import
- **Auto-import** — the captured workflow is automatically imported and appears in the Workflow tab

### GenerateUI Tab (v0.3.5)
- **4-tab layout** — Input / Model / Settings / Feeder tabs; Input, Model, and Settings each include a Raw JSON column on the right for instant preview and direct editing
- **Input tab** — Prompt (top) and Image drag-and-drop (bottom) in the left column; Raw JSON (540px) in the right column
- **Model tab** — Checkpoint, VAE, LoRA, ControlNet, UNET, TextEncoder selectors with filter; Raw JSON on the right
- **Settings tab** — KSampler and Latent Image side by side at 50% width each; Raw JSON on the right
- **Always-visible Raw JSON** — edit the API-format JSON directly from any tab with syntax highlighting; Apply button reloads the workflow; built-in **search bar** (always shown) finds all matches as you type with count display (`3/12`); navigate with ↑/↓ buttons or Enter / Shift+Enter; Escape or ✕ clears; current match highlighted in orange, other matches in yellow
- **One-click generation** — queue prompts to ComfyUI without leaving the studio
- **Seed control** — randomize, lock, or manually set seeds; seed input and mode selector stacked vertically for readability
- **Checkpoint Batch** — enable via checkbox in the right panel to sequentially generate with every checkpoint model; select checkpoints by folder from the dropdown (check a folder to select all its files, expand with ▶ for individual file selection, supports any subfolder depth); Filter input to search; All / None buttons for quick selection; **Pause/Resume** suspends processing between models; Stop aborts after the current generation; amber progress bar tracks per-model progress
- **UI-to-API conversion** — automatic conversion supporting subgraphs (nested workflows), COMBO types, and display-only node exclusion; improved analysis covers SDXL multi-hop CONDITIONING chains, CLIPTextEncodeSDXL, SDXLPromptStyler, KSamplerAdvanced, and more
- **Eagle integration** — auto-save generated images to [Eagle](https://eagle.cool/) with metadata

### Feeder subtab (v0.3.5)
Requires the **[comfyui-image-feeder](https://github.com/ketle-man/comfyui-image-feeder)** custom node.
- **ImageFeeder node control** — select the target node from a dropdown auto-populated from the loaded workflow; edit all node parameters (Directory, Sort Mode, Index, Start/End Index, Batch Size, Seed, Use Selection) and Apply to the workflow
- **Image library** — 3-pane layout: folder tree (left) browsing `user/default/image-loop-data/`, image grid with checkbox selection (center), preview panel with resolution and file size (right)
- **Selection management** — check individual images; All / None buttons for the current folder; selected files are reflected in `selected_files` on Apply
- **Presets** — save the current directory + selection as a named preset; load or delete presets (server-side persistence via `image-feeder-presets.json`)
- **Continuous Run loop** — Run / Stop buttons below the presets; **After gen** mode controls index behavior after each generation:
  - **Loop** — advance index and wrap back to 0 when all images are exhausted (runs indefinitely)
  - **Increment** — advance index and auto-stop when all images are consumed
  - **Fixed** — always use the same index
- **Index sync** — after each generation the node returns `next_index` via WebSocket (`image_loop_node_sync`); the Index field updates automatically
- **Seed** — Run loop uses the right-pane seed setting (Random / Fixed / Increment / Decrement); the node's own Seed field only affects random sort order

### Prompt Tab
- **3-column layout** — AI Assistant (left), Presets/Preset Manager tab-panel (center), Wildcard support (right)
- **AI chat assistant** — powered by [Ollama](https://ollama.com/), generate and refine prompts interactively
- **Image attachment** — attach reference images for vision-capable models
- **Translation** — JA/EN/ZH translation buttons for multilingual prompt creation
- **Prompt presets** — save/load reusable prompt templates (positive & negative) with category support
- **Preset Manager** — browse all presets, favorites, and group-based filtering with search
- **Group management** — create groups, assign/remove presets, delete groups from the Presets panel
- **Clipboard copy** — copy positive/negative prompts individually (PP Copy / NP Copy)
- **GenUI Set** — apply preset prompts directly to the GenerateUI interface
- **Wildcard input toolbar** — one-click buttons to insert `{|}`, `{n$|}`, `__|__`, `<lora::1:LBW=;>` and other wildcard syntax; wraps selected text when applicable
- **Wildcard file manager** — create, view, and edit `.txt` / `.yaml` wildcard files stored in `user/default/Workflow-Studio/wildcard/`; click a filename in the file picker to insert `__filename__` at cursor

### Metadata Tab (v0.3.8)
- **3-column layout** — Drop zone (left) | Model info (center) | LoRA + Prompt (right)
- **File drop** — drop a ComfyUI-generated PNG / WebP or workflow JSON onto the drop zone (or click to open a file picker); PNG/WebP images are shown as a preview
- **Model extraction** — automatically extracts Checkpoint, VAE, Diffusion Model, and Text Encoder names from the workflow; supports both standard and subgraph-based workflows (Flux.2 Dev/Klein, Qwen-Image-Edit/2511/Layered, Z-Image Base/Turbo, Ernie Image, WAN2.2); node types covered: UNETLoader, UnetLoaderGGUF, UNETLoaderGGUF (e.g. HiDream GGUF), CLIPLoader, DualCLIPLoader, TripleCLIPLoader, QuadrupleCLIPLoader (e.g. HiDream 4-CLIP)
- **LoRA extraction** — lists all LoRA models with `strength_model / strength_clip` values
- **Prompt extraction** — lists prompts with POS / NEG badges when positive/negative can be determined; when distinction is not possible (e.g. `SamplerCustomAdvanced`, intermediate nodes, cross-level connections), prompts are shown without a badge as plain **Text**; click any entry to view the full text below
- **Prompt actions** — Copy to clipboard, **GenUI:P/N** (set GenerateUI positive/negative prompt), **Prompt:P/N** (set Prompt tab preset positive/negative)
- **Format support** — ComfyUI PNG/WebP/JSON (standard + Flux.2 / Qwen-Image / Z-Image / Ernie Image / WAN2.2 subgraph workflows), SD WebUI, SD Forge, Fooocus
- **Format note** — supported formats and covered model types are always shown in the left column

### Settings Tab
- **2-column layout** — left column for all settings; right column shows the Theme panel fixed in place (sticky)
- **Collapsible sections** — all settings organized in accordion panels for a clean layout
- **Theme selection** — 13 built-in themes with visual swatch preview (Dark, Pop, Minimalist, Cyberpunk, Glassmorphism, Neumorphism, Retro Pixel, Pastel, Brutalism, Earthy, Material, Monotone, Corporate)
- **Theme customization** — override colors (background, surface, text, primary, accent), add background patterns (horizontal/vertical/diagonal stripes, polka dot, checkerboard, custom SVG tiling with color/opacity/scale/gap controls), and select from 16 fonts including Japanese display fonts (Google Fonts)
- **Workflows directory** — configure which folder to scan for workflows
- **Gallery output directory** — configure which output folder the Gallery tab scans for images
- **Eagle connection** — set Eagle API endpoint for auto-save
- **Ollama connection** — configure Ollama server URL
- **Default workflow** — set a workflow to auto-load on startup
- **Data Management** — export all plugin data (settings, metadata, prompts, etc.) to a single JSON file; import to restore data (useful when migrating or reinstalling)
- **Text Size** — one slider (10–28 px) adjusts font size for all prompt and chat textareas at once: Generate UI positive/negative prompts, AI Assistant chat input, Preset prompts, Wildcard prompt and file editor, and Metadata prompt full preview; takes effect immediately and saved with Save Settings
- **RAW JSON Colors** — customize the 6 syntax highlight colors for the Raw JSON editor in Generate UI: Default Text (base), Name/Scheduler (yellow), Title (pink), Width/Height (green), Prompt/Text (cyan), Image/File (red); changes apply immediately on color pick; Reset Defaults restores the original scheme; saved to `localStorage` under `wfm_settings.jsonColors` and applied on startup
- **Wildcard Integration** — link the WFS wildcard directory to ComfyUI-Impact-Pack's `wildcards/` directory (directory junction on Windows, symlink on other OS); existing WFS wildcard files are automatically migrated; requires [ComfyUI-Impact-Pack](https://github.com/ltdrdata/ComfyUI-Impact-Pack)
- **Language** — English / Japanese / Chinese

### Gallery Tab (v0.3.1)
- **Image browser** — browse ComfyUI output images (Thumbnail / Table views) with server-side scanning optimized for 6,000+ image libraries
- **Thumbnail / Table views** — switch view modes; Favorites column shown leftmost in Table view
- **Folder management** — create subfolders ("+ New") or delete the selected folder with all contents ("Del") from the folder tree header
- **File operations** — move or delete individual images from the detail panel's Info tab; bulk Move To... and Delete from the multi-select bar
- **Multi-select** — Ctrl+click to select multiple images; Bulk Bar appears for batch operations (group, favorite, move, delete)
- **Server-side filtering** — filter by group, favorites, or tags with fast server-side set lookup (no full rescan)
- **Group management** — create, rename, delete groups and assign/remove images using the same 4-section panel as Models tab
- **Favorites** — star images inline without reopening the detail panel
- **Detail panel** — view filename, path, tags, groups, and metadata in a slide-out panel
- **Workflow viewer** — Metadata tab displays workflow JSON from PNG embedded data (`prompt` / `workflow` keys) or from workflow saved by the Generate UI tab
- **Workflow auto-save** — images generated from the Generate UI tab have their workflow automatically saved to gallery metadata
- **Output folder configurable** — set the scanned output folder from Settings tab
- **Performance** — folder-level mtime cache (30s TTL) for fast incremental refresh; tree expansion state preserved across folder operations

### Nodes Tab (v0.1.7)
- **Node Browser** — browse all installed ComfyUI nodes from `/object_info` API with Card/Table views
- **Search & Filter** — full-text search, filter by category, package, tags, groups, and favorites
- **Package badges** — color-coded badges generated from package names
- **Node detail panel** — view I/O specifications, edit tags, manage groups
- **Node Sets** — save multiple nodes + connections as reusable sets from the ComfyUI canvas
- **Right-click context menu** — "Save as Node Set" option on any node in ComfyUI

### Models Tab (v0.2.3)
- **Model Browser** — browse all installed ComfyUI models (Checkpoint, LoRA, VAE, ControlNet, UNET, TextEncoder, Hypernetwork, Embedding) with sub-tab switching
- **Thumbnail / Card / Table views** — switch between view modes with pagination (24 items per page)
- **Search & Filter** — full-text search, filter by tags, groups, and favorites
- **User-defined badges** — assign free-label badges to models; badge colors shared with the Workflow tab palette
- **Side panel tabs** — Info (file path display with click-to-copy, tags, memo), Groups management, CivitAI integration
- **CivitAI integration** — fetch model metadata by SHA256 hash, view base model, trained words, tags, and model page link; preview image is automatically downloaded and saved if none exists
- **Batch CivitAI fetch** — one-click batch fetch for all models of a type with SSE progress streaming; previews are auto-saved for models without one
- **Detail modal** — preview image, CivitAI info, thumbnail change via file upload
- **GenUI Model button** — apply the selected model directly to the corresponding node in GenerateUI's current workflow (Checkpoint, LoRA, VAE, ControlNet, UNET, TextEncoder)
- **Group management** — create, rename, delete groups and assign/remove models; groups are scoped per model type (checkpoint groups only appear in the Checkpoint tab)
- **Table view memo** — memo column displayed in table view for quick reference
- **Preview images** — auto-detect `{model_stem}.preview.png` next to model files
- **Enable / Disable models** — hide models from ComfyUI by renaming the file extension (`.disabled` suffix); toggle per card (⏸ button), per group (Enable All / Disable All), or filter by status (All / Enabled / Disabled)
- **Multi-select & bulk operations** — enter selection mode to check multiple models; bulk action bar supports add/remove from groups and permanent file deletion (model file + preview images + sidecar files such as `.json` / `.info`)

### AI TOOL Tab (v0.3.14)
- **3-pane layout** — Translation (40%) | TOOLS (40%) | Settings (20%); all panes always visible simultaneously; no sub-tab switching required
- **Translation pane** — translate text between Japanese, English, Chinese, or a custom Free language using Ollama or LM Studio; language selectors with ⇄ swap button (swaps both language selectors and text content); selections saved automatically
- **TOOLS pane (VLM)** — drop an image into the 110px drop zone, select a task (Describe Image / Create Prompt / Create Tags), and click Run to analyze with a vision model; result shown in the output area with a Copy button
- **Settings pane** — choose backend (Ollama / LM Studio), set the API URL, test connection, select a model (with refresh button), and configure Free language names for translation source and destination
- **Settings shared** — settings saved to `localStorage` under `wfm_ai_settings`; shared with the Library panel's AI TOOL tab so configuration is consistent across both interfaces
- **Backend support** — Ollama (`/api/generate` for text, `/api/tags` for model list); LM Studio OpenAI-compatible API (`/v1/chat/completions`, `/v1/models`); VLM images sent as base64 (`images:[]` for Ollama, `image_url` content block for LM Studio)
- **URL security** — backend URL validated via `new URL()` to enforce `http://` or `https://` scheme

### Workflow Studio Library (ComfyUI Side Panel) (v0.3.9)
- **Tab layout (W / N / P / M / I / A)** — compact single-letter tabs with full name shown on hover
- **W — Workflows tab** — browse favorite workflows (All / ★ Favorites / Groups / By Badge sub-tabs), ★ star shown for favorites in All view
- **N — Nodes tab** — browse favorite nodes (All / ★ Favorites / Groups / Sets / 📂 Category / 🧩 Package sub-tabs), ★ star shown for favorites in All view
  - **Category sub-tab** — dropdown to filter nodes by top-level category
  - **Package sub-tab** — dropdown to filter nodes by custom node package name
- **M — Models tab** — browse installed models (All / ★ Favorites / Groups / By Type sub-tabs)
- **P — Prompts tab** — browse prompt presets with All / Favorites / Categories sub-tabs
- **I — Information tab** — drop a ComfyUI-generated PNG/WebP or workflow JSON in the side panel to view its metadata; supports `UnetLoaderGGUF` and `QuadrupleCLIPLoader` node types; preview area fixed at 110px
- **A — AI TOOL tab** — 3-pane layout (Translation | TOOLS | Settings) always visible; Translation and TOOLS (VLM) powered by Ollama or LM Studio; settings (backend, URL, model) shared with the SPA AI TOOL tab via `localStorage`
  - **model sub-tab** — Checkpoint, VAE, Diffusion Model, and Text Encoder; drag items to canvas to place the corresponding loader node (Checkpoint → `CheckpointLoaderSimple`, VAE → `VAELoader`, Diffusion Model → `UNETLoader`, Text Encoder → `CLIPLoader`); double-click also places at canvas center
  - **lora sub-tab** — LoRA names with `strength_model / strength_clip` values; drag individual LoRA to place `LoraLoader`; **Multiple LORA** section (appears for 1+ LoRAs) drags all LoRAs into a single `Lora Loader (LoraManager)` node
  - **Prompts sub-tab** — POS / NEG badge list; drag a prompt to place `CLIPTextEncode` with text pre-filled; click any entry to view full text + Copy button
- **Drag & drop workflows** — drag a workflow onto the canvas to load it
- **Drag & drop nodes** — drag nodes/node sets onto the canvas to place them
- **Drag & drop prompts** — drag a preset onto the canvas to create a WFS_PromptText node with positive/negative prompts
- **Copy prompts** — copy individual positive (P) or negative (N) prompts from sidebar items
- **Double-click** — load workflows or place nodes without dragging
- **Search** — search within each sub-tab to quickly find items
- **⚙ Theme settings** — customize panel background, sub-header background, text, border, and secondary text colors; saved to localStorage and applied on every open

### Help & Support Tab (v0.1.3)
- **Feature list** — overview of all features organized by tab
- **Tips** — quick tips for drag & drop import, favorites, and default workflow
- **Support links** — GitHub repository and Ko-fi donation page

---

## Installation

### Via ComfyUI Manager (Recommended)

Search for **Workflow Studio** in ComfyUI Manager and install.

### Manual Installation

```bash
cd ComfyUI/custom_nodes
git clone https://github.com/ketle-man/ComfyUI-Workflow-Studio.git
```

Restart ComfyUI after installation.

---

## Sample Workflows

Sample workflows are included in the `workflows/` folder. You can open them directly in ComfyUI via drag & drop, or load them from the Workflow tab.

> **Note:** Some sample workflows require additional custom nodes.
> If a node is shown as missing (red/unknown) after loading, install the required custom nodes via **ComfyUI Manager** or by cloning the repository from GitHub into your `ComfyUI/custom_nodes/` directory.
>
> ```bash
> cd ComfyUI/custom_nodes
> git clone <repository-url>
> ```
>
> After installation, restart ComfyUI to activate the new nodes.

---

## Usage

### Launch

Click the **W** button in the ComfyUI top menu bar, or navigate to:

```
http://127.0.0.1:8188/wfm
```

> **Tip:** Shift+Click the W button to open in a new window.

### Canvas Snapshot

Click the **camera icon** (next to the W button) in ComfyUI's top bar to capture the current workflow canvas as a thumbnail. The image is automatically saved to the workflow data folder and appears in Workflow Studio's workflow list.

### Quick Start

1. **Workflow Tab** — Your workflows from `ComfyUI/user/default/workflows/` are automatically listed
2. **Click a workflow** — View thumbnail, JSON details, and metadata in the side panel
3. **Load in GenerateUI** — Click the button to load a workflow into the generation interface
4. **Adjust parameters** — Modify prompts, models, seeds, and settings via the auto-generated UI
5. **Generate** — Hit the Generate button to queue the prompt

---

## Requirements

- **ComfyUI** — any recent version (v1.33.9+ recommended for action bar integration)
- **Python 3.10+**
- **Jinja2** — `pip install jinja2` (usually included with ComfyUI)

### Optional

- **[Ollama](https://ollama.com/)** — for AI chat assistant, translation, and VLM features
- **[LM Studio](https://lmstudio.ai/)** — alternative backend for translation and VLM (OpenAI-compatible API)
- **[Eagle](https://eagle.cool/)** — for auto-saving generated images with metadata

---

## Supported Languages

| Language | Status |
|----------|--------|
| English  | Full   |
| Japanese | Full   |
| Chinese  | Full   |

---

## Changelog

### v0.3.16
- **CivitAI preview fallback** — model cards and the detail panel's Info tab now display the first CivitAI image directly when no local preview file exists; if the backend download fails (e.g. network restriction server-side), the browser fetches the image URL from the CivitAI cache as a fallback so the preview is always shown after fetching

### v0.3.15
- **Sample workflows** — added `workflows/` directory containing 13 sample workflows (SD1.5 / SDXL / DWPose / Face Detailer / Image Editing) with PNG thumbnails, bundled in the package
- **CivitAI auto-preview** — when fetching CivitAI info (individual or batch), the first CivitAI image is automatically downloaded and saved as `{model_stem}.preview.png` if no preview exists; batch summary reports the count of auto-saved previews
- **TOOLS pane — Create Tags** — new task option in the VLM dropdown (both SPA AI TOOL tab and Library A tab): generates a comma-separated list of descriptive English tags from the image

### v0.3.14
- **AI TOOL tab redesign** — tab renamed from "A" to "AI TOOL"; sub-tab navigation removed in favor of a permanent 3-pane layout (Translation 40% | TOOLS 40% | Settings 20%) — all panes always visible simultaneously; "VLM" pane renamed to "TOOLS"
- **Settings — RAW JSON Colors** — new accordion section with 6 color pickers to customize the syntax highlight colors for the Raw JSON editor in Generate UI: Default Text, Name/Scheduler, Title, Width/Height, Prompt/Text, Image/File; changes apply immediately on color pick; Reset Defaults restores the original scheme; saved to `localStorage` under `wfm_settings.jsonColors` and applied on startup
- **Help tab updated** — AI TOOL tab card rewritten; Settings card updated with RAW JSON Colors entry; Library panel sidepanel-16 entry updated

### v0.3.13
- **AI Tab (A)** — new tab added to both the SPA and the Workflow Studio Library side panel (rightmost tab)
  - **Translation sub-tab** — translate text via Ollama or LM Studio between Japanese, English, Chinese, or a custom Free language; ⇄ swap button exchanges both language selectors and text content simultaneously; language selections persisted automatically
  - **VLM sub-tab** — drop zone (110px, matching the I tab) accepts images via drag & drop or click; task selector (Describe Image / Create Prompt); Run button streams result into output area with Copy button; Ollama uses `images:[base64]` payload, LM Studio uses `image_url` content block
  - **Settings sub-tab** — backend radio (Ollama / LM Studio), API URL input, connection test with live status, model selector with refresh, Free language name fields (source and destination); saved to `localStorage` key `wfm_ai_settings` and shared between SPA and Library panel
  - **URL security** — backend URL validated via `new URL()` to enforce `http://` or `https://` scheme before any network call
- **Settings Tab — Ollama section renamed** — "Ollama 設定" → "Ollama 設定（プロンプトタブ）" to distinguish it from the new AI tab's settings
- **Help Tab updated** — added AI Tab (A) feature card and Library panel A tab entry; i18n support in EN/JA/ZH

### v0.3.12
- **GenerateUI — Raw JSON search** — always-visible search bar above the Raw JSON editor; finds all matches as you type with match count (`3/12`); navigate forward/back with ↑/↓ buttons, Enter / Shift+Enter, or Escape / ✕ to clear; current match highlighted in orange, other matches in yellow; search overlay syncs with editor scroll and stays updated while editing
- **Workflow analyzer — extended model type detection** — added CLIPLoader `type` field mapping to model family (`flux`, `hidream_i`, `wan`, `cosmos`, `lumina`, `ovis`, etc.) via `_CLIP_TYPE_TO_MODEL`; subgraph nodes (`definitions.subgraphs`) now scanned for model detection; `UnetLoaderGGUF` and similar loaders matched via `"UnetLoader" in ntype`; new families added: NewBie, Ovis, HiDream, Wan, Cosmos, Lumina; model-name detection refactored into reusable `_detect_model_type_from_name()`
- **Screenshots refreshed** — replaced tab-by-tab screenshots with 8 feature-focused images

### v0.3.11
- **Metadata Tab — extended loader support** — `metadata-tab.js` now recognizes `UnetLoaderGGUF` and `UNETLoaderGGUF` as Diffusion Model (e.g. HiDream GGUF workflows), and `QuadrupleCLIPLoader` as Text Encoder (e.g. HiDream 4-CLIP); previously these were detected only in the side panel I tab, not in the Metadata tab itself
- **Settings Tab — Text Size** — new slider (10–28 px) in the Settings tab adjusts font size for all prompt and chat text areas at once: Generate UI positive/negative prompts, AI Assistant chat input, Preset prompts, Wildcard text area and file editor, and Metadata prompt full preview; applied immediately on drag and persisted with Save Settings

### v0.3.10
- **Information tab — drag to canvas** — model, lora, and Prompts sub-tabs in the side panel I tab now support drag & drop onto the ComfyUI canvas; double-click also places nodes at canvas center
  - model sub-tab: each item places the corresponding loader node (Checkpoint → `CheckpointLoaderSimple`, VAE → `VAELoader`, Diffusion Model → `UNETLoader`, Text Encoder → `CLIPLoader`)
  - lora sub-tab: drag individual LoRA to place `LoraLoader`; **Multiple LORA** section (shown for 1+ LoRAs) places all LoRAs in a single `Lora Loader (LoraManager)` node
  - Prompts sub-tab: drag a prompt to place `CLIPTextEncode` with the full text pre-filled
- **Extended node type support** — `UnetLoaderGGUF` / `UNETLoaderGGUF` now detected as Diffusion Model; `QuadrupleCLIPLoader` (HiDream and similar 4-CLIP workflows) now detected as Text Encoder
- **Bug fix: CLIPLoader widget name** — `textencoder` type in `MODEL_NODE_MAP` was incorrectly using `clip_name1` (DualCLIPLoader's widget) instead of `clip_name`; Text Encoder models now drop with the correct filename
- **Preview area fixed height** — Information tab drop zone fixed at 110px so model/prompt lists are no longer compressed when a large image is loaded

### v0.3.9
- **Side panel I tab** — new Information tab in the Workflow Studio Library side panel; drop a ComfyUI PNG/WebP/JSON directly in the panel to inspect models, LoRAs, and prompts without opening the Metadata tab; sub-tabs: model / lora / Prompts with full-text preview and Copy button
- **Side panel tab redesign** — tabs shortened to single letters (W / N / P / M / I) with full name shown on hover
- **Bug fix: top bar icons** — icons (Workflow Studio / camera / Node Sets) were invisible in newer ComfyUI versions because Iconify converted the MDI CSS class to an inline SVG before the custom SVG could be injected; fixed by removing the early-return guard and adopting the same simple `requestAnimationFrame` retry pattern used by lora-manager

### v0.3.8
- **Metadata Tab: extended subgraph support** — added extraction for Flux.2 Dev fp8 (`SamplerCustomAdvanced`), Flux.2 Klein 4B Distilled (image edit), Ernie Image, Qwen-Image-Edit 2511 (`TextEncodeQwenImageEditPlus`), and WAN2.2 14B Animate (top-level CLIPTextEncode + subgraph KSampler)
- **Prompt type: Text (no badge)** — when positive/negative polarity cannot be determined (indirect sampler connections, cross-level links, `PrimitiveStringMultiline` etc.), prompts are listed without a POS/NEG badge; action buttons still work normally
- **Prompt extraction improvements** — `extractPromptsFromNodeSet` now resolves link sources from any STRING-output node (e.g. `ComfySwitchNode`, `PrimitiveStringMultiline`) without type restriction; `PrimitiveStringMultiline` search and final text-encoder fallback both extended to include subgraph nodes via `collectAllNodes`
- **i18n** — added `metaPromptText` key (EN: "Text" / JA: "テキスト" / ZH: "文本")

### v0.3.7
- **Metadata Tab: subgraph workflow support** — Flux.2 (Dev fp8 / Klein), Qwen-Image-Edit (/ 2511 / Layered), and Z-Image (Base / Turbo) official templates now correctly extract models and prompts; these use ComfyUI's `definitions.subgraphs` format with `UNETLoader`, `CLIPLoader`, and `VAELoader` inside the subgraph
- **Prompt extraction improvements** — 7-stage fallback chain: ImageMetadataPromptLoader → WFS_PromptText → top-level CLIPTextEncode+KSampler → `PrimitiveStringMultiline` (flux2-klein) → subgraph CLIPTextEncode+KSampler → PromptStyler → all CLIPTextEncode text
- **MarkdownNote model fallback** — `extractMarkdownNoteModels()` parses `**section** → - [model](url)` patterns from MarkdownNote nodes as a supplemental model source
- **Format note updated** — "Flux.2 / Qwen-Image / Z-Image subgraph workflows supported" (EN/JA/ZH)

### v0.3.6
- **Metadata Tab** — new tab (between Prompt and Gallery) that extracts model and prompt information from ComfyUI-generated PNG/WebP images and workflow JSON files; 3-column layout: drop zone with image preview (left), Checkpoint/VAE/Diffusion Model/Text Encoder lists (center), LoRA list with strength values + Prompt list with full-text viewer (right)
- **Prompt action buttons** — Copy, GenUI:P/N (set GenerateUI prompts), Prompt:P/N (set Prompt tab preset prompts) directly from the extracted prompt text
- **SDXL Prompt Styler support** — improved prompt extraction resolves `PromptStyler → CLIPTextEncode` link chains in both LiteGraph and API workflow formats
- **Format support** — ComfyUI (PNG/WebP/JSON), SD WebUI, SD Forge, Fooocus

### v0.3.5
- **Feeder subtab** — new subtab in GenerateUI for controlling [comfyui-image-feeder](https://github.com/ketle-man/comfyui-image-feeder) nodes; left pane: node selector + all ImageFeeder parameters + presets + Run/Stop controls; center pane: folder tree, image grid with checkbox selection, and preview panel
- **Run loop with After gen modes** — Loop (wrap and continue), Increment (advance and auto-stop), Fixed (constant index); index updates automatically via WebSocket `image_loop_node_sync` after each generation; seed comes from the right-pane seed setting
- **Workflow analysis improvements** — `analyzeWorkflow` now handles multi-hop CONDITIONING chains via BFS (up to 5 iterations), CLIPTextEncodeSDXL / CLIPTextEncodeSDXLRefiner, SDXLPromptStyler / SDXLPromptStylerAdvanced, KSamplerAdvanced (`noise_seed`), TextEncodeQwenImageEditPlus, PrimitiveStringMultiline, Power Lora Loader (rgthree), and `Checkpoint Loader` (WAS) with space in the class name

### v0.3.4
- **Wildcard support panel** — new right column in the Prompt tab with a one-click toolbar for inserting wildcard syntax (`{|}`, `{n$|}`, `__|__`, `:`, `;`, `$`, `<lora::1:LBW=;>`, `[]`, single/multi pick) and wrapping selected text; dedicated prompt textarea and wildcard file picker (click to insert `__filename__`)
- **Wildcard file manager** — create, view, edit, and delete `.txt` / `.yaml` wildcard files stored in `user/default/Workflow-Studio/wildcard/`; editor opens inline with filename input and save/cancel controls
- **Preset/Preset Manager tab switch** — the center pane of the Prompt tab is now a two-tab panel (Presets / Preset Manager) to reclaim horizontal space for the new wildcard panel
- **Wildcard Integration setting** — new accordion section in Settings tab; auto-detects ComfyUI-Impact-Pack; when installed, provides a button to create a directory junction (Windows) or symlink (other OS) from the WFS wildcard directory to Impact Pack's `wildcards/` directory; existing WFS files are migrated automatically; a Remove Link button reverses the operation

### v0.3.2
- **Checkpoint Batch** — new panel in the GenerateUI right column (below Seed, above results); enable via checkbox to auto-generate once per checkpoint model; filter included/excluded subfolders by comma-separated names (empty = all checkpoints); real-time preview of matched model count; amber progress bar shows current model name and index; Stop button aborts the loop after the current generation completes; failed models are counted and reported in the summary toast
- **Seed layout fix** — seed value input and mode selector (Random / Fixed / Increment / Decrement) now stacked vertically so neither is clipped in narrow panels

### v0.3.1
- **Folder operations** — create subfolders and delete folders (with all contents) directly from the folder tree header buttons
- **File operations** — move or delete individual images from the detail panel; bulk move and bulk delete from the multi-select bar
- **Tree state preserved** — folder expansion state is maintained after create/delete/move/refresh operations
- **Workflow viewer improved** — Metadata tab now reads both `prompt` (API format, the default for most ComfyUI-generated images) and `workflow` (UI format) keys from PNG metadata, covering virtually all ComfyUI output
- **Workflow auto-save** — after each generation in the Generate UI tab, the current workflow is automatically saved to gallery metadata for the generated images; shown in the Metadata tab even if PNG embedding is absent

### v0.3.0
- **Cross-type group filter** — the group filter dropdown in the Models tab now shows groups from all model types simultaneously, each prefixed with a type label (`[Checkpoint]`, `[LoRA]`, etc.); selecting a group automatically switches to the corresponding model type
- **Sidebar group display fixed** — the ComfyUI sidebar "Model Groups" view now correctly renders per-type groups (introduced in v0.2.9) with a type label on each group header; fixes a crash where `.filter is not a function` was thrown on the new nested group structure

### v0.2.9
- **Model Enable/Disable** — hide models from ComfyUI by renaming the file extension to `.disabled`; toggle per model (⏸ button on each card/row), per group (Enable All / Disable All buttons in the Group panel), or filter the grid by status (All / Enabled only / Disabled only). Changes take effect after ComfyUI refresh.
- **Per-type model groups** — groups are now scoped to each model type; checkpoint groups only appear in the Checkpoint tab, LoRA groups only in the LoRA tab, etc. Existing flat groups are automatically migrated.
- **Multi-select mode** — click the Select button in the toolbar to enter selection mode; check individual models across Thumbnail / Card / Table views
- **Bulk group operations** — with models selected, add or remove them from any group in one click, or create a new group and add them simultaneously
- **Bulk file delete** — permanently delete selected model files along with all associated preview images and sidecar files (`.json`, `.civitai.info`, `.info`); requires confirmation before deleting
- **Bug fix** — models in subdirectories could not be disabled due to a path-doubling error; fixed by computing the rename target from `path.name` instead of `model_name`
- **Bug fix** — Hypernetwork tab showed `C`, `O`, `M`, `B` as fake model items; caused by the new ComfyUI API format returning `"COMBO"` as the first element; fixed in `comfyui-client.js`

### v0.2.8
- **Data storage moved** — plugin data (settings, metadata, prompts, etc.) is now stored in `ComfyUI/user/default/Workflow-Studio/` instead of `custom_nodes/ComfyUI-Workflow-Studio/data/`; falls back to the old `data/` directory if `user/default/` does not exist
- **Data Management section** — new Settings tab section to export all plugin data to a single JSON file and import it back; useful for migration, backup, and reinstallation

### v0.2.7
- **Gallery tab** — new image browser for ComfyUI output folder; Thumbnail/Table views, multi-select with Bulk Bar, server-side group/tag/favorite filtering, group management (rename support), performance-optimized with  + mtime folder cache
- **Group UI unified** — Workflow, Nodes, and Gallery group panels rebuilt to match the Models tab 4-section pattern (Current Groups / Add to Group / Create New Group / Manage Groups); Rename support added to Workflow and Nodes tabs
- **Settings 2-column layout** — Theme panel fixed on the right (50% width, sticky); all other settings flow continuously on the left with no visual gap
- **Gallery output directory setting** — configure the output folder scanned by Gallery tab from Settings
- **Help tab** — Gallery tab description card added

### v0.2.5
- **Sidebar Category/Package sub-tabs** — added 📂 Category and 🧩 Package sub-tabs to the Nodes tab in Workflow Studio Library; each shows a dropdown to filter nodes by category or custom node package (reads `/object_info` for accurate package detection)
- **Sidebar theme settings** — added ⚙ button in the panel header to customize background, sub-header background, text, border, and secondary text colors with live preview; settings saved to localStorage
- **Sidebar TextEncoder (By Type)** — fixed TextEncoder not appearing in Models → By Type; now uses `DualCLIPLoader` → `CLIPLoader` fallback to retrieve `clip_name1` list
- **Hide `.index.json`** — excluded `.index.json` from both the Workflow tab and the Workflow Studio Library side panel

### v0.2.4
- **GenerateUI tab redesign** — reorganized from 5 tabs (Prompt/Image/Model/Settings/Raw JSON) to 3 tabs (Input/Model/Settings); each tab shows a Raw JSON column (540px) for instant JSON preview and direct editing from any tab
- **Input tab** — Prompt and Image stacked vertically in the left column
- **Settings tab** — KSampler and LatentImage stacked vertically in the left column
- **Raw JSON tab removed** — Raw JSON is now always visible as a right-column panel within each tab

### v0.2.3
- **Badge system unified** — Workflow and Models tabs now share a single badge palette (`⚙ Badge` button); workflow auto-analysis model type system removed in favor of user-defined free-label badges
- **GenUI Model button** — apply any model from the Models tab directly to the corresponding node in GenerateUI's current workflow (available in detail modal and side panel; Checkpoint / LoRA / VAE / ControlNet / UNET / TextEncoder)
- **Sidebar Models tab** — added All / ★ Favorites / Groups / By Type sub-tabs to the Models section of Workflow Studio Library
- **Sidebar All views** — ★ star displayed for favorite items in Workflows and Nodes All sub-tabs
- **Sidebar panel width** — widened from 280px to 310px

### v0.2.2
- **Models tab** — browse, search, and manage all installed ComfyUI models (Checkpoint, LoRA, VAE, ControlNet, UNET, TextEncoder) with Thumbnail/Card/Table views
- **CivitAI integration** — fetch model metadata by SHA256 hash (individual or batch per model type) with SSE progress streaming
- **Model groups** — create, rename, delete groups and assign/remove models for organization
- **Model metadata** — persistent favorites, tags, memo, and SHA256 hash per model
- **Preview images** — auto-detect and display preview images, change via file upload in detail modal
- **Table view memo column** — memo displayed in table view with compact subdir/extension columns
- **Side panel file path** — display full file path with click-to-copy in model info panel
- **Node card redesign** — removed package badge, added left border color-coding by package
- **Toolbar pagination** — pagination controls moved to toolbar for all tabs (Models, Workflows, Nodes)
- **Help tab updated** — Models Tab section added to feature list

### v0.2.0
- **Prompt presets in sidebar** — added Prompts tab to Workflow Studio Library (ComfyUI side panel) with All / Favorites / Categories sub-tabs
- **WFS_PromptText custom node** — drag prompt presets onto the canvas to create nodes with positive/negative prompt outputs
- **Preset Manager** — 3-column layout in Prompt tab: AI Assistant | Presets editor | Preset Manager (All / Favorites / Groups)
- **Group management** — create groups, assign/remove presets, delete groups from the Presets panel
- **GenUI Set** — renamed "Apply" button to clarify its purpose (applies presets to GenerateUI)
- **Sidebar P/N copy buttons** — copy positive or negative prompts individually from sidebar items
- **Panel renamed** — "WF & Node Library" renamed to "Workflow Studio Library"
- **Backend API for presets** — presets migrated from localStorage to server-side API with one-time migration
- **Help tab updated** — Prompt Tab and Workflow Studio Library sections reflect new features

### v0.1.9
- **Side panel 2-row sub-tabs** — Workflows: row 1 (Workflows / Favorites / Groups), row 2 (Model Type); Nodes: row 1 (Nodes / Favorites / Groups), row 2 (Sets)
- **Save dialog** — canvas snapshot now shows a filename edit dialog instead of auto-naming
- **API/App format badge** — workflow items in side panel show red (API) or orange (APP) badge
- **Group auto-cleanup** — deleted workflows are automatically removed from groups on refresh

### v0.1.8
- **WF & Node Library side panel** — renamed from "Node Library", added two top-level tabs (Workflows / Nodes) accessible from ComfyUI top bar
- **Workflows tab** — browse favorite workflows, filter by model type, filter by group with collapsible sections
- **Workflow drag & drop** — drag workflows from the side panel onto the canvas to load them instantly
- **Help tab update** — added Nodes Tab and WF & Node Library sections to the feature list

### v0.1.7
- **Nodes tab** — browse, search, and filter all installed ComfyUI nodes with Card/Table views, pagination (50 nodes/page), package color badges, and node detail side panel with I/O specs
- **Node Sets** — save selected nodes + connections from ComfyUI canvas as reusable sets via right-click context menu
- **Node Library side panel** — accessible from ComfyUI top bar with Favorites, Sets, and Groups tabs, drag & drop placement
- **3 top bar buttons** — Workflow Studio, Canvas Snapshot, and Node Library buttons in ComfyUI's action bar

### v0.1.6
- **Security fix** — path traversal vulnerability in `workflow_service.py` (reported via ComfyUI-Manager PR review)

### v0.1.5
- **Theme system** — 13 built-in themes selectable from Settings tab with instant preview (Deep Ocean Dark, Pop & Vibrant, Light Minimalist, Cyberpunk, Glassmorphism, Neumorphism, Retro 8-bit, Pastel Dream, Brutalism, Earthy, Material UI, Monotone + Accent, Corporate Trust)
- Theme preference persisted in localStorage and restored on page load (no flash)
- Special CSS effects per theme: neon glow (Cyberpunk), backdrop blur (Glassmorphism), dual shadow (Neumorphism), pixel borders (Retro/Brutalism)

### v0.1.4
- **App format support** — detect `.app.json` workflows (ComfyUI App mode), show "App Format" badge, block loading in GenerateUI with guidance message
- **Preset clipboard copy** — added PP Copy / NP Copy buttons to copy positive/negative prompts to clipboard
- **Analysis bugfix** — fixed workflow analysis crash when `widgets_values` contains non-string values (e.g. integers)

### v0.1.3
- Added **Help & Support tab** — feature list, tips, and support links (GitHub, Ko-fi)
- Multi-language support (EN/JA/ZH) for all help content

### v0.1.2
- Added **Canvas Snapshot** button to ComfyUI top bar — capture workflow canvas as PNG thumbnail with embedded workflow metadata
- Added **Thumbnail tab** to the workflow side panel for quick visual preview
- Added **Thumbnail section** to the workflow detail modal
- Snapshot images are auto-imported as workflows with thumbnails

### v0.1.1
- Initial feature set: Workflow management, GenerateUI, Prompt assistant, Settings

---

## Project Structure

```
ComfyUI-Workflow-Studio/
├── __init__.py                  # ComfyUI entry point
├── py/
│   ├── wfm.py                   # Main class & route registration
│   ├── config.py                # Path configuration
│   ├── nodes/
│   │   └── prompt_text.py       # WFS_PromptText custom node (positive/negative prompt)
│   ├── routes/
│   │   ├── workflow_routes.py   # Workflow CRUD & analysis API
│   │   ├── nodes_routes.py      # Nodes metadata & node sets API
│   │   ├── models_routes.py     # Model metadata, preview, CivitAI API
│   │   ├── prompts_routes.py    # Prompt presets CRUD API
│   │   ├── settings_routes.py   # Settings API
│   │   ├── ollama_routes.py     # Ollama proxy API
│   │   └── eagle_routes.py      # Eagle integration API
│   └── services/
│       ├── workflow_service.py  # Workflow file operations
│       ├── nodes_service.py     # Node metadata & node sets
│       ├── models_service.py    # Model metadata & preview images
│       ├── civitai_service.py   # CivitAI API integration & cache
│       ├── prompts_service.py   # Prompt presets persistence
│       ├── workflow_analyzer.py # Model/node detection
│       ├── settings_service.py  # Settings persistence
│       └── png_extractor.py     # PNG metadata extraction
├── templates/
│   └── index.html               # SPA template (Workflow/GenerateUI/Prompt/Metadata/Gallery/Nodes/Models/Settings/Help/AI)
├── static/
│   ├── favicon.svg              # Browser tab icon (W+S Wave)
│   ├── css/main.css             # Styles
│   └── js/
│       ├── app.js               # App initialization & routing
│       ├── workflow-tab.js      # Workflow browser
│       ├── generate-tab.js      # Generation UI
│       ├── feeder-tab.js        # Feeder subtab (ImageFeeder node control + image library)
│       ├── prompt-tab.js        # AI assistant & presets
│       ├── metadata-tab.js      # Metadata extraction & display (PNG/WebP/JSON)
│       ├── settings-tab.js      # Settings panel
│       ├── comfyui-client.js    # ComfyUI WebSocket/API client
│       ├── nodes-tab.js          # Node browser & node sets
│       ├── models-tab.js         # Model browser & CivitAI integration
│       ├── ai-tab.js             # AI TOOL tab (Translation | TOOLS/VLM | Settings — Ollama / LM Studio)
│       ├── comfyui-workflow.js  # UI-to-API format conversion
│       ├── comfyui-editor.js    # Dynamic parameter editor
│       ├── json-highlight.js    # JSON syntax highlighting
│       └── i18n.js              # Internationalization
├── web/comfyui/
│   ├── top_menu_extension.js    # ComfyUI menu bar integration
│   └── node_sets_menu.js        # Workflow Studio Library side panel
└── data/                        # Fallback data dir (used when ComfyUI user/default/ is not found)
```

---

## License

MIT License

---

## Acknowledgements

- [ComfyUI](https://github.com/comfyanonymous/ComfyUI) by comfyanonymous
- [ComfyUI-Custom-Scripts](https://github.com/pythongosssss/ComfyUI-Custom-Scripts) by pythongosssss — Canvas snapshot and PNG workflow embedding implementation reference
- [ComfyUI-Lora-Manager](https://github.com/willchil/ComfyUI-Lora-Manager) — Plugin architecture and UI pattern reference
- [Ollama](https://ollama.com/) for local LLM inference
- [Eagle](https://eagle.cool/) for image management
