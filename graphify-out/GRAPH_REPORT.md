# Graph Report - ComfyUI-Workflow-Studio  (2026-08-22)

## Corpus Check
- 20 files · ~567,102 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 2320 nodes · 5560 edges · 157 communities (79 shown, 78 thin omitted)
- Extraction: 94% EXTRACTED · 6% INFERRED · 0% AMBIGUOUS · INFERRED: 328 edges (avg confidence: 0.87)
- Token cost: 22,191 input · 55,365 output

## Community Hubs (Navigation)
- models-tab.js
- prompt-tab.js
- models_routes.py
- generate-tab.js
- lab-tab.js
- gallery_routes.py
- gallery-tab.js
- ImageEditTab
- ai-tab.js
- Backend API Routes
- feeder-tab.js
- NodesService
- settings_routes.py
- metadata-tab.js
- node_sets_menu.js
- GalleryService
- workflow-tab.js
- tagger_routes.py
- WildcardService
- t
- renderContent
- comfyui-editor.js
- External Plugin Ecosystem
- TaggerService
- top_menu_extension.js
- settings-tab.js
- setupAiHandlers
- PromptsService
- workflow_routes.py
- GalleryMetadataStore
- WorkflowService
- lab_routes.py
- SkillService
- LayerManager
- SelectTool
- CivitaiService
- DrawTool
- MaskTool
- Registry Publish & Docs
- gallery_service.py
- Generate & Export Utilities
- image-prompt-tab.js
- KSampler Node
- ComfyUI Client & Mask Bridge
- style-catalog-tab.js
- add
- comfyui-workflow.js
- BlurTool
- MaskShapeTool
- MaskVectorTool
- ShapeTool
- gmic_routes.py
- ollama_routes.py
- TextTool
- analyze_workflow
- MaskTextTool
- i18n.js
- .list_images
- MaskAlphaTool
- MaskColorTool
- gallery_feeder_extension.js
- createPanel
- util.js
- BgRemove
- Workflow Analyzer Internals
- WFS_GalleryFeeder
- app.js
- InpaintI2IActions
- Sam3Segmentation
- fromWorkflow
- _extractPromptsAPI
- generate_doc_index.py
- WS Inpaint Basic Workflow
- ._bg_index_folder
- SettingsService
- import_style_prompt_seed.py
- Image Edit (FireRed Image Edit 1.1) node
- Version 0.3.9
- DWPose Image Feeder Workflow
- civitai_service.py
- Doc Index Automation
- WFS_PromptText
- workflow_service.py
- Project Directory Layout
- config.py
- Tagger Tab requirements.txt
- Data Storage Files
- AI Tool Version History
- Chinese Language Support
- Version 0.3.95
- Windows Long Path Handling
- Route Registration
- Caching & Unique IDs
- Service Layer
- Lazy Input Evaluation
- HuggingFace Config
- Node Cache Invalidation
- Lab Subtab
- Mask Editor One Release
- PowerShell Encoding
- prestartup_script.py
- .get_image_prompt_root
- .get_style_catalog_root
- .start_background_index
- .update_workflows_dir
- Version 0.4.2
- Workflow Studio Banner
- Workflow Studio Icon
- BiRefNet Model
- Chinese Locale
- SDXL 2D Pose Editor I2I Workflow
- ComfyUI Manager
- Tagger Tab Screenshot (WD Tagger/DeepDanbooru)
- Models Tab UI Screenshot
- Workflow Studio Topbar Icon Strip
- GenerateUI LoRA Stack Tab Screenshot
- Workflow Studio Favicon Icon
- 2D Pose Editor to Image Edit (FireRed) Workflow
- 3D Pose Editor to Image Edit (Flux.2 Klein) Workflow
- SDXL DWPose ControlNet Workflow
- SDXL From Metadata T2I Workflow
- SDXL Img2Img + FaceDetailer Workflow
- SDXL Image Feeder Img2Img Workflow
- SDXL T2I + FaceDetailer Workflow
- GenerateUI Batch Tab Screenshot
- Multiple Select Menu Screenshot
- Image Edit Tab Screenshot
- Workflow Tab Screenshot
- Prompt Tab Input Assistance Screenshot
- GenerateUI Feeder Tab Screenshot
- Workflow Studio Library Panel (Lora Info View)
- Library Panel I Tab (Prompts) Screenshot
- Settings Tab Screenshot (Language, Theme)
- ComfyUI Workflow Studio Thumbnail
- English Locale
- Feeder Subtab
- ComfyUI folder_paths API
- Help & Support Tab
- i18n System
- Japanese Locale
- Metadata Tab
- Node Class Mappings
- OrderedDict Usage
- Output Directory API
- comfyui-workflow-studio
- ComfyUI PromptServer
- python-dotenv
- Silent Failure Diagnosis
- Temp Directory API
- Path Utility
- Input Validation Hook
- SD1.5 Basic Text-to-Image Workflow
- SDXL Text-to-Image Basic Workflow Screenshot

