# Graph Report - ComfyUI-Workflow-Studio  (2026-08-19)

## Corpus Check
- Large corpus: 127 files · ~584,927 words. Semantic extraction will be expensive (many Claude tokens). Consider running on a subfolder.

## Summary
- 2094 nodes · 5083 edges · 112 communities (67 shown, 45 thin omitted)
- Extraction: 96% EXTRACTED · 4% INFERRED · 0% AMBIGUOUS · INFERRED: 214 edges (avg confidence: 0.51)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- Image Edit Layer & Draw Tools
- Models Tab Frontend
- Models API Routes
- Generate Tab Frontend & Modals
- Prompt Tab Frontend
- Gallery API Routes
- AI Tool Tab Frontend
- Gallery Tab Frontend & Toasts
- App Shell & i18n Init
- GenerateUI Feeder Tab
- GenerateUI Lab Tab
- Nodes Tab Frontend
- Nodes API Routes
- Index HTML SPA Shell Layout
- Metadata Tab Frontend
- Node Sets Menu & Sidebar
- Settings API Routes
- Tagger/Prompt i18n Helpers
- Gallery Service Core
- Workflow Tab Frontend & Storage
- Tagger API Routes
- Wildcard Service & Routes
- ComfyUI Client & Editor
- Tagger Inference Service
- AI Chat/VLM Sidebar Helpers
- CivitAI Service
- Node Sets Menu UI Components
- Node Sets Draggable Items
- Prompts API Routes/Service
- Workflow API Routes
- Gallery Metadata Store
- Workflow Service Metadata/Import
- Lab Plan Service & Routes
- Skill Service & Routes
- Image Edit Select Tool
- Style Catalog Tab
- Image Edit Draw Tool
- Image Edit Mask Tool
- Node Sets Menu Model Fetch
- Gallery Metadata/Service Bridge
- Eagle Integration Routes
- Image Prompt Tab
- ComfyUI Workflow Utilities
- Image Edit Background Removal
- Image Edit Layer Manager Core
- Settings/CivitAI Config Resolution
- Mask Editor Shape Tool
- Mask Editor Vector Tool
- Image Edit Shape Tool
- G'MIC Routes
- Ollama Routes
- Image Edit Text Tool
- WFM Server Entry (wfm.py)
- Workflow Analyzer
- Mask Editor Text Tool
- SDXL 3D Pose Editor DWPose Workflow
- Unsloth Backend Routes
- Style Application Utilities
- Gallery Service Vault Helpers
- Mask Editor Alpha Tool
- Mask Editor Color Tool
- Gallery Feeder Extension (Frontend)
- Node Sets Theme Panel
- Gallery Feeder Node (Backend)
- Node Sets Metadata Extraction
- Node Sets Prompt Extraction
- Inpaint Mask Editor One Workflow
- Inpaint Basic Workflow
- Gallery Service Background Indexing
- Style Prompt Seed Import Tool
- FireRed 3D Pose Image Edit Workflow
- DWPose Image Feeder Workflow
- Prompt Text Node
- PNG Metadata Extractor
- Settings Export Bundle
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
2. `showToast()` - 156 edges
3. `ImageEditTab` - 82 edges
4. `escapeHtml()` - 68 edges
5. `GalleryService` - 45 edges
6. `initPromptTab()` - 34 edges
7. `setup_routes()` - 32 edges
8. `initSettingsTab()` - 31 edges
9. `add()` - 31 edges
10. `renderModelGrid()` - 28 edges

## Surprising Connections (you probably didn't know these)
- `CivitaiService` --uses--> `SettingsService`  [INFERRED]
  py/services/civitai_service.py → py/services/settings_service.py
- `GalleryService` --uses--> `GalleryMetadataStore`  [INFERRED]
  py/services/gallery_service.py → py/services/gallery_metadata.py
- `loadDefaultCkptOptions()` --calls--> `t()`  [EXTRACTED]
  static/js/settings-tab.js → static/js/i18n.js
- `beforeRegisterNodeDef()` --indirect_call--> `saveSelectedAsNodeSet()`  [INFERRED]
  web/comfyui/top_menu_extension.js → web/comfyui/node_sets_menu.js
- `loadAiSettings()` --calls--> `readJsonStorage()`  [EXTRACTED]
  static/js/ai-tab.js → static/js/util.js

