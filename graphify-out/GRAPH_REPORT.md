# Graph Report - ComfyUI-Workflow-Studio  (2026-08-19)

## Corpus Check
- 13 files · ~585,836 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 2369 nodes · 5401 edges · 148 communities (89 shown, 59 thin omitted)
- Extraction: 94% EXTRACTED · 6% INFERRED · 0% AMBIGUOUS · INFERRED: 348 edges (avg confidence: 0.65)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- Models Tab Frontend
- Models API Routes
- App Shell & i18n Init
- Prompt Tab Frontend
- Gallery API Routes
- Gallery Tab Frontend & Toasts
- Image Edit Layer & Draw Tools
- GenerateUI Feeder Tab
- Eagle Integration Routes
- Nodes Tab Frontend
- Nodes API Routes
- Settings API Routes
- Index HTML SPA Shell Layout
- Metadata Tab Frontend
- Node Sets Menu & Sidebar
- Tagger/Prompt i18n Helpers
- Generate Tab Frontend & Modals
- Gallery Service Core
- Tagger API Routes
- Workflow Tab Frontend & Storage
- Wildcard Service & Routes
- ComfyUI Client & Editor
- Mask Editor Shape Tool
- GenerateUI Lab Tab
- Tagger Inference Service
- AI Chat/VLM Sidebar Helpers
- Node Sets Menu UI Components
- Node Sets Draggable Items
- Prompts API Routes/Service
- Workflow API Routes
- Gallery Metadata Store
- Workflow Service Metadata/Import
- Lab Plan Service & Routes
- Skill Service & Routes
- Image Edit Draw Tool
- Image Edit Select Tool
- DEVLOG Early History & Manager Registration
- CivitAI Service
- Image Edit Mask Tool
- Node Sets Menu Model Fetch
- Gallery Metadata/Service Bridge
- AI Tool Tab Frontend
- Image Prompt Tab
- Qwen Chat Integration Plan
- SDXL 3D Pose Editor DWPose Workflow
- DEVLOG Batch/Group UI Evolution
- Style Catalog Tab
- DEVLOG Feeder & Gallery Features
- AI Tool Tab Frontend
- Image Edit Layer Manager Core
- CLAUDE.md Node Dev Rules
- DEVLOG Subgraph & Advanced Sampling
- DEVLOG LoRA Pane & Batch Tab
- ComfyUI Workflow Utilities
- Generate Tab Frontend & Modals
- DEVLOG AI Chat & Comic Creator Bridges
- Image Edit Blur Tool (BlurTool.js)
- Image Edit Background Removal
- Image Edit Shape Tool
- DEVLOG Image Edit Tool Additions
- G'MIC Routes
- Ollama Routes
- Image Edit Text Tool
- Workflow Analyzer
- Mask Editor Text Tool
- AI Tool Tab Frontend
- GenerateUI Lab Tab
- Gallery Service Vault Helpers
- Mask Editor Alpha Tool
- Mask Editor Color Tool
- Gallery Feeder Extension (Frontend)
- Node Sets Theme Panel
- DEVLOG Prompt Tab & Wildcard Features
- Image Edit Background Removal (BgRemove.js)
- Gallery Feeder Node (Backend)
- Generate Tab Frontend & Modals
- Image Edit Inpaint/I2I Actions
- Image Edit SAM3 Segmentation
- Node Sets Metadata Extraction
- Node Sets Prompt Extraction
- Inpaint Basic Workflow
- Gallery Service Background Indexing
- Settings/CivitAI Config Resolution
- GenerateUI Lab Tab
- Style Prompt Seed Import Tool
- FireRed 3D Pose Image Edit Workflow
- Image Edit G'MIC Integration
- DWPose Image Feeder Workflow
- DEVLOG AI Chat SVG & Help Redesign
- DEVLOG GenerateUI Model Tab Features
- DEVLOG Node Sets & Prompt Preset
- Settings/CivitAI Config Resolution
- Image Edit File Export (FileExport.js)
- Release & Publish Workflow
- DEVLOG Style Catalog & ImagePrompt
- DEVLOG Gallery/Models Early Features
- DEVLOG Metadata & Sidepanel I Tab
- Prompt Text Node
- PNG Metadata Extractor
- Settings/CivitAI Config Resolution
- ComfyUI Client & Editor
- DEVLOG AI Tab & RAW JSON Search
- DEVLOG Wildcard & Impact Pack
- DEVLOG App Mode & Format
- DEVLOG LoRA Stack & CLIP Bugfix
- DEVLOG Settings & Data Storage
- DEVLOG JSON Highlighting & Subgraph
- DEVLOG Theme System
- Prestartup Script
- Gallery Image Prompt Root
- Gallery Style Catalog Root
- Gallery Background Index Trigger
- Workflow Service Dir Update
- Project Banner Asset
- Project Icon Asset
- SDXL 2D Pose Editor I2I Workflow
- Tagger Tab Screenshot
- Models Tab Screenshot
- Topbar Icon Strip Screenshot
- GenerateUI LoRA Stack Screenshot
- Favicon Asset
- FireRed 2D Pose Image Edit Workflow
- Flux.2 Klein 3D Pose Image Edit Workflow
- SDXL DWPose ControlNet Workflow
- SDXL From Metadata Workflow
- SDXL I2I FaceDetailer Workflow
- SDXL Image Feeder I2I Workflow
- SDXL T2I FaceDetailer Workflow
- DEVLOG Checkpoint Batch Generation
- DEVLOG Sidepanel Always-Visible
- DEVLOG Top Bar Icon Fix
- GenerateUI Batch Tab Screenshot
- Multiple Select Menu Screenshot
- Image Edit Tab Screenshot
- Workflow Tab Screenshot
- Prompt Input Assistance Screenshot
- GenerateUI Feeder Screenshot
- Library Panel LoRA Info Screenshot
- Library Panel Prompts Screenshot
- Settings Tab Screenshot
- Project Thumbnail Asset
- Project Manifest (pyproject.toml)
- SD1.5 T2I Basic Workflow
- SDXL T2I Basic Workflow Screenshot