## God Nodes (most connected - your core abstractions)
1. `t()` - 226 edges
2. `showToast()` - 186 edges
3. `ImageEditTab` - 53 edges
4. `escapeHtml()` - 53 edges
5. `GalleryService` - 45 edges
6. `ComfyUI-Workflow-Studio` - 41 edges
7. `initPromptTab()` - 33 edges
8. `setup_routes()` - 32 edges
9. `initSettingsTab()` - 31 edges
10. `add()` - 31 edges

## Surprising Connections (you probably didn't know these)
- `ComfyUI-Workflow-Studio` --references--> `ImagePrompt Gallery Subtab`  [INFERRED]
  CLAUDE.md → README.index.md
- `ComfyUI-Workflow-Studio` --references--> `Prompt Tab`  [INFERRED]
  CLAUDE.md → README.index.md
- `ComfyUI-Workflow-Studio` --references--> `Gallery Tab`  [INFERRED]
  CLAUDE.md → README.index.md
- `ComfyUI-Workflow-Studio` --references--> `GenerateUI Tab`  [INFERRED]
  CLAUDE.md → README.index.md
- `ComfyUI-Workflow-Studio` --references--> `Image Edit Tab`  [INFERRED]
  CLAUDE.md → README.index.md

## Import Cycles
- 3-file cycle: `static/js/app.js -> static/js/image-edit-tab.js -> static/js/image-edit/Sam3Segmentation.js -> static/js/app.js`
- 3-file cycle: `static/js/app.js -> static/js/image-edit-tab.js -> static/js/image-edit/GmicIntegration.js -> static/js/app.js`
- 3-file cycle: `static/js/app.js -> static/js/image-edit-tab.js -> static/js/image-edit/BgRemove.js -> static/js/app.js`
- 3-file cycle: `static/js/app.js -> static/js/generate-tab.js -> static/js/feeder-tab.js -> static/js/app.js`
- 3-file cycle: `static/js/feeder-tab.js -> static/js/gallery-tab.js -> static/js/generate-tab.js -> static/js/feeder-tab.js`
- 3-file cycle: `static/js/app.js -> static/js/gallery-tab.js -> static/js/image-prompt-tab.js -> static/js/app.js`
- 3-file cycle: `static/js/app.js -> static/js/gallery-tab.js -> static/js/style-catalog-tab.js -> static/js/app.js`
- 3-file cycle: `static/js/app.js -> static/js/models-tab.js -> static/js/models/badges.js -> static/js/app.js`
- 3-file cycle: `static/js/app.js -> static/js/models-tab.js -> static/js/comfyui-editor.js -> static/js/app.js`
- 3-file cycle: `static/js/app.js -> static/js/image-edit-tab.js -> static/js/image-edit/InpaintI2IActions.js -> static/js/app.js`
- 3-file cycle: `static/js/app.js -> static/js/image-edit-tab.js -> static/js/image-edit/MaskEditorOneBridge.js -> static/js/app.js`
- 3-file cycle: `static/js/app.js -> static/js/image-edit-tab.js -> static/js/image-edit/BlurTool.js -> static/js/app.js`
- 3-file cycle: `static/js/app.js -> static/js/image-edit-tab.js -> static/js/image-edit/FileExport.js -> static/js/app.js`
- 3-file cycle: `static/js/app.js -> static/js/image-edit-tab.js -> static/js/comfyui-editor.js -> static/js/app.js`
- 3-file cycle: `static/js/ai-tab.js -> static/js/app.js -> static/js/gallery-tab.js -> static/js/ai-tab.js`
- 3-file cycle: `static/js/app.js -> static/js/gallery-tab.js -> static/js/comfyui-editor.js -> static/js/app.js`
- 3-file cycle: `static/js/app.js -> static/js/generate-tab.js -> static/js/comfyui-editor.js -> static/js/app.js`
- 4-file cycle: `static/js/app.js -> static/js/workflow-tab.js -> static/js/generate-tab.js -> static/js/feeder-tab.js -> static/js/app.js`
- 4-file cycle: `static/js/app.js -> static/js/gallery-tab.js -> static/js/generate-tab.js -> static/js/feeder-tab.js -> static/js/app.js`
- 4-file cycle: `static/js/app.js -> static/js/prompt-tab.js -> static/js/generate-tab.js -> static/js/feeder-tab.js -> static/js/app.js`

