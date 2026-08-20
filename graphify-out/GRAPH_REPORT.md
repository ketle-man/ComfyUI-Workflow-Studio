# Graph Report - ComfyUI-Workflow-Studio  (2026-08-20)

## Corpus Check
- 140 files · ~0 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 2627 nodes · 5787 edges · 171 communities (119 shown, 52 thin omitted)
- Extraction: 94% EXTRACTED · 6% INFERRED · 0% AMBIGUOUS · INFERRED: 361 edges (avg confidence: 0.66)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- Models Tab Frontend
- Models API Routes
- Tagger API Routes
- Image Edit Mask Tools (Code)
- Prompt Tab Frontend
- Gallery API Routes
- Gallery Tab Frontend & Toasts
- Image Edit Layer & Draw Tools
- Tagger/Prompt i18n Helpers
- GenerateUI Feeder Tab
- Nodes API Routes
- Settings API Routes
- App Shell & i18n Init
- Nodes Tab Frontend
- GenerateUI Lab Tab
- Metadata Tab Frontend
- Node Sets Menu & Sidebar
- AI Tool Tab Frontend
- Generate Tab Frontend & Modals
- Workflow Tab Frontend & Storage
- Wildcard Service & Routes
- CivitAI Service & Data Import/Export
- GenerateUI Tab & AI Chat Features
- ComfyUI Client & Editor
- DEVLOG v0.1.x Early Features
- AI Chat/VLM Sidebar Helpers
- AI TOOL Tab Backends
- Node Sets Menu UI Components
- Node Sets Draggable Items
- Workflow API Routes
- Gallery Metadata Store
- Workflow Service Metadata/Import
- CLAUDE.md Node Dev Rules
- Lab Tab & PNG Metadata Utilities
- Lab Plan Service & Routes
- Skill Service & Routes
- Image Edit Select Tool
- Image Edit Draw Tool
- Image Edit Layer Manager Core
- CivitAI Service
- Image Edit Mask Tool
- Gallery Service Core
- Eagle Routes Backend
- Style Catalog Tab
- Image Prompt Tab
- SDXL 3D Pose Editor DWPose Workflow
- Gallery Service Core
- Image Edit Tab & Mask Editor One
- App Shell & Nodes Tab Ecosystem
- Node Sets Menu Model Fetch
- Image Edit Background Removal
- ComfyUI Workflow Utilities
- Generate Tab Frontend & Modals
- Batch Group UI & Security Fixes
- DEVLOG Early History & Manager Registration
- App Shell & ComfyUI Ecosystem Refs
- GenerateUI Batch & Workflow Editor Core
- Image Edit Blur Tool (BlurTool.js)
- Image Edit Shape Tool
- Tagger Tab & Gallery Bulk Actions
- Image Edit Layer Core & Bug Fixes
- G'MIC Routes
- Ollama Routes
- Gallery Metadata/Service Bridge
- Image Edit Text Tool
- Mask Editor One BiRefNet/SAM3 Integration
- Eagle Routes Backend
- Prompts API Routes/Service
- Workflow Analyzer
- Gallery Tab Core & Feeder Group
- AI TOOL Backend & Model Tab Updates
- Tagger Tab Implementation & Security Fixes
- Eagle Routes Backend
- Prompts API Routes/Service
- Metadata & Nodes Tab Core
- AI Tool Tab Frontend
- Node Sets Menu & Sidebar
- Gallery Feeder Extension (Frontend)
- Gallery Speed & Bulk Features
- Style Catalog & Batch Loop Core
- Metadata Tab Node Support History
- Image Edit Background Removal (BgRemove.js)
- Gallery Feeder Node (Backend)
- App Shell & i18n Init
- Generate Tab Frontend & Modals
- Image Edit Inpaint/I2I Actions
- Image Edit SAM3 Segmentation
- Node Sets Metadata Extraction
- Node Sets Prompt Extraction
- Inpaint Basic Workflow
- Gallery Feeder & Batch Features
- Gallery Service Background Indexing
- Settings/CivitAI Config Resolution
- Gallery Service Vault Helpers
- GenerateUI Lab Tab
- Style Prompt Seed Import Tool
- FireRed 3D Pose Image Edit Workflow
- Chat Image Generation & Inpaint Bridge
- Subgraph Workflow Support & Fixes
- KREA-2 & Lab Tab Extensions
- LoRA Pane Evolution & Help Tab
- Image Edit File Export (FileExport.js)
- Image Edit G'MIC Integration
- App Shell & i18n Init
- DWPose Image Feeder Workflow
- AI Tab & RAW JSON Search History
- Prompt Extraction Bug Fixes
- Comic Creator Bridge & LoRA Batch Fixes
- Settings/CivitAI Config Resolution
- Node Sets Menu Model Fetch
- G'MIC Integration & Security Fixes
- Comic Creator Integration Bridges
- GenerateUI Model Tab GGUF/Embedding Support
- Bypass Node Handling & Advanced Sampling
- Prompt Text Node
- Gallery Metadata/Service Bridge
- Gallery Service Vault Helpers
- PNG Metadata Extractor
- AI Skills & Help Redesign
- Prompt Extraction Bug Fixes
- AI TOOL Chat & Wildcard Features
- Config & Service Modules
- Group Feature Path Bug Fixes
- SVG Generation & Display Support
- Send to Canvas Feature
- Module Split Refactor (v0.4.0)
- CivitAI Detail Panel History
- GenerateUI Layout & JSON Highlight
- Workflow Tab Bug Fixes
- CivitAI Batch Fetch Optimization
- DEVLOG JSON Highlighting & Subgraph
- Mask Tool 5 Sub-tools
- Prestartup Script
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
- Default View Setting
- Latent Resolution Presets
- Send to Canvas Toast Fix
- ZIT/Lumina2 Prompt Fix
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
- Main Stylesheet
- SD1.5 T2I Basic Workflow
- SDXL T2I Basic Workflow Screenshot

## God Nodes (most connected - your core abstractions)
1. `t()` - 174 edges
2. `showToast()` - 138 edges
3. `escapeHtml()` - 57 edges
4. `ImageEditTab` - 53 edges
5. `GalleryService` - 45 edges
6. `initPromptTab()` - 34 edges
7. `setup_routes()` - 32 edges
8. `initSettingsTab()` - 31 edges
9. `add()` - 31 edges
10. `renderModelGrid()` - 28 edges

## Surprising Connections (you probably didn't know these)
- `Sidepanel Information (I) Tab` --semantically_similar_to--> `Metadata Tab`  [INFERRED] [semantically similar]
  templates/index.html → README.md
- `Batch Type: Checkpoint` --shares_data_with--> `Models Tab`  [EXTRACTED]
  templates/index.html → README.md
- `Workflow Tab` --shares_data_with--> `Badge System (shared)`  [EXTRACTED]
  README.md → templates/index.html
- `Settings Tab` --conceptually_related_to--> `Settings: Connections (ComfyUI/Ollama/Eagle)`  [EXTRACTED]
  README.md → templates/index.html
- `Settings Tab` --conceptually_related_to--> `Settings: Workflow Defaults`  [EXTRACTED]
  README.md → templates/index.html

