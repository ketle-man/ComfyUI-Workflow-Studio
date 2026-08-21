# Graph Report - ComfyUI-Workflow-Studio  (2026-08-21)

## Corpus Check
- 108 files · ~561,402 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 2192 nodes · 5313 edges · 152 communities (82 shown, 70 thin omitted)
- Extraction: 95% EXTRACTED · 5% INFERRED · 0% AMBIGUOUS · INFERRED: 288 edges (avg confidence: 0.89)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `9681e768`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- models_routes.py
- gallery-tab.js
- prompt-tab.js
- gallery_routes.py
- ImageEditTab
- ai-tab.js
- feeder-tab.js
- models-tab.js
- t
- NodesService
- settings_routes.py
- escapeHtml
- lab-tab.js
- workflow-tab.js
- metadata-tab.js
- node_sets_menu.js
- generate-tab.js
- GalleryService
- settings-tab.js
- tagger_routes.py
- WildcardService
- comfyui-editor.js
- MaskShapeTool
- TaggerService
- setupAiHandlers
- top_menu_extension.js
- renderContent
- PromptsService
- workflow_routes.py
- GalleryMetadataStore
- WorkflowService
- _renderBatchPreview
- lab_routes.py
- SelectTool
- CivitaiService
- DrawTool
- MaskTool
- image-prompt-tab.js
- gallery_service.py
- image-edit-tab.js
- eagle_routes.py
- style-catalog-tab.js
- KSampler Node
- add
- comfyui-workflow.js
- _openCellModal
- LayerManager
- ComfyUI-Workflow-Studio
- BlurTool
- ShapeTool
- wfm.py
- gmic_routes.py
- ollama_routes.py
- SkillService
- TextTool
- analyze_workflow
- MaskVectorTool
- MaskTextTool
- handle_proxy
- createPanel
- .list_images
- MaskAlphaTool
- MaskColorTool
- gallery_feeder_extension.js
- Version 0.3.9
- app.js
- BgRemove
- WFS_GalleryFeeder
- skill_routes.py
- InpaintI2IActions
- Sam3Segmentation
- fromWorkflow
- _extractPromptsAPI
- WS Inpaint Basic Workflow
- ._bg_index_folder
- SettingsService
- import_style_prompt_seed.py
- Image Edit (FireRed Image Edit 1.1) node
- FileExport
- GmicIntegration
- util.js
- DWPose Image Feeder Workflow
- civitai_service.py
- index.html (Workflow Studio)
- createModelItem
- WFS_PromptText
- workflow_service.py
- MaskEditorOneBridge
- NODE_CLASS_MAPPINGS Dictionary
- config.py
- Tagger Tab requirements.txt
- publish-node Job
- Chinese Language Support
- Version 0.3.95
- IS_CHANGED Function
- Lab Subtab
- prestartup_script.py
- .get_image_prompt_root
- .get_style_catalog_root
- .start_background_index
- .update_workflows_dir
- i18n.js
- Version 0.4.2
- ComfyUI-Workflow-Studio Project
- Workflow Studio Banner
- Workflow Studio Icon
- BiRefNet Model
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
- Feeder Subtab
- Gallery Tab
- GenerateUI Tab
- Help & Support Tab
- Image Edit Tab
- Metadata Tab
- comfyui-workflow-studio
- py/wfm.py File
- python-dotenv
- Settings Tab
- Tagger Tab
- SD1.5 Basic Text-to-Image Workflow
- SDXL Text-to-Image Basic Workflow Screenshot
- _runLabBatch
- generate_doc_index.py
- _buildWorkflowForIteration
- on_doc_edit.py

## God Nodes (most connected - your core abstractions)
1. `t()` - 209 edges
2. `showToast()` - 170 edges
3. `escapeHtml()` - 73 edges
4. `ImageEditTab` - 53 edges
5. `GalleryService` - 45 edges
6. `initPromptTab()` - 34 edges
7. `setup_routes()` - 32 edges
8. `initSettingsTab()` - 31 edges
9. `add()` - 31 edges
10. `renderModelGrid()` - 29 edges

## Surprising Connections (you probably didn't know these)
- `beforeRegisterNodeDef()` --indirect_call--> `saveSelectedAsNodeSet()`  [INFERRED]
  web/comfyui/top_menu_extension.js → web/comfyui/node_sets_menu.js
- `Version 0.3.9` --references--> `Models Tab`  [EXTRACTED]
  DEVLOG.index.md → README.index.md