## Hyperedges (group relationships)
- **Architecture Layers** — workflowstudio, add_routes, py_wfm, py_routes, py_services, business_logic, web_comfyui, static, templates, data, settings_json, metadata_json, node_metadata_json [EXTRACTED 0.80]
- **Workflow JSON Consistency Group** — last_node_id, last_link_id, links, workflow_json [EXTRACTED 0.85]
- **i18n Languages** — i18n, english, japanese, chinese [EXTRACTED 0.90]
- **Graphify Index Generation** — readme_index, devlog_index, generate_doc_index, graphifyignore, readme, devlog, claude_hooks, git_hooks [EXTRACTED 0.85]
- **AI Feature Backends** — ollama, lm_studio, lemonade_server, unsloth [INFERRED 0.80]
- **Image/Gallery Implementation References** — comfyui_custom_scripts, comfyui_gallery, infinite_image_browsing [INFERRED 0.70]
- **Workflow Studio UI Navigation Tabs** — templates_index_html_workflow, templates_index_html_nodes, templates_index_html_models, templates_index_html_generate, templates_index_html_prompt, templates_index_html_gallery, templates_index_html_image_edit, templates_index_html_tagger, templates_index_html_settings, templates_index_html_help, templates_index_html_ai [EXTRACTED 0.85]
- **Mask Editor One Inpainting Pipeline** — comfyui-workflow-studio_workflows_ws_inpaint_mask_editor_one_load_checkpoint_node, comfyui-workflow-studio_workflows_ws_inpaint_mask_editor_one_mask_editor_one_node, comfyui-workflow-studio_workflows_ws_inpaint_mask_editor_one_clip_text_encode_positive_node, comfyui-workflow-studio_workflows_ws_inpaint_mask_editor_one_clip_text_encode_negative_node, comfyui-workflow-studio_workflows_ws_inpaint_mask_editor_one_vae_encode_for_inpainting_node, comfyui-workflow-studio_workflows_ws_inpaint_mask_editor_one_save_image_node [INFERRED]

## Communities (157 total, 78 thin omitted)

### Community 0 - "models-tab.js"
Cohesion: 0.06
Nodes (120): openModal(), t(), badgeHtml(), bindBadgeModalEvents(), bindBadgeRowEvents(), getBadgePalette(), modelBadgesHtml(), _onGridChange() (+112 more)

### Community 1 - "prompt-tab.js"
Cohesion: 0.06
Nodes (107): closeModal(), refreshStylesList(), addChatMessage(), apiCreatePreset(), apiDeletePreset(), apiUpdatePreset(), applyToGenerateUI(), attachFile() (+99 more)

### Community 2 - "models_routes.py"
Cohesion: 0.06
Nodes (55): handle_change_preview(), handle_civitai_batch(), handle_civitai_cache(), handle_civitai_fetch(), handle_delete_models(), handle_get_disabled(), handle_get_filepath(), handle_get_groups() (+47 more)

### Community 3 - "generate-tab.js"
Cohesion: 0.06
Nodes (64): _applyNamedStyle(), _applyStyleToWorkflow(), _batchGroupState, _batchStyleSelected, _blobToDataUrl(), _buildFolderTree(), _buildSimpleGroupList(), _ckptBatch (+56 more)

### Community 4 - "lab-tab.js"
Cohesion: 0.08
Nodes (67): _expandWildcardsInWorkflow(), _annotatedImageRef(), _applyLabLoraToWorkflow(), _applyPlanData(), _applyStyleToText(), _buildIndexImageDataUrl(), _buildLoraPromptInjection(), _buildPlanData() (+59 more)

### Community 5 - "gallery_routes.py"
Cohesion: 0.10
Nodes (54): add_to_group(), bulk_favorite(), bulk_group(), clear_group_images(), create_folder_route(), create_group(), delete_folder_route(), delete_group() (+46 more)

### Community 6 - "gallery-tab.js"
Cohesion: 0.09
Nodes (54): addTag(), API, apiFetch(), _appendNextPage(), _applySelectionToDOM(), _attachScrollSentinel(), bindEvents(), bulkAddToGroup() (+46 more)

### Community 8 - "ai-tab.js"
Cohesion: 0.09
Nodes (51): appendChatBubble(), _appendSkillSaveButton(), _appendSvgPreview(), _applyGenOptions(), buildTranslationMessages(), callChat(), callLLM(), callVLM() (+43 more)

### Community 9 - "Backend API Routes"
Cohesion: 0.05
Nodes (46): aiohttp, Jinja2, py/routes, _eagle_add(), _eagle_add_from_path(), _eagle_test(), handle_add(), handle_test() (+38 more)

### Community 10 - "feeder-tab.js"
Cohesion: 0.10
Nodes (49): _applyGalToWorkflow(), _applyPreset(), _applyToGalNode(), _applyToNode(), _applyToWorkflow(), _deletePreset(), _deselectAll(), _feederNodes() (+41 more)