## Import Cycles
- 3-file cycle: `static/js/ai-tab.js -> static/js/app.js -> static/js/gallery-tab.js -> static/js/ai-tab.js`
- 3-file cycle: `static/js/feeder-tab.js -> static/js/gallery-tab.js -> static/js/generate-tab.js -> static/js/feeder-tab.js`
- 3-file cycle: `static/js/app.js -> static/js/generate-tab.js -> static/js/feeder-tab.js -> static/js/app.js`
- 3-file cycle: `static/js/app.js -> static/js/gallery-tab.js -> static/js/image-prompt-tab.js -> static/js/app.js`
- 3-file cycle: `static/js/app.js -> static/js/gallery-tab.js -> static/js/style-catalog-tab.js -> static/js/app.js`
- 3-file cycle: `static/js/app.js -> static/js/image-edit-tab.js -> static/js/image-edit/MaskEditorOneBridge.js -> static/js/app.js`
- 3-file cycle: `static/js/app.js -> static/js/image-edit-tab.js -> static/js/image-edit/BlurTool.js -> static/js/app.js`
- 3-file cycle: `static/js/app.js -> static/js/models-tab.js -> static/js/models/badges.js -> static/js/app.js`
- 3-file cycle: `static/js/app.js -> static/js/image-edit-tab.js -> static/js/image-edit/GmicIntegration.js -> static/js/app.js`
- 3-file cycle: `static/js/app.js -> static/js/image-edit-tab.js -> static/js/image-edit/FileExport.js -> static/js/app.js`
- 3-file cycle: `static/js/app.js -> static/js/image-edit-tab.js -> static/js/image-edit/InpaintI2IActions.js -> static/js/app.js`
- 3-file cycle: `static/js/app.js -> static/js/image-edit-tab.js -> static/js/image-edit/BgRemove.js -> static/js/app.js`
- 3-file cycle: `static/js/app.js -> static/js/image-edit-tab.js -> static/js/image-edit/Sam3Segmentation.js -> static/js/app.js`
- 4-file cycle: `static/js/feeder-tab.js -> static/js/gallery-tab.js -> static/js/style-catalog-tab.js -> static/js/generate-tab.js -> static/js/feeder-tab.js`
- 4-file cycle: `static/js/app.js -> static/js/workflow-tab.js -> static/js/generate-tab.js -> static/js/feeder-tab.js -> static/js/app.js`
- 4-file cycle: `static/js/app.js -> static/js/prompt-tab.js -> static/js/generate-tab.js -> static/js/feeder-tab.js -> static/js/app.js`
- 4-file cycle: `static/js/app.js -> static/js/gallery-tab.js -> static/js/generate-tab.js -> static/js/feeder-tab.js -> static/js/app.js`
- 4-file cycle: `static/js/app.js -> static/js/workflow-tab.js -> static/js/models-tab.js -> static/js/models/badges.js -> static/js/app.js`
- 5-file cycle: `static/js/ai-tab.js -> static/js/app.js -> static/js/generate-tab.js -> static/js/feeder-tab.js -> static/js/gallery-tab.js -> static/js/ai-tab.js`
- 5-file cycle: `static/js/app.js -> static/js/generate-tab.js -> static/js/feeder-tab.js -> static/js/gallery-tab.js -> static/js/style-catalog-tab.js -> static/js/app.js`

## Hyperedges (group relationships)
- **Gallery Feeder System** — devlog_gallery_feeder_node, devlog_gallery_feeder_canvas_controls, devlog_feeder_group_protection, devlog_feeder_tab_gallery_mode [EXTRACTED 0.90]
- **LoRA Pane Iterative Evolution (v0.3.29-v0.3.33)** — devlog_v0_3_29_lora_section_integration, devlog_v0_3_30_lora_trigger_bugfix, devlog_v0_3_31_lora_single_stack_tabs, devlog_v0_3_32_loramanager_detection, devlog_v0_3_33_lora_pane_bugfix [EXTRACTED 0.90]
- **Shared Badge System Across Workflow and Models Tabs** — templates_index_badge_system, readme_workflow_tab, readme_models_tab [EXTRACTED 1.00]
- **ComfyUI Comic Creator Bidirectional Bridge Functions** — devlog_comic_creator_integration, devlog_v0_3_69_send_cc_button, devlog_i2i_bridge_receive_image, devlog_v0_3_76_i2i_run_bridge, devlog_v0_3_72_comic_creator_inpaint_entrypoint, devlog_v0_3_80_comic_creator_bridge [EXTRACTED 1.00]
- **Mask Editor One Integration Features (BiRefNet/SAM3/ABR/Icon Fix/Connect Button)** — devlog_mask_editor_one_custom_node, devlog_birefnet_bg_remove_integration, devlog_sam3_segmentation_integration, devlog_mask_tool_abr_brush_support, devlog_bg_image_b64_field_rename_fix, devlog_v0_4_0_mask_editor_one_connect_button [EXTRACTED 1.00]
- **Feeder Group Image Queueing Flow** — readme_feeder_group, readme_gallery_tab, templates_index_feeder_gallery_mode, templates_index_wfs_galleryfeeder_node [EXTRACTED 1.00]
- **node_sets_menu.js Sidepanel Evolution Across Versions** — devlog_v0_1_7_nodes_tab, devlog_v0_1_8_wf_node_library, devlog_v0_1_9_sidepanel_improvements, devlog_v0_2_0_prompt_presets, devlog_v0_2_3_badge_unification_genui_model, devlog_v0_2_5_category_package_theme [EXTRACTED 1.00]
- **AI TOOL Tab multi-backend support** — readme_ai_tool_tab, readme_ollama, readme_lm_studio, readme_lemonade_server, readme_unsloth [EXTRACTED 1.00]
- **Feeder generation-loop ecosystem** — readme_feeder_subtab, readme_image_loop_mode, readme_gallery_mode, readme_wfs_galleryfeeder_node, readme_feeder_group [EXTRACTED 1.00]
- **GenerateUI 6-tab layout** — readme_generateui, readme_feeder_subtab, readme_batch_tab, readme_lab_subtab [EXTRACTED 1.00]
- **py/routes API layer (per-tab route modules)** — readme_workflow_routes_py, readme_models_routes_py, readme_nodes_routes_py, readme_settings_routes_py, readme_gallery_routes_py [EXTRACTED 1.00]
- **GenerateUI Style System (shared named-Style registry)** — readme_style_manager, readme_generateui, readme_batch_tab, readme_style_catalog_gallery_subtab, readme_create_catalog [EXTRACTED 1.00]
- **Release & Registry Publish Flow** — claude_release_procedure, github_workflows_publish_trigger, readme_version_badge, github_workflows_publish_action [EXTRACTED 1.00]
- **Shared Style File System Across Tabs** — templates_index_style_system, templates_index_style_feature, templates_index_style_manager_prompt, templates_index_batch_style_type, templates_index_create_catalog_feature, templates_index_gallery_stylecatalog_panel [EXTRACTED 1.00]
- **Path Traversal Protection Pattern (_safe_path)** — devlog_v0_1_6_path_traversal_fix, devlog_v0_3_3_wildcard_panel, devlog_v0_2_8_data_dir_export_import [INFERRED 0.70]
- **Shared Badge Palette System (Workflow/Models tabs)** — devlog_v0_2_3_badge_unification_genui_model, devlog_v0_3_0_model_group_display, devlog_v0_2_9_model_enable_disable [INFERRED 0.80]
- **Batch Reserved Group System** — devlog_reserved_groups_mechanism, devlog_models_batch_group_ui, devlog_prompt_workflow_batch_group_ui, devlog_v0_3_24 [INFERRED 0.80]
- **CivitAI Integration Pipeline** — devlog_v0_3_17, devlog_v0_3_19, devlog_v0_3_20, devlog_v0_3_21 [INFERRED 0.80]
- **ComfyUI Custom Node Robustness Patterns** — claude_is_changed_caching, claude_validate_inputs_pitfall, claude_hidden_inputs, claude_lazy_inputs, claude_safe_node_loading [INFERRED 0.85]
- **Recurring Dev/Runtime Deployment Sync Failures Across Versions** — devlog_dev_deploy_sync_reminder, devlog_v0_3_69_send_cc_button, devlog_v0_3_70_ollama_404_prompt_weight [INFERRED 0.85]
- **LoraManager Integration** — devlog_v0_3_17, devlog_v0_3_25, devlog_v0_3_26, devlog_lora_manager_format [INFERRED 0.85]
- **Image Edit Tab Tool Suite** — devlog_v0_3_53_image_edit_tab, devlog_v0_3_54_shape_tool, devlog_v0_3_57_blur_tool, devlog_v0_3_57_bgremove_tool, devlog_v0_3_59_mask_tool, devlog_gmic_qt_filter_tool [INFERRED 0.90]
- **Mask Editor One Inpainting Pipeline** — comfyui-workflow-studio_workflows_ws_inpaint_mask_editor_one_load_checkpoint_node, comfyui-workflow-studio_workflows_ws_inpaint_mask_editor_one_mask_editor_one_node, comfyui-workflow-studio_workflows_ws_inpaint_mask_editor_one_clip_text_encode_positive_node, comfyui-workflow-studio_workflows_ws_inpaint_mask_editor_one_clip_text_encode_negative_node, comfyui-workflow-studio_workflows_ws_inpaint_mask_editor_one_vae_encode_for_inpainting_node, comfyui-workflow-studio_workflows_ws_inpaint_mask_editor_one_save_image_node [INFERRED]

## Communities (171 total, 52 thin omitted)

### Community 0 - "Models Tab Frontend"
Cohesion: 0.10
Nodes (77): badgeHtml(), bindBadgeModalEvents(), bindBadgeRowEvents(), getBadgePalette(), modelBadgesHtml(), _onGridChange(), openBadgeEditModal(), renderBadgeFilter() (+69 more)