- `Version 0.3.9` --references--> `Nodes Tab`  [EXTRACTED]
  DEVLOG.index.md → README.index.md
- `Version 0.3.9` --references--> `Prompt Tab`  [EXTRACTED]
  DEVLOG.index.md → README.index.md
- `Version 0.3.9` --references--> `Workflow Tab`  [EXTRACTED]
  DEVLOG.index.md → README.index.md

## Import Cycles
- 3-file cycle: `static/js/app.js -> static/js/image-edit-tab.js -> static/js/image-edit/GmicIntegration.js -> static/js/app.js`
- 3-file cycle: `static/js/app.js -> static/js/models-tab.js -> static/js/models/badges.js -> static/js/app.js`
- 3-file cycle: `static/js/app.js -> static/js/image-edit-tab.js -> static/js/image-edit/BlurTool.js -> static/js/app.js`
- 3-file cycle: `static/js/app.js -> static/js/gallery-tab.js -> static/js/image-prompt-tab.js -> static/js/app.js`
- 3-file cycle: `static/js/app.js -> static/js/image-edit-tab.js -> static/js/image-edit/InpaintI2IActions.js -> static/js/app.js`
- 3-file cycle: `static/js/app.js -> static/js/gallery-tab.js -> static/js/style-catalog-tab.js -> static/js/app.js`
- 3-file cycle: `static/js/ai-tab.js -> static/js/app.js -> static/js/gallery-tab.js -> static/js/ai-tab.js`
- 3-file cycle: `static/js/app.js -> static/js/gallery-tab.js -> static/js/comfyui-editor.js -> static/js/app.js`
- 3-file cycle: `static/js/feeder-tab.js -> static/js/gallery-tab.js -> static/js/generate-tab.js -> static/js/feeder-tab.js`
- 3-file cycle: `static/js/app.js -> static/js/image-edit-tab.js -> static/js/image-edit/Sam3Segmentation.js -> static/js/app.js`
- 3-file cycle: `static/js/app.js -> static/js/models-tab.js -> static/js/comfyui-editor.js -> static/js/app.js`
- 3-file cycle: `static/js/app.js -> static/js/image-edit-tab.js -> static/js/image-edit/FileExport.js -> static/js/app.js`
- 3-file cycle: `static/js/app.js -> static/js/image-edit-tab.js -> static/js/image-edit/MaskEditorOneBridge.js -> static/js/app.js`
- 3-file cycle: `static/js/app.js -> static/js/generate-tab.js -> static/js/feeder-tab.js -> static/js/app.js`
- 3-file cycle: `static/js/app.js -> static/js/image-edit-tab.js -> static/js/image-edit/BgRemove.js -> static/js/app.js`
- 3-file cycle: `static/js/app.js -> static/js/generate-tab.js -> static/js/comfyui-editor.js -> static/js/app.js`
- 3-file cycle: `static/js/app.js -> static/js/image-edit-tab.js -> static/js/comfyui-editor.js -> static/js/app.js`
- 4-file cycle: `static/js/app.js -> static/js/workflow-tab.js -> static/js/models-tab.js -> static/js/models/badges.js -> static/js/app.js`
- 4-file cycle: `static/js/app.js -> static/js/workflow-tab.js -> static/js/generate-tab.js -> static/js/comfyui-editor.js -> static/js/app.js`
- 4-file cycle: `static/js/app.js -> static/js/workflow-tab.js -> static/js/generate-tab.js -> static/js/feeder-tab.js -> static/js/app.js`

## Hyperedges (group relationships)
- **ComfyUI Node Development Patterns** — NODE_CLASS_MAPPINGS, INPUT_TYPES, IS_CHANGED, VALIDATE_INPUTS [EXTRACTED 0.90]
- **Mask Editor One Inpainting Pipeline** — comfyui-workflow-studio_workflows_ws_inpaint_mask_editor_one_load_checkpoint_node, comfyui-workflow-studio_workflows_ws_inpaint_mask_editor_one_mask_editor_one_node, comfyui-workflow-studio_workflows_ws_inpaint_mask_editor_one_clip_text_encode_positive_node, comfyui-workflow-studio_workflows_ws_inpaint_mask_editor_one_clip_text_encode_negative_node, comfyui-workflow-studio_workflows_ws_inpaint_mask_editor_one_vae_encode_for_inpainting_node, comfyui-workflow-studio_workflows_ws_inpaint_mask_editor_one_save_image_node [INFERRED]

