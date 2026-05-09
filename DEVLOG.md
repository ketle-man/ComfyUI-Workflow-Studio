# DEVLOG - ComfyUI-Workflow-Studio

## 2026-05-09: v0.3.5 GenerateUI — Feeder サブタブ・ワークフロー解析精度向上

### 概要

- comfyui-image-feeder カスタムノード対応の Feeder サブタブを GenerateUI タブに追加
- `analyzeWorkflow` の精度向上（SDXL 多段 CONDITIONING チェーン BFS 展開、新ノード種対応、KSamplerAdvanced seed 修正）
- Help タブに Feeder サブタブの説明カードを追加（EN/JA/ZH i18n 対応）

### 変更内容

#### `static/js/feeder-tab.js` — 新規作成

- `_s = { dir, images, selected (Set), presets, running }` モジュール状態
- `_feederNodes()` — currentWorkflow から `class_type === "ImageFeeder"` のノードを列挙
- `refreshFeederNodeList()` — ノードセレクターを再描画（ワークフロー読み込み時に呼ばれる）
- `_loadFromNode(nodeId)` — ノード inputs を左ペインの各フィールドに反映
- `_applyToNode(nodeId)` — フィールド値を currentWorkflow のノード inputs に書き戻す
- `_applyToWorkflow()` — Apply ボタン用（`_applyToNode` 呼び出し＋toast）
- フォルダツリー: `_loadTree()` / `_renderTree()` / `_makeTreeRow()` / `_selectDir()` / `_highlightTreeRow()` — `/image_loop/tree` API からツリーを描画
- 画像グリッド: `_loadImages()` / `_renderGrid()` / `_makeCard()` / `_refreshGridCbs()` / `_selectAll()` / `_deselectAll()` — `/image_loop/images` API からサムネイルカードを描画、チェックボックスで選択管理
- プレビュー: `_showPreview()` — カードクリックで右ペインに拡大プレビューと `/image_loop/image_info` の情報を表示
- プリセット: `_loadPresets()` / `_renderPresets()` / `_savePreset()` / `_applyPreset()` / `_deletePreset()` — `/image_feeder/presets` API を使用
- ステータスバー: `_updateStatus()` — 現在フォルダと選択枚数/総枚数を表示
- Run ループ: `_startRun()` / `_stopRun()` / `_setRunUI()`
  - Run 前に WebSocket を接続し `image_loop_node_sync` メッセージを専用ハンドラで捕捉
  - 各反復で `_applyToNode` → `comfyUI.generate()` → 結果画像を右ペインに表示
  - `comfyUI.generate` には右ペインの seed mode/value を使用（KSampler のシードを正しく制御）
  - After gen モード (`wfm-feeder-control-after`):
    - `loop`: `_lastSync.next_index` で index を更新し無限継続（`has_next=false` でも折り返して継続）
    - `increment`: index を更新し `has_next=false` で自動停止
    - `fixed`: index を変えず同じ画像で繰り返し
  - 生成ごとに右ペインの seed 表示を更新
- `initFeederTab()` — 全コントロールのイベントリスナーを登録し `_loadTree()` / `_loadPresets()` を並列実行

#### `static/js/generate-tab.js`

- `import { initFeederTab, refreshFeederNodeList } from "./feeder-tab.js"` を追加
- `loadWorkflowIntoEditor()` に `refreshFeederNodeList()` 呼び出しを追加
- `moveRawJsonToTab()`: `tabKey === "feeder"` の場合は Raw JSON ウィジェットを非表示（feeder タブには rawjson-col がないため）
- `initGenerateTab()` に `await initFeederTab()` を追加

#### `templates/index.html`

- サブタブナビに `<button data-subtab="feeder">Feeder</button>` を追加
- `wfm-gen-subtab-feeder` コンテンツ div を追加:
  - 左ペイン (`.wfm-feeder-settings`): ノードセレクター・Apply・全パラメータフィールド・プリセット管理・Run セクション（After gen セレクト + Run/Stop ボタン）
  - 中央ペイン (`.wfm-feeder-library`): ステータスバー + ライブラリ本体（フォルダツリー・画像グリッド・プレビューパネル）
- Help タブ: GenerateUI Tab カードの説明を "4-tab layout" に更新
- Help タブ: Feeder サブタブ説明カードを追加（`wfm-help-feeder-title` / `wfm-help-feeder-desc` / `wfm-help-feeder-1`〜`9` の id 付き）

#### `static/css/main.css`

Feeder 専用スタイルを末尾に追加:
- `.wfm-feeder-layout` — flex 横並び全体レイアウト
- `.wfm-feeder-settings` — 左ペイン（幅 220px、縦スクロール）
- `.wfm-feeder-pane-header` / `.wfm-feeder-field-row` / `.wfm-feeder-label` / `.wfm-feeder-input` — フォームレイアウト
- `.wfm-feeder-library` / `.wfm-feeder-status-bar` / `.wfm-feeder-library-body` — 中央ペイン構造
- `.wfm-feeder-tree-pane` / `.wfm-feeder-tree-scroll` / `.wfm-feeder-tree-row` (+ `:hover` / `.active`) / `.wfm-feeder-tree-msg` — フォルダツリー
- `.wfm-feeder-grid-pane` / `.wfm-feeder-grid` / `.wfm-feeder-grid-msg` — 画像グリッドコンテナ
- `.wfm-feeder-card` (+ `:hover` / `.selected`) / `.wfm-feeder-card-cb` / `.wfm-feeder-card-img` / `.wfm-feeder-card-name` — 画像カード
- `.wfm-feeder-preview-pane` / `.wfm-feeder-preview-img` / `.wfm-feeder-preview-name` / `.wfm-feeder-preview-info` — プレビューパネル

#### `static/js/comfyui-workflow.js`

`analyzeWorkflow` を3パス構成に再構成:

- **Pass 1**: KSampler / KSamplerAdvanced を検出し `sampler_nodes` に追加
  - `seedKey`: `"seed" in inputs ? "seed" : "noise_seed"` で KSamplerAdvanced の `noise_seed` に対応
  - LoraLoader 検出を追加
- **Pass 1b**: BFS 展開（最大5イテレーション）で CONDITIONING チェーンの positive/negative 帰属を伝播
  - `COND_PASSTHROUGH` セット: ConditioningCombine / ConditioningConcat / ConditioningAverage / ConditioningZeroOut / ConditioningSetTimestepRange / ControlNetApply / ControlNetApplyAdvanced / IPAdapterApply / IPAdapterApplyFaceID / StyleModelApply
  - リンク接続入力を持つノードも帰属を伝播（CLIPTextEncodeSDXL の text_g / text_l が他ノードにリンクされている場合）
- **Pass 2**: 新ノード種の検出
  - `CLIPTextEncodeSDXL` / `CLIPTextEncodeSDXLRefiner`: `text_g` / `text_l` が文字列値の場合のみ prompt_nodes に追加
  - `TextEncodeQwenImageEditPlus`: `inputs.prompt` を prompt_nodes に追加
  - `SDXLPromptStyler` / `SDXLPromptStylerAdvanced`: `text_positive` / `text_negative` をそれぞれ role 付きで追加
  - `CheckpointLoader` (WAS): `ct === "Checkpoint Loader"`（スペースあり）を含む判定に修正
  - `PrimitiveStringMultiline` / `PrimitiveString`: positive/negative ref がある場合のみ prompt_nodes に追加
  - `Power Lora Loader (rgthree)`: `lora_\d+` キーをスキャンして lora_nodes に追加

#### `static/js/comfyui-editor.js`

- KSampler パラメータエディタの hidden input に `data-seed-key` 属性を追加
- Apply 時に `dataset.seedKey`（`"seed"` または `"noise_seed"`）を参照して正しいキーに書き込む

#### `static/js/i18n.js`

- EN / JA / ZH: `helpGen3` を "4-tab layout" / "4タブ構成" / "4标签布局" に更新
- EN / JA / ZH: `helpFeederTitle` / `helpFeederDesc` / `helpFeeder1`〜`9` を追加

#### `static/js/app.js`

- `helpIdMap` に `wfm-help-feeder-title` / `wfm-help-feeder-desc` / `wfm-help-feeder-1`〜`9` を追加

---

## 2026-04-29: v0.3.4 GenerateUI — Checkpoint Batch 刷新・Settings 横並びレイアウト・ヘルプ i18n 修正

### 概要

- Checkpoint Batch: フォルダツリー型ドロップダウン選択に刷新（テキスト入力の Include/Exclude フォルダ指定を廃止）
- Checkpoint Batch: 第二階層以下のサブフォルダにも対応
- Checkpoint Batch: 一時停止 / 再開（Pause/Resume）ボタンを追加
- GenerateUI Settings タブ: KSampler と Latent Image を横並び（各50%幅）に変更
- Help タブ: 最新機能に合わせて説明を更新し、i18n 対応漏れ（Gallery 5〜11、Gen 11）を修正

### 変更内容

#### `templates/index.html`

- Checkpoint Batch パネルの Include/Exclude テキスト入力を廃止し、チェックボックス付きドロップダウンに置き換え
  - フォルダヘッダー行: チェックボックス + ▶ 展開矢印 + フォルダ名 + ファイル数
  - ファイル行: インデント + チェックボックス + ファイル名（フルパスを tooltip 表示）
  - パネル上部: Filter 検索入力 + All / None ボタン
- バッチ進行エリアのプログレスバー下に Pause ボタンを追加（実行中のみ有効）
- ヘルプ: `wfm-help-gen-6`（横並びレイアウト）・`wfm-help-gen-11`（新バッチ機能）の初期テキストを更新

#### `static/js/generate-tab.js`

- `_parseFolderList()` / `_getModelFolder()` / `_filterCheckpoints()` を削除
- `_ckptState = { mode: "all"|"some"|"none", selected: Set<modelPath> }` で選択状態を管理
  - `"all"`: 全選択（selected は空）、`"some"`: 部分選択、`"none"`: 全解除
- `_buildFolderTree(models)` — モデルパスをフォルダ → モデルリストの Map に変換（`lastIndexOf("/")` で第二階層以下にも対応）
- `_getFolderCheckState(folderModels)` — `"checked"` / `"indeterminate"` / `"unchecked"` を返す
- `_toggleSingleModel()` / `_toggleFolderModels()` — 単体・フォルダ一括のトグルロジック（all/none/some の状態遷移を管理）
- `_rebuildCkptList()` — フォルダグループ形式の DOM を動的生成（▶ 展開・折りたたみ、`checkbox.indeterminate` 対応）
- `_getSelectedCheckpoints()` — mode に応じた選択リストを返す
- `_ckptBatch.paused` フラグと `_waitIfPaused()` で一時停止・再開を実装（Promise 待機 + resolve で解除）
- `_setPauseBtnState(paused)` — ボタンのテキスト・スタイルを Pause ↔ Resume で切り替え
- `initCheckpointBatch()` に Pause/Resume ボタンのハンドラを追加
- `_runBatchGenerate()`: ループ先頭で `await _waitIfPaused()`、一時停止時にステータステキストを "Paused" 表示、finally ブロックで状態クリーンアップ
- Interrupt（Stop）ボタン: `_ckptBatch.paused = false` と `_resumeResolve()` を呼んで一時停止待機を即解除

#### `static/js/comfyui-editor.js`

- `renderSettingsTab()`: 外枠を `flex-direction: row` に変更し KSampler（左）と Latent Image（右）を横並び（各 `flex:1; min-width:0`）、間に縦の境界線（`border-right: 1px solid var(--wfm-border)`）

#### `static/css/main.css`

- `.wfm-ckpt-dropdown-wrap` / `.wfm-ckpt-dropdown-trigger` / `.wfm-ckpt-dropdown-arrow` / `.wfm-ckpt-dropdown-panel` — ドロップダウン UI スタイル
- `.wfm-ckpt-folder-group` / `.wfm-ckpt-folder-header` / `.wfm-ckpt-folder-toggle` / `.wfm-ckpt-folder-name` / `.wfm-ckpt-folder-count` / `.wfm-ckpt-folder-files` — フォルダツリー UI スタイル
- `.wfm-ckpt-item--indented` — ファイル行のインデント（`padding-left: 24px`）

#### `static/js/i18n.js`

- EN / JA / ZH: `helpGen6` を横並びレイアウトの説明に更新
- EN / JA / ZH: `helpGen11` を追加（フォルダツリードロップダウン、Pause/Resume、Stop の説明）
- EN / JA / ZH: `helpGallery5`〜`helpGallery10` を現在の HTML 構成に合わせて修正（旧版から5項目ずれていたのを解消）
- EN / JA / ZH: `helpGallery11` を追加（PNG/JPEG/WebP/GIF 対応・メタデータ抽出の説明）

#### `static/js/app.js`

- `helpIdMap` に `"wfm-help-gen-11": "helpGen11"`、`"wfm-help-gallery-11": "helpGallery11"` を追加

---

## 2026-04-28: v0.3.3 Promptタブ — ワイルドカード支援パネル・Impact Packシンボリックリンク連携・サブディレクトリ対応・GenerateUI修正

### 概要

- Promptタブのレイアウトを3カラム構成に変更
  - 中央ペイン（Col2）: Presets / Preset Manager をタブ切り替え化
  - 右ペイン（Col3）: ワイルドカード支援パネルを新設
- ワイルドカードファイル管理（txt/yaml）の CRUD API を追加
- Settingsタブに Wildcard Integration セクションを追加（Impact Pack ジャンクション/シンボリックリンク連携）
- ワイルドカードフォルダのサブディレクトリファイルに対応（再帰スキャン・ディレクトリグループ表示・`__folder/name__` 形式）
- GenerateUI: `ImpactWildcardEncode` ノードの実行エラーを修正

### 変更内容

#### `py/config.py`

- `COMFYUI_ROOT = _COMFYUI_ROOT` を追加（外部モジュールから参照可能に）
- `WILDCARD_DIR = DATA_DIR / "wildcard"` を追加

#### `py/services/wildcard_service.py` — 新規作成