### Community 1 - "Models API Routes"
Cohesion: 0.06
Nodes (55): handle_change_preview(), handle_civitai_batch(), handle_civitai_cache(), handle_civitai_fetch(), handle_delete_models(), handle_get_disabled(), handle_get_filepath(), handle_get_groups() (+47 more)

### Community 2 - "Tagger API Routes"
Cohesion: 0.07
Nodes (29): Connection, Image, handle_batch_start(), handle_batch_status(), handle_batch_stop(), handle_db_delete(), handle_db_export(), handle_db_list() (+21 more)

### Community 3 - "Image Edit Mask Tools (Code)"
Cohesion: 0.05
Nodes (6): MASK_TEXT_FONTS, MaskAlphaTool, MaskColorTool, MaskShapeTool, MaskTextTool, MaskVectorTool

### Community 4 - "Prompt Tab Frontend"
Cohesion: 0.08
Nodes (59): refreshStylesList(), addChatMessage(), apiCreatePreset(), apiDeletePreset(), apiUpdatePreset(), applyToGenerateUI(), attachFile(), chatWithAi() (+51 more)

### Community 5 - "Gallery API Routes"
Cohesion: 0.10
Nodes (54): add_to_group(), bulk_favorite(), bulk_group(), clear_group_images(), create_folder_route(), create_group(), delete_folder_route(), delete_group() (+46 more)

### Community 6 - "Gallery Tab Frontend & Toasts"
Cohesion: 0.10
Nodes (53): addTag(), API, apiFetch(), _appendNextPage(), _applySelectionToDOM(), _attachScrollSentinel(), bindEvents(), bulkAddToGroup() (+45 more)

### Community 8 - "Tagger/Prompt i18n Helpers"
Cohesion: 0.11
Nodes (50): _appendSvgPreview(), closeModal(), showToast(), _applyDefaultCheckpointIfEnabled(), handleGenerate(), loadWorkflowIntoEditor(), openCatalogCreateModal(), saveCurrentWorkflow() (+42 more)

### Community 9 - "GenerateUI Feeder Tab"
Cohesion: 0.10
Nodes (50): _applyGalToWorkflow(), _applyPreset(), _applyToGalNode(), _applyToNode(), _applyToWorkflow(), _deletePreset(), _deselectAll(), _feederNodes() (+42 more)

### Community 10 - "Nodes API Routes"
Cohesion: 0.09
Nodes (28): handle_create_set(), handle_delete_set(), handle_export_set(), handle_get_groups(), handle_get_metadata(), handle_list_sets(), handle_save_groups(), handle_save_metadata() (+20 more)

### Community 11 - "Settings API Routes"
Cohesion: 0.09
Nodes (44): _apply_import_bundle(), _build_export_bundle(), _find_style(), _get_comfyui_output_dir(), handle_create_style(), handle_delete_style(), handle_export(), handle_get() (+36 more)

### Community 12 - "App Shell & i18n Init"
Cohesion: 0.09
Nodes (43): getLang(), getLanguageOptions(), getSummaryLang(), getSummaryLanguageOptions(), getSummaryPrompt(), LANGUAGE_OPTIONS, LANGUAGES, setLang() (+35 more)

### Community 13 - "Nodes Tab Frontend"
Cohesion: 0.12
Nodes (42): buildPromptItem(), _applyNodeSelectionToDOM(), bulkNodeAddToGroup(), bulkNodeCreateAndAddToGroup(), bulkNodeRemoveFromGroup(), bulkNodeSetFavorite(), categoryBadgeHtml(), createNodeCard() (+34 more)

### Community 14 - "GenerateUI Lab Tab"
Cohesion: 0.12
Nodes (41): openModal(), _applyPlanData(), _applyStyleToText(), _buildIndexImageDataUrl(), _buildPlanData(), _buildWorkflowForIteration(), _cellHtml(), _cellLabel() (+33 more)

### Community 15 - "Metadata Tab Frontend"
Cohesion: 0.11
Nodes (39): buildLoRAItem(), buildModelItem(), collectAllNodes(), collectUnique(), extractAllMetadata(), fromWorkflow(), extractCheckpoints(), extractDiffusionModels() (+31 more)

### Community 16 - "Node Sets Menu & Sidebar"
Cohesion: 0.09
Nodes (38): AI_BACKEND_DEFAULT_URLS, AI_LANG_NAMES, convertApiToUiWorkflow(), _extractAllMetadata(), _extractWorkflowFromEXIF(), fetchGroups(), fetchMetadata(), fetchNodeSets() (+30 more)

### Community 17 - "AI Tool Tab Frontend"
Cohesion: 0.12
Nodes (38): appendChatBubble(), _appendSkillSaveButton(), buildTranslationMessages(), cleanTranslationOutput(), _extractSkillBlock(), _extractSvgCode(), fetchModels(), generateImageFromChat() (+30 more)

### Community 18 - "Generate Tab Frontend & Modals"
Cohesion: 0.09
Nodes (37): _applyNamedStyle(), _applyStyleToWorkflow(), _batchGroupState, _batchStyleSelected, _blobToDataUrl(), _buildFolderTree(), _ckptBatch, _ckptState (+29 more)

### Community 19 - "Workflow Tab Frontend & Storage"
Cohesion: 0.13
Nodes (34): badgeHtml(), _buildStructuredSummaryText(), _buildSummarySourceText(), clearBatch(), closeSidePanel(), deleteWorkflow(), fetchWorkflows(), filterWorkflows() (+26 more)

### Community 20 - "Wildcard Service & Routes"
Cohesion: 0.12
Nodes (21): handle_create_link(), handle_delete(), handle_get_content(), handle_link_status(), handle_list(), handle_remove_link(), handle_save(), Application (+13 more)

### Community 21 - "CivitAI Service & Data Import/Export"
Cohesion: 0.06
Nodes (36): CivitAI, CivitAI Integration, py/services/civitai_service.py, Data Management (export/import), G'MIC-Qt Integration, Highlight color (v0.3.98), static/js/i18n.js, static/js/json-highlight.js (+28 more)

### Community 22 - "GenerateUI Tab & AI Chat Features"
Cohesion: 0.07
Nodes (36): ComfyUI-Impact-Pack (external), Eagle Integration, GenerateUI Tab, Lab Subtab, Wildcard Integration (Settings), Alt+Click Apply & Generate, Batch Type: Checkpoint, Batch Type: Prompt (+28 more)

### Community 23 - "ComfyUI Client & Editor"
Cohesion: 0.09
Nodes (26): _applyLoraToNode(), _attachPromptWeightControl(), _buildLoraManagerSyntax(), _buildLoraSyntax(), _buildPresetOptions(), _compositeImageWithMask(), _I2I_PLACEHOLDER_DEFAULT, _imageInputToDataURL() (+18 more)

### Community 24 - "DEVLOG v0.1.x Early Features"
Cohesion: 0.08
Nodes (30): Feeder Tab (GenerateUI), Gallery タブ追加 & 全タブ Group UI 統一, node_sets_menu.js (ComfyUI Sidepanel Library), プロジェクトリネーム & アイコン適用（Workflow-Manager→Workflow-Studio）, プロンプトタブ 中国語↔英語翻訳追加, テーマカスタマイズ機能・設定タブ改善, トップバーボタンアイコン修正・Appモードバッジ調査, v0.1.0 リリース（GitHub公開・ComfyUI Manager登録） (+22 more)

### Community 25 - "AI Chat/VLM Sidebar Helpers"
Cohesion: 0.11
Nodes (28): _aiApplyGenOptions(), aiCallChat(), aiCallLLM(), aiCallVLM(), aiFetchModels(), aiFileToBase64(), aiLooksUntranslated(), aiSkillDeleteFile() (+20 more)

### Community 26 - "AI TOOL Tab Backends"
Cohesion: 0.09
Nodes (28): static/js/ai-tab.js, AI TOOL Tab, Lemonade Server, LM Studio, Ollama, py/routes/ollama_routes.py, Prompt Tab, static/js/prompt-tab.js (+20 more)

### Community 27 - "Node Sets Menu UI Components"
Cohesion: 0.14
Nodes (27): ../../scripts/ui/components/button.js, ../../scripts/ui/components/buttonGroup.js, getNodeSetsIcon(), NODE_SETS_TOOLTIP, attachTopMenuButton(), beforeRegisterNodeDef(), captureCanvasSnapshot(), compareVersions() (+19 more)