## Import Cycles
- 3-file cycle: `static/js/ai-tab.js -> static/js/app.js -> static/js/gallery-tab.js -> static/js/ai-tab.js`
- 3-file cycle: `static/js/app.js -> static/js/generate-tab.js -> static/js/feeder-tab.js -> static/js/app.js`
- 3-file cycle: `static/js/feeder-tab.js -> static/js/gallery-tab.js -> static/js/generate-tab.js -> static/js/feeder-tab.js`
- 3-file cycle: `static/js/app.js -> static/js/gallery-tab.js -> static/js/image-prompt-tab.js -> static/js/app.js`
- 3-file cycle: `static/js/app.js -> static/js/gallery-tab.js -> static/js/style-catalog-tab.js -> static/js/app.js`
- 4-file cycle: `static/js/app.js -> static/js/gallery-tab.js -> static/js/generate-tab.js -> static/js/feeder-tab.js -> static/js/app.js`
- 4-file cycle: `static/js/app.js -> static/js/prompt-tab.js -> static/js/generate-tab.js -> static/js/feeder-tab.js -> static/js/app.js`
- 4-file cycle: `static/js/app.js -> static/js/workflow-tab.js -> static/js/generate-tab.js -> static/js/feeder-tab.js -> static/js/app.js`
- 4-file cycle: `static/js/feeder-tab.js -> static/js/gallery-tab.js -> static/js/style-catalog-tab.js -> static/js/generate-tab.js -> static/js/feeder-tab.js`
- 5-file cycle: `static/js/ai-tab.js -> static/js/app.js -> static/js/generate-tab.js -> static/js/feeder-tab.js -> static/js/gallery-tab.js -> static/js/ai-tab.js`
- 5-file cycle: `static/js/app.js -> static/js/gallery-tab.js -> static/js/style-catalog-tab.js -> static/js/generate-tab.js -> static/js/feeder-tab.js -> static/js/app.js`
- 5-file cycle: `static/js/app.js -> static/js/generate-tab.js -> static/js/feeder-tab.js -> static/js/gallery-tab.js -> static/js/image-prompt-tab.js -> static/js/app.js`
- 5-file cycle: `static/js/app.js -> static/js/generate-tab.js -> static/js/feeder-tab.js -> static/js/gallery-tab.js -> static/js/style-catalog-tab.js -> static/js/app.js`

## Hyperedges (group relationships)
- **Mask Editor One Inpainting Pipeline** — comfyui-workflow-studio_workflows_ws_inpaint_mask_editor_one_load_checkpoint_node, comfyui-workflow-studio_workflows_ws_inpaint_mask_editor_one_mask_editor_one_node, comfyui-workflow-studio_workflows_ws_inpaint_mask_editor_one_clip_text_encode_positive_node, comfyui-workflow-studio_workflows_ws_inpaint_mask_editor_one_clip_text_encode_negative_node, comfyui-workflow-studio_workflows_ws_inpaint_mask_editor_one_vae_encode_for_inpainting_node, comfyui-workflow-studio_workflows_ws_inpaint_mask_editor_one_ksampler_node, comfyui-workflow-studio_workflows_ws_inpaint_mask_editor_one_vae_decode_node, comfyui-workflow-studio_workflows_ws_inpaint_mask_editor_one_save_image_node [INFERRED]

## Communities (112 total, 45 thin omitted)

### Community 1 - "Models Tab Frontend"
Cohesion: 0.08
Nodes (75): applyEmbeddingToPrompt(), applyToGenUI(), badgeHtml(), BATCH_MODEL_TYPES, batchFetchCivitai(), bindBadgeModalEvents(), bindBadgeRowEvents(), bulkAddToGroup() (+67 more)

### Community 2 - "Models API Routes"
Cohesion: 0.06
Nodes (55): handle_change_preview(), handle_civitai_batch(), handle_civitai_cache(), handle_civitai_fetch(), handle_delete_models(), handle_get_disabled(), handle_get_filepath(), handle_get_groups() (+47 more)

### Community 3 - "Generate Tab Frontend & Modals"
Cohesion: 0.06
Nodes (68): closeModal(), openModal(), _applyDefaultCheckpointIfEnabled(), _batchGroupState, _batchStyleSelected, _blobToDataUrl(), _buildFolderTree(), _buildSimpleGroupList() (+60 more)