- `WildcardService(wildcard_dir)` クラス
  - `list_wildcards()` — txt/yaml/yml ファイル一覧を返す
  - `get_content(filename)` — ファイル内容を取得
  - `save_file(filename, content)` — ファイルを保存（新規/上書き）
  - `delete_file(filename)` — ファイルを削除
  - `_safe_path(filename)` — `..` / スラッシュ / 拡張子チェックによるパストラバーサル防止
- Impact Pack 連携メソッド
  - `find_impact_pack_wildcards(comfyui_root)` — `custom_nodes/` 以下で "impact-pack" ディレクトリを検索
  - `get_link_status(comfyui_root)` — インストール状況・リンク状態・パスを返す dict
  - `create_link(comfyui_root)` — 既存 WFS ファイルを Impact Pack dir へ移行後、ジャンクション/シンボリックリンクを作成
  - `remove_link()` — ジャンクション/シンボリックリンクを削除して通常ディレクトリに復元
- プラットフォームヘルパー
  - `_is_junction(path)` — Windows の `GetFileAttributesW` + `FILE_ATTRIBUTE_REPARSE_POINT` でジャンクション検出（`os.path.islink()` では検出不可）
  - `_create_junction_or_symlink(link, target)` — Windows は `mklink /J`、他 OS は `os.symlink`
  - `_remove_junction_or_symlink(path)` — Windows は `rmdir`（ジャンクションを削除、中身に影響なし）、他は `os.unlink`
- コンストラクタ: `_is_junction()` で事前確認し、ジャンクション/シンボリックリンクの場合は mkdir をスキップ

#### `py/routes/wildcard_routes.py` — 新規作成

- `GET /api/wfm/wildcards` — ファイル一覧
- `GET /api/wfm/wildcards/content?filename=` — ファイル内容取得
- `POST /api/wfm/wildcards/save` — ファイル保存
- `POST /api/wfm/wildcards/delete` — ファイル削除
- `GET /api/wfm/wildcards/link-status` — Impact Pack リンク状態取得
- `POST /api/wfm/wildcards/create-link` — ジャンクション/シンボリックリンク作成（移行ファイルリストを返す）
- `POST /api/wfm/wildcards/remove-link` — リンク解除

#### `py/wfm.py`

- `wildcard_routes.setup_routes(app)` を追加

#### `templates/index.html`

- Promptタブ Col2 をタブ切り替え構造（`.wfm-prompt-center-tabnav` + `.wfm-prompt-center-pane`）に変更
- Promptタブ Col3 にワイルドカード支援パネル（`.wfm-wc-panel`）を新設
  - ツールバー: `{|}`, `|`, `__`, `:`, `;`, `$`, `<lora:>`, `[]`, `{n$|}`, ファイルピッカーボタン
  - プロンプトテキストエリア（`.wfm-wc-prompt-ta`）
  - ファイル管理セクション（ファイル一覧 + インラインエディタ）
- Helpタブ: `wfm-help-prompt-8`、`wfm-help-prompt-9`、`wfm-help-settings-10` を追加

#### `static/js/prompt-tab.js`

- ワイルドカード API ヘルパー: `wcFetchFiles()`、`wcFetchContent()`、`wcSaveFile()`、`wcDeleteFile()`
- `wcInsertAtCursor(textarea, open, close)` — 選択テキストをラップ、または `open+close` を挿入してカーソルを `open` の末尾に移動
- `wcRenderFileList()`、`wcOpenEditor()`、`wcCloseEditor()`、`wcRefreshFiles()`、`wcUpdateFilePicker()`
- `initPromptTab()` に追加:
  - 中央ペインのタブ切り替えハンドラ
  - ワイルドカードツールバーボタン（`data-wc-open` / `data-wc-close` 属性で制御）
  - Loraボタン: `<lora::1:LBW=;>` を挿入してカーソル位置調整
  - `{n$|}` ボタン: `prompt()` で n を入力し `{n$|}` を挿入
  - ファイルピッカー（ポップアップ型、クリックで `__filename__` 挿入）
  - ファイルマネージャのイベントハンドラ（新規作成・保存・削除）

#### `static/js/settings-tab.js`

- Data Management セクションの直後に **Wildcard Integration** `<details>` セクションを追加
- セクション展開時に `GET /api/wfm/wildcards/link-status` を呼び出して動的 UI をレンダリング
  - Impact Pack 未インストール: インストール誘導メッセージ + GitHub リンク
  - インストール済み・リンクなし: Impact Pack パス表示 + 「リンクを作成」ボタン（移行ファイル名を表示）
  - リンク済み: リンク先パス表示 + 「リンクを解除」ボタン

#### `static/js/app.js`

- `wfm-help-prompt-8`、`wfm-help-prompt-9`、`wfm-help-settings-10` の ID マッピングを追加

#### `static/js/i18n.js`

- `helpPrompt8`、`helpPrompt9`、`helpSettings10` を EN/JA/ZH に追加

#### `static/css/main.css`

- `.wfm-prompt-center-tabnav`、`.wfm-prompt-center-tab`、`.wfm-prompt-center-pane` — 中央ペインタブ UI
- `.wfm-wc-panel`、`.wfm-wc-toolbar`、`.wfm-wc-btn`、`.wfm-wc-prompt-ta` — ワイルドカードパネル
- `.wfm-wc-file-picker-wrap`、`.wfm-wc-file-picker`、`.wfm-wc-picker-item` — ファイルピッカー
- `.wfm-wc-files-section`、`.wfm-wc-file-list`、`.wfm-wc-file-item`、`.wfm-wc-editor` — ファイルマネージャ

### ワイルドカードサブディレクトリ対応

#### `py/services/wildcard_service.py`

- `list_wildcards()` — `iterdir()` → `rglob("*")` に変更して再帰スキャン。レスポンスに `dir`（サブディレクトリパス、ルートは空文字）と `wc_name`（拡張子なし相対パス、例: `color/animals`）を追加
- `_safe_path()` — `/` 区切りの相対パスを受け付けるよう変更。各パスコンポーネントを個別に検証してパストラバーサルをブロック
- `save_file()` — `path.parent.mkdir(parents=True, exist_ok=True)` を追加してサブディレクトリを自動作成。レスポンスに `dir`、`wc_name` を追加

#### `static/js/prompt-tab.js`