## Communities (152 total, 70 thin omitted)

### Community 0 - "models_routes.py"
Cohesion: 0.06
Nodes (55): handle_change_preview(), handle_civitai_batch(), handle_civitai_cache(), handle_civitai_fetch(), handle_delete_models(), handle_get_disabled(), handle_get_filepath(), handle_get_groups() (+47 more)

### Community 1 - "gallery-tab.js"
Cohesion: 0.10
Nodes (52): addTag(), API, apiFetch(), _appendNextPage(), _applySelectionToDOM(), _attachScrollSentinel(), bindEvents(), bulkAddToGroup() (+44 more)

### Community 2 - "prompt-tab.js"
Cohesion: 0.08
Nodes (59): refreshStylesList(), addChatMessage(), apiCreatePreset(), apiDeletePreset(), apiUpdatePreset(), applyToGenerateUI(), attachFile(), chatWithAi() (+51 more)

### Community 3 - "gallery_routes.py"
Cohesion: 0.10
Nodes (54): add_to_group(), bulk_favorite(), bulk_group(), clear_group_images(), create_folder_route(), create_group(), delete_folder_route(), delete_group() (+46 more)

### Community 5 - "ai-tab.js"
Cohesion: 0.09
Nodes (52): appendChatBubble(), _appendSkillSaveButton(), _appendSvgPreview(), _applyGenOptions(), buildTranslationMessages(), callChat(), callLLM(), callVLM() (+44 more)

### Community 6 - "feeder-tab.js"
Cohesion: 0.10
Nodes (50): _applyGalToWorkflow(), _applyPreset(), _applyToGalNode(), _applyToNode(), _applyToWorkflow(), _deletePreset(), _deselectAll(), _feederNodes() (+42 more)

### Community 7 - "models-tab.js"
Cohesion: 0.09
Nodes (77): closeModal(), initModal(), badgeHtml(), bindBadgeModalEvents(), bindBadgeRowEvents(), getBadgePalette(), modelBadgesHtml(), _onGridChange() (+69 more)

### Community 8 - "t"
Cohesion: 0.12
Nodes (46): showToast(), _applyDefaultCheckpointIfEnabled(), handleGenerate(), loadWorkflowIntoEditor(), _runBatchGenerate(), saveCurrentWorkflow(), t(), _loadPlanWorkflow() (+38 more)

### Community 9 - "NodesService"
Cohesion: 0.09
Nodes (28): handle_create_set(), handle_delete_set(), handle_export_set(), handle_get_groups(), handle_get_metadata(), handle_list_sets(), handle_save_groups(), handle_save_metadata() (+20 more)

### Community 10 - "settings_routes.py"
Cohesion: 0.09
Nodes (44): _apply_import_bundle(), _build_export_bundle(), _find_style(), _get_comfyui_output_dir(), handle_create_style(), handle_delete_style(), handle_export(), handle_get() (+36 more)

### Community 11 - "escapeHtml"
Cohesion: 0.12
Nodes (41): _applyNodeSelectionToDOM(), bulkNodeAddToGroup(), bulkNodeCreateAndAddToGroup(), bulkNodeRemoveFromGroup(), bulkNodeSetFavorite(), categoryBadgeHtml(), createNodeCard(), createNodeSet() (+33 more)

### Community 12 - "lab-tab.js"
Cohesion: 0.13
Nodes (36): _applyPlanData(), _buildIndexImageDataUrl(), _buildPlanData(), _clearPlan(), COLUMN_KEYS, _defaultValueFor(), _emptyColumns(), _emptyLabState() (+28 more)

### Community 13 - "workflow-tab.js"
Cohesion: 0.13
Nodes (34): highlightJSON(), badgeHtml(), _buildStructuredSummaryText(), _buildSummarySourceText(), clearBatch(), closeSidePanel(), deleteWorkflow(), fetchWorkflows() (+26 more)

### Community 14 - "metadata-tab.js"
Cohesion: 0.11
Nodes (40): buildLoRAItem(), buildModelItem(), buildPromptItem(), collectAllNodes(), collectUnique(), extractAllMetadata(), fromWorkflow(), extractCheckpoints() (+32 more)

### Community 15 - "node_sets_menu.js"
Cohesion: 0.08
Nodes (38): AI_BACKEND_DEFAULT_URLS, AI_LANG_NAMES, convertApiToUiWorkflow(), _extractAllMetadata(), _extractWorkflowFromEXIF(), fetchGroups(), fetchMetadata(), fetchNodeSets() (+30 more)