## God Nodes (most connected - your core abstractions)
1. `t()` - 202 edges
2. `showToast()` - 143 edges
3. `escapeHtml()` - 68 edges
4. `ImageEditTab` - 53 edges
5. `GalleryService` - 45 edges
6. `initPromptTab()` - 34 edges
7. `setup_routes()` - 32 edges
8. `add()` - 31 edges
9. `initSettingsTab()` - 31 edges
10. `renderModelGrid()` - 28 edges

## Surprising Connections (you probably didn't know these)
- `Global CLIP State vs GenerateUI VRAM Integration Concern` --semantically_similar_to--> `Bounded Module-level Cache Pattern`  [INFERRED] [semantically similar]
  QWEN_CHAT_INTEGRATION_PLAN.md → CLAUDE.md
- `Unsloth Backend (AI TOOL Tab)` --semantically_similar_to--> `Option A: External chat_TE Connection`  [INFERRED] [semantically similar]
  README.md → QWEN_CHAT_INTEGRATION_PLAN.md
- `Prompt Tab AI Assistant LM Studio Backend Support` --conceptually_related_to--> `AI TOOL Tab`  [INFERRED]
  DEVLOG.md → README.md
- `Group Orphan Entry Auto-Cleanup + Gallery Shift-Click Range Select` --references--> `Gallery Tab`  [EXTRACTED]
  DEVLOG.md → README.md
- `Generated Image Workflow Metadata Embedding Bug Fix` --conceptually_related_to--> `Gallery Tab`  [INFERRED]
  DEVLOG.md → README.md

## Import Cycles
- 3-file cycle: `static/js/app.js -> static/js/image-edit-tab.js -> static/js/image-edit/BgRemove.js -> static/js/app.js`
- 3-file cycle: `static/js/app.js -> static/js/image-edit-tab.js -> static/js/image-edit/FileExport.js -> static/js/app.js`
- 3-file cycle: `static/js/app.js -> static/js/image-edit-tab.js -> static/js/image-edit/GmicIntegration.js -> static/js/app.js`
- 3-file cycle: `static/js/app.js -> static/js/image-edit-tab.js -> static/js/image-edit/InpaintI2IActions.js -> static/js/app.js`
- 3-file cycle: `static/js/app.js -> static/js/gallery-tab.js -> static/js/image-prompt-tab.js -> static/js/app.js`
- 3-file cycle: `static/js/feeder-tab.js -> static/js/gallery-tab.js -> static/js/generate-tab.js -> static/js/feeder-tab.js`
- 3-file cycle: `static/js/app.js -> static/js/generate-tab.js -> static/js/feeder-tab.js -> static/js/app.js`
- 3-file cycle: `static/js/app.js -> static/js/image-edit-tab.js -> static/js/image-edit/BlurTool.js -> static/js/app.js`
- 3-file cycle: `static/js/app.js -> static/js/gallery-tab.js -> static/js/style-catalog-tab.js -> static/js/app.js`
- 3-file cycle: `static/js/ai-tab.js -> static/js/app.js -> static/js/gallery-tab.js -> static/js/ai-tab.js`
- 3-file cycle: `static/js/app.js -> static/js/image-edit-tab.js -> static/js/image-edit/Sam3Segmentation.js -> static/js/app.js`
- 4-file cycle: `static/js/feeder-tab.js -> static/js/gallery-tab.js -> static/js/style-catalog-tab.js -> static/js/generate-tab.js -> static/js/feeder-tab.js`
- 4-file cycle: `static/js/app.js -> static/js/workflow-tab.js -> static/js/generate-tab.js -> static/js/feeder-tab.js -> static/js/app.js`
- 4-file cycle: `static/js/app.js -> static/js/prompt-tab.js -> static/js/generate-tab.js -> static/js/feeder-tab.js -> static/js/app.js`
- 4-file cycle: `static/js/app.js -> static/js/gallery-tab.js -> static/js/generate-tab.js -> static/js/feeder-tab.js -> static/js/app.js`
- 5-file cycle: `static/js/app.js -> static/js/generate-tab.js -> static/js/feeder-tab.js -> static/js/gallery-tab.js -> static/js/image-prompt-tab.js -> static/js/app.js`
- 5-file cycle: `static/js/app.js -> static/js/generate-tab.js -> static/js/feeder-tab.js -> static/js/gallery-tab.js -> static/js/style-catalog-tab.js -> static/js/app.js`
- 5-file cycle: `static/js/ai-tab.js -> static/js/app.js -> static/js/generate-tab.js -> static/js/feeder-tab.js -> static/js/gallery-tab.js -> static/js/ai-tab.js`
- 5-file cycle: `static/js/app.js -> static/js/gallery-tab.js -> static/js/style-catalog-tab.js -> static/js/generate-tab.js -> static/js/feeder-tab.js -> static/js/app.js`

## Hyperedges (group relationships)
- **Release & Registry Publish Flow** — claude_release_procedure, github_workflows_publish_trigger, readme_version_badge, github_workflows_publish_action [EXTRACTED 1.00]
- **Duplicate AI UI Implementations (SPA vs Side Panel)** — readme_ai_tab_js, readme_node_sets_menu_js, qwen_chat_integration_plan_shared_client_proposal, qwen_chat_integration_plan_js_duplication_concern [EXTRACTED 1.00]
- **ComfyUI Custom Node Robustness Patterns** — claude_is_changed_caching, claude_validate_inputs_pitfall, claude_hidden_inputs, claude_lazy_inputs, claude_safe_node_loading [INFERRED 0.85]
- **Mask Editor One Inpainting Pipeline** — comfyui-workflow-studio_workflows_ws_inpaint_mask_editor_one_load_checkpoint_node, comfyui-workflow-studio_workflows_ws_inpaint_mask_editor_one_mask_editor_one_node, comfyui-workflow-studio_workflows_ws_inpaint_mask_editor_one_clip_text_encode_positive_node, comfyui-workflow-studio_workflows_ws_inpaint_mask_editor_one_clip_text_encode_negative_node, comfyui-workflow-studio_workflows_ws_inpaint_mask_editor_one_vae_encode_for_inpainting_node, comfyui-workflow-studio_workflows_ws_inpaint_mask_editor_one_save_image_node [INFERRED]