- `wcRenderFileList()` — ファイルをディレクトリごとにグループ化して表示（ルートが先、サブディレクトリはヘッダ付き）。サブディレクトリ内ファイルは `wfm-wc-file-item--sub` クラスでインデント。挿入テキストを `__f.name__` → `__f.wc_name__`（例: `__color/animals__`）に変更
- `wcUpdateFilePicker()` — 同様にディレクトリグループ表示。挿入テキストを `wc_name` ベースに変更
- Editor Save ハンドラ — `name` のバリデーションを `folder/name` 形式に対応。`\` を `/` に正規化して各コンポーネントを個別検証。`filename` を `name.ext`（例: `color/animals.txt`）として構築

#### `templates/index.html`

- エディタ名入力の placeholder を `"name or folder/name"` に更新

#### `static/css/main.css`

- `.wfm-wc-dir-header` — ファイル一覧のディレクトリ区切りヘッダ
- `.wfm-wc-file-item--sub` — サブディレクトリファイルの左インデント
- `.wfm-wc-picker-dir` — ファイルピッカーのディレクトリ区切りラベル
- `.wfm-wc-picker-item--sub` — ファイルピッカー内サブディレクトリファイルのインデント
- Safari 向け `-webkit-user-select` を追加

### GenerateUI: ImpactWildcardEncode バリデーションエラー修正

#### `static/js/comfyui-workflow.js`

- `convertUiToApi()` — COMBO 型ウィジェット値を `/object_info` の選択肢リストと照合し、値が存在しない場合は先頭の有効な選択肢にフォールバック。Impact Pack の `ImpactWildcardEncode` ノードが `"Select Wildcard 🟢 Full Cache"` 等の動的プレースホルダー値を持つ場合でも `"Prompt outputs failed validation"` エラーが発生しなくなる
- `analyzeWorkflow()` — `ImpactWildcardEncode` / `ImpactWildcardProcessor` を `prompt_nodes` として認識（KSampler の positive/negative 接続からロールを判定）。テキストフィールドキーを `text` ではなく `wildcard_text` として記録

#### `static/js/comfyui-editor.js`

- `renderPromptTab()` — select の option に `data-text-key` 属性を追加（`CLIPTextEncode` = `"text"`、`ImpactWildcardEncode` = `"wildcard_text"`）
- Apply ハンドラ — `analysis.prompt_nodes` から `textKey` を取得して `inputs[textKey]` に書き込むよう変更（従来は `inputs.text` 固定）
- `syncToWorkflow()` — 選択中の option の `data-text-key` を読んで正しいフィールドに書き込むよう変更。生成前の同期（`_coreGenerate` 直前の `comfyEditor.syncToWorkflow()` 経由）でも正しく反映される

---

## 2026-04-28: v0.3.2 生成UIタブ — Checkpoint Batch・Seed UIレイアウト修正

### 概要

- 生成UIタブの右パネルに **Checkpoint Batch** 機能を追加
- Seed行のレイアウトを2段構成に変更（seed値とモード選択が見切れる問題を解消）

### 変更内容

#### `templates/index.html` — UI要素追加・修正

**Checkpoint Batch パネル追加:**
- 右パネル（Seed行の下・結果表示の上）に `wfm-ckpt-batch-panel` を追加
- チェックボックス ON/OFF でバッチ設定欄を展開/折りたたみ
- Include Folders テキスト入力 — カンマ区切りでサブフォルダ名を指定。空欄でcheckpointフォルダ内の全モデルを対象
- Exclude Folders テキスト入力 — カンマ区切りで除外するサブフォルダ名を指定
- 対象モデル数プレビュー表示 (`wfm-ckpt-batch-info`)
- バッチ進捗エリア — 現在のモデル名、インデックス/総数、アンバー色プログレスバー (`wfm-ckpt-batch-bar`)

**Seed レイアウト修正:**
- 横並び1行（`flex-direction: row`）→ 縦2行（`flex-direction: column`）に変更
- 1行目: `Seed:` ラベル + 数値入力（`flex:1` で横幅いっぱい）
- 2行目: モード選択セレクト（`width:100%`）

**ヘルプタブ:**
- GenerateUI タブ説明に gen-11（Checkpoint Batch の説明）を追加
- gen-8（Seed control）に2段レイアウト化の補足を追加

#### `static/js/generate-tab.js` — バッチロジック追加・生成処理リファクタリング

**新規追加:**
- `_ckptBatch` — `{ aborted: false }` バッチ中断フラグ
- `_parseFolderList(str)` — カンマ区切り文字列をトリム・小文字化して配列に変換
- `_getModelFolder(modelPath)` — パスの最初の `/` より前を抽出してフォルダ名を取得。`\\` を `/` に正規化、ルート直下は `""` を返す
- `_filterCheckpoints(checkpoints, includeStr, excludeStr)` — include/exclude フィルタを適用したチェックポイントリストを返す。大文字小文字を区別しない
- `_updateBatchInfo()` — チェックポイントリストのフィルタ済み件数を `wfm-ckpt-batch-info` に即時反映
- `initCheckpointBatch()` — チェックボックス・include/exclude 入力のイベントリスナーを登録
- `_coreGenerate(silent)` — 1回の生成コア処理（`silent=true` のとき完了トーストを省略）。エラー時はスローする
- `_runBatchGenerate()` — チェックポイントリストをループし `_coreGenerate` を順番に呼び出す。各反復でワークフロー内の全checkpointノードの `ckpt_name` を書き換える。エラーは件数カウントして継続。完了後に結果サマリをトースト表示

**変更:**
- `handleGenerate()` — バッチが有効な場合は `_runBatchGenerate()` を、無効の場合は `_coreGenerate(false)` を呼び出すよう分岐。ボタン管理（disabled / Stop 表示）を共通 try/finally で処理
- interrupt ボタンのハンドラ — `_ckptBatch.aborted = true` を設定してから `comfyUI.interrupt()` を呼び出し、単発生成とバッチの両方を停止できるように
- Refresh Models ボタンのハンドラ — モデルリスト再取得後に `_updateBatchInfo()` を呼び出してバッチ件数を更新
- `initGenerateTab()` — 末尾で `initCheckpointBatch()` を呼び出し。初期接続成功時に `_updateBatchInfo()` を呼び出し

---

## 2026-04-27: v0.3.1 ギャラリー拡張（フォルダ/ファイル操作・ワークフロー保存）

### 概要

- ギャラリータブにフォルダ作成・削除機能を追加
- ギャラリータブにファイル削除・移動機能を追加（単体・複数選択対応）
- 操作後もフォルダツリーの展開状態を維持するよう改善
- 生成UIタブで生成した画像のワークフローをギャラリーメタデータに自動保存
- MetadataタブのワークフローJSON表示をComfyUI生成画像全般（`prompt`キー）に対応

### 変更内容

#### `py/services/gallery_metadata.py` — メタデータ操作追加

- `delete(image_path)` 追加 — 画像削除時にメタデータエントリを除去
- `rename_path(old_path, new_path)` 追加 — ファイル移動後のパスキー付け替え
- `allowed` セットに `"workflow"` を追加 — 生成UIからのワークフロー保存を受け付けるように

#### `py/services/gallery_service.py` — ファイル・フォルダ操作追加

- `create_folder(parent_path, name)` — 無効文字チェック付きでサブフォルダを作成。作成後にフォルダキャッシュを無効化
- `delete_folder(folder_path)` — `shutil.rmtree` で再帰削除。ルートフォルダは保護
- `delete_images(paths)` — 複数画像ファイルを削除。各ファイルのメタデータ削除・キャッシュ無効化も実行
- `move_images(paths, dest_folder)` — 複数画像を別フォルダへ移動。ファイル名衝突時は連番サフィックス付与。メタデータのパスキーを `rename_path` で引き継ぎ
- `extract_workflow_from_metadata` 修正 — PNG埋め込みの参照キーを `workflow` → `workflow / prompt` の順に拡張。どちらも存在しない場合は `gallery_metadata.json` の `workflow` フィールドへフォールバック

#### `py/routes/gallery_routes.py` — エンドポイント追加

- `POST /wfm/gallery/folder` — フォルダ作成
- `DELETE /wfm/gallery/folder` — フォルダ削除
- `POST /wfm/gallery/images/delete` — 画像削除（単体・複数）
- `POST /wfm/gallery/images/move` — 画像移動（単体・複数）

#### `static/js/gallery-tab.js` — フロントエンド拡張

**API定数追加:**
- `folderCreate`, `folderDelete`, `imagesDelete`, `imagesMove`

**state追加:**
- `folderTree` — ツリー全体データを保持（移動先フォルダ一覧の生成に使用）

**フォルダツリー展開状態の保持:**
- `_getExpandedPaths()` — 再構築前に展開済みフォルダのパスを `Set` で収集
- `_restoreTreeState(expandedPaths, selectedPath)` — 再構築後に展開状態・選択ハイライトを復元。階層の浅い順に展開することで子ノードのDOM存在を保証
- `renderTreeNode` — 各アイテムに `data-path` 属性を付与（復元の識別子）
- `loadFolderTree` — 初回ロード判定（`isFirstLoad`）を追加。2回目以降は `_restoreTreeState` を呼び出して展開状態を維持

**フォルダ操作:**
- `createFolder()` — `prompt()` でフォルダ名入力後、API呼び出し・ツリー再読み込み
- `deleteFolder()` — 確認ダイアログ後、再帰削除・currentFolder リセット・ツリー再読み込み
- フォルダラベルクリック時に Delete Folder ボタンの `disabled` 状態を更新（ルート選択時は削除不可）

**ファイル削除・移動:**
- `performDeleteImages(paths)` — 削除後に `state.images` / `state.selectedImages` を即時更新。詳細パネルの選択中画像が削除された場合はパネルをリセット
- `performMoveImages(paths, dest)` — 移動後に同様に state を即時更新
- `flattenFolderTree(node)` — ツリーデータをフラットリストに変換（移動先選択に使用）
- `openMoveModal(paths)` — 移動先フォルダ選択モーダルを動的生成。現在フォルダを除く全フォルダをドロップダウン表示
- 詳細パネルの Move To... / Delete ボタンを画像選択時に有効化

#### `templates/index.html` — UI要素追加

- フォルダツリーヘッダーに「+ New」「Del」ボタン（`wfm-gallery-tree-actions`）
- 詳細パネル Info タブに「Move To...」「Delete」ボタン（`wfm-gallery-file-actions`）
- 一括バーに「Move To...」「Delete」ボタン
- ヘルプ項目を10項目から11項目に更新

#### `static/css/gallery-tab.css` — スタイル追加

- `.wfm-gallery-tree-header` — `justify-content: space-between` でタイトルとボタンを両端配置
- `.wfm-gallery-tree-actions` — フォルダ操作ボタンのフレックスコンテナ
- `.wfm-gallery-file-actions` — 詳細パネルのファイル操作ボタン
- `.wfm-gallery-move-modal` / `.wfm-gallery-move-modal-title` / `.wfm-gallery-move-dest-sel` / `.wfm-gallery-move-modal-footer` — 移動先選択モーダル

#### `static/js/generate-tab.js` — ワークフロー自動保存

- `_outputDir` モジュール変数 — outputパスをキャッシュ
- `_fetchOutputDir()` — `/api/wfm/settings/output-dir` からoutputパスを取得
- `saveGeneratedImagesMeta(images, workflow)` — 生成完了後、各画像のフルパスを組み立てて `/wfm/gallery/image/meta` にワークフローを保存。`type !== "output"` の一時ファイルはスキップ
- `initGenerateTab` — 初期化時に `_fetchOutputDir()` を実行。`wfm-output-dir-changed` イベントで設定変更時にパスを同期
- `handleGenerate` — 生成成功後に `saveGeneratedImagesMeta` を非同期呼び出し

### 技術的な判断

- **ツリー展開状態の復元**: `innerHTML = ""` による完全再構築を維持しつつ、展開パスを `Set` で保存して復元する方式を採用。差分DOMパッチより実装が単純で、フォルダ追加・削除後のツリー構造変化にも対応できる
- **PNG `prompt` キーの参照**: ComfyUIのSaveImageノードはデフォルトでPNGに `prompt` キー（API形式）のみを埋め込む。`workflow` キー（UI形式）が埋め込まれるのは特定の操作時のみ。`prompt` を参照することで既存の全ComfyUI生成画像に対応
- **フォールバック優先順位**: PNG埋め込み（`workflow` > `prompt`）> `gallery_metadata.json` の順とし、ComfyUI本体が埋め込んだデータを最優先に

---

## 2026-04-18: v0.3.0 モデルグループ表示改善（全タイプ横断・サイドパネル修正）

### 概要

- モデルタブのグループフィルタードロップダウンを全タイプ横断表示に改善
- ComfyUIサイドパネルのModel Groupsビューを v0.2.9 のタイプ別形式に対応させバグ修正

### 変更内容

#### `static/js/models-tab.js` — グループフィルター全タイプ横断表示

- `state.allModelGroups` 追加 — 全タイプのグループを `{ type: { groupName: [models] } }` 形式で保持
- `fetchAllModelGroups()` 追加 — `type` パラメータなしで全タイプのグループをAPIから一括取得
- `renderGroupFilter()` 改善 — ドロップダウンオプションを `[Checkpoint] GroupName` / `[LoRA] GroupName` 形式で全タイプ分表示。値は `type::groupName` としてエンコード
- グループフィルター `change` ハンドラ更新 — 選択したグループが現在と異なるタイプの場合、モデルタイプタブを自動切り替えしてモデルを再ロード
- `saveModelGroups()` — 保存時に `state.allModelGroups[type]` も更新
- `loadModelsForCurrentType()` — ロード時に `state.allModelGroups[type]` を同期
- `loadMetadataAndModels()` — 初回ロード時に `fetchAllModelGroups()` で全タイプのグループを一括取得

#### `web/comfyui/node_sets_menu.js` — サイドパネルのModel Groupsビュー修正

- `renderModelGroups()` を新タイプ別形式 `{ type: { groupName: [...] } }` に対応
  - 旧: `groups[groupName]` が配列を期待 → `TypeError: .filter is not a function` でクラッシュ
  - 新: `flatGroups = [{modelType, groupName, members}]` にフラット展開してから描画
- グループヘッダーに `[Checkpoint]` / `[LoRA]` 等のタイプラベルを追加（`wfm-nlp-model-type-badge`クラス）
- `typeOf[name] || modelType` — モデルリスト未取得時のフォールバックをグループのモデルタイプに変更

---

## 2026-04-18: v0.2.9 モデル有効/無効・複数選択・一括削除

### 概要

- モデルファイルの拡張子リネーム（`.disabled`サフィックス）でComfyUIへの表示を制御
- モデル種別ごとのグループスコープ（checkpointグループはcheckpointタブにのみ表示）
- 複数選択モードと一括グループ操作・ファイル削除機能を追加

### 変更内容

#### `py/services/models_service.py` — 有効/無効・削除ロジック追加

- `_DISABLED_SUFFIX = ".disabled"` 定数追加
- `_SIDECAR_EXTENSIONS` — 削除対象の付属ファイル拡張子リスト（`.preview.png` 〜 `.webp` + `.json`, `.civitai.info`, `.info`）
- `find_model_file(model_type, model_name)` — 有効・無効両状態を検索、`(Path, is_enabled)` を返す
- `enable_model(model_type, model_name)` — `.disabled` → 元の拡張子にリネーム
- `disable_model(model_type, model_name)` — 元の拡張子 → `.disabled` にリネーム（`path.name` ベースでサブディレクトリ二重化バグを回避）
- `scan_disabled_models(model_type)` — `rglob("*.disabled")` でスキャン、正規化名リストを返す
- `get_model_groups(model_type=None)` — `model_type` パラメータ追加。旧フラット形式 `{ "groupName": [...] }` を `_groups_legacy` に退避し、`{ "_groups": { "checkpoint": {...} } }` 形式へ自動マイグレーション
- `save_model_groups(groups, model_type)` — `model_type` パラメータ追加、種別ごとに保存
- `delete_model(model_type, model_name)` — モデルファイル（有効・無効どちらも対応）を削除。`path.name` から `.disabled` を除去してstemを正しく計算し、全サイドカーファイルを削除。メタデータエントリも削除

#### `py/routes/models_routes.py` — エンドポイント追加・変更

**新エンドポイント:**

- `GET /api/wfm/models/disabled?type=` — 指定タイプの無効モデル名リストを返す
- `POST /api/wfm/models/toggle` — `{ model_type, model_name, enabled }` でモデル1件の有効/無効を切り替え
- `POST /api/wfm/models/group-toggle` — `{ model_type, group_name, enabled }` でグループ内全モデルを一括切り替え
- `POST /api/wfm/models/delete` — `{ model_type, model_names: [] }` で複数モデルを一括削除

**変更:**

- `GET /api/wfm/models/groups` — `?type=` クエリパラメータ追加
- `POST /api/wfm/models/groups` — ボディを `{ "model_type": ..., "groups": {...} }` 形式に変更

#### `static/js/comfyui-client.js` — Hypernetworkバグ修正

- `_fetchModelList` で新ComfyUI APIフォーマット `["COMBO", {"values":[...]}]` に対応
- `Array.isArray(first)` チェックを追加、文字列 `"COMBO"` をスプレッドしてしまう問題を解消

#### `static/js/models-tab.js` — フロントエンド全体

**state追加:**

- `disabledModels: {}` — タイプ別の無効モデルSet
- `statusFilter: "all"` — "all" / "enabled" / "disabled"
- `selectMode: false`, `selectedModels: new Set()` — 複数選択状態

**新関数:**

- `isModelDisabled()`, `fetchDisabledModels()`, `toggleModelEnable()`, `toggleGroupEnable()` — 有効/無効操作
- `toggleSelectMode()` — 選択モードのON/OFF切り替え、ボタンテキスト更新
- `toggleModelSelection(modelName)` — DOM直接更新（再レンダリングなし）
- `clearSelection()` — 選択リセット
- `renderBulkActionBar()` — グループ選択・追加/削除・新規作成・削除ボタンを描画
- `bulkAddToGroup()`, `bulkRemoveFromGroup()` — 一括グループ操作
- `bulkDeleteModels()` — `confirm()` で確認後 `/api/wfm/models/delete` を呼び出し、ローカルstateを即時更新

**各ビュー:**

- ThumbView / CardView: 無効オーバーレイ・⏸ボタン・selectMode時チェックボックスオーバーレイ追加
- TableView: チェックボックス列・`wfm-table-td-check` 追加
- `renderSideGroup()`: "全て有効化" / "全て無効化" ボタン追加

**タイプ切り替え:**

- `groupFilter`, `statusFilter`, `selectMode`, `selectedModels` をリセット

#### `templates/index.html` — UI要素追加

- `<select id="wfm-models-status-filter">` — All / Enabled / Disabled フィルター
- `<button id="wfm-models-select-btn">` — 選択モード切り替え
- `<div id="wfm-models-bulk-bar">` — 一括操作バー（初期非表示）
- `<li id="wfm-help-models-11">` — ヘルプ項目追加

#### `static/css/main.css` — スタイル追加

- `.wfm-model-disabled` / `.wfm-disabled-overlay` — 無効状態の見た目
- `.wfm-toggle-btn` / `.wfm-toggle-btn.wfm-toggle-disabled` — ⏸ボタン
- `.wfm-badge-disabled` — 無効バッジ
- `.wfm-select-check` / `.wfm-select-check.checked` — チェックボックス
- `.wfm-card-checked` — 選択済みカードのアウトライン
- `.wfm-bulk-bar` / `.wfm-bulk-count` / `.wfm-bulk-sep` / `.wfm-table-td-check` — 一括操作バー

#### `static/js/i18n.js` — 新キー追加（3言語）

- 有効/無効操作: `modelEnable`, `modelDisable`, `modelDisabled`, `modelStatusAll`, `modelStatusEnabled`, `modelStatusDisabled`, `modelGroupEnableAll`, `modelGroupDisableAll`, `modelToggleError`, `modelStatusWarning`
- 複数選択: `modelSelectMode`, `modelSelectExit`, `modelSelected`, `modelBulkAddGroup`, `modelBulkRemoveGroup`, `modelBulkCreateAdd`, `modelBulkAddDone`, `modelBulkRemoveDone`
- ファイル削除: `modelBulkDelete`, `modelBulkDeleteConfirm`, `modelBulkDeleteDone`, `modelBulkDeleteError`
- ヘルプ: `helpModels11`（複数選択・一括削除の説明）、`helpModels3` 更新（ステータスフィルター追記）

### 技術的な判断

- **拡張子リネーム方式**: ComfyUIはスキャン時に認識拡張子のみ列挙するため、`.disabled`サフィックスを付けるだけでモデルを隠せる。ファイル移動や専用DBを使わず最もシンプルな実装
- **DOM直接更新（選択モード）**: 選択トグルのたびに`renderModelGrid()`を呼ぶと大量再レンダリングが起きる。`querySelectorAll("[data-model-name]")`で対象要素を絞り`classList.toggle()`のみ実行
- **stemバグの根本原因**: `path.stem`は最後のサフィックスのみ除去する。`model.safetensors.disabled`の`stem`は`model.safetensors`になるため、`model.safetensors.png`を探してしまう。`.disabled`を先に除去してから`Path.stem`を計算する必要がある

---

## 2026-04-14: v0.2.8 データ保存先変更・エクスポート/インポート機能追加

### 概要

- プラグインデータの保存先を `custom_nodes/ComfyUI-Workflow-Studio/data/` から `ComfyUI/user/default/Workflow-Studio/` に変更
- `user/default/` が存在しない環境（Portable版・Dockerなど）では従来の `data/` にフォールバック
- 設定タブに「データ管理」セクションを追加（エクスポート/インポート機能）

### 変更内容

#### `py/config.py` — DATA_DIR 保存先変更

**`DATA_DIR` の解決ロジックを変更:**

- 変更前: `DATA_DIR = PLUGIN_DIR / "data"` （固定）
- 変更後: `user/default/` が存在すれば `DATA_DIR = _COMFYUI_USER_DEFAULT / "Workflow-Studio"`、存在しなければ `PLUGIN_DIR / "data"` にフォールバック
- `_COMFYUI_ROOT` の定義位置を `DATA_DIR` の前に移動（`_COMFYUI_WORKFLOWS` と共用）

#### `py/routes/settings_routes.py` — エクスポート/インポートAPI追加

**新エンドポイント:**

- `GET /api/wfm/settings/export` — `settings.json`, `metadata.json`, `node_metadata.json`, `node_sets.json`, `prompts.json`, `model_metadata.json`, `gallery_metadata.json` の7ファイルを1つのJSONバンドルとして返す（`Content-Disposition: attachment` でDL）
- `POST /api/wfm/settings/import` — JSONバンドルを受け取り、含まれるファイルを個別に書き戻す。存在しないキーはスキップ

**新定数:**

- `_DATA_FILES` — エクスポート/インポート対象ファイル名のリスト

#### `static/js/settings-tab.js` — データ管理UIセクション追加

**Eagle連携セクションの直下に `<!-- Data Management -->` セクションを追加:**

- エクスポートボタン: クリックで `wfm-data-export.json` をダウンロード
- インポートボタン: `<label>` でファイル選択ダイアログを開く（`.json` 限定）
- ステータス表示: 成功・失敗をインラインで表示（成功: green / 失敗: red）
- 同一ファイルの再インポートができるよう、インポート後にファイル入力をリセット

#### `static/js/i18n.js` — 新キー追加（3言語）

**追加キー（英語・日本語・中国語）:**

- `dataManagement`, `dataManagementHint`, `exportData`, `importData`
- `exportSuccess`, `exportError`, `importSuccess`, `importError`

#### `templates/index.html` / `static/js/app.js` / `static/js/i18n.js` — ヘルプタブ更新

- `wfm-help-settings-8` をデータ管理の説明に変更
- `wfm-help-settings-9`（アコーディオン説明）を追加（HTML・app.jsマッピング・i18n 3言語）

### 移行手順（既存ユーザー向け）

1. 設定タブ →「データ管理」→「エクスポート」で `wfm-data-export.json` を保存
2. ComfyUIを再起動（新パスで空の状態で起動）
3. 設定タブ →「データ管理」→「インポート」でエクスポートしたファイルを選択
4. ComfyUIを再起動して反映

または手動で `custom_nodes/ComfyUI-Workflow-Studio/data/` の内容を `ComfyUI/user/default/Workflow-Studio/` にコピーしてから再起動。

---

## 2026-04-06: v0.2.6 UI改善・バッジ保存修正・フォルダフィルター追加

### 概要
- ワークフロー/モデル/ノードタブのサイドパネルを常時表示固定に変更
- グリッドをページネーションからスクロール全件表示に変更
- ワークフロータブのバッジが再起動後に消える問題を修正
- バッジフィルターボタンをパレット定義バッジで統一（ワークフロータブ）
- モデルタブにフォルダ（サブディレクトリ）フィルターを追加
- モデルカードビューから拡張子・フォルダバッジを削除（詳細パネルで確認可能）
- サムネイルカードサイズを 178×200px に調整、グリッドレイアウトを修正

### 変更内容

#### `py/services/workflow_service.py` — バッジ保存修正

**`save_metadata` のキーリストに `badges` を追加:**
- 変更前: `("tags", "memo", "summary", "modelTypesOverride", "favorite")`
- 変更後: `("tags", "memo", "summary", "modelTypesOverride", "favorite", "badges")`

**`list_workflows` のレスポンスに `badges` フィールドを追加:**
- `metadata` dict に `"badges": meta.get("badges", [])` を追加
- これにより再起動後もバッジが保持される

#### `static/js/workflow-tab.js` — バッジフィルター・サイドパネル・スクロール

**バッジフィルターをパレット定義バッジで表示:**
- `renderModelFilters()`: `getAllBadges()`（ワークフローに付いているバッジのみ）→ `getBadgePalette()`（パレット全バッジ）に変更
- フィルターボタンにバッジカラーを適用

**サイドパネル常時表示化:**
- `showSidePanel()`: `panel.style.display = "flex"` を削除
- `closeSidePanel()`: `panel.style.display = "none"` を削除、タイトルをクリアするのみ
- ×ボタンのイベントリスナー削除

**ページネーション廃止・スクロール全件表示:**
- `WF_PER_PAGE` 定数削除
- `updateWfPagination()` 関数削除
- `renderGrid()`: ページスライス処理を削除、全件描画に変更

#### `static/js/models-tab.js` — サイドパネル・スクロール・フォルダフィルター・カードビュー

**サイドパネル常時表示化:**
- `showSidePanel()`: `panel.style.display = "flex"` を削除
- `closeSidePanel()`: `panel.style.display = "none"` を削除

**ページネーション廃止・スクロール全件表示:**
- `MODELS_PER_PAGE` 定数削除、`updatePagination()` 関数削除
- `renderThumbView()` / `renderCardView()` / `renderTableView()`: `totalPages` 引数削除、全件描画に変更

**フォルダフィルター追加:**
- `state.dirFilter: ""` 追加
- `filterModels()` に `dirFilter` による絞り込みを追加
- `renderDirFilter()` 関数追加（現在のモデルタイプのサブディレクトリ一覧を `<select>` に反映）
- モデルロード時・モデルタイプ切替時に呼び出し
- `wfm-models-dir-filter` change イベントリスナー追加

**モデルカードビューからバッジ削除:**
- `renderCardView()`: `dir` バッジ・`ext` バッジを削除。ユーザーバッジ・タグのみ表示

#### `static/js/nodes-tab.js` — サイドパネル・スクロール

**サイドパネル常時表示化:**
- `showNodeSidePanel()`: `panel.style.display = "flex"` を削除
- `closeNodeSidePanel()`: `panel.style.display = "none"` を削除

**ページネーション廃止・スクロール全件表示:**
- `NODES_PER_PAGE` / `renderPagination()` / `clearPagination()` / `scrollGridToTop()` 削除
- `renderNodeGrid()`: 全件描画に変更

#### `templates/index.html` — サイドパネル・ページネーション・フォルダフィルター

- 3タブ（ワークフロー/ノード/モデル）のサイドパネルから `style="display:none"` と×ボタンを削除
- ページネーション用 `<div>` を3箇所から削除
- モデルタブのツールバーに `<select id="wfm-models-dir-filter">` を追加（TagとGroupの間）

#### `static/css/main.css` — グリッド・カードサイズ・サイドパネル

**グリッド・カードサイズ変更:**
- グリッド列幅: `161px` → `178px`
- カード幅: `161px` → `178px`
- サムネイル: `161×162px` → `178×200px`
- `grid-auto-rows: max-content` / `align-items: start` / `justify-items: start` 追加（行高さ圧縮防止）

**カードビュー:**
- グリッド列幅: `minmax(180px, 1fr)` → `repeat(auto-fill, 220px)` 固定幅に変更（横伸び防止）
- カード: `flex-direction: row` / `min-height: 56px` / `width: 220px` 固定

**サイドパネル:**
- `.wfm-side-panel-close` スタイル削除
- `.wfm-side-panel-empty` クラス追加（選択前の空状態表示用）

#### `static/js/i18n.js` — フォルダフィルター翻訳追加

- `modelsAllDirs`: 英語 `"All Folders"` / 日本語 `"すべてのフォルダ"` / 中国語 `"所有文件夹"` を追加

---

## 2026-04-04: v0.2.5 追加修正

### 概要
- サイドパネルModels→By TypeでTextEncoderが表示されない問題を修正
- サイドパネルのWorkflowsタブでも `.index.json` を非表示に
- 未使用の `buildDropdown` 関数を削除

### 変更内容

#### `web/comfyui/node_sets_menu.js`

**TextEncoder取得ロジック修正:**
- 変更前: `/api/wfm/models?type=textencoder`（存在しないエンドポイント）
- 変更後: `DualCLIPLoader` → `CLIPLoader` の順に `/object_info/{cls}` を試して `clip_name1` を取得（`comfyui-client.js` の `fetchTextEncoders()` と同じロジック）

**`.index.json` 非表示:**
- `loadWfData()`: `state.wfList = workflows.filter(w => w.filename !== ".index.json")` でサイドパネルのWorkflowsタブからも除外

**未使用関数削除:**
- `buildDropdown()` 関数を削除（Category/Packageドロップダウンは個別実装に置き換え済みだったため不要）

---

## 2026-04-03: v0.2.5 サイドパネル Category/Package サブタブ・テーマ設定・Workflow修正

### 概要
- サイドパネル（Workflow Studio Library）のNodesタブに📂 Category / 🧩 Packageサブタブを追加
- サイドパネルのヘッダーに⚙テーマ設定ボタンを追加（背景・文字・ボーダー色カスタマイズ）
- ワークフロータブで `.index.json` を非表示に

### 変更内容

#### `web/comfyui/node_sets_menu.js` — Nodesサブタブ追加・テーマ設定

**Nodesタブのrow2サブタブ構成変更:**
- 変更前: row2 = `☰ Sets`
- 変更後: row2 = `☰ Sets` / `📂 Category` / `🧩 Package`

**state追加:**
- `activeNodeCategory: ""` — Categoryサブタブで選択中のカテゴリ値
- `activeNodePackage: ""` — Packageサブタブで選択中のパッケージ値
- `objectInfo: {}` — `/object_info` APIから取得した全ノード情報（パッケージ判定に使用）

**`loadData()` 変更:**
- `fetchObjectInfo()` を追加して `/object_info` を並行取得
- `state.objectInfo` に保存

**新規関数:**
- `fetchObjectInfo()` — `GET /object_info` で全ノード情報を取得
- `extractPackageName(pythonModule)` — `python_module` からパッケージ名を抽出
- `getNodeCategory(nodeType)` — `state.objectInfo` 優先でカテゴリを取得（LiteGraphフォールバック）
- `getNodePackage(nodeType)` — `state.objectInfo[nodeType].python_module` からパッケージ名を取得
- `renderNodesByCategory(container)` — カテゴリドロップダウンをcontent上部に挿入してリスト表示
- `renderNodesByCategoryList(container)` — 選択カテゴリ＋検索テキストでフィルタしてカード表示
- `renderNodesByPackage(container)` — パッケージドロップダウンをcontent上部に挿入してリスト表示
- `renderNodesByPackageList(container)` — 選択パッケージ＋検索テキストでフィルタしてカード表示

**ドロップダウンのDOM挿入方式:**
- `.wfm-nlp-filter-row` クラスのdivを `.wfm-nlp-content` の直前に `insertBefore` で挿入
- `renderContent()` 冒頭で `panelEl.querySelectorAll(".wfm-nlp-filter-row").forEach(e => e.remove())` により他タブ移動時に削除

**テーマ設定:**
- `THEME_KEY = "wfm_nlp_theme"` — localStorage保存キー
- `THEME_VARS` — 設定可能な5変数: `--comfy-menu-bg`（背景）、`--comfy-input-bg`（サブヘッダーBG）、`--input-text`（文字色）、`--border-color`（ボーダー）、`--descrip-text`（補助テキスト色）
- `loadTheme()` — localStorageから読み込み
- `applyTheme(panel, theme)` — パネル要素にCSS変数をインラインsetPropertyで上書き
- `buildThemePanel(panel)` — カラーピッカーUIを動的生成（ライブプレビュー・Save・Resetボタン付き）
- パネルのHTMLに `.wfm-nlp-theme-btn`（⚙）と `.wfm-nlp-theme-panel` を追加
- `createPanel()` 内でテーマボタンのイベントリスナーを登録、`applyTheme(panel, loadTheme())` で起動時に保存済みテーマを適用

#### `static/js/workflow-tab.js` — `.index.json` 非表示

- `filterWorkflows()` の先頭に `if (wf.filename === ".index.json") return false;` を追加

### 技術的な判断

- **`python_module` の取得元をAPIに変更:** `LiteGraph.registered_node_types` にはバックエンド由来の `python_module` が存在しないため、全ノードが `ComfyUI (Built-in)` 判定になる問題があった。`/object_info` APIを `loadData()` 時に並行取得することで正確なパッケージ判定を実現
- **CSS変数のインライン上書き:** テーマ色はパネル要素自体に `style.setProperty` で適用。ComfyUI本体の `:root` 変数を書き換えず、パネルスコープ内のみに影響させる設計
- **ドロップダウンのDOMインジェクション:** Category/Packageビューのドロップダウンは `renderContent` の都度生成・削除する方式を採用。タブ切替時のクリーンアップを `renderContent` 冒頭の `.wfm-nlp-filter-row` 削除処理で一元管理

---

## 2026-03-29: v0.2.4 GenerateUIタブ レイアウト再設計

### 概要
- GenerateUIのサブタブを5タブ（Prompt/Image/Model/Settings/RawJSON）→ 3タブ（Input/Model/Settings）に整理
- 各タブ内にRaw JSONエディタを右列として常時表示。どのタブでもJSON変更をリアルタイム確認・直接編集・Apply可能
- Raw JSONタブを廃止（独立タブとしての Raw JSON は不要）
- 右列（生成コントロール）はGenerate/Seed/結果画像のみにスリム化

### 変更内容

#### `templates/index.html` — タブ構成刷新

- **Inputタブ**: 左列＝Prompt（上段）+ Image（下段）の縦2段、右列＝Raw JSON（540px）
- **Modelタブ**: 左列＝モデル選択フォーム（スクロール）、右列＝Raw JSON（540px）
- **Settingsタブ**: 左列＝KSampler（上段）+ LatentImage（下段）の縦2段、右列＝Raw JSON（540px）
- Raw JSONのDOMノード（`wfm-gen-rawjson-widget`）はページ内に1つ定義し、タブ切替時にJSで対応する列へ移動
- 右列（`.wfm-gen-right`）: 280px幅、Generate/Stop/Progress/Seed＋結果画像のみ

#### `static/js/generate-tab.js` — タブ切替時にRaw JSONを移動

- `moveRawJsonToTab(tabKey)` 追加: `wfm-gen-rawjson-widget` を `wfm-gen-rawjson-col-{tabKey}` へ `appendChild`
- 初期表示（Input）とタブクリック時に自動移動

#### `static/js/comfyui-editor.js` — Settings縦2段化

- `renderSettingsTab`: KSampler / LatentImageを横2列グリッド → 縦2段（`flex-direction:column`）に変更
- `renderAll` の末尾に `_syncRawJson()` 追加（ワークフロー読込直後にRaw JSONが即時反映）

#### `static/css/main.css` — 新レイアウト用スタイル

- `.wfm-gen-tab-cols`: タブ内2列レイアウト（flex行）
- `.wfm-gen-params-col`: 左サブ列（flex:1、縦積み）
- `.wfm-gen-params-col--scroll`: Model/Settings用スクロール変種
- `.wfm-gen-params-section`: Input用上下2段の各セクション（flex:1、overflow-y:auto）
- `.wfm-gen-rawjson-col`: Raw JSON列（540px固定幅）
- `#wfm-gen-rawjson-widget` / `.wfm-gen-rawjson-header` / `.wfm-gen-rawjson-editor`: Raw JSONウィジェットスタイル