### Community 16 - "generate-tab.js"
Cohesion: 0.08
Nodes (37): openModal(), _applyNamedStyle(), _applyStyleToWorkflow(), _batchGroupState, _batchStyleSelected, _blobToDataUrl(), _buildFolderTree(), _ckptBatch (+29 more)

### Community 17 - "GalleryService"
Cohesion: 0.10
Nodes (13): GalleryService, Path, 許可するルートパスを更新する（Settings変更時に呼ぶ）, ComfyUI実outputフォルダの不変ルートを設定する（起動時に一度だけ呼ぶ）, パスが許可ルート配下かチェック（パストラバーサル防止）。 Output ギャラリーの _allowed_root、またはComfyUI実outputフォルダの…, outputフォルダのフォルダツリーを返す, 画像と同名の.txtサイドカーにプロンプトテキストを保存する, ワークフローを抽出する。 優先順位: PNG[workflow] > PNG[prompt] > gallery_metadata.json[workflow] (+5 more)

### Community 18 - "settings-tab.js"
Cohesion: 0.12
Nodes (29): applyCustomFont(), applyCustomOverrides(), applyTheme(), BG_PATTERNS, buildLangOptions(), clearCustomOverrides(), COLOR_TARGETS, FONT_OPTIONS (+21 more)

### Community 19 - "tagger_routes.py"
Cohesion: 0.14
Nodes (24): Connection, handle_batch_start(), handle_batch_status(), handle_batch_stop(), handle_db_delete(), handle_db_export(), handle_db_list(), handle_db_save() (+16 more)

### Community 20 - "WildcardService"
Cohesion: 0.12
Nodes (21): handle_create_link(), handle_delete(), handle_get_content(), handle_link_status(), handle_list(), handle_remove_link(), handle_save(), Application (+13 more)

### Community 21 - "comfyui-editor.js"
Cohesion: 0.08
Nodes (28): _applyLoraToNode(), _attachPromptWeightControl(), _buildLoraManagerSyntax(), _buildLoraSyntax(), _buildPresetOptions(), _compositeImageWithMask(), _I2I_PLACEHOLDER_DEFAULT, _imageInputToDataURL() (+20 more)

### Community 23 - "TaggerService"
Cohesion: 0.14
Nodes (5): Image, Path, WD Tagger / DeepDanbooru / Ollama VLM 推論サービス。, パストラバーサル防止: セパレータ・NUL・相対参照を拒否, TaggerService

### Community 24 - "setupAiHandlers"
Cohesion: 0.11
Nodes (28): _aiApplyGenOptions(), aiCallChat(), aiCallLLM(), aiCallVLM(), aiFetchModels(), aiFileToBase64(), aiLooksUntranslated(), aiSkillDeleteFile() (+20 more)

### Community 25 - "top_menu_extension.js"
Cohesion: 0.14
Nodes (27): ../../scripts/ui/components/button.js, ../../scripts/ui/components/buttonGroup.js, getNodeSetsIcon(), NODE_SETS_TOOLTIP, attachTopMenuButton(), beforeRegisterNodeDef(), captureCanvasSnapshot(), compareVersions() (+19 more)

### Community 26 - "renderContent"
Cohesion: 0.16
Nodes (28): createDraggableItem(), createDraggablePromptItem(), createDraggableWfItem(), esc(), extractPackageName(), getNodeCategory(), getNodePackage(), getWfBadges() (+20 more)

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

### Community 31 - "_renderBatchPreview"
Cohesion: 0.14
Nodes (24): _buildSimpleGroupList(), _getGroupSelCount(), _getGroupSelCountFrom(), _getItemsFromGroupState(), _getSelectedCheckpoints(), _getSelectedGroupModels(), _getSelectedLoraGroupItems(), _getSelectedPromptGroupItems() (+16 more)

### Community 32 - "lab_routes.py"
Cohesion: 0.15
Nodes (14): handle_delete(), handle_get_content(), handle_list(), handle_save(), handle_save_index_to_output(), Application, Request, Response (+6 more)

### Community 34 - "CivitaiService"
Cohesion: 0.15
Nodes (11): CivitaiService, Build request headers, optionally including Bearer token., Calculate SHA256 hash of a file., Fetch model version info from CivitAI by SHA256 hash (GET). 429/5xx…, POST /model-versions/by-hash でハッシュリストを一括取得（最大100件/リクエスト）。 レスポンスの…, Extract relevant fields from CivitAI API response., Batch fetch CivitAI info for multiple model files. Phase 1: SHA256…, Clear cache for a specific hash or all. (+3 more)