### Community 11 - "NodesService"
Cohesion: 0.09
Nodes (28): handle_create_set(), handle_delete_set(), handle_export_set(), handle_get_groups(), handle_get_metadata(), handle_list_sets(), handle_save_groups(), handle_save_metadata() (+20 more)

### Community 12 - "settings_routes.py"
Cohesion: 0.09
Nodes (44): _apply_import_bundle(), _build_export_bundle(), _find_style(), _get_comfyui_output_dir(), handle_create_style(), handle_delete_style(), handle_export(), handle_get() (+36 more)

### Community 13 - "metadata-tab.js"
Cohesion: 0.11
Nodes (40): buildLoRAItem(), buildModelItem(), buildPromptItem(), collectAllNodes(), collectUnique(), extractAllMetadata(), fromWorkflow(), extractCheckpoints() (+32 more)

### Community 14 - "node_sets_menu.js"
Cohesion: 0.08
Nodes (37): AI_BACKEND_DEFAULT_URLS, AI_LANG_NAMES, convertApiToUiWorkflow(), _extractAllMetadata(), _extractWorkflowFromEXIF(), fetchGroups(), fetchMetadata(), fetchNodeSets() (+29 more)

### Community 15 - "GalleryService"
Cohesion: 0.10
Nodes (13): GalleryService, Path, 許可するルートパスを更新する（Settings変更時に呼ぶ）, ComfyUI実outputフォルダの不変ルートを設定する（起動時に一度だけ呼ぶ）, パスが許可ルート配下かチェック（パストラバーサル防止）。 Output ギャラリーの _allowed_root、またはComfyUI実outputフォルダの…, outputフォルダのフォルダツリーを返す, 画像と同名の.txtサイドカーにプロンプトテキストを保存する, ワークフローを抽出する。 優先順位: PNG[workflow] > PNG[prompt] > gallery_metadata.json[workflow] (+5 more)

### Community 16 - "workflow-tab.js"
Cohesion: 0.13
Nodes (35): readJsonStorage(), badgeHtml(), _buildStructuredSummaryText(), _buildSummarySourceText(), clearBatch(), closeSidePanel(), deleteWorkflow(), fetchWorkflows() (+27 more)

### Community 17 - "tagger_routes.py"
Cohesion: 0.14
Nodes (24): Connection, handle_batch_start(), handle_batch_status(), handle_batch_stop(), handle_db_delete(), handle_db_export(), handle_db_list(), handle_db_save() (+16 more)

### Community 18 - "WildcardService"
Cohesion: 0.12
Nodes (21): handle_create_link(), handle_delete(), handle_get_content(), handle_link_status(), handle_list(), handle_remove_link(), handle_save(), Application (+13 more)

### Community 19 - "t"
Cohesion: 0.12
Nodes (35): _applyI18n(), _batchStart(), _batchStop(), _dbDelete(), _dbExport(), _dbLoad(), _dbSave(), _dbSearch() (+27 more)

### Community 20 - "renderContent"
Cohesion: 0.14
Nodes (35): createDraggableItem(), createDraggablePromptItem(), createDraggableWfItem(), createModelItem(), esc(), extractPackageName(), fetchModelList(), getNodeCategory() (+27 more)

### Community 21 - "comfyui-editor.js"
Cohesion: 0.08
Nodes (28): _applyLoraToNode(), _attachPromptWeightControl(), _buildLoraManagerSyntax(), _buildLoraSyntax(), _buildPresetOptions(), _compositeImageWithMask(), _I2I_PLACEHOLDER_DEFAULT, _imageInputToDataURL() (+20 more)

### Community 22 - "External Plugin Ecosystem"
Cohesion: 0.06
Nodes (33): Canvas Snapshot, CivitAI, ComfyUI-Custom-Scripts, ComfyUI-Gallery, ComfyUI-Lora-Manager, comfyui-mask-editor-one, README Index — ComfyUI-Workflow-Studio, ComfyUI-Workflow-Studio (+25 more)

### Community 23 - "TaggerService"
Cohesion: 0.14
Nodes (5): Image, Path, WD Tagger / DeepDanbooru / Ollama VLM 推論サービス。, パストラバーサル防止: セパレータ・NUL・相対参照を拒否, TaggerService

### Community 24 - "top_menu_extension.js"
Cohesion: 0.13
Nodes (29): ../../scripts/ui/components/button.js, ../../scripts/ui/components/buttonGroup.js, getNodeSetsIcon(), injectStyles(), NODE_SETS_TOOLTIP, saveSelectedAsNodeSet(), attachTopMenuButton(), beforeRegisterNodeDef() (+21 more)