### 技術的な判断
- **Raw JSONをDOMで移動**: タブごとにtextareaのIDは1つである必要があるため、DOMノードをappendChildで移動する方式を採用。イベントリスナーはノードに付いたまま引き継がれる
- **Raw JSON列幅540px**: テキストエディタとして十分な視認性を確保しつつ、パラメータ列にも十分な幅を残す設定

---

## 2026-03-29: v0.2.3 バッジ統一・GenUI Model・サイドパネルModels拡充

### 概要
- ワークフローとモデルのバッジ体系を統一（共有パレット `wfm_models_badge_palette`、自動解析廃止）
- ModelsタブにGenUI Modelボタン追加（詳細モーダル・サイドパネル両対応）
- ComfyUIサイドパネルのModelsタブにFavorites/Groups/By Typeサブタブを追加
- サイドパネルのWorkflows・Nodesサブタブ名を「All」に統一、お気に入りに★表示
- サイドパネル幅を280px→310pxに拡張

### 変更内容

#### `web/comfyui/node_sets_menu.js` — サイドパネルModels拡充

- **Modelsタブのサブタブ構成を2段に変更:**
  - row1: All / ★ Favorites / 📁 Groups
  - row2: ◦ By Type
  - `state.modelSubTab2` で行2の選択を管理