### Community 37 - "image-prompt-tab.js"
Cohesion: 0.21
Nodes (20): activateImagePromptTab(), addSelectedToChips(), API, apiFetch(), cleanPromptText(), clearAllChips(), copyFinalPrompt(), createThumbCard() (+12 more)

### Community 38 - "gallery_service.py"
Cohesion: 0.10
Nodes (13): Gallery Metadata Store - ギャラリー画像のメタデータ永続化, _clean_vault_tags(), _decode_image_data_url(), _FolderCache, _parse_vault_yaml_leaves(), Gallery Service - outputフォルダの画像管理、メタデータ閲覧, フォルダ単位の画像スキャン結果キャッシュ。 フォルダのmtimeが変わった場合、またはTTL超過時に再スキャンする。, data URL (data:<mime>;base64,<data>) をデコードし (バイト列, 拡張子) を返す。 ヘッダが無ければPNG扱い（旧互換）。 (+5 more)

### Community 39 - "image-edit-tab.js"
Cohesion: 0.16
Nodes (7): comfyUI, comfyEditor, comfyWorkflow, Layer, fitToCanvas(), TOOL_DEFS, TEXT_FONTS

### Community 40 - "eagle_routes.py"
Cohesion: 0.14
Nodes (20): _eagle_add(), _eagle_add_from_path(), _eagle_test(), handle_add(), handle_test(), Application, Request, Response (+12 more)

### Community 41 - "style-catalog-tab.js"
Cohesion: 0.17
Nodes (23): selectStyleByName(), _wireLabLoraFilter(), _wireLabValueFilter(), loadFileIntoMetadataTab(), activateStyleCatalogTab(), API, apiFetch(), copyText() (+15 more)

### Community 42 - "KSampler Node"
Cohesion: 0.19
Nodes (20): CLIP Text Encode Negative Prompt Node, CLIP Text Encode Positive Prompt Node, Inpaint with Mask Editor One (Workflow Screenshot), Load Checkpoint Node, Mask Editor One Node, Save Image Node, VAE Encode (for Inpainting) Node, 3D Pose Editor Node (comfyui-vrm-pose-editor) (+12 more)

### Community 43 - "add"
Cohesion: 0.22
Nodes (19): add(), fetchWorkflowRaw(), getCanvasDropPos(), handleInfoFile(), installCanvasDropHandler(), loadWorkflowOnCanvas(), placeClipTextEncodeNode(), placeLoraMgrNode() (+11 more)

### Community 44 - "comfyui-workflow.js"
Cohesion: 0.20
Nodes (13): _CONTROL_AFTER_GENERATE, _findInjectedWidgetIndex(), _flattenSubgraphs(), _getDynamicComboSubNames(), _getWidgetInputNames(), _getWidgetInputTypes(), _isExtraWidgetValue(), _isLinkedWidgetName() (+5 more)

### Community 45 - "_openCellModal"
Cohesion: 0.20
Nodes (16): _applyStyleToText(), _cellHtml(), _cellLabel(), _effectiveDisplayValue(), _initColumnButtons(), _isEmptyValue(), _isLiveDisplay(), _liveValueFor() (+8 more)

### Community 47 - "ComfyUI-Workflow-Studio"
Cohesion: 0.12
Nodes (16): CivitAI, ComfyUI, ComfyUI-Custom-Scripts, ComfyUI-Gallery, ComfyUI-Lora-Manager, ComfyUI-Workflow-Studio, Eagle, Fooocus (+8 more)

### Community 50 - "wfm.py"
Cohesion: 0.21
Nodes (12): Jinja2, Request, Response, Serve the main SPA page., Serve files from the current workflows directory (dynamic path)., Serve files (index thumbnails) from the Lab plan directory., Main entry point for Workflow Studio plugin., Register all routes with ComfyUI's server. (+4 more)

### Community 51 - "gmic_routes.py"
Cohesion: 0.21
Nodes (14): _gmic_run_gui(), handle_open(), handle_result(), handle_status(), Application, Request, Response, G'MIC-Qt integration API routes. (+6 more)

### Community 52 - "ollama_routes.py"
Cohesion: 0.23
Nodes (14): _get_ollama_config(), handle_chat(), handle_models(), handle_test(), Application, Request, Response, Ollama API proxy routes. (+6 more)