### Community 4 - "Prompt Tab Frontend"
Cohesion: 0.09
Nodes (55): apiCreatePreset(), apiDeletePreset(), apiUpdatePreset(), attachFile(), chatWithAi(), clearBatchPresets(), clearChat(), createPmItem() (+47 more)

### Community 5 - "Gallery API Routes"
Cohesion: 0.10
Nodes (54): add_to_group(), bulk_favorite(), bulk_group(), clear_group_images(), create_folder_route(), create_group(), delete_folder_route(), delete_group() (+46 more)

### Community 6 - "AI Tool Tab Frontend"
Cohesion: 0.09
Nodes (52): appendChatBubble(), _appendSkillSaveButton(), _appendSvgPreview(), _applyGenOptions(), buildTranslationMessages(), callChat(), callLLM(), callVLM() (+44 more)

### Community 7 - "Gallery Tab Frontend & Toasts"
Cohesion: 0.11
Nodes (53): showToast(), addTag(), API, apiFetch(), _appendNextPage(), _applySelectionToDOM(), _attachScrollSentinel(), bindEvents() (+45 more)

### Community 8 - "App Shell & i18n Init"
Cohesion: 0.07
Nodes (47): applyI18nToHtml(), initModal(), _onHelpSearch(), getLang(), getLanguageOptions(), getSummaryLang(), getSummaryLanguageOptions(), getSummaryPrompt() (+39 more)

### Community 9 - "GenerateUI Feeder Tab"
Cohesion: 0.10
Nodes (50): _applyGalToWorkflow(), _applyPreset(), _applyToGalNode(), _applyToNode(), _applyToWorkflow(), _deletePreset(), _deselectAll(), _feederNodes() (+42 more)

### Community 10 - "GenerateUI Lab Tab"
Cohesion: 0.10
Nodes (50): _annotatedImageRef(), _applyPlanData(), _applyStyleToText(), _buildIndexImageDataUrl(), _buildPlanData(), _buildWorkflowForIteration(), _cellHtml(), _cellLabel() (+42 more)

### Community 11 - "Nodes Tab Frontend"
Cohesion: 0.12
Nodes (41): _applyNodeSelectionToDOM(), bulkNodeAddToGroup(), bulkNodeCreateAndAddToGroup(), bulkNodeRemoveFromGroup(), bulkNodeSetFavorite(), categoryBadgeHtml(), createNodeCard(), createNodeSet() (+33 more)

### Community 12 - "Nodes API Routes"
Cohesion: 0.09
Nodes (28): handle_create_set(), handle_delete_set(), handle_export_set(), handle_get_groups(), handle_get_metadata(), handle_list_sets(), handle_save_groups(), handle_save_metadata() (+20 more)