- **`renderModelFavorites(container)`** — 全モデルを取得し `state.modelMetadata[name]?.favorite === true` のものを表示
- **`renderModelGroups(container)`** — `state.modelGroups` からコラプス式セクションを生成
- **Workflowsサブタブ名:** `"Workflows"` → `"All"`
- **Nodesサブタブ名:** `"Nodes"` → `"All"`
- **Allビューでお気に入りに★表示:**
  - `createDraggableWfItem`: `wf.metadata?.favorite` に応じて `<span class="wfm-nlp-fav-star">★</span>` を追加
  - `renderAllNodes`: `state.metadata[name]?.favorite` に応じて★を表示
- **`.wfm-nlp-fav-star`** スタイル追加（`color: #f5c518; font-size: 11px; margin-right: 3px`）
- **サイドパネル幅:** `width: 280px` → `width: 310px`
- **`getWfModelTypes` → `getWfBadges`** にリネーム（`wf.metadata?.badges` ベースに変更）
- **`wfModelTypes` state → `wfBadgeTypes`** にリネーム
- `renderWfModelType` がバッジ表示に `state.wfBadgeTypes` を使用

#### `static/js/models-tab.js` — GenUI Modelボタン・バッジ表示改善

- **型バッジの削除:** ThumbView・CardView・SidePanelの `renderSideInfo` から `typeBadge = badgeHtml(typeLabel)` を削除。ユーザー定義バッジのみ表示
- **`GENUI_TYPE_MAP` 追加:**
  ```javascript
  const GENUI_TYPE_MAP = {
      checkpoint:  { key: "checkpoints",     inputKey: "ckpt_name" },
      lora:        { key: "loras",           inputKey: "lora_name" },
      vae:         { key: "vaes",            inputKey: "vae_name" },
      controlnet:  { key: "controlNets",     inputKey: "control_net_name" },
      unet:        { key: "diffusionModels", inputKey: "unet_name" },
      textencoder: { key: "textEncoders",    inputKey: "clip_name1" },
  };
  ```
  hypernetwork / embedding は対象外
- **`applyToGenUI(modelName, modelType)`** 追加:
  - `comfyUI.currentWorkflow` からターゲット `inputKey` を持つノードを検索
  - `node.inputs[inputKey] = modelName` で直接セット
  - `<select id="wfm-model-${key}">` の表示値も同期
  - `<textarea id="wfm-gen-raw-json">` も同期
  - 成功トースト表示
- **詳細モーダルの actions に「GenUI Model」ボタン追加**（`GENUI_TYPE_MAP` に対応するタイプのみ表示）
- **サイドパネルの Save ボタン右隣に「GenUI Model」ボタン追加**（同上）
- **`export function openBadgeEditModal(onPaletteChange = null)`** — workflow-tab.js から呼び出せるよう export 化
- **`bindBadgeModalEvents(onPaletteChange)`** — パレット変更後に `renderBadgeFilter()`, `renderModelGrid()`, `onPaletteChange()` を実行

#### `static/js/workflow-tab.js` — バッジ体系をモデルタブと統一

- **`import { openBadgeEditModal } from "./models-tab.js"`** 追加
- **自動解析によるバッジ体系を廃止:**
  - `state.badgeColors`, `BADGE_DEFAULT_COLORS` 削除
  - 「Analysis」「Override」セクションを詳細モーダルから完全削除
  - `getAllModelTypes()` → `getAllBadges()` （`wf.metadata?.badges` ベース）
  - `state.activeModel` → `state.activeBadge`
- **共有パレット関数を追加:** `getBadgePalette()`, `saveBadgePalette()` （`wfm_models_badge_palette` localStorage キー共有）
- **`badgeHtml(label)`** が共有パレットを参照するように変更
- **`wfBadgesHtml(wf)`** ヘルパー追加（`wf.metadata?.badges` から表示用バッジHTML生成）
- **`filterWorkflows()`** が `wf.metadata?.badges` でフィルタリング
- **詳細モーダルにバッジチェックボックスUI追加**（Modelsタブと同じ管理UI）
- **⚙ボタン** → `renderViewSettings()`（ビュー設定のみ）
- **「⚙ Badge」ボタン追加** → `openBadgeEditModal(() => renderGrid())`

#### `templates/index.html` — Workflowツールバー更新

- `<button id="wfm-reanalyze-btn">Reanalyze All</button>` 削除
- `<button id="wfm-badge-btn">⚙ Badge</button>` 追加
- ⚙設定ボタンの title を "View settings" に変更

#### `static/js/i18n.js` — 翻訳追加（EN/JA/ZH）

- **GenUI Model関連（3言語）:**
  - `modelsGenUIBtn`: "GenUI Model"
  - `modelsGenUITitle`: ボタンのツールチップ
  - `modelsGenUIUnsupported`: 非対応タイプへの警告
  - `modelsGenUINoWorkflow`: GenUIにワークフローが未読み込みの警告
  - `modelsGenUINoNode(type)`: 対応ノードが見つからない場合の警告（アロー関数）

### 技術的な判断

- **バッジ統一の方針:** 自動解析モデルタイプはユーザー操作が必要なオーバーライドが多く UX が複雑だったため廃止。完全にユーザー定義バッジへ移行し、ワークフロー/モデル間で同じパレットを共有する設計に統一
- **GenUI連携方式:** `comfyUI.currentWorkflow` を直接ミューテーション。`<select>` 要素の DOM 同期も行うことで視覚的なフィードバックを確保
- **`openBadgeEditModal` のexport:** モデルタブとワークフロータブが同じパレット管理 UI を共有するため、`export function` に変更。`onPaletteChange` コールバックで各タブが独立してグリッドを再描画

---

## 2026-03-28: v0.2.2 Modelsタブ・CivitAI連携

### 概要
- ComfyUIにインストールされたモデル（Checkpoint、LoRA、VAE、ControlNet、UNET、TextEncoder）を一覧・管理する「Models」タブを新規追加
- CivitAI API連携（SHA256ハッシュによるモデル情報取得、一括取得）
- モデルグループ管理、プレビュー画像表示・変更、メタデータ永続化
- ノードカードビュー改善、全タブのページネーションをツールバーに移動

### 新規ファイル

#### `py/services/models_service.py` — モデルメタデータサービス
- `_get_model_dirs()`: ComfyUIの`folder_paths.get_folder_paths()`でモデルディレクトリを解決
- `ModelsService`: メタデータのCRUD（お気に入り、タグ、メモ、SHA256）
- `find_preview_image()`: `{stem}.preview.png`等のプレビュー画像を自動検出
- `get_model_groups()` / `save_model_groups()`: グループの永続化（`model_metadata.json`の`_groups`キー）

#### `py/services/civitai_service.py` — CivitAI API連携
- `calculate_sha256()`: モデルファイルのSHA256ハッシュ計算
- `fetch_by_hash()`: CivitAI APIからモデル情報取得（キャッシュ付き）
- `batch_fetch()`: 複数モデルの一括取得（プログレスコールバック対応）
- `_extract_info()`: APIレスポンスから必要フィールドを抽出（modelName, baseModel, trainedWords, images等）
- キャッシュ: `civitai_cache.json`に保存

#### `py/routes/models_routes.py` — モデル管理APIルート
- `GET/POST /api/wfm/models/metadata` — メタデータCRUD
- `GET /api/wfm/models/preview` — プレビュー画像配信
- `GET/POST /api/wfm/models/groups` — グループ管理
- `POST /api/wfm/models/civitai/fetch` — 個別CivitAI取得
- `GET /api/wfm/models/civitai/cache` — CivitAIキャッシュ取得
- `POST /api/wfm/models/civitai/batch` — SSEストリーミング一括取得
- `POST /api/wfm/models/change-preview` — プレビュー画像アップロード
- `GET /api/wfm/models/filepath` — モデルファイルのフルパス取得

#### `static/js/models-tab.js` — フロントエンドモジュール
- state管理: `modelsByType`, `modelMetadata`, `modelGroups`, `civitaiCache`, `activeModelType`
- サブタブ切り替え（6タイプ）、サムネイル/カード/テーブル表示
- サイドパネル: Info（ファイルパス表示、タグ、メモ）、Group管理、CivitAI情報表示
- 詳細モーダル: プレビュー画像、CivitAI情報、サムネイル変更
- 一括CivitAI取得ボタン（SSEプログレス付き）
- テーブルビューにメモ列表示

### 変更ファイル

#### `py/config.py`
- `MODEL_METADATA_FILE = DATA_DIR / "model_metadata.json"` 追加

#### `py/wfm.py`
- `models_routes`のインポートとルート登録追加

#### `templates/index.html`
- Modelsタブボタン・セクション追加（サブタブナビ、ツールバー、グリッド、サイドパネル）
- ヘルプタブにModels Tabセクション追加

#### `static/js/app.js`
- `models-tab.js`のimportと`initModelsTab()`呼び出し追加
- i18nマッピングにModelsタブ・ヘルプ用キー追加

#### `static/js/nodes-tab.js`
- カードビュー: パッケージバッジ削除、カード左端にパッケージ色のボーダー追加
- カードビュー: 入出力カウント表示を削除
- ページネーションをツールバーに移動

#### `static/js/workflow-tab.js`
- ページネーションをツールバーに移動
- 1ページ24件表示

#### `static/css/main.css`
- `.wfm-grid`: `grid-template-columns: repeat(auto-fill, 161px)`、カード161×162px固定
- `.wfm-node-card`: 左ボーダー3pxスタイル追加
- `.wfm-pagination-inline`: ツールバー内ページネーション
- サブタブナビ（`.wfm-models-type-nav`）、テーブル列幅調整

#### `static/js/i18n.js` — 翻訳追加（EN/JA/ZH）
- Modelsタブ関連: ~50キー（モデルタイプ、フィルタ、サイドパネル、CivitAI、グループ等）
- ヘルプModelsセクション: `helpModels1`〜`helpModels7`
- ファイルパス関連: `modelsFilePath`, `modelsCopyPath`, `modelsCopiedPath`

### 技術的な判断
- **プレビュー画像判定**: HEADリクエストではなく`img.onload/onerror`パターンを採用（404コンソールスパム回避）
- **CivitAI一括取得**: ブロッキングリクエストではなくSSE（Server-Sent Events）でリアルタイムプログレス表示
- **aiohttp HEAD自動登録**: `add_get`が自動でHEADも登録するため、明示的なHEADルート追加は不要（重複RuntimeError回避）
- **テーブルビューメモ列**: `max-width: 200px`＋`text-overflow: ellipsis`で長文を省略表示
- **ファイルパス表示**: バックエンドAPIでフルパスを解決し、クリックでクリップボードコピー

## 2026-03-27: テーマカスタマイズ機能・設定タブ改善

### 概要
- テーマのカラーカスタマイズ、背景パターン、フォント選択機能を追加
- 設定タブの各セクションをアコーディオン式折りたたみに変更
- ヘルプタブのSettings Tab説明を更新

### 変更内容

#### `static/js/settings-tab.js` — テーマカスタマイズ機能追加
- **カラーオーバーライド:** 6つのCSS変数（背景、サブ背景、サーフェス、テキスト、プライマリ、アクセント）をカラーピッカーでリアルタイム調整、localStorageに保存
- **背景パターン:** 7種類（なし、横/縦/斜めストライプ、ポルカドット、チェック、SVGファイル）を選択可能
  - パターンオプション: 色、不透明度、サイズ、間隔（gap）スライダー
  - SVGタイリング: FileReader APIでクライアント側読込、色の置換（fill/stroke属性＋`<style>`要素注入）、`::after`疑似要素でopacity制御、gap対応はviewBox拡張ラッパーSVG方式