## Communities (148 total, 59 thin omitted)

### Community 0 - "Models Tab Frontend"
Cohesion: 0.08
Nodes (75): applyEmbeddingToPrompt(), applyToGenUI(), badgeHtml(), BATCH_MODEL_TYPES, batchFetchCivitai(), bindBadgeModalEvents(), bindBadgeRowEvents(), bulkAddToGroup() (+67 more)

### Community 1 - "Models API Routes"
Cohesion: 0.06
Nodes (55): handle_change_preview(), handle_civitai_batch(), handle_civitai_cache(), handle_civitai_fetch(), handle_delete_models(), handle_get_disabled(), handle_get_filepath(), handle_get_groups() (+47 more)

### Community 2 - "App Shell & i18n Init"
Cohesion: 0.06
Nodes (57): applyI18nToHtml(), closeModal(), initModal(), _onHelpSearch(), getLang(), getLanguageOptions(), getSummaryLang(), getSummaryLanguageOptions() (+49 more)

### Community 3 - "Prompt Tab Frontend"
Cohesion: 0.08
Nodes (59): refreshStylesList(), addChatMessage(), apiCreatePreset(), apiDeletePreset(), apiUpdatePreset(), applyToGenerateUI(), attachFile(), chatWithAi() (+51 more)

### Community 4 - "Gallery API Routes"
Cohesion: 0.10
Nodes (54): add_to_group(), bulk_favorite(), bulk_group(), clear_group_images(), create_folder_route(), create_group(), delete_folder_route(), delete_group() (+46 more)

### Community 5 - "Gallery Tab Frontend & Toasts"
Cohesion: 0.10
Nodes (54): showToast(), comfyWorkflow, addTag(), API, apiFetch(), _appendNextPage(), _applySelectionToDOM(), _attachScrollSentinel() (+46 more)

### Community 7 - "GenerateUI Feeder Tab"
Cohesion: 0.10
Nodes (50): _applyGalToWorkflow(), _applyPreset(), _applyToGalNode(), _applyToNode(), _applyToWorkflow(), _deletePreset(), _deselectAll(), _feederNodes() (+42 more)

### Community 8 - "Eagle Integration Routes"
Cohesion: 0.06
Nodes (43): _eagle_add(), _eagle_add_from_path(), _eagle_test(), handle_add(), handle_test(), Application, Request, Response (+35 more)

### Community 9 - "Nodes Tab Frontend"
Cohesion: 0.11
Nodes (43): openCompare(), _wireLabValueFilter(), _applyNodeSelectionToDOM(), bulkNodeAddToGroup(), bulkNodeCreateAndAddToGroup(), bulkNodeRemoveFromGroup(), bulkNodeSetFavorite(), categoryBadgeHtml() (+35 more)

### Community 10 - "Nodes API Routes"
Cohesion: 0.09
Nodes (28): handle_create_set(), handle_delete_set(), handle_export_set(), handle_get_groups(), handle_get_metadata(), handle_list_sets(), handle_save_groups(), handle_save_metadata() (+20 more)

### Community 11 - "Settings API Routes"
Cohesion: 0.09
Nodes (44): _apply_import_bundle(), _build_export_bundle(), _find_style(), _get_comfyui_output_dir(), handle_create_style(), handle_delete_style(), handle_export(), handle_get() (+36 more)