### Community 53 - "SkillService"
Cohesion: 0.20
Nodes (7): _parse_frontmatter(), Path, AI skill (.md system prompt) file management service., Extract a shallow `key: value` frontmatter block, if present., Seed a starter skill file the first time the directory is empty., Return sorted list of skill files with parsed frontmatter metadata., SkillService

### Community 55 - "analyze_workflow"
Cohesion: 0.20
Nodes (13): analyze_workflow(), _clip_type_from_ui_node(), _collect_all_ui_nodes(), _detect_model_type_from_name(), _model_name_from_api_node(), _model_name_from_ui_node(), Workflow analyzer - detects model types and counts input/output nodes., Analyze workflow JSON and return model types, input/output node counts. (+5 more)

### Community 58 - "handle_proxy"
Cohesion: 0.19
Nodes (12): _get_api_key(), handle_proxy(), _is_allowed_base_url(), Application, Request, Response, Unsloth API proxy routes. Unlike Ollama/LM Studio/Lemonade, Unsloth Desktop…, Return the Unsloth API key from the environment (.env), or None. (+4 more)

### Community 59 - "createPanel"
Cohesion: 0.22
Nodes (13): applyTheme(), buildThemePanel(), createPanel(), fetchModelGroups(), fetchModelMetadata(), fetchPrompts(), fetchWorkflows(), injectStyles() (+5 more)