- **フォント選択:** 16種のGoogle Fonts（日本語デザインフォント含む）を動的ロード、クリックで即時プレビュー
  - ゴシック系: Noto Sans JP, Zen丸ゴシック, M PLUS Rounded, 小杉丸ゴシック, さわらびゴシック, BIZ UDPゴシック
  - デザイン系: ドットゴシック16, はちまるポップ, デラゴシック, レゲエ One, ロックンロール, ステッキ, トレイン One
  - 等幅: Space Mono, Fira Code
- **保存ロジック修正:** `saveLocalSettings()`のスプレッドマージでは`delete`したキーが消えない問題を修正、リセット時は`localStorage.setItem()`で直接上書き
- **SVGリカラー強化:** `<style>`ブロックをSVGに注入し、fill属性がない要素にも色を適用

#### `static/css/main.css` — UIスタイル追加
- **設定アコーディオン:** `<details>`/`<summary>`要素用のスタイル（`.wfm-settings-section`, `.wfm-settings-summary`）— 三角矢印回転アニメーション付き
- **テーマカスタマイザー:** カラーピッカーグリッド、パターン選択グリッド（プレビューSVG付き）、パターンオプション行、フォント選択グリッド
- **パターンプレビュー改善:** SVGプレビューのコントラストを大幅強化（60x60サイズ、太い線、高opacity、青系前景色）

#### `static/js/i18n.js` — 翻訳追加（EN/JA/ZH）
- テーマカスタマイズ関連: カラー調整、背景パターン、パターンオプション（色、不透明度、サイズ、間隔）、フォント
- フォント名: 16種のフォントラベル
- ヘルプSettings項目: helpSettings7, helpSettings8追加

#### `static/js/app.js` — i18nマッピング追加
- `helpSettings7`, `helpSettings8` のHTML id→i18nキーマッピングを追加

#### `templates/index.html` — ヘルプタブ更新
- Settings Tabセクション: テーマカスタマイズ機能の説明を追加（項目2）、Eagle連携を項目7に、アコーディオン折りたたみを項目8に追加

### 技術的な判断
- **SVGカラー変更:** 属性置換だけでは不十分なSVG（CSSクラスやデフォルト黒を使用）に対応するため、`<style>`ブロック注入方式を採用
- **SVG間隔（gap）:** viewBoxを拡張するラッパーSVGでタイル間に余白を作成
- **フォント読込:** Google Fonts CDNから動的にlinkタグを挿入、一度読み込んだフォントはSetで管理し重複読込を防止
- **アコーディオン:** `<details>`/`<summary>`ネイティブHTML要素を使用、JSなしで開閉動作

## 2026-03-26: トップバーボタンアイコン修正・Appモードバッジ調査

### 概要
- トップバーの3つのボタン（Workflow Studio / Snapshot / Library）のアイコンが表示されない問題を修正
- ComfyUI Appモード（linearMode）のワークフローJSON構造を調査、バッジ表示対応は保留

### 変更内容

#### `web/comfyui/top_menu_extension.js` — アイコン置換ロジック修正
- **問題:** `setup()` 内の `replaceButtonIcon()` が `requestAnimationFrame` でボタンを見つけてSVGを注入するが、ComfyUIのVueフレームワークが再レンダリングして元の `<i class="icon-[mdi--...]">` に戻してしまう。リトライ条件が `wfmButtons.length === 0`（ボタン未検出時のみ）のため、一度見つかった後は再注入されなかった
- **修正:** `MutationObserver` でボタンの親コンテナ（`.actionbar-container`）を監視し、DOMが変更されるたびにSVGアイコンを再注入するように変更
- `applyButtonIcon()`: ボタンに既にSVGがあればスキップ（無限ループ防止）、なければSVG注入
- `waitAndObserve()`: ボタンがDOMに現れるまで `requestAnimationFrame` で待機し、見つかったらアイコン置換＋`MutationObserver`監視開始

### Appモードバッジ表示について（保留）
- ComfyUI Appモード（BETA機能）のワークフローJSON構造を調査
- `extra.linearMode: true` と `extra.linearData` （inputs/outputs配列）でappモード情報が格納される
- appモード削除後も `linearData`/`linearMode` キーは残り中身が空配列になるだけ、拡張子 `.app.json` も維持される
- **結論:** Appモード自体がBETA機能のため、バッジ表示対応は現状維持とする

## 2026-03-25: v0.2.0 プロンプトプリセット機能・Workflow Studio Library

### 概要
- プロンプトプリセット機能を追加：サイドパネルからドラッグ＆ドロップでWFS_PromptTextカスタムノードを作成
- Workflow Studio SPAのPromptタブを3カラムレイアウトに刷新（AIアシスタント｜プリセット編集｜プリセットマネージャー）
- プリセットのバックエンドAPI化（localStorage→サーバーサイド保存）
- サイドパネル名を「WF & Node Library」→「Workflow Studio Library」に変更

### 変更内容

#### `py/nodes/prompt_text.py` — WFS_PromptTextカスタムノード（新規）
- **WFS_PromptText**: ポジティブ/ネガティブの2つのSTRING入力とSTRING出力を持つカスタムノード
- `INPUT_TYPES`: `positive`（multiline）, `negative`（multiline）
- `RETURN_TYPES`: `("STRING", "STRING")`, `RETURN_NAMES`: `("positive", "negative")`
- `CATEGORY`: `"Workflow Studio"`

#### `py/nodes/__init__.py` — パッケージ初期化（新規）
- 空ファイル（Pythonパッケージ認識用）

#### `__init__.py` — カスタムノード登録
- `_NODE_MODULES` に `WFS_PromptText` を追加（分離読み込みパターン）
- `NODE_DISPLAY_NAME_MAPPINGS` に `"Prompt Text (WFS)"` を追加

#### `py/services/prompts_service.py` — プリセットCRUDサービス（新規）
- `list_prompts()`: 全プリセット一覧取得
- `create_prompt(data)`: 新規作成（name, text, negText, category, tags, favorite）
- `update_prompt(id, updates)`: 更新（name, text, negText, category, tags, favorite）
- `delete_prompt(id)`: 削除
- `list_categories()`: カテゴリ一覧取得
- データ永続化: `data/prompts.json`

#### `py/routes/prompts_routes.py` — プリセットAPIエンドポイント（新規）
- `GET /api/wfm/prompts` — 一覧取得
- `POST /api/wfm/prompts` — 新規作成
- `POST /api/wfm/prompts/update` — 更新
- `POST /api/wfm/prompts/delete` — 削除

#### `py/config.py` — 設定追加
- `PROMPTS_FILE = DATA_DIR / "prompts.json"` を追加

#### `py/wfm.py` — ルート登録
- `prompts_routes` のインポートと `prompts_routes.setup_routes(app)` を追加

#### `web/comfyui/node_sets_menu.js` — サイドパネルにPromptsタブ追加
- **トップタブ:** Workflows / Nodes / **Prompts** の3タブ構成
- **Promptsサブタブ:** All / ★ Favorites / 📁 Categories
- **State追加:** `promptSubTab`, `promptList`, `promptFavorites`, `promptCategories`, `promptLoaded`
- **API関数:** `fetchPrompts()`, `loadPromptData()`
- **レンダリング:** `renderPromptAll()`, `renderPromptFavorites()`, `renderPromptCategories()`
- **ドラッグ＆ドロップ:** `application/x-wfm-prompt` MIMEタイプ、`placePromptNode(posText, negText, promptName, pos)` でWFS_PromptTextノード作成
- **P/Nコピーボタン:** 各プリセットアイテムにポジティブ(P)・ネガティブ(N)の個別コピーボタン（Nはテキスト空の場合非表示）
- **パネル名変更:** ツールチップ・タイトルを「Workflow Studio Library」に更新
- **CSS追加:** `.wfm-nlp-copy-btns`, `.wfm-nlp-copy-pos`（緑ホバー）, `.wfm-nlp-copy-neg`（赤ホバー）

#### `templates/index.html` — Promptタブ3カラムレイアウト
- 2カラム（AI Assistant | Presets）→ 3カラム（AI Assistant | Presets | Preset Manager）に変更
- **Presetsパネル:** Deleteボタン削除、Apply→「GenUI Set」、Category入力欄追加、下部にグループ管理行（Select group + Add to Group + + Group + Del Group）
- **Preset Managerパネル:** All / ★ / Groupsタブ、検索、スクロール可能なリスト
- **ヘルプタブ:** helpPrompt5〜7追加、helpSidepanel4・7〜10追加（Promptsタブ・ドラッグ＆ドロップ・P/Nコピー）
- サイドパネルタイトルを「Workflow Studio Library」に更新

#### `static/css/main.css` — スタイル追加（約150行）
- `.wfm-prompt-split-3col` — 3カラムFlexboxレイアウト
- `.wfm-prompt-split-col` — 各カラムのスタイル
- `.wfm-preset-manager` — プリセットマネージャーパネル
- `.wfm-pm-tabs`, `.wfm-pm-tab` — マネージャータブ
- `.wfm-pm-list`, `.wfm-pm-item` — アイテムリスト
- `.wfm-pm-item-actions`, `.wfm-pm-action-btn` — お気に入り(★)・削除(✕)ボタン
- `.wfm-pm-group-header` — グループヘッダー

#### `static/js/prompt-tab.js` — 全面リライト
- **API化:** `fetchPresets()`, `apiCreatePreset()`, `apiUpdatePreset()`, `apiDeletePreset()`
- **localStorage移行:** `migrateLocalStoragePresets()` — 一回限りの自動移行
- **プリセット管理:** `renderPresetSelect()`, `renderGroupSelect()`, `selectPresetInEditor(preset)`
- **Preset Manager:** `renderPresetManager()`, `renderPmAll()`, `renderPmFavorites()`, `renderPmGroups()`
- **`createPmItem()`:** お気に入りトグル(★)と削除(✕)ボタン（コピーボタンなし — Presetsパネル側にPP/NP Copyあり）
- **グループ管理:** Presetsパネル下部のnew-group, add-to-group, del-groupボタン
- **Save:** API経由でnegTextフィールドを含むプリセットの作成/更新

#### `static/js/i18n.js` — 翻訳更新
- `applyPreset` → `"GenUI Set"`（英/日/中 全3言語）
- `deletePreset` キー削除（全3言語）
- ヘルプ: `helpPrompt5`〜`helpPrompt7`, `helpSidepanel8`〜`helpSidepanel10` 追加（全3言語）
- サイドパネルタイトル: `helpSidepanelTitle` → `"Workflow Studio Library"` に更新（全3言語）

#### `static/js/app.js` — i18nマッピング更新
- `helpIdMap` に `helpPrompt5`〜`7`, `helpSidepanel8`〜`10` を追加
- `deletePreset` 適用コード削除

#### `README.md` — v0.2.0更新
- バージョンバッジ: `0.1.9` → `0.2.0`
- Prompt Tab: 3カラムレイアウト、Preset Manager、グループ管理、GenUI Set
- Workflow Studio Library: Promptsタブ、ドラッグ＆ドロップ、P/Nコピー
- Project Structure: `py/nodes/`, `prompts_routes.py`, `prompts_service.py` 追加
- Changelog: v0.2.0エントリ追加
- スクリーンショット全8枚差し替え

## 2026-03-24: v0.1.9 サイドパネルUI改善・保存ダイアログ・バグ修正

### 概要
- サイドパネルのサブタブを2段構成に変更、全ワークフロー/全ノード表示タブを追加
- キャンバススナップショット保存時にファイル名編集ダイアログを表示
- API/App形式バッジをワークフロー一覧に表示
- グループ内の削除済みワークフロー（Not found）を自動クリーンアップ

### 変更内容

#### `web/comfyui/node_sets_menu.js` — サイドパネルサブタブ2段化
- **Workflows サブタブ:**
  - 1段目: Workflows（全WF一覧）/ ★ Favorites / 📁 Groups
  - 2段目: ◦ Model Type
- **Nodes サブタブ:**
  - 1段目: Nodes（全ノード一覧）/ ✳ Favorites / 📁 Groups
  - 2段目: ☰ Sets
- **State 変更:** `wfSubTab2`, `activeTab2` を追加（2段目タブの排他制御用）
- **新レンダリング関数:**
  - `renderWfAll()` — 全ワークフロー一覧表示
  - `renderWfFavorites()` — お気に入りワークフロー一覧（タブとして復活）
  - `renderAllNodes()` — `LiteGraph.registered_node_types` から全ノード一覧表示
- **API/App形式バッジ:** `createDraggableWfItem()` でAPI形式（赤）・App形式（オレンジ）のバッジをファイル名前に表示
- **グループ自動クリーンアップ:** `loadWfData()` でワークフロー一覧取得時に、存在しないファイルをグループから自動除去し localStorage を更新
- **Not found 表示削除:** `renderWfGroups()` から削除済みワークフローの灰色表示コードを除去
- **CSS 追加:**
  - `.wfm-nlp-subtabs-row2` — 2段目サブタブ行
  - `.wfm-nlp-fmt-badge`, `.wfm-nlp-fmt-api`, `.wfm-nlp-fmt-app` — 形式バッジスタイル

#### `web/comfyui/top_menu_extension.js` — 保存ダイアログ追加
- **`showSaveDialog(defaultName)`** — モーダルダイアログでファイル名を編集可能に
  - タイムスタンプ形式のデフォルト名がプレースホルダーとして全選択状態で表示
  - Enter/Saveボタンで確定、Escape/Cancel/オーバーレイクリックでキャンセル
  - `.json` 拡張子は自動付与
- **`saveCanvasToWorkflowStudio()`** — 自動保存からダイアログ経由の保存に変更

#### `py/services/workflow_analyzer.py` — ワークフロー形式検出
- `analyze_workflow()` の返却値に `format` フィールドを追加
  - `"app"`: `definitions`（サブグラフ）キー存在 or `extra.linearMode === true`、フォールバックで `.app.json` ファイル名
  - `"ui"`: `nodes` 配列 + `links` 存在（App特徴なし）
  - `"api"`: 全トップレベル値に `class_type` 存在
  - `"unknown"`: 判定不能