### Community 13 - "Index HTML SPA Shell Layout"
Cohesion: 0.05
Nodes (44): AI TOOL Chat pane with Skills management, AI TOOL Skills editor panel (create/edit/delete markdown skills), AI TOOL Tab panel (#wfm-tab-ai), AI TOOL Translation pane (JA/EN/ZH), app.js (ES module entrypoint), Gallery ImagePrompt subtab, Gallery Output subtab panel (3-column: folder tree/grid/detail), Gallery Style_Catalog subtab (+36 more)

### Community 14 - "Metadata Tab Frontend"
Cohesion: 0.11
Nodes (40): buildLoRAItem(), buildModelItem(), buildPromptItem(), collectAllNodes(), collectUnique(), extractAllMetadata(), fromWorkflow(), extractCheckpoints() (+32 more)

### Community 15 - "Node Sets Menu & Sidebar"
Cohesion: 0.08
Nodes (42): AI_BACKEND_DEFAULT_URLS, AI_LANG_NAMES, convertApiToUiWorkflow(), _extractAllMetadata(), _extractWorkflowFromEXIF(), fetchGroups(), fetchMetadata(), fetchNodeSets() (+34 more)

### Community 16 - "Settings API Routes"
Cohesion: 0.10
Nodes (40): _apply_import_bundle(), _find_style(), _get_comfyui_output_dir(), handle_create_style(), handle_delete_style(), handle_export(), handle_get(), handle_get_output_dir() (+32 more)

### Community 17 - "Tagger/Prompt i18n Helpers"
Cohesion: 0.12
Nodes (40): t(), addChatMessage(), applyToGenerateUI(), sendTranslate(), _applyI18n(), _batchStart(), _batchStop(), _dbDelete() (+32 more)

### Community 18 - "Gallery Service Core"
Cohesion: 0.10
Nodes (13): GalleryService, Path, 許可するルートパスを更新する（Settings変更時に呼ぶ）, ComfyUI実outputフォルダの不変ルートを設定する（起動時に一度だけ呼ぶ）, パスが許可ルート配下かチェック（パストラバーサル防止）。 Output ギャラリーの _allowed_root、またはComfyUI実outputフォルダの…, outputフォルダのフォルダツリーを返す, 画像と同名の.txtサイドカーにプロンプトテキストを保存する, ワークフローを抽出する。 優先順位: PNG[workflow] > PNG[prompt] > gallery_metadata.json[workflow] (+5 more)

### Community 19 - "Workflow Tab Frontend & Storage"
Cohesion: 0.13
Nodes (35): getSettings(), readJsonStorage(), badgeHtml(), _buildStructuredSummaryText(), _buildSummarySourceText(), clearBatch(), closeSidePanel(), deleteWorkflow() (+27 more)

### Community 20 - "Tagger API Routes"
Cohesion: 0.14
Nodes (24): Connection, handle_batch_start(), handle_batch_status(), handle_batch_stop(), handle_db_delete(), handle_db_export(), handle_db_list(), handle_db_save() (+16 more)

### Community 21 - "Wildcard Service & Routes"
Cohesion: 0.12
Nodes (21): handle_create_link(), handle_delete(), handle_get_content(), handle_link_status(), handle_list(), handle_remove_link(), handle_save(), Application (+13 more)

### Community 22 - "ComfyUI Client & Editor"
Cohesion: 0.08
Nodes (27): comfyUI, _applyLoraToNode(), _attachPromptWeightControl(), _buildLoraManagerSyntax(), _buildLoraSyntax(), _buildPresetOptions(), _compositeImageWithMask(), _I2I_PLACEHOLDER_DEFAULT (+19 more)

### Community 23 - "Tagger Inference Service"
Cohesion: 0.14
Nodes (5): Image, Path, WD Tagger / DeepDanbooru / Ollama VLM 推論サービス。, パストラバーサル防止: セパレータ・NUL・相対参照を拒否, TaggerService

### Community 24 - "AI Chat/VLM Sidebar Helpers"
Cohesion: 0.11
Nodes (28): _aiApplyGenOptions(), aiCallChat(), aiCallLLM(), aiCallVLM(), aiFetchModels(), aiFileToBase64(), aiLooksUntranslated(), aiSkillDeleteFile() (+20 more)

### Community 25 - "CivitAI Service"
Cohesion: 0.12
Nodes (14): CivitaiService, _get_ssl_context(), Build request headers, optionally including Bearer token., Calculate SHA256 hash of a file., Fetch model version info from CivitAI by SHA256 hash (GET). 429/5xx…, POST /model-versions/by-hash でハッシュリストを一括取得（最大100件/リクエスト）。 レスポンスの…, Extract relevant fields from CivitAI API response., Batch fetch CivitAI info for multiple model files. Phase 1: SHA256… (+6 more)

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

### Community 35 - "Style Catalog Tab"
Cohesion: 0.18
Nodes (22): selectStyleByName(), _wireLabValueFilter(), loadFileIntoMetadataTab(), activateStyleCatalogTab(), API, apiFetch(), copyText(), createThumbCard() (+14 more)

### Community 38 - "Node Sets Menu Model Fetch"
Cohesion: 0.19
Nodes (23): createModelItem(), add(), fetchModelList(), fetchWorkflowRaw(), getCanvasDropPos(), installCanvasDropHandler(), loadWorkflowOnCanvas(), matchesModelSearch() (+15 more)

### Community 39 - "Gallery Metadata/Service Bridge"
Cohesion: 0.10
Nodes (13): Gallery Metadata Store - ギャラリー画像のメタデータ永続化, _clean_vault_tags(), _decode_image_data_url(), _FolderCache, _parse_vault_yaml_leaves(), Gallery Service - outputフォルダの画像管理、メタデータ閲覧, フォルダ単位の画像スキャン結果キャッシュ。 フォルダのmtimeが変わった場合、またはTTL超過時に再スキャンする。, data URL (data:<mime>;base64,<data>) をデコードし (バイト列, 拡張子) を返す。 ヘッダが無ければPNG扱い（旧互換）。 (+5 more)

### Community 40 - "Eagle Integration Routes"
Cohesion: 0.14
Nodes (20): _eagle_add(), _eagle_add_from_path(), _eagle_test(), handle_add(), handle_test(), Application, Request, Response (+12 more)

### Community 41 - "Image Prompt Tab"
Cohesion: 0.21
Nodes (20): activateImagePromptTab(), addSelectedToChips(), API, apiFetch(), cleanPromptText(), clearAllChips(), copyFinalPrompt(), createThumbCard() (+12 more)

### Community 42 - "ComfyUI Workflow Utilities"
Cohesion: 0.20
Nodes (13): _CONTROL_AFTER_GENERATE, _findInjectedWidgetIndex(), _flattenSubgraphs(), _getDynamicComboSubNames(), _getWidgetInputNames(), _getWidgetInputTypes(), _isExtraWidgetValue(), _isLinkedWidgetName() (+5 more)

### Community 43 - "Image Edit Background Removal"
Cohesion: 0.14
Nodes (7): comfyEditor, comfyWorkflow, Layer, MASK_TEXT_FONTS, fitToCanvas(), TOOL_DEFS, TEXT_FONTS

### Community 45 - "Settings/CivitAI Config Resolution"
Cohesion: 0.15
Nodes (9): Resolve workflows dir from settings, falling back to default., _resolve_workflows_dir(), _make_ssl_context(), CivitAI API integration service., Return an SSL context with CA verification. 1. certifi CA bundle (available in…, Settings management service., Merge updates into existing settings., Manages application settings (data/settings.json). (+1 more)

### Community 49 - "G'MIC Routes"
Cohesion: 0.21
Nodes (14): _gmic_run_gui(), handle_open(), handle_result(), handle_status(), Application, Request, Response, G'MIC-Qt integration API routes. (+6 more)

### Community 50 - "Ollama Routes"
Cohesion: 0.23
Nodes (14): _get_ollama_config(), handle_chat(), handle_models(), handle_test(), Application, Request, Response, Ollama API proxy routes. (+6 more)

### Community 52 - "WFM Server Entry (wfm.py)"
Cohesion: 0.23
Nodes (11): Request, Response, Serve the main SPA page., Serve files from the current workflows directory (dynamic path)., Serve files (index thumbnails) from the Lab plan directory., Main entry point for Workflow Studio plugin., Register all routes with ComfyUI's server., serve_index_page() (+3 more)

### Community 53 - "Workflow Analyzer"
Cohesion: 0.20
Nodes (13): analyze_workflow(), _clip_type_from_ui_node(), _collect_all_ui_nodes(), _detect_model_type_from_name(), _model_name_from_api_node(), _model_name_from_ui_node(), Workflow analyzer - detects model types and counts input/output nodes., Analyze workflow JSON and return model types, input/output node counts. (+5 more)

### Community 55 - "SDXL 3D Pose Editor DWPose Workflow"
Cohesion: 0.24
Nodes (13): 3D Pose Editor Node (comfyui-vrm-pose-editor), Apply ControlNet Node, CLIP Text Encode (Negative Prompt), CLIP Text Encode (Positive Prompt), DWPose Estimator Node (comfyui_controlnet_aux), Empty Latent Image (768x1024), SDXL 3D Pose Editor + DWPose Workflow Screenshot, KSampler Node (+5 more)

### Community 56 - "Unsloth Backend Routes"
Cohesion: 0.19
Nodes (12): _get_api_key(), handle_proxy(), _is_allowed_base_url(), Application, Request, Response, Unsloth API proxy routes. Unlike Ollama/LM Studio/Lemonade, Unsloth Desktop…, Return the Unsloth API key from the environment (.env), or None. (+4 more)

### Community 57 - "Style Application Utilities"
Cohesion: 0.24
Nodes (12): _applyNamedStyle(), _applyStyleToWorkflow(), _coreGenerate(), AI_BACKEND_DEFAULT_URLS, _bytesToDataUrl(), _dataUrlToBytes(), embedPngTextChunk(), getEagleSettings() (+4 more)

### Community 58 - "Gallery Service Vault Helpers"
Cohesion: 0.17
Nodes (6): os.scandir() で画像ファイルを1回のシステムコールで列挙。 キャッシュがあればそれを返す。 Returns: [(name,…, os.walk() でフォルダ配下を再帰的に列挙する（サブフォルダの画像も含む）。 ImagePrompt/Style…, 指定フォルダ内の画像一覧を返す（recursive=Trueならサブフォルダも含める）, 画像のプロンプトテキストを返す。 1. 画像と同名の .txt サイドカーがあればそれを使う 2. 無ければ ponyxlWildcardsVault 形式…, image_path の祖先を辿り、直下に thumbnails(_option2) を持つフォルダ…, ponyxlWildcardsVault形式のフォールバック解決。 thumbnails_option2 の "{leaf}.preview3.ext"…

### Community 61 - "Gallery Feeder Extension (Frontend)"
Cohesion: 0.36
Nodes (11): beforeRegisterNodeDef(), fetchGroupImages(), getInputWidget(), getOrCreate(), _ns, setWidgetValue(), startLoop(), stopLoop() (+3 more)

### Community 62 - "Node Sets Theme Panel"
Cohesion: 0.24
Nodes (12): applyTheme(), buildThemePanel(), createPanel(), fetchModelGroups(), fetchModelMetadata(), fetchPrompts(), fetchWorkflows(), loadModelsData() (+4 more)

### Community 63 - "Gallery Feeder Node (Backend)"
Cohesion: 0.27
Nodes (4): Path, WFS_GalleryFeeder – Feeds images from a gallery group into a workflow., Gallery グループ内の画像をインデックス順に1枚ずつ出力するノード。, WFS_GalleryFeeder

### Community 64 - "Node Sets Metadata Extraction"
Cohesion: 0.36
Nodes (10): _collectAllNodes(), _collectUnique(), fromWorkflow(), _extractCheckpoints(), _extractDiffusionModels(), _extractLoRAs(), _extractMarkdownNoteModels(), addU() (+2 more)

### Community 65 - "Node Sets Prompt Extraction"
Cohesion: 0.33
Nodes (10): _extractPrompts(), _extractPromptsAPI(), _extractPromptsFromNodeSet(), _extractPromptsLiteGraph(), _isPromptStylerNode(), _isSamplerNode(), _isTextEncoderNode(), _resolveEditPlusText() (+2 more)

### Community 66 - "Inpaint Mask Editor One Workflow"
Cohesion: 0.53
Nodes (9): CLIP Text Encode Negative Prompt Node, CLIP Text Encode Positive Prompt Node, Inpaint with Mask Editor One (Workflow Screenshot), KSampler Node, Load Checkpoint Node, Mask Editor One Node, Save Image Node, VAE Decode Node (+1 more)

### Community 67 - "Inpaint Basic Workflow"
Cohesion: 0.53
Nodes (9): CLIP Text Encode (Prompt) - negative conditioning, CLIP Text Encode (Prompt) - positive conditioning, KSampler node (ddim sampler, 30 steps, cfg 4.0, denoise 1.00), Load Checkpoint node (hayochamixIDXL_v11+_bl checkpoint), Load Image node (clipspace painted mask input), Save Image node (ComfyUI filename prefix), VAE Decode node, VAE Encode (for Inpainting) node with grow_mask_by (+1 more)

### Community 68 - "Gallery Service Background Indexing"
Cohesion: 0.25
Nodes (5): Event, バックグラウンドスレッドで未キャッシュ画像のprompt_cacheを構築する。 10枚処理するたびに50msスリープしてメインスレッドへの影響を最小化。, PNG/JPEGからメタデータを抽出し、保存済みメタと合わせて返す, PNGのtEXtチャンクからメタデータを抽出, JPEGのEXIF/commentからメタデータを抽出（簡易）

### Community 69 - "Style Prompt Seed Import Tool"
Cohesion: 0.36
Nodes (8): clean_tags(), import_category(), main(), parse_yaml_leaves(), Path, Style/Prompt ギャラリー用シードデータ投入スクリプト。 comfyui_prompt_gallery / prompt_builder_proto…, comfyui_prompt_gallery の parseYamlForImages と同じ簡易パーサ（PyYAML不要）。 「key:」行の直後が「-…, 1カテゴリ分を投入する。戻り値: (copied, images_without_prompt, leaves_total)

### Community 70 - "FireRed 3D Pose Image Edit Workflow"
Cohesion: 0.32
Nodes (8): 3D Pose Editor node, FireRed-Image-Edit-1.1_fp8mixed_comfy.safetensors, FireRed-Image-Edit-1.0-Lightning-8steps-v1.0.safetensors (LoRA), Image Edit (FireRed Image Edit 1.1) node, qwen_2.5_vl_7b_fp8_scaled.safetensors (CLIP), qwen_image_vae.safetensors (VAE), Save Image node, 3D Pose Editor to Image Edit (Fire Red) Workflow

### Community 71 - "DWPose Image Feeder Workflow"
Cohesion: 0.52
Nodes (7): DWPose Image Feeder Workflow, Apply ControlNet Node, DWPose Estimator Node (comfyui-controlnet-aux), Image Feeder Node (comfyui-image-feeder), KSampler Node, Load Checkpoint Node (animagineXLRealistic_v6), Load ControlNet Model Node (OpenPoseXL2)

### Community 72 - "Prompt Text Node"
Cohesion: 0.33
Nodes (3): WFS_PromptText – Prompt preset node with positive/negative STRING outputs., Outputs positive and negative prompt strings., WFS_PromptText

### Community 73 - "PNG Metadata Extractor"
Cohesion: 0.40
Nodes (4): extract_png_workflow(), Extract ComfyUI workflow JSON from PNG metadata., Extract ComfyUI workflow JSON from PNG byte data. Returns dict or None., Workflow CRUD and metadata management service.

### Community 74 - "Settings Export Bundle"
Cohesion: 0.50
Nodes (4): _build_export_bundle(), _load_data_file(), Load a single data file, return empty dict/list if missing., Collect all data files into a single export bundle.

## Knowledge Gaps
- **139 isolated node(s):** `comfyui-workflow-studio`, `LANG_NAMES`, `VLM_PROMPTS`, `IMAGE_GEN_TOOLS`, `skillFiles` (+134 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **45 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `showToast()` connect `Gallery Tab Frontend & Toasts` to `Image Edit Layer & Draw Tools`, `Models Tab Frontend`, `Generate Tab Frontend & Modals`, `Prompt Tab Frontend`, `Style Catalog Tab`, `AI Tool Tab Frontend`, `App Shell & i18n Init`, `GenerateUI Feeder Tab`, `Image Prompt Tab`, `Image Edit Background Removal`, `GenerateUI Lab Tab`, `Nodes Tab Frontend`, `Tagger/Prompt i18n Helpers`, `Workflow Tab Frontend & Storage`, `Style Application Utilities`?**
  _High betweenness centrality (0.072) - this node is a cross-community bridge._
- **Why does `t()` connect `Tagger/Prompt i18n Helpers` to `Models Tab Frontend`, `Generate Tab Frontend & Modals`, `Style Catalog Tab`, `Prompt Tab Frontend`, `AI Tool Tab Frontend`, `Gallery Tab Frontend & Toasts`, `App Shell & i18n Init`, `GenerateUI Feeder Tab`, `Image Prompt Tab`, `GenerateUI Lab Tab`, `Nodes Tab Frontend`, `Metadata Tab Frontend`, `Workflow Tab Frontend & Storage`, `ComfyUI Client & Editor`, `Style Application Utilities`?**
  _High betweenness centrality (0.046) - this node is a cross-community bridge._
- **Why does `ImageEditTab` connect `Image Edit Layer & Draw Tools` to `App Shell & i18n Init`, `Image Edit Background Removal`?**
  _High betweenness centrality (0.028) - this node is a cross-community bridge._
- **What connects `comfyui-workflow-studio`, `LANG_NAMES`, `VLM_PROMPTS` to the rest of the system?**
  _139 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Image Edit Layer & Draw Tools` be split into smaller, more focused modules?**
  _Cohesion score 0.07086834733893557 - nodes in this community are weakly interconnected._
- **Should `Models Tab Frontend` be split into smaller, more focused modules?**
  _Cohesion score 0.08491228070175438 - nodes in this community are weakly interconnected._
- **Should `Models API Routes` be split into smaller, more focused modules?**
  _Cohesion score 0.0554954954954955 - nodes in this community are weakly interconnected._