### Community 60 - ".list_images"
Cohesion: 0.17
Nodes (6): os.scandir() で画像ファイルを1回のシステムコールで列挙。 キャッシュがあればそれを返す。 Returns: [(name,…, os.walk() でフォルダ配下を再帰的に列挙する（サブフォルダの画像も含む）。 ImagePrompt/Style…, 指定フォルダ内の画像一覧を返す（recursive=Trueならサブフォルダも含める）, 画像のプロンプトテキストを返す。 1. 画像と同名の .txt サイドカーがあればそれを使う 2. 無ければ ponyxlWildcardsVault 形式…, image_path の祖先を辿り、直下に thumbnails(_option2) を持つフォルダ…, ponyxlWildcardsVault形式のフォールバック解決。 thumbnails_option2 の "{leaf}.preview3.ext"…

### Community 63 - "gallery_feeder_extension.js"
Cohesion: 0.36
Nodes (11): beforeRegisterNodeDef(), fetchGroupImages(), getInputWidget(), getOrCreate(), _ns, setWidgetValue(), startLoop(), stopLoop() (+3 more)

### Community 64 - "Version 0.3.9"
Cohesion: 0.18
Nodes (11): AI TOOL Tab, Models Tab, Nodes Tab, Prompt Tab, Version 0.1.2, Version 0.1.7, Version 0.2.3, Version 0.3.14 (+3 more)

### Community 65 - "app.js"
Cohesion: 0.24
Nodes (7): applyI18nToHtml(), _onHelpSearch(), initI18n(), applyJsonColors(), applyModelTabActiveColor(), applyTextareaFontSize(), getSettings()

### Community 67 - "WFS_GalleryFeeder"
Cohesion: 0.27
Nodes (4): Path, WFS_GalleryFeeder – Feeds images from a gallery group into a workflow., Gallery グループ内の画像をインデックス順に1枚ずつ出力するノード。, WFS_GalleryFeeder

### Community 68 - "skill_routes.py"
Cohesion: 0.42
Nodes (9): handle_delete(), handle_get_content(), handle_list(), handle_save(), Application, Request, Response, AI skill (.md system prompt) file management API routes. (+1 more)

### Community 71 - "fromWorkflow"
Cohesion: 0.36
Nodes (10): _collectAllNodes(), _collectUnique(), fromWorkflow(), _extractCheckpoints(), _extractDiffusionModels(), _extractLoRAs(), _extractMarkdownNoteModels(), addU() (+2 more)

### Community 72 - "_extractPromptsAPI"
Cohesion: 0.33
Nodes (10): _extractPrompts(), _extractPromptsAPI(), _extractPromptsFromNodeSet(), _extractPromptsLiteGraph(), _isPromptStylerNode(), _isSamplerNode(), _isTextEncoderNode(), _resolveEditPlusText() (+2 more)

### Community 73 - "WS Inpaint Basic Workflow"
Cohesion: 0.53
Nodes (9): CLIP Text Encode (Prompt) - negative conditioning, CLIP Text Encode (Prompt) - positive conditioning, KSampler node (ddim sampler, 30 steps, cfg 4.0, denoise 1.00), Load Checkpoint node (hayochamixIDXL_v11+_bl checkpoint), Load Image node (clipspace painted mask input), Save Image node (ComfyUI filename prefix), VAE Decode node, VAE Encode (for Inpainting) node with grow_mask_by (+1 more)

### Community 74 - "._bg_index_folder"
Cohesion: 0.25
Nodes (5): Event, バックグラウンドスレッドで未キャッシュ画像のprompt_cacheを構築する。 10枚処理するたびに50msスリープしてメインスレッドへの影響を最小化。, PNG/JPEGからメタデータを抽出し、保存済みメタと合わせて返す, PNGのtEXtチャンクからメタデータを抽出, JPEGのEXIF/commentからメタデータを抽出（簡易）

### Community 75 - "SettingsService"
Cohesion: 0.28
Nodes (4): Return CivitAI API key. Env var CIVITAI_API_KEY takes priority over…, Merge updates into existing settings., Manages application settings (data/settings.json)., SettingsService

### Community 76 - "import_style_prompt_seed.py"
Cohesion: 0.36
Nodes (8): clean_tags(), import_category(), main(), parse_yaml_leaves(), Path, Style/Prompt ギャラリー用シードデータ投入スクリプト。 comfyui_prompt_gallery / prompt_builder_proto…, comfyui_prompt_gallery の parseYamlForImages と同じ簡易パーサ（PyYAML不要）。 「key:」行の直後が「-…, 1カテゴリ分を投入する。戻り値: (copied, images_without_prompt, leaves_total)

### Community 77 - "Image Edit (FireRed Image Edit 1.1) node"
Cohesion: 0.32
Nodes (8): 3D Pose Editor node, FireRed-Image-Edit-1.1_fp8mixed_comfy.safetensors, FireRed-Image-Edit-1.0-Lightning-8steps-v1.0.safetensors (LoRA), Image Edit (FireRed Image Edit 1.1) node, qwen_2.5_vl_7b_fp8_scaled.safetensors (CLIP), qwen_image_vae.safetensors (VAE), Save Image node, 3D Pose Editor to Image Edit (Fire Red) Workflow

### Community 80 - "util.js"
Cohesion: 0.43
Nodes (7): AI_BACKEND_DEFAULT_URLS, _bytesToDataUrl(), _dataUrlToBytes(), embedPngTextChunk(), _joinBytes(), _n2b(), _pngCrc32()

### Community 81 - "DWPose Image Feeder Workflow"
Cohesion: 0.52
Nodes (7): DWPose Image Feeder Workflow, Apply ControlNet Node, DWPose Estimator Node (comfyui-controlnet-aux), Image Feeder Node (comfyui-image-feeder), KSampler Node, Load Checkpoint Node (animagineXLRealistic_v6), Load ControlNet Model Node (OpenPoseXL2)

### Community 82 - "civitai_service.py"
Cohesion: 0.33
Nodes (5): _get_ssl_context(), _make_ssl_context(), CivitAI API integration service., Return an SSL context with CA verification. 1. certifi CA bundle (available in…, Download an image from URL and save to save_path. Returns True on success.

### Community 84 - "createModelItem"
Cohesion: 0.57
Nodes (7): createModelItem(), fetchModelList(), matchesModelSearch(), renderModelAll(), renderModelByType(), renderModelFavorites(), renderModelGroups()

### Community 85 - "WFS_PromptText"
Cohesion: 0.33
Nodes (3): WFS_PromptText – Prompt preset node with positive/negative STRING outputs., Outputs positive and negative prompt strings., WFS_PromptText

### Community 86 - "workflow_service.py"
Cohesion: 0.40
Nodes (4): extract_png_workflow(), Extract ComfyUI workflow JSON from PNG metadata., Extract ComfyUI workflow JSON from PNG byte data. Returns dict or None., Workflow CRUD and metadata management service.

### Community 88 - "NODE_CLASS_MAPPINGS Dictionary"
Cohesion: 0.40
Nodes (5): INPUT_TYPES Definition, NODE_CLASS_MAPPINGS Dictionary, WorkflowStudio.add_routes Method, __init__.py File, prestartup_script.py File

### Community 89 - "config.py"
Cohesion: 0.40
Nodes (3): Resolve workflows dir from settings, falling back to default., _resolve_workflows_dir(), Settings management service.

### Community 90 - "Tagger Tab requirements.txt"
Cohesion: 0.40
Nodes (5): Tagger Tab requirements.txt, onnxruntime (WD Tagger / SwinV2), piexif (JPEG EXIF tag writing), python-dotenv (Unsloth .env loading), tensorflow (optional, DeepDanbooru)

### Community 91 - "publish-node Job"
Cohesion: 0.67
Nodes (4): Publish to Comfy Registry Workflow, Comfy-Org/publish-node-action, publish-node Job, pyproject.toml Push Trigger

### Community 92 - "Chinese Language Support"
Cohesion: 1.00
Nodes (3): Chinese Language Support, English Language Support, Japanese Language Support

### Community 93 - "Version 0.3.95"
Cohesion: 0.67
Nodes (3): ImagePrompt Gallery Subtab, Style_Catalog Subtab, Version 0.3.95

### Community 101 - "i18n.js"
Cohesion: 0.17
Nodes (12): getLang(), getLanguageOptions(), getSummaryLang(), getSummaryLanguageOptions(), getSummaryPrompt(), LANGUAGE_OPTIONS, LANGUAGES, setLang() (+4 more)

### Community 148 - "_runLabBatch"
Cohesion: 0.31
Nodes (10): _coreGenerate(), _expandWildcardsInWorkflow(), _annotatedImageRef(), _fetchLabLoraMetadataCache(), _maybeSaveIndexImageOnRun(), _runLabBatch(), _setRunUiState(), _waitIfPaused() (+2 more)

### Community 149 - "generate_doc_index.py"
Cohesion: 0.53
Nodes (5): generate_devlog_index(), generate_readme_index(), main(), Path, Regenerate README.index.md / DEVLOG.index.md from README.md / DEVLOG.md.…

### Community 150 - "_buildWorkflowForIteration"
Cohesion: 0.40
Nodes (5): _applyLabLoraToWorkflow(), _buildLoraPromptInjection(), _buildWorkflowForIteration(), _labTriggerWordsFor(), _stripLoraPromptInjection()

## Knowledge Gaps
- **159 isolated node(s):** `comfyui-workflow-studio`, `LANG_NAMES`, `VLM_PROMPTS`, `IMAGE_GEN_TOOLS`, `skillFiles` (+154 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **70 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `showToast()` connect `t` to `gallery-tab.js`, `prompt-tab.js`, `ImageEditTab`, `ai-tab.js`, `feeder-tab.js`, `models-tab.js`, `escapeHtml`, `lab-tab.js`, `workflow-tab.js`, `generate-tab.js`, `settings-tab.js`, `_runLabBatch`, `comfyui-editor.js`, `_buildWorkflowForIteration`, `image-prompt-tab.js`, `image-edit-tab.js`, `style-catalog-tab.js`, `_openCellModal`, `BlurTool`, `app.js`, `BgRemove`, `InpaintI2IActions`, `Sam3Segmentation`, `FileExport`, `GmicIntegration`, `MaskEditorOneBridge`?**
  _High betweenness centrality (0.065) - this node is a cross-community bridge._
- **Why does `t()` connect `t` to `gallery-tab.js`, `prompt-tab.js`, `ai-tab.js`, `feeder-tab.js`, `models-tab.js`, `escapeHtml`, `lab-tab.js`, `workflow-tab.js`, `metadata-tab.js`, `generate-tab.js`, `settings-tab.js`, `_runLabBatch`, `comfyui-editor.js`, `_buildWorkflowForIteration`, `image-prompt-tab.js`, `style-catalog-tab.js`, `_openCellModal`, `app.js`, `i18n.js`?**
  _High betweenness centrality (0.054) - this node is a cross-community bridge._
- **Why does `ImageEditTab` connect `ImageEditTab` to `app.js`, `image-edit-tab.js`?**
  _High betweenness centrality (0.029) - this node is a cross-community bridge._
- **What connects `comfyui-workflow-studio`, `LANG_NAMES`, `VLM_PROMPTS` to the rest of the system?**
  _159 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `models_routes.py` be split into smaller, more focused modules?**
  _Cohesion score 0.0554954954954955 - nodes in this community are weakly interconnected._
- **Should `gallery-tab.js` be split into smaller, more focused modules?**
  _Cohesion score 0.09941944847605225 - nodes in this community are weakly interconnected._
- **Should `prompt-tab.js` be split into smaller, more focused modules?**
  _Cohesion score 0.08305084745762711 - nodes in this community are weakly interconnected._