#### `static/js/comfyui-workflow.js` — フロントエンド形式検出も構造ベースに変更
- `detectFormat()` をファイル名依存から `definitions` / `extra.linearMode` による構造判定に変更

#### `static/js/workflow-tab.js` — グループクリーンアップ
- `loadWorkflows()` でワークフロー取得後にグループの不要エントリを自動削除

---

## 2026-03-24: v0.1.8 WF & Node Library サイドパネル拡張

### 概要
- ComfyUI キャンバス右側の「Node Library」サイドパネルを「WF & Node Library」に拡張
- ワークフローをサイドパネルからキャンバスにドラッグ＆ドロップで読み込み可能に
- ヘルプタブに Nodes Tab / WF & Node Library の機能一覧を追加

### 変更内容

#### `web/comfyui/node_sets_menu.js` — サイドパネル全面改修
- **パネル名変更:** "Node Library" → "WF & Node Library"
- **2階層タブ構造:** トップレベル（Workflows / Nodes）+ サブタブ
  - Workflows サブタブ: Favorites（お気に入り）、Model Type（モデル種別）、Groups（グループ）
  - Nodes サブタブ: 既存の Favorites / Sets / Groups をそのまま維持
- **State 拡張:** `topTab`, `wfSubTab`, `wfList`, `wfFavorites`, `wfModelTypes`, `wfGroups`, `wfLoaded` を追加
- **API 追加:**
  - `fetchWorkflows()` — `GET /api/wfm/workflows`（既存エンドポイント流用）
  - `fetchWorkflowRaw(filename)` — `GET /api/wfm/workflows/raw`（既存エンドポイント流用）
  - `loadWfData()` — ワークフロー一覧取得 + favorites/modelTypes/groups 抽出
- **ワークフロー読み込み:**
  - `loadWorkflowOnCanvas(filename)` — raw JSON 取得 → `app.loadGraphData(data)` でキャンバスに読み込み
  - 新 MIME タイプ `application/x-wfm-workflow` によるドラッグ＆ドロップ
  - ダブルクリックでもワークフロー読み込み可能
- **ドロップハンドラー拡張:** `installCanvasDropHandler()` で `application/x-wfm-workflow` を追加受付
- **レンダリング関数追加:**
  - `createDraggableWfItem(wf)` — ワークフロー名 + モデルタイプバッジ表示
  - `renderWfFavorites()` — お気に入りワークフロー一覧
  - `renderWfModelType()` — モデルタイプ別折りたたみセクション（初期: 折りたたみ状態）
  - `renderWfGroups()` — localStorage グループ別折りたたみセクション（初期: 折りたたみ状態）
  - `matchesWfSearch()` — filename, tags, memo, summary に対する検索フィルタ
- **折りたたみ初期状態:** Model Type / Groups（WF・Node 両方）を初期状態で折りたたみ表示に変更
- **CSS 追加:**
  - `.wfm-nlp-subtabs` — サブタブ行（背景色で視覚区別）
  - `.wfm-nlp-top-tab` — トップタブ（大きめフォント 12px, font-weight 600）
  - `.wfm-nlp-sub-tab` — サブタブ（小さめフォント 10px）
  - `.wfm-nlp-item-label` に `text-overflow: ellipsis` 追加（長いファイル名対応）
- **tooltip 更新:** `NODE_SETS_TOOLTIP` → `"WF & Node Library – Browse & drag workflows/nodes onto canvas"`

#### `web/comfyui/top_menu_extension.js` — 変更なし
- `NODE_SETS_TOOLTIP` を import しているため、tooltip 変更が自動反映

#### ヘルプタブ更新
- **`templates/index.html`:**
  - Nodes Tab カード追加（6項目: ノードブラウザ、表示モード、お気に入り/タグ、グループ、サイドパネル、ノードセット）
  - WF & Node Library カード追加（7項目: ボタン起動、WFタブ、Nodesタブ、WFドラッグ、ノードドラッグ、ダブルクリック、検索）
  - About 説明文にノード管理を追記
- **`static/js/i18n.js`:**
  - EN/JA/ZH に `helpNodes1`〜`helpNodes6`（6キー × 3言語）追加
  - EN/JA/ZH に `helpSidepanel1`〜`helpSidepanel7` + `helpSidepanelTitle`（8キー × 3言語）追加
  - 各言語の `helpAboutDesc` にノード管理の記述を追記
- **`static/js/app.js`:**
  - `helpIdMap` に Nodes（6エントリ）+ Sidepanel（8エントリ）のマッピング追加

#### README.md 更新
- バージョンバッジ: `0.1.7` → `0.1.8`
- Screenshots セクション: Nodes Tab + WF & Node Library の行を追加（3行→4行、4枚→6枚）
- ComfyUI Integration 画像をツールバー3ボタンにフォーカスした画像に差し替え
- Features セクション: 新セクション「WF & Node Library (ComfyUI Side Panel) (v0.1.8)」追加
- Changelog: v0.1.8 エントリ追加、v0.1.7 のサイドパネル記載を元に戻し
- Project Structure: `node_sets_menu.js` の説明を更新

#### スクリーンショット追加
- `docs/screenshot_nodes.png` — Nodes タブ（カードビュー + サイドパネル）
- `docs/screenshot_wf_node_library.png` — ComfyUI 上の WF & Node Library サイドパネル
- `docs/screenshot_comfyui_topbar.png` — ツールバー3ボタンにフォーカスした画像に差し替え

### バックエンド変更
- なし（既存の `/api/wfm/workflows` と `/api/wfm/workflows/raw` を流用）

---

## 2026-03-23: v0.1.7 Nodes タブ追加

### 概要
- ComfyUI にインストールされた全ノードをブラウジング・整理・管理する「Nodes」タブを追加
- ノードセット機能：複数ノード＋接続情報をセットとして保存し、再利用可能に

### 変更内容

#### 新規ファイル
- **`py/services/nodes_service.py`** — ノードメタデータ（お気に入り、タグ、グループ）とノードセットの CRUD サービス
- **`py/routes/nodes_routes.py`** — 9つの API エンドポイント（metadata, groups, node-sets の GET/POST/update/delete/export）
- **`static/js/nodes-tab.js`** — Nodes タブのメインロジック（Node Browser + Node Sets サブビュー）
- **`web/comfyui/node_sets_menu.js`** — ComfyUI キャンバス内サイドパネル（Favorites/Sets/Groups タブ、ドラッグ&ドロップ配置）

#### 既存ファイル修正
- **`py/wfm.py`** — `nodes_routes.setup_routes(app)` 追加
- **`py/config.py`** — `NODE_METADATA_FILE`, `NODE_SETS_FILE` 定数追加
- **`static/js/app.js`** — Nodes タブ登録、`initNodesTab()` 呼び出し
- **`static/js/i18n.js`** — EN/JA/ZH に Nodes タブ関連 ~35 キー追加
- **`static/js/comfyui-client.js`** — `fetchAllObjectInfo()` メソッド追加
- **`static/css/main.css`** — ノードタブ固有スタイル（カード、テーブル、バッジ、ページネーション等）
- **`templates/index.html`** — Nodes タブの HTML 構造追加
- **`web/comfyui/top_menu_extension.js`** — Node Library ボタン＋右クリック "Save as Node Set" コンテキストメニュー追加

### 機能詳細

#### Node Browser（Sub-view 1）
- ComfyUI `/object_info` API から全ノード取得（遅延読み込み）
- Card / Table の2ビュー切り替え
- フィルタ: カテゴリ、パッケージ、タグ、グループ、お気に入り
- 全文検索: name, display_name, description, search_aliases, tags
- パッケージ名カラーバッジ（ハッシュベース色生成）
- サイドパネル: ノード詳細（I/O仕様テーブル、タグ編集、グループ管理）
- 1ページ50ノード表示（ページネーション）

#### Node Sets（Sub-view 2）
- ComfyUI キャンバスで選択したノード＋接続をセットとして保存
- 右クリックコンテキストメニュー "Save as Node Set" から保存
- セット一覧表示（名前、説明、ノード数、タグ）
- 作成・編集・削除
- ComfyUI 互換 JSON としてクリップボードにコピー

#### ComfyUI トップバー統合
- 3ボタン: Workflow Studio / Snapshot / Node Library
- Node Library ボタンでサイドパネル開閉

### バグ修正
- `node_sets_menu.js` で `const saveSelectedAsNodeSet` が二重定義されていた ESM SyntaxError を修正（Vite preload wrapper により完全にサイレントだった）
- デバッグ用 `console.log` 削除

---

## 2026-03-23: v0.1.6 パストラバーサル脆弱性修正

### 概要
- ComfyUI-Manager PR #2706 のレビューで指摘されたセキュリティ脆弱性を修正
- `workflow_service.py` で任意のファイルパスへのアクセスが可能だった問題を解消

### 背景
- ltdrdata（ComfyUI-Manager メンテナー）から `import_files` メソッド内のパス構築が安全でないとの指摘
- `original_name` に `../../etc/passwd` のようなパストラバーサル文字列を送ることで、`workflows_dir` 外のファイルを読み書きできる状態だった

### 変更内容

#### `py/services/workflow_service.py`
- **`_validate_filename()` 強化** — `"."`, `".."`, null バイト (`\x00`) のチェックを追加
- **`_safe_path()` メソッド新規追加** — ファイル名バリデーション + `resolve()` でパスを正規化し、`workflows_dir` 配下にあることを検証。違反時は `ValueError` を送出
- **全公開メソッドに `_safe_path()` 適用:**
  - `import_files` — ループ冒頭で `_validate_filename` チェック追加、パス構築を `_safe_path` に変更
  - `get_raw` — `_safe_path` に変更
  - `rename` — old/new 両パスを `_safe_path` に変更
  - `delete` — `_safe_path` に変更
  - `analyze` — `_safe_path` に変更
  - `change_thumbnail` — `_safe_path` に変更

---

## 2026-03-22: v0.1.5 テーマシステム追加

### 概要
- 13種類のビルトインテーマを設定タブから切り替え可能に
- テーマごとにカラー・フォント・角丸・影・特殊効果を変更
- 選択テーマはlocalStorageに保存、ページ読み込み時にフラッシュなく復元

### 変更内容

#### テーマ定義（CSS）
- `static/css/main.css` — 12テーマの`[data-theme="xxx"]`変数定義を末尾に追加
  - Pop & Vibrant / Light Minimalist / Cyberpunk / Glassmorphism / Neumorphism / Retro 8-bit / Pastel Dream / Brutalism / Earthy / Material UI / Monotone + Accent / Corporate Trust
- テーマ固有の特殊効果CSS:
  - Cyberpunk: ネオン発光ボーダー（`box-shadow`）、JSON構文ハイライト色変更
  - Glassmorphism: `backdrop-filter: blur(12px)` + メッシュグラデーション背景
  - Neumorphism: ダブルシャドウ（凸凹表現）、insetシャドウボタン
  - Retro-pixel / Brutalism: 太い黒ボーダー（`border: 3px solid #000`）
- `.wfm-theme-grid` / `.wfm-theme-card` / `.wfm-theme-swatch` — テーマ選択UIスタイル

#### テーマ選択UI（JavaScript）
- `static/js/settings-tab.js`:
  - `THEMES` 配列: テーマID・i18nキー・プレビュー用4色スウォッチを定義
  - `applyTheme(themeId)` — `<html>`の`data-theme`属性を設定/解除
  - `getSavedTheme()` — localStorageから保存テーマを取得
  - 設定タブにカラースウォッチ付きグリッドUIを生成（言語設定の直下）
  - クリックで即座にテーマ適用 + localStorage保存 + activeクラス更新
- `static/js/app.js`:
  - `applyTheme` / `getSavedTheme` をインポート
  - `DOMContentLoaded`の前にテーマ復元を実行（テーマフラッシュ防止）

#### 多言語対応
- `static/js/i18n.js` — 3言語（EN/JA/ZH）に `themeLabel` + 13テーマ名の翻訳キー追加

#### その他
- `templates/index.html` — ヘルプページのGitHubリンクURL修正
- `README.md` — v0.1.5更新、テーマ機能記載、git clone URL修正

### スクリーンショット
| Workflow Tab (Pastel Dream) | Settings Tab (Theme) |
|:---:|:---:|
| ![Workflow](docs/screenshot_workflow.png) | ![Settings](docs/screenshot_settings.png) |

---

## 2026-03-22: v0.1.4 App形式対応・プリセットコピー・分析バグ修正

### 概要
- ComfyUI App形式（`.app.json`）ワークフローの識別・表示対応
- プリセットタブにポジティブ/ネガティブプロンプトのクリップボードコピーボタン追加
- ワークフロー分析のクラッシュバグ修正

### 変更内容

#### App形式ワークフロー対応
- **背景:** ComfyUIの最新アップデートでAppモード（ノードを簡略化したWebアプリ風UI）が追加され、`.app.json`拡張子で保存される
- **対応:**
  - `static/js/comfyui-workflow.js` — `detectFormat()`にファイル名ベースのApp形式判定を追加
  - `static/js/workflow-tab.js` — サイドパネルJSONタブのフォーマットバッジに「App形式」表示を追加
  - `static/js/generate-tab.js` — App形式ワークフローの生成UI読み込みをブロックし、「ComfyUIで開く」への誘導メッセージを表示
  - `static/css/main.css` — `.wfm-format-badge--app` スタイル追加（オレンジ色）
  - `static/js/i18n.js` — `appFormat` / `appFormatNotSupported` 翻訳キー追加（EN/JA/ZH）

#### プリセット クリップボードコピーボタン
- **課題:** プリセットのプロンプトをComfyUI本体で使う際に手動コピーが必要だった
- **対応:**
  - `templates/index.html` — プリセット保存ボタン行に「PP コピー」「NP コピー」ボタンを追加（flex:2/2/1比率）
  - `static/js/prompt-tab.js` — クリップボードコピー処理（`navigator.clipboard.writeText`）追加
  - `static/js/app.js` — コピーボタンのi18n適用
  - `static/js/i18n.js` — `copyPositivePrompt` / `copyNegativePrompt` / `copiedToClipboard` / `noTextToCopy` 翻訳キー追加