### Community 25 - "settings-tab.js"
Cohesion: 0.12
Nodes (29): applyCustomFont(), applyCustomOverrides(), applyTheme(), BG_PATTERNS, buildLangOptions(), clearCustomOverrides(), COLOR_TARGETS, FONT_OPTIONS (+21 more)

### Community 26 - "setupAiHandlers"
Cohesion: 0.11
Nodes (28): _aiApplyGenOptions(), aiCallChat(), aiCallLLM(), aiCallVLM(), aiFetchModels(), aiFileToBase64(), aiLooksUntranslated(), aiSkillDeleteFile() (+20 more)

### Community 27 - "PromptsService"
Cohesion: 0.13
Nodes (16): handle_create(), handle_delete(), handle_list(), handle_update(), Application, Request, Response, Prompt presets API routes. (+8 more)

### Community 28 - "workflow_routes.py"
Cohesion: 0.15
Nodes (26): handle_analyze(), handle_change_thumbnail(), handle_delete(), handle_import(), handle_list(), handle_metadata(), handle_raw(), handle_reanalyze_all() (+18 more)

### Community 29 - "GalleryMetadataStore"
Cohesion: 0.13
Nodes (9): GalleryMetadataStore, Path, グループ名を変更し、全画像のgroupsフィールドも更新する, gallery_metadata.json の構造: { "images": { "<abs_path>": { "favorite": bool,…, 存在しないパスをグループから一括削除する（1回の保存で完結）, グループメンバーのパスをsetで返す（高速フィルタ用）, グループ内の全画像を除外する（グループ自体は残す）, 画像のパスキーを変更する（ファイル移動後のメタデータ引継ぎ） (+1 more)

### Community 30 - "WorkflowService"
Cohesion: 0.13
Nodes (13): Get raw workflow JSON content., Save metadata (tags, memo, summary, etc.) for a workflow., Manages workflow files and metadata., Import workflow files. Returns list of results., Rename workflow and its associated thumbnail., Delete workflow JSON and associated thumbnail., Re-analyze a workflow and save results to metadata., Re-analyze all workflows and update metadata. (+5 more)

### Community 31 - "lab_routes.py"
Cohesion: 0.15
Nodes (14): handle_delete(), handle_get_content(), handle_list(), handle_save(), handle_save_index_to_output(), Application, Request, Response (+6 more)

### Community 32 - "SkillService"
Cohesion: 0.14
Nodes (16): handle_delete(), handle_get_content(), handle_list(), handle_save(), Application, Request, Response, AI skill (.md system prompt) file management API routes. (+8 more)

### Community 35 - "CivitaiService"
Cohesion: 0.15
Nodes (11): CivitaiService, Build request headers, optionally including Bearer token., Calculate SHA256 hash of a file., Fetch model version info from CivitAI by SHA256 hash (GET). 429/5xx…, POST /model-versions/by-hash でハッシュリストを一括取得（最大100件/リクエスト）。 レスポンスの…, Extract relevant fields from CivitAI API response., Batch fetch CivitAI info for multiple model files. Phase 1: SHA256…, Clear cache for a specific hash or all. (+3 more)

### Community 38 - "Registry Publish & Docs"
Cohesion: 0.10
Nodes (22): actions/checkout@v4, Comfy-Org/publish-node-action@main, DEVLOG.md, Publish to Comfy Registry Workflow, graphifyignore, main Branch, pyproject.toml, README.md (+14 more)

### Community 39 - "gallery_service.py"
Cohesion: 0.10
Nodes (13): Gallery Metadata Store - ギャラリー画像のメタデータ永続化, _clean_vault_tags(), _decode_image_data_url(), _FolderCache, _parse_vault_yaml_leaves(), Gallery Service - outputフォルダの画像管理、メタデータ閲覧, フォルダ単位の画像スキャン結果キャッシュ。 フォルダのmtimeが変わった場合、またはTTL超過時に再スキャンする。, data URL (data:<mime>;base64,<data>) をデコードし (バイト列, 拡張子) を返す。 ヘッダが無ければPNG扱い（旧互換）。 (+5 more)

### Community 40 - "Generate & Export Utilities"
Cohesion: 0.17
Nodes (8): showToast(), _applyDefaultCheckpointIfEnabled(), loadWorkflowIntoEditor(), saveCurrentWorkflow(), FileExport, GmicIntegration, _loadPlanWorkflow(), onLoadGenUIClick()

### Community 41 - "image-prompt-tab.js"
Cohesion: 0.20
Nodes (21): activateImagePromptTab(), addSelectedToChips(), API, apiFetch(), cleanPromptText(), clearAllChips(), copyFinalPrompt(), createThumbCard() (+13 more)

### Community 42 - "KSampler Node"
Cohesion: 0.19
Nodes (20): CLIP Text Encode Negative Prompt Node, CLIP Text Encode Positive Prompt Node, Inpaint with Mask Editor One (Workflow Screenshot), Load Checkpoint Node, Mask Editor One Node, Save Image Node, VAE Encode (for Inpainting) Node, 3D Pose Editor Node (comfyui-vrm-pose-editor) (+12 more)

### Community 43 - "ComfyUI Client & Mask Bridge"
Cohesion: 0.16
Nodes (8): comfyUI, comfyEditor, comfyWorkflow, MaskEditorOneBridge, MASK_TEXT_FONTS, fitToCanvas(), TOOL_DEFS, TEXT_FONTS

### Community 44 - "style-catalog-tab.js"
Cohesion: 0.22
Nodes (18): selectStyleByName(), activateStyleCatalogTab(), API, apiFetch(), copyText(), createThumbCard(), debounce(), initStyleCatalogTab() (+10 more)

### Community 45 - "add"
Cohesion: 0.22
Nodes (19): add(), fetchWorkflowRaw(), getCanvasDropPos(), handleInfoFile(), installCanvasDropHandler(), loadWorkflowOnCanvas(), placeClipTextEncodeNode(), placeLoraMgrNode() (+11 more)

### Community 46 - "comfyui-workflow.js"
Cohesion: 0.20
Nodes (13): _CONTROL_AFTER_GENERATE, _findInjectedWidgetIndex(), _flattenSubgraphs(), _getDynamicComboSubNames(), _getWidgetInputNames(), _getWidgetInputTypes(), _isExtraWidgetValue(), _isLinkedWidgetName() (+5 more)

### Community 51 - "gmic_routes.py"
Cohesion: 0.21
Nodes (14): _gmic_run_gui(), handle_open(), handle_result(), handle_status(), Application, Request, Response, G'MIC-Qt integration API routes. (+6 more)

### Community 52 - "ollama_routes.py"
Cohesion: 0.23
Nodes (14): _get_ollama_config(), handle_chat(), handle_models(), handle_test(), Application, Request, Response, Ollama API proxy routes. (+6 more)

### Community 54 - "analyze_workflow"
Cohesion: 0.20
Nodes (13): analyze_workflow(), _clip_type_from_ui_node(), _collect_all_ui_nodes(), _detect_model_type_from_name(), _model_name_from_api_node(), _model_name_from_ui_node(), Workflow analyzer - detects model types and counts input/output nodes., Analyze workflow JSON and return model types, input/output node counts. (+5 more)

### Community 56 - "i18n.js"
Cohesion: 0.17
Nodes (12): getLang(), getLanguageOptions(), getSummaryLang(), getSummaryLanguageOptions(), getSummaryPrompt(), LANGUAGE_OPTIONS, LANGUAGES, setLang() (+4 more)

### Community 57 - ".list_images"
Cohesion: 0.17
Nodes (6): os.scandir() で画像ファイルを1回のシステムコールで列挙。 キャッシュがあればそれを返す。 Returns: [(name,…, os.walk() でフォルダ配下を再帰的に列挙する（サブフォルダの画像も含む）。 ImagePrompt/Style…, 指定フォルダ内の画像一覧を返す（recursive=Trueならサブフォルダも含める）, 画像のプロンプトテキストを返す。 1. 画像と同名の .txt サイドカーがあればそれを使う 2. 無ければ ponyxlWildcardsVault 形式…, image_path の祖先を辿り、直下に thumbnails(_option2) を持つフォルダ…, ponyxlWildcardsVault形式のフォールバック解決。 thumbnails_option2 の "{leaf}.preview3.ext"…

### Community 60 - "gallery_feeder_extension.js"
Cohesion: 0.36
Nodes (11): beforeRegisterNodeDef(), fetchGroupImages(), getInputWidget(), getOrCreate(), _ns, setWidgetValue(), startLoop(), stopLoop() (+3 more)

### Community 61 - "createPanel"
Cohesion: 0.24
Nodes (12): applyTheme(), buildThemePanel(), createPanel(), fetchModelGroups(), fetchModelMetadata(), fetchPrompts(), fetchWorkflows(), loadModelsData() (+4 more)

### Community 62 - "util.js"
Cohesion: 0.31
Nodes (10): AI_BACKEND_DEFAULT_URLS, _bytesToDataUrl(), _dataUrlToBytes(), embedPngTextChunk(), getEagleSettings(), getSettings(), _joinBytes(), _n2b() (+2 more)

### Community 64 - "Workflow Analyzer Internals"
Cohesion: 0.20
Nodes (10): EXTRA_PNGINFO, last_link_id, last_node_id, links array, Position Index, PROMPT, widgets_values, workflow_analyzer.py (+2 more)

### Community 65 - "WFS_GalleryFeeder"
Cohesion: 0.27
Nodes (4): Path, WFS_GalleryFeeder – Feeds images from a gallery group into a workflow., Gallery グループ内の画像をインデックス順に1枚ずつ出力するノード。, WFS_GalleryFeeder

### Community 66 - "app.js"
Cohesion: 0.22
Nodes (7): applyI18nToHtml(), initModal(), _onHelpSearch(), initI18n(), applyJsonColors(), applyModelTabActiveColor(), applyTextareaFontSize()

### Community 69 - "fromWorkflow"
Cohesion: 0.36
Nodes (10): _collectAllNodes(), _collectUnique(), fromWorkflow(), _extractCheckpoints(), _extractDiffusionModels(), _extractLoRAs(), _extractMarkdownNoteModels(), addU() (+2 more)

### Community 70 - "_extractPromptsAPI"
Cohesion: 0.33
Nodes (10): _extractPrompts(), _extractPromptsAPI(), _extractPromptsFromNodeSet(), _extractPromptsLiteGraph(), _isPromptStylerNode(), _isSamplerNode(), _isTextEncoderNode(), _resolveEditPlusText() (+2 more)

### Community 71 - "generate_doc_index.py"
Cohesion: 0.31
Nodes (7): main(), PostToolUse hook: regenerate README.index.md / DEVLOG.index.md right after…, Path, generate_devlog_index(), generate_readme_index(), main(), Regenerate README.index.md / DEVLOG.index.md from README.md / DEVLOG.md.…

### Community 72 - "WS Inpaint Basic Workflow"
Cohesion: 0.53
Nodes (9): CLIP Text Encode (Prompt) - negative conditioning, CLIP Text Encode (Prompt) - positive conditioning, KSampler node (ddim sampler, 30 steps, cfg 4.0, denoise 1.00), Load Checkpoint node (hayochamixIDXL_v11+_bl checkpoint), Load Image node (clipspace painted mask input), Save Image node (ComfyUI filename prefix), VAE Decode node, VAE Encode (for Inpainting) node with grow_mask_by (+1 more)

### Community 73 - "._bg_index_folder"
Cohesion: 0.25
Nodes (5): Event, バックグラウンドスレッドで未キャッシュ画像のprompt_cacheを構築する。 10枚処理するたびに50msスリープしてメインスレッドへの影響を最小化。, PNG/JPEGからメタデータを抽出し、保存済みメタと合わせて返す, PNGのtEXtチャンクからメタデータを抽出, JPEGのEXIF/commentからメタデータを抽出（簡易）

### Community 74 - "SettingsService"
Cohesion: 0.28
Nodes (4): Return CivitAI API key. Env var CIVITAI_API_KEY takes priority over…, Merge updates into existing settings., Manages application settings (data/settings.json)., SettingsService

### Community 75 - "import_style_prompt_seed.py"
Cohesion: 0.36
Nodes (8): clean_tags(), import_category(), main(), parse_yaml_leaves(), Path, Style/Prompt ギャラリー用シードデータ投入スクリプト。 comfyui_prompt_gallery / prompt_builder_proto…, comfyui_prompt_gallery の parseYamlForImages と同じ簡易パーサ（PyYAML不要）。 「key:」行の直後が「-…, 1カテゴリ分を投入する。戻り値: (copied, images_without_prompt, leaves_total)

### Community 76 - "Image Edit (FireRed Image Edit 1.1) node"
Cohesion: 0.32
Nodes (8): 3D Pose Editor node, FireRed-Image-Edit-1.1_fp8mixed_comfy.safetensors, FireRed-Image-Edit-1.0-Lightning-8steps-v1.0.safetensors (LoRA), Image Edit (FireRed Image Edit 1.1) node, qwen_2.5_vl_7b_fp8_scaled.safetensors (CLIP), qwen_image_vae.safetensors (VAE), Save Image node, 3D Pose Editor to Image Edit (Fire Red) Workflow

### Community 77 - "Version 0.3.9"
Cohesion: 0.25
Nodes (8): Models Tab, Nodes Tab, Prompt Tab, Version 0.1.2, Version 0.1.7, Version 0.2.3, Version 0.3.9, Workflow Tab

### Community 78 - "DWPose Image Feeder Workflow"
Cohesion: 0.52
Nodes (7): DWPose Image Feeder Workflow, Apply ControlNet Node, DWPose Estimator Node (comfyui-controlnet-aux), Image Feeder Node (comfyui-image-feeder), KSampler Node, Load Checkpoint Node (animagineXLRealistic_v6), Load ControlNet Model Node (OpenPoseXL2)

### Community 79 - "civitai_service.py"
Cohesion: 0.33
Nodes (5): _get_ssl_context(), _make_ssl_context(), CivitAI API integration service., Return an SSL context with CA verification. 1. certifi CA bundle (available in…, Download an image from URL and save to save_path. Returns True on success.

### Community 80 - "Doc Index Automation"
Cohesion: 0.40
Nodes (6): on_doc_edit.py, DEVLOG.index.md, generate_doc_index.py, pre-commit, graphify, README.index.md

### Community 81 - "WFS_PromptText"
Cohesion: 0.33
Nodes (3): WFS_PromptText – Prompt preset node with positive/negative STRING outputs., Outputs positive and negative prompt strings., WFS_PromptText

### Community 82 - "workflow_service.py"
Cohesion: 0.40
Nodes (4): extract_png_workflow(), Extract ComfyUI workflow JSON from PNG metadata., Extract ComfyUI workflow JSON from PNG byte data. Returns dict or None., Workflow CRUD and metadata management service.

### Community 83 - "Project Directory Layout"
Cohesion: 0.40
Nodes (5): ComfyUI, SPA, static, templates, web/comfyui

### Community 84 - "config.py"
Cohesion: 0.40
Nodes (3): Resolve workflows dir from settings, falling back to default., _resolve_workflows_dir(), Settings management service.

### Community 85 - "Tagger Tab requirements.txt"
Cohesion: 0.40
Nodes (5): Tagger Tab requirements.txt, onnxruntime (WD Tagger / SwinV2), piexif (JPEG EXIF tag writing), python-dotenv (Unsloth .env loading), tensorflow (optional, DeepDanbooru)

### Community 86 - "Data Storage Files"
Cohesion: 0.50
Nodes (4): data directory, metadata.json, node_metadata.json, settings.json

### Community 87 - "AI Tool Version History"
Cohesion: 0.67
Nodes (3): AI TOOL Tab, Version 0.3.14, Version 0.3.99

### Community 88 - "Chinese Language Support"
Cohesion: 1.00
Nodes (3): Chinese Language Support, English Language Support, Japanese Language Support

### Community 89 - "Version 0.3.95"
Cohesion: 0.67
Nodes (3): ImagePrompt Gallery Subtab, Style_Catalog Subtab, Version 0.3.95

### Community 90 - "Windows Long Path Handling"
Cohesion: 0.67
Nodes (3): LongPathsEnabled, MAX_PATH, Windows

## Knowledge Gaps
- **228 isolated node(s):** `state`, `groups`, `state`, `WF_RESERVED_GROUPS`, `AI_BACKEND_DEFAULT_URLS` (+223 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **78 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `showToast()` connect `Generate & Export Utilities` to `models-tab.js`, `prompt-tab.js`, `generate-tab.js`, `lab-tab.js`, `gallery-tab.js`, `ImageEditTab`, `ai-tab.js`, `feeder-tab.js`, `workflow-tab.js`, `t`, `comfyui-editor.js`, `settings-tab.js`, `LayerManager`, `image-prompt-tab.js`, `ComfyUI Client & Mask Bridge`, `style-catalog-tab.js`, `BlurTool`, `BgRemove`, `app.js`, `InpaintI2IActions`, `Sam3Segmentation`?**
  _High betweenness centrality (0.062) - this node is a cross-community bridge._
- **Why does `t()` connect `models-tab.js` to `prompt-tab.js`, `app.js`, `generate-tab.js`, `lab-tab.js`, `gallery-tab.js`, `ai-tab.js`, `Generate & Export Utilities`, `feeder-tab.js`, `image-prompt-tab.js`, `style-catalog-tab.js`, `metadata-tab.js`, `workflow-tab.js`, `t`, `comfyui-editor.js`, `i18n.js`, `settings-tab.js`?**
  _High betweenness centrality (0.048) - this node is a cross-community bridge._
- **Why does `GalleryService` connect `GalleryService` to `gallery_routes.py`, `.get_image_prompt_root`, `gallery_service.py`, `.get_style_catalog_root`, `._bg_index_folder`, `.start_background_index`, `.list_images`, `GalleryMetadataStore`?**
  _High betweenness centrality (0.027) - this node is a cross-community bridge._
- **What connects `state`, `groups`, `state` to the rest of the system?**
  _228 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `models-tab.js` be split into smaller, more focused modules?**
  _Cohesion score 0.06185919343814081 - nodes in this community are weakly interconnected._
- **Should `prompt-tab.js` be split into smaller, more focused modules?**
  _Cohesion score 0.05572545022086307 - nodes in this community are weakly interconnected._
- **Should `models_routes.py` be split into smaller, more focused modules?**
  _Cohesion score 0.0554954954954955 - nodes in this community are weakly interconnected._