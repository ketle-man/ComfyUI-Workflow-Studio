# ComfyUI-Workflow-Studio

A comprehensive workflow management and generation UI plugin for [ComfyUI](https://github.com/comfyanonymous/ComfyUI).

Browse, organize, and execute workflows directly from a dedicated studio interface — without switching between windows or manually editing JSON.

![Workflow Studio](https://img.shields.io/badge/ComfyUI-Custom_Node-blue)

## Screenshots

| Workflow Tab | GenerateUI Tab |
|:---:|:---:|
| ![Workflow](docs/screenshot_workflow.png) | ![GenerateUI](docs/screenshot_generate.png) |

| Prompt Tab | Settings Tab |
|:---:|:---:|
| ![Prompt](docs/screenshot_prompt.png) | ![Settings](docs/screenshot_settings.png) |

---

## Features

### Workflow Tab
- **Thumbnail / Card / Table views** — switch between view modes to browse your workflow library
- **Tag-based filtering** — filter by base model (SD1.5, SDXL, etc.) and custom groups
- **Search** — full-text search across workflow names and metadata
- **Side panel** — view workflow JSON with syntax highlighting, format badge (UI/API), and copy button
- **Batch analysis** — auto-detect checkpoint, model type, prompt, and I/O node counts
- **AI summary** — generate workflow descriptions using Ollama
- **Import / Export** — import workflows from files or clipboard, open in ComfyUI directly
- **Default view setting** — persist your preferred view mode (Thumbnail / Card / Table)

### GenerateUI Tab
- **Auto-generated parameter UI** — prompt, model, sampler, image, and other settings extracted from the workflow
- **One-click generation** — queue prompts to ComfyUI without leaving the studio
- **Seed control** — randomize, lock, or manually set seeds
- **Raw JSON editor** — view and edit the API-format JSON with syntax highlighting
- **UI-to-API conversion** — automatic conversion supporting subgraphs (nested workflows), COMBO types, and display-only node exclusion
- **Eagle integration** — auto-save generated images to [Eagle](https://eagle.cool/) with metadata

### Prompt Tab
- **AI chat assistant** — powered by [Ollama](https://ollama.com/), generate and refine prompts interactively
- **Image attachment** — attach reference images for vision-capable models
- **Translation** — JA/EN/ZH translation buttons for multilingual prompt creation
- **Prompt presets** — save/load reusable prompt templates (positive & negative)
- **Apply to GenerateUI** — send prompts directly to the generation interface

### Settings Tab
- **Workflows directory** — configure which folder to scan for workflows
- **Eagle connection** — set Eagle API endpoint for auto-save
- **Ollama connection** — configure Ollama server URL
- **Badge display** — toggle metadata badges on workflow cards
- **Language** — English / Japanese / Chinese

---

## Installation

### Via ComfyUI Manager (Recommended)

Search for **Workflow Studio** in ComfyUI Manager and install.

### Manual Installation

```bash
cd ComfyUI/custom_nodes
git clone https://github.com/your-username/ComfyUI-Workflow-Studio.git
```

Restart ComfyUI after installation.

---

## Usage

### Launch

Click the **WS** button in the ComfyUI top menu bar, or navigate to:

```
http://127.0.0.1:8188/wfm
```

> **Tip:** Shift+Click the WS button to open in a new window.

### Quick Start

1. **Workflow Tab** — Your workflows from `ComfyUI/user/default/workflows/` are automatically listed
2. **Click a workflow** — View JSON details and metadata in the side panel
3. **Load in GenerateUI** — Click the button to load a workflow into the generation interface
4. **Adjust parameters** — Modify prompts, models, seeds, and settings via the auto-generated UI
5. **Generate** — Hit the Generate button to queue the prompt

---

## Requirements

- **ComfyUI** — any recent version (v1.33.9+ recommended for action bar integration)
- **Python 3.10+**
- **Jinja2** — `pip install jinja2` (usually included with ComfyUI)

### Optional

- **[Ollama](https://ollama.com/)** — for AI chat assistant and translation features
- **[Eagle](https://eagle.cool/)** — for auto-saving generated images with metadata

---

## Supported Languages

| Language | Status |
|----------|--------|
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
│   ├── routes/
│   │   ├── workflow_routes.py   # Workflow CRUD & analysis API
│   │   ├── settings_routes.py   # Settings API
│   │   ├── ollama_routes.py     # Ollama proxy API
│   │   └── eagle_routes.py      # Eagle integration API
│   └── services/
│       ├── workflow_service.py  # Workflow file operations
│       ├── workflow_analyzer.py # Model/node detection
│       ├── settings_service.py  # Settings persistence
│       └── png_extractor.py     # PNG metadata extraction
├── templates/
│   └── index.html               # SPA template
├── static/
│   ├── css/main.css             # Styles
│   └── js/
│       ├── app.js               # App initialization & routing
│       ├── workflow-tab.js      # Workflow browser
│       ├── generate-tab.js      # Generation UI
│       ├── prompt-tab.js        # AI assistant & presets
│       ├── settings-tab.js      # Settings panel
│       ├── comfyui-client.js    # ComfyUI WebSocket/API client
│       ├── comfyui-workflow.js  # UI-to-API format conversion
│       ├── comfyui-editor.js    # Dynamic parameter editor
│       ├── json-highlight.js    # JSON syntax highlighting
│       └── i18n.js              # Internationalization
├── web/comfyui/
│   └── top_menu_extension.js    # ComfyUI menu bar integration
└── data/                        # Metadata & settings storage
```

---

## License

MIT License

---

## Acknowledgements

- [ComfyUI](https://github.com/comfyanonymous/ComfyUI) by comfyanonymous
- [Ollama](https://ollama.com/) for local LLM inference
- [Eagle](https://eagle.cool/) for image management