#### ワークフロー分析バグ修正
- **問題:** UI形式ワークフローの`widgets_values[0]`が整数（例: EmptyLatentImageの`768`）の場合、`.lower()`で`AttributeError`が発生し、例外キャッチにより全分析結果がゼロになる
- **修正:** `py/services/workflow_analyzer.py` — `_model_name_from_ui_node()`に`isinstance(val, str)`型チェックを追加

---

## 2026-03-21: v0.1.3 ヘルプ＆サポートタブ追加

### 概要
- ヘルプ＆サポートタブを新規追加（機能一覧 + サポートリンク）

### 変更内容

#### ヘルプ＆サポートタブ
- **課題:** プラグインの機能概要を確認する場所がなく、サポートへの導線もなかった
- **対応:** 新しいメインタブ「Help」を追加し、機能一覧とサポートセクションを設置

##### 機能一覧セクション
- 各タブ（Workflow / GenerateUI / Prompt / Settings）の主要機能をカード形式で表示
- Tipsセクション（ドラッグ＆ドロップ、お気に入り、デフォルトワークフロー）

##### サポートセクション
- GitHubリンク（バグ報告・機能リクエスト・コントリビュート）
- Ko-fiリンク（開発支援）
- SVGアイコン付きのリンクカード

#### 変更ファイル
- `templates/index.html` — Helpタブボタン追加、ヘルプ＆サポートセクションのHTML構造
- `static/js/i18n.js` — 3言語（EN/JA/ZH）のヘルプ関連翻訳キー30項目追加
- `static/js/app.js` — タブマップにhelp追加、`applyI18nToHtml()`にヘルプタブのi18n適用ロジック追加
- `static/css/main.css` — `.wfm-help-*` スタイル追加（コンテナ、セクション、カード、リンク）

---

## 2026-03-19: v0.1.2 リリース

### 概要
- キャンバススナップショット機能追加（ComfyUIトップバーにカメラボタン）
- ワークフローサイドパネル・モーダルにサムネイルプレビュー追加

### 変更内容

#### Canvas Snapshot（キャンバススナップショット）
- **課題:** ワークフローのキャンバス画像を保存するにはComfyUIのエクスポート機能を使い手動でファイル管理する必要があった
- **対応:** ComfyUIトップバーにカメラボタンを追加し、ワンクリックでキャンバスをPNGキャプチャ→ワークフローデータフォルダに自動保存
- `web/comfyui/top_menu_extension.js`:
  - カメラアイコンボタン追加（actionBarButtons API / legacy ComfyButtonGroup 両対応）
  - `captureCanvasSnapshot()` — LiteGraphキャンバスの状態保存→ノード範囲計算→レンダリング→Blob化→復元
  - PNG tEXtチャンク埋め込み (`n2b`, `joinArrayBuffer`, `crc32`, `embedWorkflowInPng`) — ComfyUIのドラッグ＆ドロップインポート互換
  - タイムスタンプファイル名 `wf_YYYYMMDDHHmmss.json` 形式で自動生成
- `py/routes/workflow_routes.py`:
  - `POST /api/wfm/workflows/save-canvas-image` ルート追加
  - `import_files` を利用してPNGからワークフローJSON抽出＋サムネイル保存＋自動インポート
- 参考実装: [pythongosssss/ComfyUI-Custom-Scripts](https://github.com/pythongosssss/ComfyUI-Custom-Scripts) の workflowImage.js

#### サムネイルプレビュー
- `templates/index.html` — サイドパネルにThumbnailタブ追加（デフォルトアクティブ）
- `static/js/workflow-tab.js`:
  - `sidePanelThumbUpdate()` — 選択ワークフローのサムネイル・メタ情報表示
  - モーダル上部にサムネイルセクション追加
  - サムネイル変更時にサイドパネル・モーダル両方を同期更新
- `static/css/main.css` — `.wfm-side-thumb-*` / `.wfm-modal-thumb-*` スタイル追加

### スクリーンショット
| Workflow Tab | ComfyUI Top Bar |
|:---:|:---:|
| ![Workflow](docs/screenshot_workflow.png) | ![TopBar](docs/screenshot_comfyui_topbar.png) |

### リリース
- GitHub Release v0.1.2: https://github.com/ketle-man/ComfyUI-Workflow-Studio/releases/tag/v0.1.2

---

## 2026-03-19: v0.1.1 リリース

### 概要
- ファビコン追加
- プロンプトタブをサブタブ切り替え方式から左右2分割レイアウトに変更

### 変更内容

#### ファビコン追加
- `static/favicon.svg` — 起動ボタンと同じ W + S Wave デザインの SVG ファビコンを新規作成
- `templates/index.html` — `<link rel="icon">` タグ追加

#### プロンプトタブ 2分割レイアウト
- **課題:** Assistant / Presets のサブタブ切り替え方式では画面幅が広い場合に視点移動が大きく使いづらい
- **対応:** サブタブナビゲーションを廃止し、左パネル（AIアシスタント）・右パネル（プリセット）の同時表示レイアウトに変更
- `templates/index.html` — サブタブ構造を `.wfm-prompt-split` 左右分割構造に変更
- `static/css/main.css` — `.wfm-prompt-subtab-*` スタイルを `.wfm-prompt-split` / `.wfm-prompt-split-header` に置換
- `static/js/prompt-tab.js` — サブタブ切り替えイベントリスナー削除
- `static/js/app.js` — 翻訳対象をサブタブボタンからパネルヘッダーに変更

### スクリーンショット
![Prompt Tab](docs/screenshot_prompt.png)

---

## 2026-03-18: プロジェクトリネーム & アイコン適用

### 概要
- `ComfyUI-Workflow-Manager` → `ComfyUI-Workflow-Studio` にリネーム
- 起動ボタンのアイコンを W + S Wave デザインに差し替え

### 背景
- 既存の `ComfyUI-WorkflowManager` (yichengup) と名前が衝突するため、GitHub公開・ComfyUI Manager登録に向けてリネーム
- アイコンは9種類のWSモノグラムバリエーションから「W + S Wave」(W文字 + S字カーブ) を選定

### 変更内容
- ディレクトリ名: `ComfyUI-Workflow-Manager/` → `ComfyUI-Workflow-Studio/`
- 全ファイルの "Workflow Manager" → "Workflow Studio" 置換
- `top_menu_extension.js`:
  - 関数名 `openWorkflowManager` → `openWorkflowStudio`
  - 拡張名 `WorkflowManager.TopMenu` → `WorkflowStudio.TopMenu`
  - `getWfmIcon()` を W + S Wave SVGに差し替え

---

## 2026-03-18: デフォルトビュー設定追加

### 概要
ワークフロータブの歯車アイコン設定パネルに「デフォルトビュー」設定を追加

### 変更ファイル
- `static/js/workflow-tab.js` - ラジオボタンUI追加、localStorage連携
- `static/js/i18n.js` - defaultView/viewThumbnail/viewCard/viewTable キー追加
- `static/css/main.css` - `.wfm-settings-radio-group` スタイル追加

---

## 2026-03-18: MarkdownNote表示専用ノード除外

### 概要
`MarkdownNote`等の表示専用ノード（入出力接続なし、object_info未登録）がAPI変換に含まれエラーになる問題を修正

### 変更ファイル
- `static/js/comfyui-workflow.js` - `_isDisplayOnlyNode()` ヘルパー追加、`convertUiToApi`でスキップ

---

## 2026-03-18: サブグラフワークフロー対応 & 変換精度修正

### 概要
ComfyUIサブグラフ（LongCat Image等）を含むワークフローの生成時エラーを修正

### 問題
1. サブグラフノードのUUID型typeがComfyUIバックエンドで認識されない
2. リンク済み入力のwidgets_values消費漏れでbatch_sizeが1024になる
3. `"COMBO"` 文字列型がウィジェット型として認識されない

### 修正内容 (`static/js/comfyui-workflow.js`)
- `_flattenSubgraphs(workflow)` 関数追加: サブグラフを `parentId:internalId` 形式に展開
- リンク済み入力でも `wIdx` をインクリメントするよう修正
- `_getWidgetInputNames` / `_getWidgetInputTypes` に `"COMBO"` 文字列型を追加

---

## 2026-03-18: Raw JSON同期修正

### 概要
GenerateUIの各タブでApply操作後、Raw JSONテキストエリアが更新されない問題を修正

### 変更ファイル
- `static/js/comfyui-editor.js` - `_syncRawJson()` ヘルパー追加、全Apply箇所から呼び出し

---

## プロジェクト構成 (現在)

```
ComfyUI-Workflow-Studio/
├── __init__.py              # ComfyUIエントリーポイント
├── py/
│   ├── wfm.py               # メインクラス (WorkflowStudio)
│   ├── config.py             # パス設定
│   ├── routes/               # APIルート
│   └── services/             # ビジネスロジック
├── templates/index.html      # SPA (Workflow/GenerateUI/Prompt/Settings/Help)
├── static/                   # CSS/JS
├── web/comfyui/              # ComfyUIメニュー拡張
└── data/                     # ワークフロー・メタデータ・設定
```

---

## 2026-03-18: JSONシンタックスハイライト

### 概要
ワークフロータブ・生成UIタブのJSON表示にシンタックスハイライトを追加

### 色分け (eagle_comic_creater_webと同じOne Atomテーマ風)
- 黄 `#e5c07b` — name, scheduler
- ピンク `#c678dd` — title
- 緑 `#98c379` — width, height
- 水色 `#61afef` — text, prompt
- 赤 `#e06c75` — image, file
- ベース `#abb2bf` — その他

### 変更ファイル
- `static/js/json-highlight.js` — 新規: `highlightJSON`, `syncJsonHighlight`, `syncScroll`
- `static/js/workflow-tab.js` — サイドパネルJSON表示に `highlightJSON` 適用
- `templates/index.html` — Raw JSONを `<pre>` + `<textarea>` レイヤー構造に変更
- `static/js/generate-tab.js` — ハイライト同期、input/scrollイベント追加
- `static/js/comfyui-editor.js` — `_syncRawJson` にハイライト同期追加
- `static/css/main.css` — `.wfm-json-container`, `.wfm-json-highlight`, `.json-key-*` スタイル追加

---

## 2026-03-18: プロンプトタブ 中国語↔英語翻訳追加

### 概要
プロンプトタブの翻訳機能に ZH→EN / EN→ZH を追加

### 変更ファイル
- `templates/index.html` — `ZH→EN` / `EN→ZH` ボタン追加
- `static/js/prompt-tab.js` — `sendTranslate` に `zh2en` / `en2zh` プロンプト追加、イベントリスナー追加

---

## 2026-03-18: v0.1.0 リリース

### 概要
GitHub公開・ComfyUI Manager登録・初回リリース

### 実施内容
- GitHub リポジトリ作成: https://github.com/ketle-man/ComfyUI-Workflow-Studio
- README.md 作成（スクリーンショット4枚付き）
- ComfyUI Manager 登録PR: https://github.com/Comfy-Org/ComfyUI-Manager/pull/2706
- GitHub Release v0.1.0: https://github.com/ketle-man/ComfyUI-Workflow-Studio/releases/tag/v0.1.0

---

## 2026-04-13: Gallery タブ追加 & 全タブ Group UI 統一

### 概要
- ギャラリータブ（Phase 1）実装：6800枚超の画像ブラウザ
- Workflow / Nodes / Gallery の Group UI を Models タブ基準に統一
- Settings タブを2カラムレイアウトに変更（テーマを右固定）

### Gallery タブ機能
- **3カラム表示** — サムネイル / テーブル切り替え、Fav列を左端に
- **サーバーサイドフィルタ** — グループ・お気に入り・タグによる server-side filtering
- **マルチセレクト** — Ctrl+クリックで複数選択、Bulk Bar でまとめて操作
- **グループ管理** — 作成・Rename・削除（Models パネルと同一UIパターン）
- **os.scandir() + フォルダキャッシュ** — 6800枚環境でのパフォーマンス改善
- **出力フォルダ設定** — Settings タブからギャラリー参照フォルダを変更可能

### Group UI 統一
- **Workflow タブ** — `renderSideGroup()` を新設し Models 4 セクションパターンに変更（Current Groups / Add to Group / Create New Group / Manage Groups）。冗長なヘッダーブロック削除
- **Nodes タブ** — `renderSideGroups()` を全面書き換え。`×` ボタン・"Add" ボタン・"Rename (✎)" 追加
- **Gallery タブ** — `renderDetailGroup()` を新設、同パターン適用

### Settings 2カラムレイアウト
- テーマパネルを右側（`float:right; width:50%`）に固定
- 左側に UI言語〜保存ボタンを連続配置（ギャップなし）
- `position:sticky; top:0` でテーマパネルをスクロールに追従

### 変更ファイル
- `py/services/gallery_metadata.py` — `rename_group()`, `get_group_member_set()` 追加
- `py/services/gallery_service.py` — `_FolderCache`, `_scan_folder()`, `group_filter` 対応
- `py/routes/gallery_routes.py` — `PUT /wfm/gallery/groups/{name}` 追加
- `static/js/gallery-tab.js` — マルチセレクト・サーバーサイドフィルタ・renderDetailGroup
- `static/js/nodes-tab.js` — `renderSideGroups()` 全面書き換え
- `static/js/workflow-tab.js` — `renderSideGroup()` 新設、旧ハンドラ削除
- `static/js/settings-tab.js` — 2カラムレイアウト HTML 構造変更
- `static/css/gallery-tab.css` — multi-selected・bulk-bar・セクションタイトルスタイル
- `static/css/main.css` — Settings レイアウト CSS（float:right ベース 50:50）
- `templates/index.html` — Gallery "Group"→"Groups"、各タブ static HTML → JS動的生成、Gallery ヘルプカード追加

