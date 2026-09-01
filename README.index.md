# README Index — ComfyUI-Workflow-Studio

Condensed index of README.md: intro summary, feature names per tab (full descriptions live in the excluded README.md), and the installation/usage/requirements/project-structure sections verbatim. Exists so graphify can extract this without feeding the full README (with its screenshot table) to the local Ollama model. Regenerate with `python tools/generate_doc_index.py readme` whenever README.md changes.

# ComfyUI-Workflow-Studio

A comprehensive workflow, asset management, and generation UI plugin for [ComfyUI](https://github.com/comfyanonymous/ComfyUI).

**📁 Management** — organize all your assets in one studio

- Workflow, model, image, and prompt management
- AI-powered prompt writing assistance, translation, and tag generation
- File drop & Gallery-linked metadata viewing — inspect and reuse generation settings instantly

**⚡ GenerateUI** — a productivity-focused generation tab connected to every other tab

- Batch generation across models, samplers, prompts, and workflows
- Image Feeder for continuous folder-based generation
- Lab: experimental I2I batch generation with independent per-iteration keyframes for Model (Checkpoint/LoRA Single/VAE)/Prompt/KSampler

**📚 Workflow Studio Library** — a multi-function side panel for smooth ComfyUI integration

- Drag & drop models, nodes, prompts, and workflows straight onto the canvas
- **Send to Canvas**: click "Send to Canvas" (Workflow tab) or "Copy & Send Canvas" (Gallery tab) to send the workflow directly to the ComfyUI canvas — UI and API formats both supported
- View metadata from images / JSON, then drop the detected models and prompts onto the canvas
- Built-in AI tools (translation and more)

![Workflow Studio](https://img.shields.io/badge/ComfyUI-Custom_Node-blue)
![Version](https://img.shields.io/badge/version-0.5.8-green)

## Features (tab -> feature names)

### Workflow Tab
Thumbnail / Table views, Thumbnail side panel, Badge filtering, Search, Side panel tabs, Badge management, AI summary, Import / Export, Side panel toolbar buttons, Default view setting, Search clear (✕), Clear all filters (✕ Clear)

### Canvas Snapshot (v0.1.2)
One-click capture, Auto-save as thumbnail, Embedded workflow metadata, Auto-import

### GenerateUI Tab (v0.3.5)
6-tab layout, Save button, Input tab, Model tab, Settings tab, Always-visible Raw JSON, Bypass/Mute node handling, One-click generation, Seed control, Style selector, Create Catalog / Catalog buttons, Batch type selector, Batch tab, UI-to-API conversion, Video workflow support, Eagle integration

### Feeder subtab (v0.3.5 / v0.3.42)
ImageFeeder node control, Image library, Selection management, Presets, Continuous Run loop, Index sync, Seed, WFS_GalleryFeeder node, Node & group selector, Image grid, After Gen modes, Run / Stop controls

### Lab subtab (v0.3.87 – v0.5.2)
Setting / Results / Plan JSON sub-panels, Per-column keyframes, Model column — Checkpoint / LoRA Single / VAE, Empty state when no matching node exists, Wildcards, Prompt cell extras, Keyframe #1 live-reflect, Bypass checkbox, LoRA node bypass & prompt injection, T2I workflow support, Use generated image for next, Workflow recall, Plan files, Plan Load, Plan JSON tab, Save index image to Output on Run, Index images are self-contained plan files, Eagle integration, Select vs. edit, and keyframe reordering, PG — apply a Prompt tab preset group, Video workflow support, Use generated image for next, now video-aware

### Prompt Tab
3-column layout, AI chat assistant, Image attachment, Translation, Prompt presets, Preset Manager, Group management, Clipboard copy, GenUI Set, Wildcard/Style tab bar, Wildcard input toolbar, Wildcard file manager, Style manager, Form / Table toggle, Table view — Presets / Presets Group / Wildcards / Style

### Settings Tab
2-column layout, Collapsible sections, Theme selection, Theme customization, Workflows directory, Gallery output directory, Eagle connection, CivitAI Host, CivitAI API Key, Default workflow, Default Checkpoint, Video Playback Volume, Data Management, Text Size, RAW JSON Colors, GenerateUI Model Tab Highlight, Wildcard Integration, G'MIC-Qt Integration, Language

### Gallery Tab (v0.3.44)
Output / ImagePrompt / Style_Catalog / Metadata sub-tabs, Image browser, Folder tree root label, Thumbnail / Table views, Folder management, File operations, Download, MP4 video support, MP4 embedded metadata, Info tab: dimensions & duration, Multi-select, Image Compare, Prompt search, Server-side filtering, Group management, Thumbnail F button, Favorites, Detail panel, Prompt tab, Workflow viewer, GenUI button, Image Edit button, Send GenUI Image button, Send to LI node button, Send CC button, Search clear (✕), Clear all filters (✕ Clear), Workflow auto-save, Output folder configurable, SVG file support, Performance

### ImagePrompt Gallery subtab (v0.3.94, renamed from Style/Prompt in v0.3.95)
Visual prompt library, 3-column layout, Prompt builder (right pane), Plain-text prompt storage, ponyxlWildcardsVault format support, Seed data importer

### Style_Catalog Gallery subtab (v0.3.95)
Visual Style picker, 3-column layout, Positive/Negative panel, Select as Style button, Load in GenerateUI / Open in Metadata Tab buttons, Double-click to enlarge

### Metadata Gallery subtab (v0.3.8, moved from a top-level tab in v0.4.6)
Now inside Gallery, 3-column layout, File drop, MP4 embedded metadata, Model extraction, LoRA extraction, Prompt extraction, Prompt actions, Format support, Format note

### Nodes Tab (v0.1.7)
Node Browser, Search & Filter, Package badges, Node detail panel, Node Sets, Right-click context menu, Multi-select, Search clear (✕), Clear all filters (✕ Clear)

### Models Tab (v0.2.3)
Model Browser, Thumbnail / Table views, Table column sort, Search & Filter, User-defined badges, Side panel tabs, CivitAI integration, CivitAI panel — Info / Sample sub-tabs, CivitAI panel states, Batch CivitAI fetch, Detail modal, GenUI Model button, Group management, Table view memo, Preview images, Enable / Disable models, Multi-select & bulk operations, Search clear (✕), Clear all filters (✕ Clear)

### Tagger Tab (v0.3.38)
3 sub-tabs, Model support, Threshold sliders, VLM tagging, Single tab, Single output options, Batch tab, DB tab, Dependencies

### Image Edit Tab (v0.3.65)
Layer-based image editor, Loading images, New button, Tools, Layer panel, Layer lock, Text quality, Export, Canvas navigation, Undo / Redo

### Video Tab (v0.5.0 – v0.5.7)
Dedicated video generation UI, independent of GenerateUI, Plan / Edit subtabs, Base settings row, Asset / Project subtabs, Two center previews, First Frame / Last Frame are both optional, Semantic node lookup, not hardcoded IDs, Field highlight color, Load in Video, Frame tab, GIF tab, Playback volume

### AI TOOL Tab (v0.3.14)
4-pane layout, Translation pane, Chat pane, Chat pane — image generation via Tool Calling, Chat pane — generate_image extra parameters, TOOLS pane (VLM), TOOLS pane — shared Chat attachment, TOOLS pane (Wildcards), Chat pane — image-to-image (I2I), Chat pane — SVG generation, no ComfyUI workflow involved, Chat pane — Skills, Settings pane, Unsloth backend, Settings pane — Chat Image Generation, Settings pane — Chat I2I Generation, Settings pane — Generation, Model unload, Settings shared, Backend support, URL security, Lemonade's other endpoints (not integrated)

### Workflow Studio Library (ComfyUI Side Panel) (v0.3.9)
Tab layout (W / N / P / M / I / A), W — Workflows tab, N — Nodes tab, M — Models tab, P — Prompts tab, I — Information tab, A — AI TOOL tab, Drag & drop workflows, Drag & drop nodes, Drag & drop prompts, Send to Canvas, Copy prompts, Double-click, Search, ⚙ Theme settings

### Help &amp; Support Tab (v0.1.3)
Sidebar navigation, Support, Feature list, Keyboard Shortcuts

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
- **[Lemonade Server](https://lemonade-server.ai/)** — alternative backend for translation, chat, and VLM (OpenAI-compatible API)
- **[Unsloth](https://unsloth.ai/)** — alternative backend for translation, chat, and VLM (OpenAI-compatible API); always requires an API key, set via `UNSLOTH_API_KEY` in a `.env` file — `pip install -r requirements.txt` for `python-dotenv`
- **[Eagle](https://eagle.cool/)** — for auto-saving generated images with metadata
- **[comfyui-mask-editor-one](https://github.com/ketle-man/comfyui-mask-editor-one) (v0.1.9+)** — enables BiRefNet background removal, SAM3 text-prompt segmentation, and ABR stamp-brush library in the Image Edit Mask tool; `birefnet.safetensors` must be placed in `ComfyUI/models/background_removal/` for BiRefNet

---

## Supported Languages

| Language | Status |
| -------- | ------ |
| English  | Full   |
| Japanese | Full   |
| Chinese  | Full   |

---

## Project Structure

```
ComfyUI-Workflow-Studio/
├── __init__.py                  # ComfyUI entry point
├── py/
│   ├── wfm.py                   # Main class & route registration
│   ├── config.py                # Path configuration
│   ├── nodes/
│   │   ├── prompt_text.py       # WFS_PromptText custom node (positive/negative prompt)
│   │   └── gallery_feeder_node.py  # WFS_GalleryFeeder custom node (gallery group → IMAGE)
│   ├── routes/
│   │   ├── workflow_routes.py   # Workflow CRUD & analysis API
│   │   ├── nodes_routes.py      # Nodes metadata & node sets API
│   │   ├── models_routes.py     # Model metadata, preview, CivitAI API
│   │   ├── prompts_routes.py    # Prompt presets CRUD API
│   │   ├── settings_routes.py   # Settings API
│   │   ├── ollama_routes.py     # Ollama proxy API
│   │   ├── eagle_routes.py      # Eagle integration API
│   │   └── gallery_routes.py    # Gallery tab API (Output + ImagePrompt + Style_Catalog sub-tabs)
│   └── services/
│       ├── workflow_service.py  # Workflow file operations
│       ├── nodes_service.py     # Node metadata & node sets
│       ├── models_service.py    # Model metadata & preview images
│       ├── civitai_service.py   # CivitAI API integration & cache
│       ├── prompts_service.py   # Prompt presets persistence
│       ├── workflow_analyzer.py # Model/node detection
│       ├── settings_service.py  # Settings persistence
│       ├── png_extractor.py     # PNG metadata extraction
│       ├── gallery_service.py   # Gallery image scanning, .txt sidecar & ponyxlWildcardsVault prompt resolution
│       └── gallery_metadata.py  # Gallery per-image metadata store (favorites/tags/memo/groups)
├── templates/
│   └── index.html               # SPA template (Workflow/GenerateUI/Prompt/Metadata/Gallery/Nodes/Models/Settings/Help/AI)
├── static/
│   ├── favicon.svg              # Browser tab icon (W+S Wave)
│   ├── css/main.css             # Styles
│   └── js/
│       ├── app.js               # App initialization & routing
│       ├── workflow-tab.js      # Workflow browser
│       ├── generate-tab.js      # Generation UI
│       ├── feeder-tab.js        # Feeder subtab (Image Loop + Gallery modes)
│       ├── gallery-tab.js       # Gallery tab: Output sub-tab (image browser, groups, metadata) + sub-tab switching
│       ├── image-prompt-tab.js  # Gallery tab: ImagePrompt sub-tab (visual prompt builder)
│       ├── style-catalog-tab.js # Gallery tab: Style_Catalog sub-tab (visual Style picker)
│       ├── tagger-tab.js        # Tagger tab (WD Tagger, DeepDanbooru, Ollama VLM)
│       ├── prompt-tab.js        # AI assistant & presets
│       ├── metadata-tab.js      # Metadata extraction & display (PNG/WebP/JSON)
│       ├── settings-tab.js      # Settings panel
│       ├── comfyui-client.js    # ComfyUI WebSocket/API client
│       ├── nodes-tab.js          # Node browser & node sets
│       ├── models-tab.js         # Model browser & CivitAI integration
│       ├── ai-tab.js             # AI TOOL tab (Translation | Chat | TOOLS/VLM | Settings)
│       ├── comfyui-workflow.js  # UI-to-API format conversion
│       ├── comfyui-editor.js    # Dynamic parameter editor
│       ├── json-highlight.js    # JSON syntax highlighting
│       ├── util.js              # Shared utilities (escapeHtml, readJsonStorage, getSettings)
│       └── i18n.js              # Internationalization
├── web/comfyui/
│   ├── top_menu_extension.js    # ComfyUI menu bar integration
│   ├── node_sets_menu.js        # Workflow Studio Library side panel
│   └── gallery_feeder_extension.js  # WFS_GalleryFeeder canvas widgets (After Gen / Run / Stop)
├── tools/
│   └── import_style_prompt_seed.py  # Dev tool: pre-process a wildcards-vault source into ws_image_prompt (not run by the plugin itself)
└── data/                        # Fallback data dir (used when ComfyUI user/default/ is not found)
```

---

## License

MIT License

---

## Acknowledgements

- [ComfyUI](https://github.com/comfyanonymous/ComfyUI) by comfyanonymous
- [ComfyUI-Custom-Scripts](https://github.com/pythongosssss/ComfyUI-Custom-Scripts) by pythongosssss — Canvas snapshot and PNG workflow embedding implementation reference
- [ComfyUI-Lora-Manager](https://github.com/willmiao/ComfyUI-Lora-Manager) — Plugin architecture and UI pattern reference
- [Ollama](https://ollama.com/) for local LLM inference
- [Eagle](https://eagle.cool/) for image management
- [Pillow (PIL Fork)](https://python-pillow.org/) — server-side thumbnail generation (`data/thumb_cache/`)
- [ComfyUI-Gallery](https://github.com/PanicTitan/ComfyUI-Gallery) by PanicTitan — thumbnail grid UX reference
- [infinite-image-browsing](https://github.com/zanllp/sd-webui-infinite-image-browsing) by zanllp — thumbnail caching and index strategy reference
- [Fooocus](https://github.com/lllyasviel/Fooocus) by lllyasviel — style preset JSON format reference