### Community 12 - "Index HTML SPA Shell Layout"
Cohesion: 0.05
Nodes (44): AI TOOL Chat pane with Skills management, AI TOOL Skills editor panel (create/edit/delete markdown skills), AI TOOL Tab panel (#wfm-tab-ai), AI TOOL Translation pane (JA/EN/ZH), app.js (ES module entrypoint), Gallery ImagePrompt subtab, Gallery Output subtab panel (3-column: folder tree/grid/detail), Gallery Style_Catalog subtab (+36 more)

### Community 13 - "Metadata Tab Frontend"
Cohesion: 0.11
Nodes (40): buildLoRAItem(), buildModelItem(), buildPromptItem(), collectAllNodes(), collectUnique(), extractAllMetadata(), fromWorkflow(), extractCheckpoints() (+32 more)

### Community 14 - "Node Sets Menu & Sidebar"
Cohesion: 0.08
Nodes (42): AI_BACKEND_DEFAULT_URLS, AI_LANG_NAMES, convertApiToUiWorkflow(), _extractAllMetadata(), _extractWorkflowFromEXIF(), fetchGroups(), fetchMetadata(), fetchNodeSets() (+34 more)

### Community 15 - "Tagger/Prompt i18n Helpers"
Cohesion: 0.11
Nodes (41): _applyDefaultCheckpointIfEnabled(), loadWorkflowIntoEditor(), saveCurrentWorkflow(), t(), _loadPlanWorkflow(), onLoadGenUIClick(), _applyI18n(), _batchStart() (+33 more)

### Community 16 - "Generate Tab Frontend & Modals"
Cohesion: 0.08
Nodes (40): openModal(), _applyNamedStyle(), _applyStyleToWorkflow(), _batchGroupState, _batchStyleSelected, _blobToDataUrl(), _buildFolderTree(), _ckptBatch (+32 more)

### Community 17 - "Gallery Service Core"
Cohesion: 0.10
Nodes (13): GalleryService, Path, 許可するルートパスを更新する（Settings変更時に呼ぶ）, ComfyUI実outputフォルダの不変ルートを設定する（起動時に一度だけ呼ぶ）, パスが許可ルート配下かチェック（パストラバーサル防止）。 Output ギャラリーの _allowed_root、またはComfyUI実outputフォルダの…, outputフォルダのフォルダツリーを返す, 画像と同名の.txtサイドカーにプロンプトテキストを保存する, ワークフローを抽出する。 優先順位: PNG[workflow] > PNG[prompt] > gallery_metadata.json[workflow] (+5 more)

### Community 18 - "Tagger API Routes"
Cohesion: 0.14
Nodes (24): Connection, handle_batch_start(), handle_batch_status(), handle_batch_stop(), handle_db_delete(), handle_db_export(), handle_db_list(), handle_db_save() (+16 more)

### Community 19 - "Workflow Tab Frontend & Storage"
Cohesion: 0.14
Nodes (33): badgeHtml(), _buildStructuredSummaryText(), _buildSummarySourceText(), clearBatch(), closeSidePanel(), deleteWorkflow(), fetchWorkflows(), filterWorkflows() (+25 more)

### Community 20 - "Wildcard Service & Routes"
Cohesion: 0.12
Nodes (21): handle_create_link(), handle_delete(), handle_get_content(), handle_link_status(), handle_list(), handle_remove_link(), handle_save(), Application (+13 more)

### Community 21 - "ComfyUI Client & Editor"
Cohesion: 0.09
Nodes (26): _applyLoraToNode(), _attachPromptWeightControl(), _buildLoraManagerSyntax(), _buildLoraSyntax(), _buildPresetOptions(), _compositeImageWithMask(), _I2I_PLACEHOLDER_DEFAULT, _imageInputToDataURL() (+18 more)

### Community 23 - "GenerateUI Lab Tab"
Cohesion: 0.16
Nodes (31): _applyPlanData(), _buildIndexImageDataUrl(), _buildPlanData(), _clearPlan(), COLUMN_KEYS, _defaultValueFor(), _emptyColumns(), _emptyLabState() (+23 more)

### Community 24 - "Tagger Inference Service"
Cohesion: 0.14
Nodes (5): Image, Path, WD Tagger / DeepDanbooru / Ollama VLM 推論サービス。, パストラバーサル防止: セパレータ・NUL・相対参照を拒否, TaggerService

### Community 25 - "AI Chat/VLM Sidebar Helpers"
Cohesion: 0.11
Nodes (28): _aiApplyGenOptions(), aiCallChat(), aiCallLLM(), aiCallVLM(), aiFetchModels(), aiFileToBase64(), aiLooksUntranslated(), aiSkillDeleteFile() (+20 more)

### Community 26 - "Node Sets Menu UI Components"
Cohesion: 0.14
Nodes (27): ../../scripts/ui/components/button.js, ../../scripts/ui/components/buttonGroup.js, getNodeSetsIcon(), injectStyles(), NODE_SETS_TOOLTIP, attachTopMenuButton(), captureCanvasSnapshot(), compareVersions() (+19 more)

### Community 27 - "Node Sets Draggable Items"
Cohesion: 0.16
Nodes (28): createDraggableItem(), createDraggablePromptItem(), createDraggableWfItem(), esc(), extractPackageName(), getNodeCategory(), getNodePackage(), getWfBadges() (+20 more)

### Community 28 - "Prompts API Routes/Service"
Cohesion: 0.13
Nodes (16): handle_create(), handle_delete(), handle_list(), handle_update(), Application, Request, Response, Prompt presets API routes. (+8 more)

### Community 29 - "Workflow API Routes"
Cohesion: 0.15
Nodes (26): handle_analyze(), handle_change_thumbnail(), handle_delete(), handle_import(), handle_list(), handle_metadata(), handle_raw(), handle_reanalyze_all() (+18 more)

### Community 30 - "Gallery Metadata Store"
Cohesion: 0.13
Nodes (9): GalleryMetadataStore, Path, グループ名を変更し、全画像のgroupsフィールドも更新する, gallery_metadata.json の構造: { "images": { "<abs_path>": { "favorite": bool,…, 存在しないパスをグループから一括削除する（1回の保存で完結）, グループメンバーのパスをsetで返す（高速フィルタ用）, グループ内の全画像を除外する（グループ自体は残す）, 画像のパスキーを変更する（ファイル移動後のメタデータ引継ぎ） (+1 more)

### Community 31 - "Workflow Service Metadata/Import"
Cohesion: 0.13
Nodes (13): Get raw workflow JSON content., Save metadata (tags, memo, summary, etc.) for a workflow., Manages workflow files and metadata., Import workflow files. Returns list of results., Rename workflow and its associated thumbnail., Delete workflow JSON and associated thumbnail., Re-analyze a workflow and save results to metadata., Re-analyze all workflows and update metadata. (+5 more)

### Community 32 - "Lab Plan Service & Routes"
Cohesion: 0.15
Nodes (14): handle_delete(), handle_get_content(), handle_list(), handle_save(), handle_save_index_to_output(), Application, Request, Response (+6 more)

### Community 33 - "Skill Service & Routes"
Cohesion: 0.14
Nodes (16): handle_delete(), handle_get_content(), handle_list(), handle_save(), Application, Request, Response, AI skill (.md system prompt) file management API routes. (+8 more)

### Community 36 - "DEVLOG Early History & Manager Registration"
Cohesion: 0.13
Nodes (23): ComfyUI Manager Registration, Path Traversal Vulnerability Fix, Project Rename to ComfyUI-Workflow-Studio, v0.1.0 Initial Release, qwen_chat_routes.py (planned py/routes/qwen_chat_routes.py), ComfyUI-Workflow-Studio README, Canvas Snapshot Feature, Eagle Integration (+15 more)

### Community 37 - "CivitAI Service"
Cohesion: 0.15
Nodes (11): CivitaiService, Build request headers, optionally including Bearer token., Calculate SHA256 hash of a file., Fetch model version info from CivitAI by SHA256 hash (GET). 429/5xx…, POST /model-versions/by-hash でハッシュリストを一括取得（最大100件/リクエスト）。 レスポンスの…, Extract relevant fields from CivitAI API response., Batch fetch CivitAI info for multiple model files. Phase 1: SHA256…, Clear cache for a specific hash or all. (+3 more)

### Community 39 - "Node Sets Menu Model Fetch"
Cohesion: 0.19
Nodes (23): createModelItem(), add(), fetchModelList(), fetchWorkflowRaw(), getCanvasDropPos(), installCanvasDropHandler(), loadWorkflowOnCanvas(), matchesModelSearch() (+15 more)

### Community 40 - "Gallery Metadata/Service Bridge"
Cohesion: 0.10
Nodes (13): Gallery Metadata Store - ギャラリー画像のメタデータ永続化, _clean_vault_tags(), _decode_image_data_url(), _FolderCache, _parse_vault_yaml_leaves(), Gallery Service - outputフォルダの画像管理、メタデータ閲覧, フォルダ単位の画像スキャン結果キャッシュ。 フォルダのmtimeが変わった場合、またはTTL超過時に再スキャンする。, data URL (data:<mime>;base64,<data>) をデコードし (バイト列, 拡張子) を返す。 ヘッダが無ければPNG扱い（旧互換）。 (+5 more)

### Community 41 - "AI Tool Tab Frontend"
Cohesion: 0.16
Nodes (22): buildTranslationMessages(), cleanTranslationOutput(), fetchModels(), generateImageFromChat(), initAiTab(), initChatTab(), sendMessage(), initSettingsTab() (+14 more)

### Community 42 - "Image Prompt Tab"
Cohesion: 0.20
Nodes (21): activateImagePromptTab(), addSelectedToChips(), API, apiFetch(), cleanPromptText(), clearAllChips(), copyFinalPrompt(), createThumbCard() (+13 more)

### Community 43 - "Qwen Chat Integration Plan"
Cohesion: 0.12
Nodes (21): Bounded Module-level Cache Pattern, prestartup_script.py Early Env Setup, AI TOOL Chat Pane + Wildcard Generation, Qwen Chat Integration Plan, chat_engine.py (planned py/services/qwen_chat/engine.py), chat_state.py (planned py/services/qwen_chat/state.py), chat_TE Custom Node, chat_template.py (planned py/services/qwen_chat/template.py) (+13 more)

### Community 44 - "SDXL 3D Pose Editor DWPose Workflow"
Cohesion: 0.19
Nodes (20): CLIP Text Encode Negative Prompt Node, CLIP Text Encode Positive Prompt Node, Inpaint with Mask Editor One (Workflow Screenshot), Load Checkpoint Node, Mask Editor One Node, Save Image Node, VAE Encode (for Inpainting) Node, 3D Pose Editor Node (comfyui-vrm-pose-editor) (+12 more)

### Community 45 - "DEVLOG Batch/Group UI Evolution"
Cohesion: 0.12
Nodes (20): Batch Group Selection UI for Lora/Prompt/Workflow, Card View Removal + 4-Type Batch Switching UI (v0.3.22), Model Batch Group Registration UI (Thumb/Card/Table), Prompt/Workflow Batch Group Registration UI, Batch Reserved Group System (Workflow/Prompt/Models), GenerateUI Batch Tab Addition (v0.3.18), GenerateUI Checkpoint Batch Redesign — Folder Tree + Pause/Resume (v0.3.4), CivitAI Batch Integration Overhaul (v0.3.19) (+12 more)

### Community 46 - "Style Catalog Tab"
Cohesion: 0.21
Nodes (19): selectStyleByName(), loadFileIntoMetadataTab(), activateStyleCatalogTab(), API, apiFetch(), copyText(), createThumbCard(), debounce() (+11 more)

### Community 47 - "DEVLOG Feeder & Gallery Features"
Cohesion: 0.15
Nodes (19): __Feeder__ Group Protection + Thumbnail F Button + Seed Validation Bug Fix, Feeder Tab, Feeder Tab UI Improvements (Root Auto-Select, Preview Pane, RUN Preview), Gallery Background Prompt Indexing (Event-Loop Blocking Fix), Gallery Image Download / Bulk ZIP Export, WFS_GalleryFeeder ComfyUI Canvas Controls Extension, Gallery Feeder Feature (WFS_GalleryFeeder Node), Gallery Tab Performance Overhaul (Thumbnails, Infinite Scroll, Bulk API, Compare Mode, Prompt Search) (+11 more)

### Community 48 - "AI Tool Tab Frontend"
Cohesion: 0.18
Nodes (18): appendChatBubble(), _appendSkillSaveButton(), _appendSvgPreview(), _extractSkillBlock(), _extractSvgCode(), _getActiveSkillSystemPrompt(), IMAGE_GEN_TOOLS, LANG_NAMES (+10 more)

### Community 50 - "CLAUDE.md Node Dev Rules"
Cohesion: 0.15
Nodes (18): CLAUDE.md Development Guidelines, ComfyUI Restart Required After Python Change, Pre-Commit Checklist, Loose Dependency Pinning Policy, Source Repo vs custom_nodes Deploy Sync, folder_paths-based File Path Handling, Hidden Inputs (UNIQUE_ID/PROMPT/EXTRA_PNGINFO), IS_CHANGED Cache Control (+10 more)

### Community 51 - "DEVLOG Subgraph & Advanced Sampling"
Cohesion: 0.12
Nodes (18): Advanced Sampling Workflow Support, DynamicCombo Subgraph Slot Bug Fix, Ernie Image Workflow Support, Subgraph Fan-out Boundary Value Bug Fix, Input Image Placeholder Feature, KREA-2 Workflow Support, Lab Index Image Output Save, Lab T2I Mode Support (+10 more)

### Community 52 - "DEVLOG LoRA Pane & Batch Tab"
Cohesion: 0.16
Nodes (18): Batch Tab Sampler/Scheduler Support + Models Thumbnail Bug Fix, GenerateUI Batch Tab, Group Orphan Entry Auto-Cleanup + Gallery Shift-Click Range Select, Group Data Loss Bug Fix (Path Separator Mismatch on Windows), GenUI Model LoRA Reset-on-Retab Bug Fix, LoRA Pane (GenerateUI), LoRA Pane Single/Stack Tab Split, LoRA Section Integration + Help Tab Sidebar Layout (+10 more)

### Community 53 - "ComfyUI Workflow Utilities"
Cohesion: 0.20
Nodes (13): _CONTROL_AFTER_GENERATE, _findInjectedWidgetIndex(), _flattenSubgraphs(), _getDynamicComboSubNames(), _getWidgetInputNames(), _getWidgetInputTypes(), _isExtraWidgetValue(), _isLinkedWidgetName() (+5 more)

### Community 54 - "Generate Tab Frontend & Modals"
Cohesion: 0.20
Nodes (18): _buildSimpleGroupList(), _getGroupSelCount(), _getGroupSelCountFrom(), initBatchTab(), _loadBatchCheckpointGroups(), _loadBatchLoraGroups(), _loadPromptGroupsForBatch(), _loadWorkflowGroupsForBatch() (+10 more)

### Community 55 - "DEVLOG AI Chat & Comic Creator Bridges"
Cohesion: 0.12
Nodes (17): AI TOOL Chat Image Attachment + I2I, AI TOOL Chat Tool Calling Image Generation, AI Translation Reliability Fix, Bypass Node Generation Failure Fix, Checkpoint Silent Substitution Bug Fix, Comic Creator Integration Bridges, Comic Creator Manga Bridge, Dev/Deploy Folder Sync Issue (+9 more)

### Community 57 - "Image Edit Background Removal"
Cohesion: 0.17
Nodes (5): Layer, MASK_TEXT_FONTS, fitToCanvas(), TOOL_DEFS, TEXT_FONTS

### Community 59 - "DEVLOG Image Edit Tool Additions"
Cohesion: 0.16
Nodes (15): ABR Brush Support, Blur Tool / BG Remove Tool, Clipping Mask Feature, Draw/Mask Layer-Canvas Compositing Bug Fix, Image Edit Filter Tool (G'MIC-Qt), Mask Editor One Integration, Image Edit Mask Tool, Mask Tool 5 Subtools (+7 more)

### Community 60 - "G'MIC Routes"
Cohesion: 0.21
Nodes (14): _gmic_run_gui(), handle_open(), handle_result(), handle_status(), Application, Request, Response, G'MIC-Qt integration API routes. (+6 more)

### Community 61 - "Ollama Routes"
Cohesion: 0.23
Nodes (14): _get_ollama_config(), handle_chat(), handle_models(), handle_test(), Application, Request, Response, Ollama API proxy routes. (+6 more)

### Community 63 - "Workflow Analyzer"
Cohesion: 0.20
Nodes (13): analyze_workflow(), _clip_type_from_ui_node(), _collect_all_ui_nodes(), _detect_model_type_from_name(), _model_name_from_api_node(), _model_name_from_ui_node(), Workflow analyzer - detects model types and counts input/output nodes., Analyze workflow JSON and return model types, input/output node counts. (+5 more)

### Community 65 - "AI Tool Tab Frontend"
Cohesion: 0.26
Nodes (12): _applyGenOptions(), callChat(), callLLM(), callVLM(), _clearToolsImage(), fileToBase64(), _formatMessagesForBackend(), initVlmTab() (+4 more)

### Community 66 - "GenerateUI Lab Tab"
Cohesion: 0.23
Nodes (13): _applyStyleToText(), _buildWorkflowForIteration(), _cellHtml(), _cellLabel(), _effectiveDisplayValue(), _initColumnButtons(), _isEmptyValue(), _isLiveDisplay() (+5 more)

### Community 67 - "Gallery Service Vault Helpers"
Cohesion: 0.17
Nodes (6): os.scandir() で画像ファイルを1回のシステムコールで列挙。 キャッシュがあればそれを返す。 Returns: [(name,…, os.walk() でフォルダ配下を再帰的に列挙する（サブフォルダの画像も含む）。 ImagePrompt/Style…, 指定フォルダ内の画像一覧を返す（recursive=Trueならサブフォルダも含める）, 画像のプロンプトテキストを返す。 1. 画像と同名の .txt サイドカーがあればそれを使う 2. 無ければ ponyxlWildcardsVault 形式…, image_path の祖先を辿り、直下に thumbnails(_option2) を持つフォルダ…, ponyxlWildcardsVault形式のフォールバック解決。 thumbnails_option2 の "{leaf}.preview3.ext"…

### Community 70 - "Gallery Feeder Extension (Frontend)"
Cohesion: 0.36
Nodes (11): beforeRegisterNodeDef(), fetchGroupImages(), getInputWidget(), getOrCreate(), _ns, setWidgetValue(), startLoop(), stopLoop() (+3 more)

### Community 71 - "Node Sets Theme Panel"
Cohesion: 0.24
Nodes (12): applyTheme(), buildThemePanel(), createPanel(), fetchModelGroups(), fetchModelMetadata(), fetchPrompts(), fetchWorkflows(), loadModelsData() (+4 more)

### Community 72 - "DEVLOG Prompt Tab & Wildcard Features"
Cohesion: 0.24
Nodes (11): A1111-style SPA-side Wildcard Expansion, Prompt Tab AI Assistant LM Studio Backend Support, API-format Workflow Canvas Load Bug Fix, GenerateUI Prompt/Input Tab, GenerateUI Improvements: LoRA Stack Trigger Sync, Reset Workflow Button, Input Tab Tabification, ImpactWildcardEncode/Processor Prompt Detection Bug Fix, model-and-prompt-from-metadata Custom Node Pack Support, Send to Canvas Feature (localStorage + Title Drag) (+3 more)

### Community 74 - "Gallery Feeder Node (Backend)"
Cohesion: 0.27
Nodes (4): Path, WFS_GalleryFeeder – Feeds images from a gallery group into a workflow., Gallery グループ内の画像をインデックス順に1枚ずつ出力するノード。, WFS_GalleryFeeder

### Community 75 - "Generate Tab Frontend & Modals"
Cohesion: 0.24
Nodes (6): initGenerateTab(), updateStatus(), highlightJSON(), syncJsonHighlight(), syncScroll(), refreshLabLiveDefaults()

### Community 78 - "Node Sets Metadata Extraction"
Cohesion: 0.36
Nodes (10): _collectAllNodes(), _collectUnique(), fromWorkflow(), _extractCheckpoints(), _extractDiffusionModels(), _extractLoRAs(), _extractMarkdownNoteModels(), addU() (+2 more)

### Community 79 - "Node Sets Prompt Extraction"
Cohesion: 0.33
Nodes (10): _extractPrompts(), _extractPromptsAPI(), _extractPromptsFromNodeSet(), _extractPromptsLiteGraph(), _isPromptStylerNode(), _isSamplerNode(), _isTextEncoderNode(), _resolveEditPlusText() (+2 more)

### Community 80 - "Inpaint Basic Workflow"
Cohesion: 0.53
Nodes (9): CLIP Text Encode (Prompt) - negative conditioning, CLIP Text Encode (Prompt) - positive conditioning, KSampler node (ddim sampler, 30 steps, cfg 4.0, denoise 1.00), Load Checkpoint node (hayochamixIDXL_v11+_bl checkpoint), Load Image node (clipspace painted mask input), Save Image node (ComfyUI filename prefix), VAE Decode node, VAE Encode (for Inpainting) node with grow_mask_by (+1 more)

### Community 81 - "Gallery Service Background Indexing"
Cohesion: 0.25
Nodes (5): Event, バックグラウンドスレッドで未キャッシュ画像のprompt_cacheを構築する。 10枚処理するたびに50msスリープしてメインスレッドへの影響を最小化。, PNG/JPEGからメタデータを抽出し、保存済みメタと合わせて返す, PNGのtEXtチャンクからメタデータを抽出, JPEGのEXIF/commentからメタデータを抽出（簡易）

### Community 82 - "Settings/CivitAI Config Resolution"
Cohesion: 0.28
Nodes (4): Return CivitAI API key. Env var CIVITAI_API_KEY takes priority over…, Merge updates into existing settings., Manages application settings (data/settings.json)., SettingsService

### Community 83 - "GenerateUI Lab Tab"
Cohesion: 0.36
Nodes (9): _coreGenerate(), _expandWildcardsInWorkflow(), _annotatedImageRef(), _maybeSaveIndexImageOnRun(), _runLabBatch(), _setRunUiState(), _waitIfPaused(), getEagleSettings() (+1 more)

### Community 84 - "Style Prompt Seed Import Tool"
Cohesion: 0.36
Nodes (8): clean_tags(), import_category(), main(), parse_yaml_leaves(), Path, Style/Prompt ギャラリー用シードデータ投入スクリプト。 comfyui_prompt_gallery / prompt_builder_proto…, comfyui_prompt_gallery の parseYamlForImages と同じ簡易パーサ（PyYAML不要）。 「key:」行の直後が「-…, 1カテゴリ分を投入する。戻り値: (copied, images_without_prompt, leaves_total)

### Community 85 - "FireRed 3D Pose Image Edit Workflow"
Cohesion: 0.32
Nodes (8): 3D Pose Editor node, FireRed-Image-Edit-1.1_fp8mixed_comfy.safetensors, FireRed-Image-Edit-1.0-Lightning-8steps-v1.0.safetensors (LoRA), Image Edit (FireRed Image Edit 1.1) node, qwen_2.5_vl_7b_fp8_scaled.safetensors (CLIP), qwen_image_vae.safetensors (VAE), Save Image node, 3D Pose Editor to Image Edit (Fire Red) Workflow

### Community 87 - "DWPose Image Feeder Workflow"
Cohesion: 0.52
Nodes (7): DWPose Image Feeder Workflow, Apply ControlNet Node, DWPose Estimator Node (comfyui-controlnet-aux), Image Feeder Node (comfyui-image-feeder), KSampler Node, Load Checkpoint Node (animagineXLRealistic_v6), Load ControlNet Model Node (OpenPoseXL2)

### Community 88 - "DEVLOG AI Chat SVG & Help Redesign"
Cohesion: 0.29
Nodes (7): AI TOOL Chat SVG Generation, AI Skills Mechanism, Eagle Auto-Save SVG Support, Gallery Tab SVG Support, Help Tab 3-Piece Update Convention, Help Tab Card Format Redesign, Node Tab Multi-Select Bulk Operations

### Community 89 - "DEVLOG GenerateUI Model Tab Features"
Cohesion: 0.33
Nodes (7): Embedding GenUI PP/NP + Prompt Tab Embedding Selector, GenerateUI Model Tab, GenUI Model Tab GGUF Extension (Diffusion/Text Encoder), GenerateUI Hypernetwork Support, GenUI Settings LATENT IMAGE Presets, v0.3.35 Table Sort, Load GenUI Button, Workflow Save, Hypernetwork/Embedding Not Showing Bug Fix (ComfyUI V3 object_info Format)

### Community 90 - "DEVLOG Node Sets & Prompt Preset"
Cohesion: 0.29
Nodes (7): Node Sets Feature, Prompt Preset Feature, Canvas Sidepanel Category/Package Subtabs & Theme, WF & Node Library Sidepanel Expansion, WFS_PromptText Custom Node, Workflow Studio Library Sidepanel Rename, Nodes Tab

### Community 91 - "Settings/CivitAI Config Resolution"
Cohesion: 0.33
Nodes (5): _get_ssl_context(), _make_ssl_context(), CivitAI API integration service., Return an SSL context with CA verification. 1. certifi CA bundle (available in…, Download an image from URL and save to save_path. Returns True on success.

### Community 93 - "Release & Publish Workflow"
Cohesion: 0.40
Nodes (6): Release Procedure, Publish to Comfy Registry Workflow, Comfy-Org/publish-node-action, publish-node Job, pyproject.toml Push Trigger, README Version Badge

### Community 94 - "DEVLOG Style Catalog & ImagePrompt"
Cohesion: 0.40
Nodes (6): Catalog Batch Silent-Stall Fix, GalleryMetadataStore Threading Race Fix, Style/Prompt to ImagePrompt Rename, Sidecar .txt Prompt Storage Design, Style Catalog Gallery Tab, Style/Prompt Visual Gallery

### Community 95 - "DEVLOG Gallery/Models Early Features"
Cohesion: 0.40
Nodes (6): Gallery Folder/File Management, Gallery Tab Phase 1, Group UI Unification Across Tabs, Model Enable/Disable & Bulk Delete, Cross-Type Model Group Display, Models Tab & CivitAI Integration

### Community 96 - "DEVLOG Metadata & Sidepanel I Tab"
Cohesion: 0.40
Nodes (6): Information Tab Canvas Drag-and-Drop + Node Type Extension (v0.3.10), Metadata Tab Addition (v0.3.6), Metadata Tab data9 Support + Undetermined Prompt Text Type (v0.3.8), Metadata Tab Node Type Extension + Settings Text Size UI (v0.3.11), Metadata Tab Subgraph Format Support — Flux.2/Qwen/Z-Image (v0.3.7), Sidepanel I Tab Addition (Information/Metadata) + Topbar Icon Fix (v0.3.9)

### Community 97 - "Prompt Text Node"
Cohesion: 0.33
Nodes (3): WFS_PromptText – Prompt preset node with positive/negative STRING outputs., Outputs positive and negative prompt strings., WFS_PromptText

### Community 98 - "PNG Metadata Extractor"
Cohesion: 0.40
Nodes (4): extract_png_workflow(), Extract ComfyUI workflow JSON from PNG metadata., Extract ComfyUI workflow JSON from PNG byte data. Returns dict or None., Workflow CRUD and metadata management service.

### Community 99 - "Settings/CivitAI Config Resolution"
Cohesion: 0.40
Nodes (3): Resolve workflows dir from settings, falling back to default., _resolve_workflows_dir(), Settings management service.

### Community 101 - "DEVLOG AI Tab & RAW JSON Search"
Cohesion: 0.67
Nodes (4): AI Tab Addition — Ollama/LM Studio Translation + VLM (v0.3.13), AI TOOL Tab English Localization, AI TOOL Tab 3-Pane Redesign + RAW JSON Color Customization (v0.3.14), RAW JSON Panel Search Feature (VSCode-style)

### Community 102 - "DEVLOG Wildcard & Impact Pack"
Cohesion: 0.67
Nodes (3): ImpactWildcardEncode Validation Fix, Impact Pack Symlink Integration, Wildcard Support Panel

## Ambiguous Edges - Review These
- `GenerateUI Feeder Subtab + Workflow Analysis Precision Improvement (v0.3.5)` → `GenerateUI Checkpoint Batch Redesign — Folder Tree + Pause/Resume (v0.3.4)`  [AMBIGUOUS]
  DEVLOG.md · relation: conceptually_related_to
- `Subgraph Workflow Support & Conversion Fix` → `JSON Syntax Highlighting`  [AMBIGUOUS]
  DEVLOG.md · relation: conceptually_related_to

## Knowledge Gaps
- **203 isolated node(s):** `BATCH_MODEL_TYPES`, `FETCH_MAP`, `GENUI_TYPE_MAP`, `RESERVED_GROUPS`, `STACK_MODEL_TYPES` (+198 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **59 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **What is the exact relationship between `GenerateUI Feeder Subtab + Workflow Analysis Precision Improvement (v0.3.5)` and `GenerateUI Checkpoint Batch Redesign — Folder Tree + Pause/Resume (v0.3.4)`?**
  _Edge tagged AMBIGUOUS (relation: conceptually_related_to) - confidence is low._
- **What is the exact relationship between `Subgraph Workflow Support & Conversion Fix` and `JSON Syntax Highlighting`?**
  _Edge tagged AMBIGUOUS (relation: conceptually_related_to) - confidence is low._
- **Why does `showToast()` connect `Gallery Tab Frontend & Toasts` to `Models Tab Frontend`, `App Shell & i18n Init`, `Prompt Tab Frontend`, `GenerateUI Feeder Tab`, `Nodes Tab Frontend`, `Tagger/Prompt i18n Helpers`, `Generate Tab Frontend & Modals`, `Workflow Tab Frontend & Storage`, `GenerateUI Lab Tab`, `AI Tool Tab Frontend`, `Image Prompt Tab`, `Style Catalog Tab`, `AI Tool Tab Frontend`, `Image Edit Blur Tool (BlurTool.js)`, `Image Edit Background Removal`, `AI Tool Tab Frontend`, `GenerateUI Lab Tab`, `Image Edit Background Removal (BgRemove.js)`, `Generate Tab Frontend & Modals`, `Image Edit SAM3 Segmentation`, `GenerateUI Lab Tab`, `Image Edit G'MIC Integration`, `ComfyUI Client & Editor`?**
  _High betweenness centrality (0.038) - this node is a cross-community bridge._
- **Why does `t()` connect `Tagger/Prompt i18n Helpers` to `Models Tab Frontend`, `App Shell & i18n Init`, `Prompt Tab Frontend`, `Gallery Tab Frontend & Toasts`, `GenerateUI Feeder Tab`, `Nodes Tab Frontend`, `Metadata Tab Frontend`, `Generate Tab Frontend & Modals`, `Workflow Tab Frontend & Storage`, `ComfyUI Client & Editor`, `GenerateUI Lab Tab`, `AI Tool Tab Frontend`, `Image Prompt Tab`, `Style Catalog Tab`, `AI Tool Tab Frontend`, `AI Tool Tab Frontend`, `GenerateUI Lab Tab`, `Generate Tab Frontend & Modals`, `GenerateUI Lab Tab`?**
  _High betweenness centrality (0.037) - this node is a cross-community bridge._
- **Why does `GalleryService` connect `Gallery Service Core` to `Gallery Service Vault Helpers`, `Gallery API Routes`, `Gallery Metadata/Service Bridge`, `Gallery Image Prompt Root`, `Gallery Style Catalog Root`, `Gallery Background Index Trigger`, `Gallery Service Background Indexing`, `Gallery Metadata Store`?**
  _High betweenness centrality (0.018) - this node is a cross-community bridge._
- **What connects `BATCH_MODEL_TYPES`, `FETCH_MAP`, `GENUI_TYPE_MAP` to the rest of the system?**
  _203 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Models Tab Frontend` be split into smaller, more focused modules?**
  _Cohesion score 0.08491228070175438 - nodes in this community are weakly interconnected._