### Community 28 - "Node Sets Draggable Items"
Cohesion: 0.16
Nodes (28): createDraggableItem(), createDraggablePromptItem(), createDraggableWfItem(), esc(), extractPackageName(), getNodeCategory(), getNodePackage(), getWfBadges() (+20 more)

### Community 29 - "Workflow API Routes"
Cohesion: 0.15
Nodes (26): handle_analyze(), handle_change_thumbnail(), handle_delete(), handle_import(), handle_list(), handle_metadata(), handle_raw(), handle_reanalyze_all() (+18 more)

### Community 30 - "Gallery Metadata Store"
Cohesion: 0.13
Nodes (9): GalleryMetadataStore, Path, グループ名を変更し、全画像のgroupsフィールドも更新する, gallery_metadata.json の構造: { "images": { "<abs_path>": { "favorite": bool,…, 存在しないパスをグループから一括削除する（1回の保存で完結）, グループメンバーのパスをsetで返す（高速フィルタ用）, グループ内の全画像を除外する（グループ自体は残す）, 画像のパスキーを変更する（ファイル移動後のメタデータ引継ぎ） (+1 more)

### Community 31 - "Workflow Service Metadata/Import"
Cohesion: 0.13
Nodes (13): Get raw workflow JSON content., Save metadata (tags, memo, summary, etc.) for a workflow., Manages workflow files and metadata., Import workflow files. Returns list of results., Rename workflow and its associated thumbnail., Delete workflow JSON and associated thumbnail., Re-analyze a workflow and save results to metadata., Re-analyze all workflows and update metadata. (+5 more)

### Community 32 - "CLAUDE.md Node Dev Rules"
Cohesion: 0.10
Nodes (25): CLAUDE.md Development Guidelines, Bounded Module-level Cache Pattern, ComfyUI Restart Required After Python Change, Pre-Commit Checklist, Loose Dependency Pinning Policy, Source Repo vs custom_nodes Deploy Sync, folder_paths-based File Path Handling, Hidden Inputs (UNIQUE_ID/PROMPT/EXTRA_PNGINFO) (+17 more)

### Community 33 - "Lab Tab & PNG Metadata Utilities"
Cohesion: 0.09
Nodes (25): wfm:apply-and-generate Custom Event (Circular Import Avoidance), embedPngTextChunk() iTXt PNG Chunk Embedding (util.js), extractAllMetadata() Exported Reusable Prompt Extraction, Gallery Root Folder Label Simplification ("[root]"), Lab Index Image Save-to-Output + Eagle Auto-Save, Lab Keyframe Data Model (atIteration/value/revertToBase), Lab Plan JSON "Open Workflow" Button (Dynamic Import), Lab Tab Plan JSON Sub-tab (Refresh/Apply to Setting) (+17 more)

### Community 34 - "Lab Plan Service & Routes"
Cohesion: 0.15
Nodes (14): handle_delete(), handle_get_content(), handle_list(), handle_save(), handle_save_index_to_output(), Application, Request, Response (+6 more)

### Community 35 - "Skill Service & Routes"
Cohesion: 0.14
Nodes (16): handle_delete(), handle_get_content(), handle_list(), handle_save(), Application, Request, Response, AI skill (.md system prompt) file management API routes. (+8 more)

### Community 39 - "CivitAI Service"
Cohesion: 0.15
Nodes (11): CivitaiService, Build request headers, optionally including Bearer token., Calculate SHA256 hash of a file., Fetch model version info from CivitAI by SHA256 hash (GET). 429/5xx…, POST /model-versions/by-hash でハッシュリストを一括取得（最大100件/リクエスト）。 レスポンスの…, Extract relevant fields from CivitAI API response., Batch fetch CivitAI info for multiple model files. Phase 1: SHA256…, Clear cache for a specific hash or all. (+3 more)

### Community 41 - "Gallery Service Core"
Cohesion: 0.15
Nodes (8): Path, パスが許可ルート配下かチェック（パストラバーサル防止）。 Output ギャラリーの _allowed_root、またはComfyUI実outputフォルダの…, ワークフローを抽出する。 優先順位: PNG[workflow] > PNG[prompt] > gallery_metadata.json[workflow], 複数画像のグループ追加 / 削除を一括処理する。action は "add" または "remove"。, 選択フォルダ内に新しいサブフォルダを作成する, 画像ファイルを別フォルダへ移動する（複数対応）, 画像のPathオブジェクトを返す（ルートで使用）, 縮小サムネイルのPathを返す。 ディスクキャッシュがあればそれを返し、なければPillowで生成して保存する。…

### Community 42 - "Eagle Routes Backend"
Cohesion: 0.14
Nodes (20): _eagle_add(), _eagle_add_from_path(), _eagle_test(), handle_add(), handle_test(), Application, Request, Response (+12 more)

### Community 43 - "Style Catalog Tab"
Cohesion: 0.19
Nodes (20): selectStyleByName(), _wireLabValueFilter(), activateStyleCatalogTab(), API, apiFetch(), copyText(), createThumbCard(), debounce() (+12 more)

### Community 44 - "Image Prompt Tab"
Cohesion: 0.21
Nodes (20): activateImagePromptTab(), addSelectedToChips(), API, apiFetch(), cleanPromptText(), clearAllChips(), copyFinalPrompt(), createThumbCard() (+12 more)

### Community 45 - "SDXL 3D Pose Editor DWPose Workflow"
Cohesion: 0.19
Nodes (20): CLIP Text Encode Negative Prompt Node, CLIP Text Encode Positive Prompt Node, Inpaint with Mask Editor One (Workflow Screenshot), Load Checkpoint Node, Mask Editor One Node, Save Image Node, VAE Encode (for Inpainting) Node, 3D Pose Editor Node (comfyui-vrm-pose-editor) (+12 more)

### Community 46 - "Gallery Service Core"
Cohesion: 0.10
Nodes (7): GalleryService, 許可するルートパスを更新する（Settings変更時に呼ぶ）, ComfyUI実outputフォルダの不変ルートを設定する（起動時に一度だけ呼ぶ）, フォルダ内の未キャッシュ画像をバックグラウンドでインデックスする。 フォルダロード時に呼び出す。前回のインデックス処理は自動キャンセル。, outputフォルダのフォルダツリーを返す, ImagePromptギャラリーのルートフォルダ(ComfyUI実output/ws_image_prompt)を 返す。無ければ作成する。, Style Catalogギャラリーのルートフォルダ(ComfyUI実output/ws_style_catalog)を 返す。無ければ作成する。

### Community 47 - "Image Edit Tab & Mask Editor One"
Cohesion: 0.13
Nodes (20): Image Edit Tab, Mask Editor One Integration, Mask slot for inpainting (v0.3.71), G'MIC-Qt Standalone, Help Tab, ABR Brush Library (Mask Editor One), Image Edit BG Remove Tool, Image Edit Blur Tool (Whole/Rect Blur & Mosaic) (+12 more)

### Community 48 - "App Shell & Nodes Tab Ecosystem"
Cohesion: 0.13
Nodes (19): ComfyUI-Workflow-Studio README, Canvas Snapshot Feature, ComfyUI-Custom-Scripts (external), Node Sets, web/comfyui/node_sets_menu.js, py/routes/nodes_routes.py, py/services/nodes_service.py, Nodes Tab (+11 more)

### Community 49 - "Node Sets Menu Model Fetch"
Cohesion: 0.22
Nodes (19): add(), fetchWorkflowRaw(), getCanvasDropPos(), handleInfoFile(), installCanvasDropHandler(), loadWorkflowOnCanvas(), placeClipTextEncodeNode(), placeLoraMgrNode() (+11 more)

### Community 50 - "Image Edit Background Removal"
Cohesion: 0.18
Nodes (7): comfyUI, comfyEditor, comfyWorkflow, MaskEditorOneBridge, fitToCanvas(), TOOL_DEFS, TEXT_FONTS

### Community 51 - "ComfyUI Workflow Utilities"
Cohesion: 0.20
Nodes (13): _CONTROL_AFTER_GENERATE, _findInjectedWidgetIndex(), _flattenSubgraphs(), _getDynamicComboSubNames(), _getWidgetInputNames(), _getWidgetInputTypes(), _isExtraWidgetValue(), _isLinkedWidgetName() (+5 more)

### Community 52 - "Generate Tab Frontend & Modals"
Cohesion: 0.20
Nodes (18): _buildSimpleGroupList(), _getGroupSelCount(), _getGroupSelCountFrom(), initBatchTab(), _loadBatchCheckpointGroups(), _loadBatchLoraGroups(), _loadPromptGroupsForBatch(), _loadWorkflowGroupsForBatch() (+10 more)

### Community 53 - "Batch Group UI & Security Fixes"
Cohesion: 0.12
Nodes (17): GenerateUI Batch 4-Type Group Selection (unreleased), Batch Queue Sampler/Scheduler Columns, LoraManager Data Format (__value__ / text), LORA SYNTAX innerHTML Display Bug, Models Batch Group Registration UI (unreleased), Prompt/Workflow Batch Group Registration UI (unreleased), RESERVED_GROUPS Mechanism, SSL CERT_NONE MitM Vulnerability (+9 more)

### Community 54 - "DEVLOG Early History & Manager Registration"
Cohesion: 0.12
Nodes (17): comfyui-image-feeder (external node), __Feeder__ reserved group, Feeder Subtab, static/js/feeder-tab.js, web/comfyui/gallery_feeder_extension.js, py/nodes/gallery_feeder_node.py, Gallery mode (Feeder), Help & Support Tab (+9 more)

### Community 55 - "App Shell & ComfyUI Ecosystem Refs"
Cohesion: 0.12
Nodes (16): static/js/app.js, ComfyUI, static/js/comfyui-client.js, ComfyUI-Lora-Manager (external), ComfyUI Manager, ComfyUI-Workflow-Studio, py/config.py, data/ (fallback data dir) (+8 more)

### Community 56 - "GenerateUI Batch & Workflow Editor Core"
Cohesion: 0.14
Nodes (16): Batch tab (v0.3.18), Bypass/Mute node handling (v0.3.75), static/js/comfyui-editor.js, Create Catalog / Catalog buttons (v0.3.95), Eagle, py/routes/eagle_routes.py, Emphasis weight editing (v0.3.70), Fooocus (external, by lllyasviel) (+8 more)

### Community 59 - "Tagger Tab & Gallery Bulk Actions"
Cohesion: 0.16
Nodes (15): prestartup_script.py Early Env Setup, Tagger Tab, static/js/tagger-tab.js, Unsloth Backend (AI TOOL Tab), Tagger Tab requirements.txt, onnxruntime (WD Tagger / SwinV2), piexif (JPEG EXIF tag writing), python-dotenv (Unsloth .env loading) (+7 more)

### Community 60 - "Image Edit Layer Core & Bug Fixes"
Cohesion: 0.16
Nodes (15): async Event Handler e.currentTarget Null-After-Await Pattern, Draw/Mask Layer Disappearing Bug Fix, G'MIC-Qt Filter Tool Integration, Image Edit Layer Lock Feature, LayerManager.js (Layer Compositing Core), Image Edit Save to Gallery Feature, MaskTool.js, Models Tab Overlay Button Not-Updating Bug Fix (+7 more)

### Community 61 - "G'MIC Routes"
Cohesion: 0.21
Nodes (14): _gmic_run_gui(), handle_open(), handle_result(), handle_status(), Application, Request, Response, G'MIC-Qt integration API routes. (+6 more)

### Community 62 - "Ollama Routes"
Cohesion: 0.23
Nodes (14): _get_ollama_config(), handle_chat(), handle_models(), handle_test(), Application, Request, Response, Ollama API proxy routes. (+6 more)

### Community 63 - "Gallery Metadata/Service Bridge"
Cohesion: 0.15
Nodes (11): Gallery Metadata Store - ギャラリー画像のメタデータ永続化, _clean_vault_tags(), _decode_image_data_url(), _parse_vault_yaml_leaves(), Gallery Service - outputフォルダの画像管理、メタデータ閲覧, data URL (data:<mime>;base64,<data>) をデコードし (バイト列, 拡張子) を返す。 ヘッダが無ければPNG扱い（旧互換）。, OSで使えない文字を除去し、拡張子が無ければ付与する, 任意フォルダへ画像を保存する（data URL想定、同名なら上書き）。 Style Catalogのカタログ作成（スタイル名でのファイル保存）で使用。 (+3 more)

### Community 65 - "Mask Editor One BiRefNet/SAM3 Integration"
Cohesion: 0.15
Nodes (14): store_image API bg_image_b64 Field Rename Compatibility Fix, BiRefNet BG Remove (Mask Editor One Integration), Mask Editor One (comfyui-mask-editor-one Custom Node), Mask Layer Add/Subtract Composite Mode (toggleOperation), MaskTool.js ABR Brush Support (spacing/angle/jitter), Plan: Image Edit Extension — ABR Brush + Mask Editor One Integration, SAM3 Text-Prompt Segmentation (Mask Editor One Integration), Top Bar Icon Disappearance Fix (MutationObserver, top_menu_extension.js) (+6 more)

### Community 66 - "Eagle Routes Backend"
Cohesion: 0.23
Nodes (11): Request, Response, Serve the main SPA page., Serve files from the current workflows directory (dynamic path)., Serve files (index thumbnails) from the Lab plan directory., Main entry point for Workflow Studio plugin., Register all routes with ComfyUI's server., serve_index_page() (+3 more)

### Community 67 - "Prompts API Routes/Service"
Cohesion: 0.25
Nodes (13): handle_create(), handle_delete(), handle_list(), handle_update(), Application, Request, Response, Prompt presets API routes. (+5 more)

### Community 68 - "Workflow Analyzer"
Cohesion: 0.20
Nodes (13): analyze_workflow(), _clip_type_from_ui_node(), _collect_all_ui_nodes(), _detect_model_type_from_name(), _model_name_from_api_node(), _model_name_from_ui_node(), Workflow analyzer - detects model types and counts input/output nodes., Analyze workflow JSON and return model types, input/output node counts. (+5 more)

### Community 69 - "Gallery Tab Core & Feeder Group"
Cohesion: 0.15
Nodes (14): ComfyUI-Gallery (external, by PanicTitan), Folder tree root label (v0.3.90), py/services/gallery_metadata.py, py/routes/gallery_routes.py, py/services/gallery_service.py, Gallery Tab, static/js/gallery-tab.js, static/js/image-prompt-tab.js (+6 more)

### Community 70 - "AI TOOL Backend & Model Tab Updates"
Cohesion: 0.15
Nodes (13): AI_BACKEND_DEFAULT_URLS / getAiBackendDefaultUrl() Helper (util.js), GenerateUI Model Tab Active Highlight Color Feature, ponyxlWildcardsVault Format Live (Un-imported) Support, reasoning_content Field Handling Bug Fix (Unsloth), SSRF Credential Leak Fix (Unsloth Proxy baseUrl allowlist), AI TOOL Thinking Mode / Max Tokens Setting, Prompt Data as .txt Sidecar Files (Avoiding gallery_metadata.json Contention), Unsloth Server-Side Proxy (unsloth_routes.py) (+5 more)

### Community 71 - "Tagger Tab Implementation & Security Fixes"
Cohesion: 0.15
Nodes (13): Gallery Detail Panel UI Improvement (Tab/Action Row Split), Gallery Tag Save Bug Fix (tags.forEach not a function), Path Traversal Security Fix (Tagger + Gallery), Security Fix: XSS Escaping + Path Validation (2026-06-20), Tagger Batch .txt Output Feature, Tagger Single GenUI:P Button, TaggerService / TaggerDbService (Backend), Tagger Tab New Implementation (+5 more)

### Community 72 - "Eagle Routes Backend"
Cohesion: 0.19
Nodes (12): _get_api_key(), handle_proxy(), _is_allowed_base_url(), Application, Request, Response, Unsloth API proxy routes. Unlike Ollama/LM Studio/Lemonade, Unsloth Desktop…, Return the Unsloth API key from the environment (.env), or None. (+4 more)

### Community 73 - "Prompts API Routes/Service"
Cohesion: 0.28
Nodes (3): PromptsService, Prompt presets management service., Manages prompt presets (CRUD, categories, favorites).

### Community 74 - "Metadata & Nodes Tab Core"
Cohesion: 0.17
Nodes (13): CLIPTextEncodeEditPlus edit+ support (v0.3.92), static/js/comfyui-workflow.js, Metadata Tab, static/js/metadata-tab.js, py/services/png_extractor.py, UI-to-API conversion, py/services/workflow_analyzer.py, Gallery Bulk Actions (Group/Favorite/Compare/Move/Export/Delete) (+5 more)

### Community 75 - "AI Tool Tab Frontend"
Cohesion: 0.26
Nodes (12): _applyGenOptions(), callChat(), callLLM(), callVLM(), _clearToolsImage(), fileToBase64(), _formatMessagesForBackend(), initVlmTab() (+4 more)

### Community 76 - "Node Sets Menu & Sidebar"
Cohesion: 0.22
Nodes (13): applyTheme(), buildThemePanel(), createPanel(), fetchModelGroups(), fetchModelMetadata(), fetchPrompts(), fetchWorkflows(), injectStyles() (+5 more)

### Community 77 - "Gallery Feeder Extension (Frontend)"
Cohesion: 0.36
Nodes (11): beforeRegisterNodeDef(), fetchGroupImages(), getInputWidget(), getOrCreate(), _ns, setWidgetValue(), startLoop(), stopLoop() (+3 more)

### Community 78 - "Gallery Speed & Bulk Features"
Cohesion: 0.20
Nodes (10): Background Daemon Thread Indexing Pattern (asyncio.to_thread + Cancelable Scan), Select All Button + Gallery Bulk Bar i18n, Bulk API Endpoint Pattern (Single Request vs N Parallel), v0.3.44 Gallery Image Compare Mode, v0.3.44 Gallery Prompt Full-Text Search, v0.3.44 Gallery Speedup (Server Thumbnails + Infinite Scroll), v0.3.45 Gallery Shift+Click Range Selection, v0.3.48 Gallery Image Download / Bulk ZIP Export (+2 more)

### Community 79 - "Style Catalog & Batch Loop Core"
Cohesion: 0.20
Nodes (10): Catalog Creation "Don't keep copy in Output" Option, Style/Prompt to ImagePrompt Full Rename, Prompt Tab Style Management Sub-tab (CRUD), Reuse Existing Batch/Selection UI Before Building New, _runBatchLoop() Generic Batch Loop, Backend save_image_to_folder() Generalization, Style Catalog Gallery Sub-tab, trackProgress() Timeout & execution_interrupted Handling Fix (+2 more)

### Community 80 - "Metadata Tab Node Support History"
Cohesion: 0.20
Nodes (10): CLIPLoader Widget Name Bug (clip_name1 to clip_name), model-and-prompt-from-metadata Custom Node Pack, Top Bar Icon Not Showing Bug, v0.3.10: Information Tab Canvas Drag Support, v0.3.11: Metadata Tab Node Type Expansion + Settings Text Size, v0.3.27: model-and-prompt-from-metadata Node Support, v0.3.6: Metadata Tab Addition, v0.3.7: Metadata Tab Flux2/Qwen/Z-Image Support (+2 more)

### Community 82 - "Gallery Feeder Node (Backend)"
Cohesion: 0.27
Nodes (4): Path, WFS_GalleryFeeder – Feeds images from a gallery group into a workflow., Gallery グループ内の画像をインデックス順に1枚ずつ出力するノード。, WFS_GalleryFeeder

### Community 83 - "App Shell & i18n Init"
Cohesion: 0.22
Nodes (7): applyI18nToHtml(), initModal(), _onHelpSearch(), initI18n(), applyJsonColors(), applyModelTabActiveColor(), applyTextareaFontSize()

### Community 84 - "Generate Tab Frontend & Modals"
Cohesion: 0.24
Nodes (6): initGenerateTab(), updateStatus(), highlightJSON(), syncJsonHighlight(), syncScroll(), refreshLabLiveDefaults()

### Community 87 - "Node Sets Metadata Extraction"
Cohesion: 0.36
Nodes (10): _collectAllNodes(), _collectUnique(), fromWorkflow(), _extractCheckpoints(), _extractDiffusionModels(), _extractLoRAs(), _extractMarkdownNoteModels(), addU() (+2 more)

### Community 88 - "Node Sets Prompt Extraction"
Cohesion: 0.33
Nodes (10): _extractPrompts(), _extractPromptsAPI(), _extractPromptsFromNodeSet(), _extractPromptsLiteGraph(), _isPromptStylerNode(), _isSamplerNode(), _isTextEncoderNode(), _resolveEditPlusText() (+2 more)

### Community 89 - "Inpaint Basic Workflow"
Cohesion: 0.53
Nodes (9): CLIP Text Encode (Prompt) - negative conditioning, CLIP Text Encode (Prompt) - positive conditioning, KSampler node (ddim sampler, 30 steps, cfg 4.0, denoise 1.00), Load Checkpoint node (hayochamixIDXL_v11+_bl checkpoint), Load Image node (clipspace painted mask input), Save Image node (ComfyUI filename prefix), VAE Decode node, VAE Encode (for Inpainting) node with grow_mask_by (+1 more)

### Community 90 - "Gallery Feeder & Batch Features"
Cohesion: 0.22
Nodes (9): __Feeder__ Reserved Group Protection + F Button + Seed Bug Fix, Feeder Tab Gallery Mode (vs Image Loop Mode), Feeder Tab UI Improvements (Root Auto-Select / Preview Pane Move / RUN Preview Sync), WFS_GalleryFeeder ComfyUI Canvas Controls Extension, WFS_GalleryFeeder Node (Gallery Feeder Feature), Models Tab Thumbnail Update Bug Fix (Cache/Corrupt-File/Disabled-Model), v0.3.28 Batch Tab Sampler/Scheduler Support, v0.3.56 Style Feature (GenerateUI Toolbar & Batch Tab) (+1 more)

### Community 91 - "Gallery Service Background Indexing"
Cohesion: 0.25
Nodes (5): Event, バックグラウンドスレッドで未キャッシュ画像のprompt_cacheを構築する。 10枚処理するたびに50msスリープしてメインスレッドへの影響を最小化。, PNG/JPEGからメタデータを抽出し、保存済みメタと合わせて返す, PNGのtEXtチャンクからメタデータを抽出, JPEGのEXIF/commentからメタデータを抽出（簡易）

### Community 92 - "Settings/CivitAI Config Resolution"
Cohesion: 0.28
Nodes (4): Return CivitAI API key. Env var CIVITAI_API_KEY takes priority over…, Merge updates into existing settings., Manages application settings (data/settings.json)., SettingsService

### Community 93 - "Gallery Service Vault Helpers"
Cohesion: 0.22
Nodes (4): 画像のプロンプトテキストを返す。 1. 画像と同名の .txt サイドカーがあればそれを使う 2. 無ければ ponyxlWildcardsVault 形式…, image_path の祖先を辿り、直下に thumbnails(_option2) を持つフォルダ…, ponyxlWildcardsVault形式のフォールバック解決。 thumbnails_option2 の "{leaf}.preview3.ext"…, 画像と同名の.txtサイドカーにプロンプトテキストを保存する

### Community 94 - "GenerateUI Lab Tab"
Cohesion: 0.36
Nodes (9): _coreGenerate(), _expandWildcardsInWorkflow(), _annotatedImageRef(), _maybeSaveIndexImageOnRun(), _runLabBatch(), _setRunUiState(), _waitIfPaused(), getEagleSettings() (+1 more)

### Community 95 - "Style Prompt Seed Import Tool"
Cohesion: 0.36
Nodes (8): clean_tags(), import_category(), main(), parse_yaml_leaves(), Path, Style/Prompt ギャラリー用シードデータ投入スクリプト。 comfyui_prompt_gallery / prompt_builder_proto…, comfyui_prompt_gallery の parseYamlForImages と同じ簡易パーサ（PyYAML不要）。 「key:」行の直後が「-…, 1カテゴリ分を投入する。戻り値: (copied, images_without_prompt, leaves_total)

### Community 96 - "FireRed 3D Pose Image Edit Workflow"
Cohesion: 0.32
Nodes (8): 3D Pose Editor node, FireRed-Image-Edit-1.1_fp8mixed_comfy.safetensors, FireRed-Image-Edit-1.0-Lightning-8steps-v1.0.safetensors (LoRA), Image Edit (FireRed Image Edit 1.1) node, qwen_2.5_vl_7b_fp8_scaled.safetensors (CLIP), qwen_image_vae.safetensors (VAE), Save Image node, 3D Pose Editor to Image Edit (Fire Red) Workflow

### Community 97 - "Chat Image Generation & Inpaint Bridge"
Cohesion: 0.29
Nodes (8): comfyEditor.applyImageToSlot() Method, "Use Dedicated Workflow" Toggle Pattern (Inpaint/Chat Image Gen Shared Design), generate_image Tool Call (LLM Tool Calling to ComfyUI Generation), tagger_settings.json Missing from Data Export Bug Fix, v0.3.62 Send GenUI Image Button + tagger_settings.json Export Fix, v0.3.71 Inpaint Feature (GenerateUI Image Tab + Image Edit Inpaint Tool), v0.3.73 AI TOOL Chat Tool Calling Image Generation + Checkpoint Safety, v0.3.74 AI TOOL Chat Image Attachment + I2I Bridge

### Community 98 - "Subgraph Workflow Support & Fixes"
Cohesion: 0.25
Nodes (8): detectFormat() App vs UI Judgment Criteria Fix (linearMode), DynamicCombo (COMFY_DYNAMICCOMBO_V3) Flat Dot-Key Input Fix, _flattenSubgraphs() Outer Widget Value Injection Into Inner Nodes, Subgraph Fan-out Fix: inputPortTargets Array + _wfmLiteralInputs, v0.3.78 GenerateUI/Metadata Tab Subgraph Workflow Support (Mage-Flow), v0.3.84 Ernie T2I "source" Validation Error / Subgraph Fan-out Bug, workflow_analyzer.py P:/I:/→ Count and Format Badge Fix, Workflow Tab Summarize: Structured Data Instead of Raw JSON Truncation

### Community 99 - "KREA-2 & Lab Tab Extensions"
Cohesion: 0.25
Nodes (8): DynamicCombo Multi-Slot Consumption Bug (sampling_mode), GenerateUI Input Image Placeholder Feature (Color/Image mode), KREA-2 Turbo Workflow Support, Lab Tab Bypass Checkbox (Per-Keyframe Row Disable), Lab Tab Clear / Get from Previous Buttons, Lab Tab Keyframe #1 Live Default Reflection, Role Propagation Bug: PreviewAny / StringConcatenate Relay Nodes, v0.3.97 KREA-2 Workflow Support + Lab Tab Extension + Input Image Placeholder

### Community 100 - "LoRA Pane Evolution & Help Tab"
Cohesion: 0.29
Nodes (8): GenerateUI Reset Workflow Button + Input Tab Tabify (2026-06-08), Help Tab Search Feature + Font Enlargement + Gallery-mode i18n, Help Tab Sidebar Layout (2-Column), v0.3.29 LoRA Section Integration (Single+Stack Merge), v0.3.30 LoRA Stack Trigger Words Bug Fix, v0.3.31 LoRA Pane Single/Stack Tab Split, v0.3.32 Lora Loader (LoraManager) LoRA Detection Support, v0.3.33 LoRA Pane / Workflow Parse Bug Fixes

### Community 103 - "App Shell & i18n Init"
Cohesion: 0.43
Nodes (7): AI_BACKEND_DEFAULT_URLS, _bytesToDataUrl(), _dataUrlToBytes(), embedPngTextChunk(), _joinBytes(), _n2b(), _pngCrc32()

### Community 104 - "DWPose Image Feeder Workflow"
Cohesion: 0.52
Nodes (7): DWPose Image Feeder Workflow, Apply ControlNet Node, DWPose Estimator Node (comfyui-controlnet-aux), Image Feeder Node (comfyui-image-feeder), KSampler Node, Load Checkpoint Node (animagineXLRealistic_v6), Load ControlNet Model Node (OpenPoseXL2)

### Community 105 - "AI Tab & RAW JSON Search History"
Cohesion: 0.29
Nodes (7): AI TOOL Tab English Localization, RAW JSON Panel Search Feature, v0.3.12: README Screenshot Refresh + workflow_analyzer Extension, v0.3.13: AI Tab (A) Addition, v0.3.14: AI TOOL Tab 3-Pane Redesign + RAW JSON Colors, v0.3.15: Sample Workflow Bundling + CivitAI Auto Preview, v0.3.16: CivitAI Preview Fallback Display

### Community 106 - "Prompt Extraction Bug Fixes"
Cohesion: 0.33
Nodes (7): ComfySwitchNode Branch Resolution (Prompt Enhancement Toggle), GenerateUI vs Metadata Tab: Separate Non-Synced Analysis Logic, node_sets_menu.js Local Duplication Pattern (web/comfyui/ import restriction), v0.3.79 Side Panel I-Tab Mage-Flow Subgraph Support, v0.3.82 Metadata Tab / Side Panel I-Tab Prompt Extraction Bug (LongCat/Boogu/HiDream E1/FireRed), v0.3.83 Ernie Image Support + Link-Sourced Prompt Pattern Fix, WFS_PromptText Node GenerateUI Prompt Tab Support + Drop Title Fix

### Community 107 - "Comic Creator Bridge & LoRA Batch Fixes"
Cohesion: 0.29
Nodes (7): Development Repo vs Runtime custom_nodes Folder Sync Reminder, _wfmReceiveImageForI2I I2I Receive Bridge (Comic Creator to WFS), LoRA Batch Path Separator Mismatch Fix + resolveLoraName(), LoRA Batch Execution Prompt Auto-Reflection + Restore, Prompt Weight Ctrl+Up/Down Editing (A1111-style), v0.3.69 Gallery to Comic Creator "Send CC" Button, v0.3.70 Ollama 404 Fix + Prompt Revert Button + Weight Ctrl+Arrow Editing

### Community 108 - "Settings/CivitAI Config Resolution"
Cohesion: 0.33
Nodes (5): _get_ssl_context(), _make_ssl_context(), CivitAI API integration service., Return an SSL context with CA verification. 1. certifi CA bundle (available in…, Download an image from URL and save to save_path. Returns True on success.

### Community 109 - "Node Sets Menu Model Fetch"
Cohesion: 0.57
Nodes (7): createModelItem(), fetchModelList(), matchesModelSearch(), renderModelAll(), renderModelByType(), renderModelFavorites(), renderModelGroups()

### Community 110 - "G'MIC Integration & Security Fixes"
Cohesion: 0.40
Nodes (6): Draw/Mask Brush Circular Cursor + Off-canvas Drag Support, gmic_qt.exe Argument Order Fix (-o output input), handle_result Path Traversal Fix (gmic/result endpoint), gmic_routes.py (New Backend for G'MIC-Qt Job Handling), v0.3.60 Image Edit Filter Tool (G'MIC-Qt Integration), v0.3.61 G'MIC Bug Fix + Security + Draw/Mask Brush Operability

### Community 111 - "Comic Creator Integration Bridges"
Cohesion: 0.40
Nodes (6): ComfyUI Comic Creator (External iframe-embedded Custom Node), _runInpaintWithImages() / runInpaintExternal() Shared Inpaint Logic, v0.3.72 Comic Creator External Inpaint Entry Point, v0.3.76 Comic Creator I2I Run Bridge (_wfmReceiveI2IRunRequest), v0.3.80 Comic Creator Semi-auto Manga Bridge (LLM Prompt Draft + Batch Gen), v0.3.85 Generate UI Bridge (T2I) Default Workflow + Negative Prompt

### Community 112 - "GenerateUI Model Tab GGUF/Embedding Support"
Cohesion: 0.40
Nodes (6): GenUI Model LoRA Reset-on-Subtab-Switch Bug Fix, v0.3.51 Embedding GenUI PP/NP Support, v0.3.51 GenerateUI Hypernetwork Support, v0.3.51 Models Tab Side Panel GenUI Model Button, Hypernetwork/Embedding Not-Displayed Bug (V3 object_info Format), v0.3.58 GenerateUI GGUF Diffusion Model / Text Encoder Support

### Community 113 - "Bypass Node Handling & Advanced Sampling"
Cohesion: 0.40
Nodes (6): GenerateUI Raw JSON Bypass/Mute Node Indicator, Reroute Node missing_node_type 400 Error Fix (_resolveBypassSource extension), _resolveBypassSource() Bypass Pass-through Link Resolution, _simulateWidgetValues / _stripLegacyLinkedWidgetValues Common Logic Rewrite, v0.3.75 Bypass (mode:4) Node Workflow Generation Failure Fix, v0.3.81 Flux.2 Klein / LongCat / Boogu / HiDream E1 / FireRed Advanced Sampling Support

### Community 114 - "Prompt Text Node"
Cohesion: 0.33
Nodes (3): WFS_PromptText – Prompt preset node with positive/negative STRING outputs., Outputs positive and negative prompt strings., WFS_PromptText

### Community 116 - "Gallery Service Vault Helpers"
Cohesion: 0.33
Nodes (3): os.scandir() で画像ファイルを1回のシステムコールで列挙。 キャッシュがあればそれを返す。 Returns: [(name,…, os.walk() でフォルダ配下を再帰的に列挙する（サブフォルダの画像も含む）。 ImagePrompt/Style…, 指定フォルダ内の画像一覧を返す（recursive=Trueならサブフォルダも含める）

### Community 117 - "PNG Metadata Extractor"
Cohesion: 0.40
Nodes (4): extract_png_workflow(), Extract ComfyUI workflow JSON from PNG metadata., Extract ComfyUI workflow JSON from PNG byte data. Returns dict or None., Workflow CRUD and metadata management service.

### Community 118 - "AI Skills & Help Redesign"
Cohesion: 0.40
Nodes (5): AI Skills Mechanism (Selectable System Prompt Library), Help Tab Card-Format Redesign (16 Pages), Skill Creator (Interactive Skill Creation Meta-skill), SVG Icon Generator Skill (Shape Decomposition Prompting), v0.3.79 AI TOOL Chat Skills Mechanism + SVG Generation Quality Improvement

### Community 119 - "Prompt Extraction Bug Fixes"
Cohesion: 0.40
Nodes (5): Checkpoint Silent Substitution Bug (getLastCheckpointSubstitutions), CLIPTextEncodeEditPlus Metadata Extraction Gap, convertUiToApi forceInput Widget Misclassification (Root Cause), LoRA Stack: Use Stack Group Checkbox, v0.3.92 convertUiToApi forceInput Bug + LoRA Stack Improvements

### Community 120 - "AI TOOL Chat & Wildcard Features"
Cohesion: 0.40
Nodes (5): v0.3.41 ImpactWildcardEncode/Processor Prompt Detection Bug Fix, v0.3.40 AI TOOL Tab Chat Pane, v0.3.40 AI TOOL Wildcard Generation Feature, v0.3.46 Prompt Tab AI Assistant LM Studio Support, v0.3.49 A1111-style Wildcard Expansion in GenerateUI

### Community 121 - "Config & Service Modules"
Cohesion: 0.40
Nodes (3): Resolve workflows dir from settings, falling back to default., _resolve_workflows_dir(), Settings management service.

### Community 122 - "Group Feature Path Bug Fixes"
Cohesion: 0.50
Nodes (4): Windows Path Separator Normalization Pattern, v0.3.45 Group Orphan Entry Auto Cleanup, v0.3.47 Models Tab File-Move Group State Fix, v0.3.55 Group Feature Bug Fixes (All Tabs)

### Community 123 - "SVG Generation & Display Support"
Cohesion: 0.67
Nodes (3): AI TOOL Chat Workflow-less SVG Generation/Display/Gallery Save, v0.3.77 Gallery Tab SVG File Display/Management Support, v0.3.78 Eagle Auto-Save SVG Support

### Community 124 - "Send to Canvas Feature"
Cohesion: 1.00
Nodes (3): API-Format Workflow Loads Empty on Canvas Bug Fix, Send to Canvas Feature (Workflow Tab / Gallery Tab Title DnD), Send to Canvas via window.opener Direct Load

### Community 125 - "Module Split Refactor (v0.4.0)"
Cohesion: 0.67
Nodes (3): Callback Injection Pattern (One-way Dependency), Graphify Community Cohesion Analysis, v0.4.0 image-edit-tab.js / models-tab.js Low-Cohesion Module Split

### Community 126 - "CivitAI Detail Panel History"
Cohesion: 0.67
Nodes (3): CivitAI modelUrl Broken Fallback Bug, v0.3.20: CivitAI Detail Panel Enhancement, v0.3.21: CivitAI Host Setting + Sample Subtab

### Community 127 - "GenerateUI Layout & JSON Highlight"
Cohesion: 0.67
Nodes (3): JSONシンタックスハイライト, Raw JSON同期修正, v0.2.4 GenerateUIタブ レイアウト再設計

### Community 128 - "Workflow Tab Bug Fixes"
Cohesion: 0.67
Nodes (3): v0.3.23: Two Bug Fixes, Workflow Batch 404 Endpoint Bug, Workflow Rename Duplicate Listener Bug

## Ambiguous Edges - Review These
- `_wfmReceiveImageForI2I I2I Receive Bridge (Comic Creator to WFS)` → `LoRA Batch Path Separator Mismatch Fix + resolveLoraName()`  [AMBIGUOUS]
  DEVLOG.md · relation: references
- `SSRF Credential Leak Fix (Unsloth Proxy baseUrl allowlist)` → `Prompt Data as .txt Sidecar Files (Avoiding gallery_metadata.json Contention)`  [AMBIGUOUS]
  DEVLOG.md · relation: semantically_similar_to
- `Models Tab Overlay Button Not-Updating Bug Fix` → `v0.3.54 Image Edit Shape Tool`  [AMBIGUOUS]
  DEVLOG.md · relation: conceptually_related_to
- `Feeder Tab UI Improvements (Root Auto-Select / Preview Pane Move / RUN Preview Sync)` → `v0.3.28 Batch Tab Sampler/Scheduler Support`  [AMBIGUOUS]
  DEVLOG.md · relation: conceptually_related_to

## Knowledge Gaps
- **311 isolated node(s):** `AI_BACKEND_DEFAULT_URLS`, `state`, `LANGUAGE_OPTIONS`, `LANGUAGES`, `SUMMARY_LANGUAGE_OPTIONS` (+306 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **52 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **What is the exact relationship between `_wfmReceiveImageForI2I I2I Receive Bridge (Comic Creator to WFS)` and `LoRA Batch Path Separator Mismatch Fix + resolveLoraName()`?**
  _Edge tagged AMBIGUOUS (relation: references) - confidence is low._
- **What is the exact relationship between `SSRF Credential Leak Fix (Unsloth Proxy baseUrl allowlist)` and `Prompt Data as .txt Sidecar Files (Avoiding gallery_metadata.json Contention)`?**
  _Edge tagged AMBIGUOUS (relation: semantically_similar_to) - confidence is low._
- **What is the exact relationship between `Models Tab Overlay Button Not-Updating Bug Fix` and `v0.3.54 Image Edit Shape Tool`?**
  _Edge tagged AMBIGUOUS (relation: conceptually_related_to) - confidence is low._
- **What is the exact relationship between `Feeder Tab UI Improvements (Root Auto-Select / Preview Pane Move / RUN Preview Sync)` and `v0.3.28 Batch Tab Sampler/Scheduler Support`?**
  _Edge tagged AMBIGUOUS (relation: conceptually_related_to) - confidence is low._
- **Why does `showToast()` connect `Tagger/Prompt i18n Helpers` to `Models Tab Frontend`, `Prompt Tab Frontend`, `Gallery Tab Frontend & Toasts`, `Image Edit Layer & Draw Tools`, `GenerateUI Feeder Tab`, `App Shell & i18n Init`, `Nodes Tab Frontend`, `GenerateUI Lab Tab`, `AI Tool Tab Frontend`, `Generate Tab Frontend & Modals`, `Workflow Tab Frontend & Storage`, `Image Edit Layer Manager Core`, `Style Catalog Tab`, `Image Prompt Tab`, `Image Edit Background Removal`, `Image Edit Blur Tool (BlurTool.js)`, `AI Tool Tab Frontend`, `Image Edit Background Removal (BgRemove.js)`, `App Shell & i18n Init`, `Generate Tab Frontend & Modals`, `Image Edit SAM3 Segmentation`, `GenerateUI Lab Tab`, `Image Edit File Export (FileExport.js)`, `Image Edit G'MIC Integration`?**
  _High betweenness centrality (0.042) - this node is a cross-community bridge._
- **Why does `t()` connect `Tagger/Prompt i18n Helpers` to `Models Tab Frontend`, `Prompt Tab Frontend`, `Gallery Tab Frontend & Toasts`, `GenerateUI Feeder Tab`, `AI Tool Tab Frontend`, `App Shell & i18n Init`, `Image Prompt Tab`, `GenerateUI Lab Tab`, `Style Catalog Tab`, `Metadata Tab Frontend`, `AI Tool Tab Frontend`, `Generate Tab Frontend & Modals`, `App Shell & i18n Init`, `Generate Tab Frontend & Modals`, `Nodes Tab Frontend`, `Workflow Tab Frontend & Storage`, `ComfyUI Client & Editor`, `GenerateUI Lab Tab`?**
  _High betweenness centrality (0.023) - this node is a cross-community bridge._
- **Why does `GalleryService` connect `Gallery Service Core` to `Gallery API Routes`, `Gallery Service Core`, `Gallery Metadata/Service Bridge`, `Gallery Service Vault Helpers`, `Gallery Service Background Indexing`, `Gallery Service Vault Helpers`, `Gallery Metadata Store`, `Gallery Metadata/Service Bridge`?**
  _High betweenness centrality (0.018) - this node is a cross-community bridge._