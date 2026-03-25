# DEVLOG - ComfyUI-Workflow-Studio

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
