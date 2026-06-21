# DEVLOG - ComfyUI-Workflow-Studio

## 2026-06-22: v0.3.47 — モデルタブ ファイル移動後グループ状態修正

**変更ファイル**: `static/js/models-tab.js`

### モデル移動後のグループ状態不整合を修正

`bulkMoveModels` でモデルをサブディレクトリ間移動した際、Python側（`move_models`）はグループメンバーの名前を `from → to` に更新していたが、JS の `state.modelGroups` が更新されていなかった。

このため移動直後にグループフィルターで絞り込むと、移動したモデルが消えてしまう（旧名で参照されるため一致しなくなる）問題があった。

- `data.moved.forEach` ループ内で `state.modelGroups` の各グループメンバーを `from → to` でリネーム
- サーバーが `_groups` を更新する処理と対称的なクライアント側更新
- `state.modelGroups` と `state.allModelGroups[type]` は同一オブジェクト参照のためインプレース更新で両方に反映される
- Generate タブ Batch の `_batchGroupState.groups` はサーバーから毎回取得するため影響なし

---

## 2026-06-21: v0.3.46 — プロンプトタブ AI Assistant LM Studio対応・設定タブ AI Assistant設定に変更

**変更ファイル**: `static/js/settings-tab.js`, `static/js/prompt-tab.js`, `static/js/i18n.js`, `templates/index.html`

### 設定タブ「AI Assistant設定（プロンプトタブ）」

設定タブの「Ollama設定（プロンプトタブ）」セクションを AI TOOL タブの SETTINGS ペインと同等の内容に変更。

- セクション名を **「AI Assistant設定（プロンプトタブ）」** に変更
- **バックエンド選択ラジオ（Ollama / LM Studio）** を追加
- **API URL 入力** — バックエンド切替時にプレースホルダーが自動変更（Ollama: `http://localhost:11434`、LM Studio: `http://localhost:1234`）
- **モデル選択 + Refresh** — 選択中のバックエンドへ直接接続してモデル一覧を取得
- **Test ボタン** — バックエンドへ直接接続テスト
- **Save ボタン** — 設定を localStorage `wfm_prompt_ai_settings` に保存（サーバーAPI不要）
- AI TOOL タブの設定（`wfm_ai_settings`）とは独立した設定キーを使用

### プロンプトタブ AI Assistant LM Studio対応

Python プロキシルート（`/api/wfm/ollama/*`）依存を廃止し、AI TOOL タブと同方式のブラウザから直接バックエンドAPIを呼び出す実装に変更。

- Ollama: `{url}/api/tags`（モデル一覧）、`{url}/api/chat`（チャット）
- LM Studio: `{url}/v1/models`（モデル一覧）、`{url}/v1/chat/completions`（チャット）
- 画像添付（ビジョンモデル）も両バックエンド対応 — Ollama形式（`images`フィールド）を LM Studio形式（`content`配列の`image_url`）に自動変換
- 設定タブで保存したモデルを初期選択として表示
- ウェルカムメッセージの "AI Assistant (Ollama)" 表記を削除

### バックエンド変更時の自動モデル再取得

設定タブでバックエンドを変更した後にプロンプトタブですぐ送信しようとすると、ドロップダウンに旧バックエンドのモデル名が残ったまま送信されモデル未認識エラーが発生する問題を修正。

- `_promptAiBackendForModels` 変数にモデル一覧取得時のバックエンドを記録
- `sendMessage()` の冒頭で現在設定と比較し、バックエンドが変わっていた場合は自動でモデル一覧をリフレッシュしてから送信
- モデル一覧表示に `[ollama]` / `[lmstudio]` のバックエンド名を付記

### i18n 更新（EN/JA/ZH）

- `ollamaSettings` → "AI Assistant Settings (Prompt Tab)"
- `ollamaUrl` → "API URL"（汎用）
- `saveOllama` → "Save AI Assistant Settings"
- `ollamaSaved` → "AI Assistant settings saved"
- `helpPrompt1` — "Ollama" → "Ollama / LM Studio"・設定場所の説明を追記
- `helpSettings5` — バックエンド選択・URL・モデル・接続テストの説明に更新
- `helpTrouble2` — "Ollamaに接続できない" → "AIアシスタントに接続できない（Ollama/LM Studio両対応）"

---

## 2026-06-21: v0.3.45 — グループ孤立エントリ自動クリーンアップ・Galleryタブ Shift+クリック範囲選択

**変更ファイル**: `py/services/models_service.py`, `py/services/gallery_service.py`, `py/services/gallery_metadata.py`, `static/js/gallery-tab.js`, `static/js/i18n.js`

### グループ孤立エントリ自動クリーンアップ

ファイルをアプリ外（OS）で移動・削除した際にグループデータに残る孤立エントリを自動的に除去する仕組みを追加。

#### Modelsタブ

- `models_service.py` に `_scan_model_names(model_type)` を追加 — `_get_model_dirs` の全ディレクトリを `rglob` で走査し、有効なモデルファイル名のセットを返す（`.disabled` サフィックスを除いた相対パス）
- `get_model_groups(model_type)` に自動クリーンアップを追加 — タイプ指定時にファイルスキャンを実行し、存在しないモデル名をグループから除去；変更があった場合のみ保存
- `move_models()` でグループエントリを即時更新 — アプリ内での移動時に `renames` リストを収集し、`_groups[model_type]` 内の旧パスを新パスに一括書き換え

#### Galleryタブ（フォルダ表示）

- `gallery_metadata.py` に `cleanup_stale_images(folder_path, existing_paths)` を追加 — `folder_path` 配下のメタデータキーのうち `existing_paths` に含まれないものを削除して保存
- `gallery_service.py` の `list_images()` で `_scan_folder` 直後にクリーンアップを呼ぶ — スキャン結果の `abs_path` セットを渡すため、60秒 TTL キャッシュとフォルダ mtime 変化検知に連動して自動実行

#### Galleryタブ（グループ画像一覧）

- `gallery_metadata.py` に `remove_stale_paths_from_group(group_name, stale_paths)` を追加 — 孤立パスをグループから一括削除し1回の保存で完結
- `gallery_service.py` の `list_images_in_group()` で `Path.is_file()` チェックを追加 — FeederタブのGalleryモード（`GET /wfm/gallery/groups/{name}/images`）呼び出し時に孤立パスをグループから自動除去して既存ファイルのみ返す

#### 各タブのクリーンアップトリガー

| タブ | トリガー | 対象 |
|---|---|---|
| Modelsタブ | タブ切替・モデルタイプ変更時 | 全グループから存在しないモデル名を削除 |
| Modelsタブ（アプリ内移動） | `move_models` API 呼び出し時 | グループ内パスを即時更新 |
| Galleryタブ（フォルダUI） | フォルダ表示時（mtime 変化 or 60秒後） | フォルダ内の孤立メタデータエントリを削除 |
| Galleryタブ（Feederモード） | グループ画像一覧取得時 | グループから孤立パスを削除 |

### GalleryタブのShift+クリック範囲選択

- `state` に `lastSelectionIndex: -1` を追加（Shift 選択のアンカーインデックス）
- `createThumbCard()` / `createTable()` に `data-path` 属性を追加
- `_applySelectionToDOM()` ヘルパーを追加 — `state.selectedImages` を元に描画済み要素の `multi-selected` クラスを一括同期；ページング未描画の要素はスクロールで描画される際に `createThumbCard` が自動で反映
- サムネイルビュー・テーブルビューのクリックハンドラを更新：
  - Shift+クリック: アンカーから現在位置まで `state.images` のインデックス範囲で一括追加
  - Ctrl+クリック: 個別トグル（既存）＋アンカー更新
  - 通常クリック: 詳細表示（既存）＋アンカー更新
- `lastSelectionIndex` リセット箇所: フォルダ切替時・`loadImages()` 完了時（ソート/フィルタ変更後も含む）・一括解除ボタン押下時
- `i18n.js` の `helpGallery6`（EN/JA/ZH）を更新して Shift+クリック範囲選択を追記

---

## 2026-06-21: v0.3.44 — Galleryタブ高速化・比較モード・バルク強化・バルクバーUI整理

**変更ファイル**: `py/services/gallery_service.py`, `py/routes/gallery_routes.py`, `static/js/gallery-tab.js`, `static/css/gallery-tab.css`, `templates/index.html`, `static/js/app.js`, `static/js/i18n.js`

### フェーズ2-A: サーバーサイドサムネイル生成

- `gallery_service.py` に `serve_thumbnail(path, width=256)` を追加
- Pillow で画像を 256px JPEG に縮小し `data/thumb_cache/` にキャッシュ（キー: `md5(path:mtime:width)`）
- GIF はアニメーション保持のため元ファイルをそのまま返す；Pillow 未インストール時は元ファイルにフォールバック
- `GET /wfm/gallery/image/thumb?path=...&w=256` エンドポイントを `gallery_routes.py` に追加（Cache-Control 24時間）
- `gallery-tab.js` のサムネイルビュー・テーブルビューを `/image/serve` → `/image/thumb` に切り替え；ライトボックス・詳細プレビューは引き続き元画像を使用

### フェーズ2-B: 無限スクロールページング

- モジュールレベル変数 `PAGE_SIZE=50`, `_renderedCount`, `_scrollObserver` を追加
- `renderImages()` をリファクタリング: 初回は50枚のみ DOM に追加し、末尾にセンチネル div を配置
- `IntersectionObserver`（rootMargin 300px）がセンチネルを検出するたびに次の50枚を追加
- 全枚数を描画し終えたらオブザーバーを切断してセンチネルを削除
- `renderImages()` 呼び出し（フォルダ切替・フィルタ変更・ソート変更）のたびに自動リセット

### フェーズ3-A: バルクAPIエンドポイント

- `gallery_service.py` に `bulk_set_favorite(paths, value)` と `bulk_group_op(paths, group, action)` を追加
- `POST /wfm/gallery/bulk/favorite`, `POST /wfm/gallery/bulk/group` を `gallery_routes.py` に追加
- フロントエンドの `bulkSetFavorite()` / `bulkAddToGroup()` を N並列個別リクエスト → 単一バルクリクエストに変更

### フェーズ3-B: 画像比較モード

- Ctrl+クリックで2〜4枚選択すると Bulk Bar に「比較」ボタンが出現
- `openCompare(paths)` 関数を追加: `--compare-cols` CSS カスタムプロパティで列数を動的制御した CSS Grid サイドバイサイドライトボックス
- 閉じるボタンは `position:fixed; top:16px; right:16px` で配置し `overflow:auto` コンテナによるクリッピングを防止
- i18n: `galleryBulkCompare`（EN/JA/ZH）追加

### フェーズ3-C: プロンプト全文検索

- `get_image_metadata()` 実行時に PNG/JPEG 埋め込みテキスト（`workflow` キーを除く文字列フィールド）を連結して `metadata.json` の `prompt_cache` に保存
- `list_images()` の検索フィルタに `prompt_cache` を追加（ファイル名・メモ・タグに加えて）
- 検索プレースホルダを「名前・タグ・プロンプトで検索...」に更新（EN/JA/ZH）
- ヘルプ `helpGallery4` を更新して prompt 検索対応を明記

### バルクバーUI整理

- ドロップダウンプレースホルダ「グループに追加...」→「グループ選択」
- 「追加」ボタン → 「グループに追加」
- 「グループから削除」ボタンを「グループに追加」の右隣に新規追加
  - `bulkRemoveFromGroup()` 関数を追加（`POST /wfm/gallery/bulk/group` の `action:"remove"` を使用）
  - `removedNImagesFromGroup` i18n キー追加（EN/JA/ZH）
- 「削除」ボタン → 「ファイル削除」（グループ削除との混同を防ぐ）
- ヘルプ `helpGallery6`, `helpGallery7` を更新

---

## 2026-06-21: ヘルプタブ改善 — Gallery mode 多言語対応・フォント拡大・検索機能追加

**変更ファイル**: `templates/index.html`, `static/js/app.js`, `static/js/i18n.js`, `static/css/main.css`

### Gallery mode の多言語対応

Feeder サブタブの Gallery mode セクション（h4 見出し・説明文・リスト6項目）が英語のハードコードのままだったのを i18n 対応に変更。

**修正（`templates/index.html`）**
- `<h4 id="wfm-help-feeder-imgloop-title">` と `<p id="wfm-help-feeder-imgloop-desc">` を追加（Image Loop mode 見出し・説明文を i18n 化）
- `<h4 id="wfm-help-feeder-gal-title">` と `<p id="wfm-help-feeder-gal-desc">` を追加
- Gallery mode 6項目に `id="wfm-help-feeder-gal-1"` 〜 `id="wfm-help-feeder-gal-6"` を付与

**修正（`static/js/app.js`）**
- `helpIdMap` に `helpFeederImgloopTitle` / `helpFeederImgloopDesc` / `helpFeederGalTitle` / `helpFeederGalDesc` / `helpFeederGal1`〜`helpFeederGal6` を追加

**修正（`static/js/i18n.js`）**
- `helpFeederDesc`: 「2モード切り替え」の説明に EN/JA/ZH で更新
- `helpFeederImgloopTitle` / `helpFeederImgloopDesc`: Image Loop mode 見出し・説明を EN/JA/ZH で追加
- `helpFeederGalTitle` / `helpFeederGalDesc` / `helpFeederGal1`〜`helpFeederGal6`: Gallery mode 全項目を EN/JA/ZH で追加
- `helpSearchPlaceholder`: 検索ボックスのプレースホルダーを EN/JA/ZH で追加

### ヘルプ全体フォントを 1.5 倍に変更

**修正（`static/css/main.css`）**
- `.wfm-help-nav-item`: 12px → 18px
- `.wfm-help-sidebar` 幅: 170px → 220px（フォント拡大に伴う調整）
- `.wfm-help-card h3`: 14px → 21px
- `.wfm-help-card h4`: 18px（新規追加）
- `.wfm-help-card p`: 20px（新規追加）
- `.wfm-help-card li`: 13px → 20px
- `.wfm-help-link-title`: 15px → 23px
- `.wfm-help-link-desc`: 12px → 18px
- `.wfm-help-thanks`: 13px → 20px
- `.wfm-help-support-card > p`: 14px → 21px

### ヘルプタブに検索機能を追加

**修正（`templates/index.html`）**
- サイドバーの `.wfm-help-nav` 上部に `<input id="wfm-help-search">` を追加

**修正（`static/js/app.js`）**
- `_onHelpSearch()`: 入力テキストで全ヘルプページの `textContent` を検索。マッチしないナビゲーションボタンは `search-hidden` クラスで非表示。マッチするページが1つでもあれば最初にマッチしたページを自動表示

**修正（`static/css/main.css`）**
- `.wfm-help-search-wrap` / `.wfm-help-search` / `.wfm-help-search:focus` / `.wfm-help-nav-item.search-hidden` のスタイルを追加

---

## 2026-06-21: Send to Canvas — window.opener経由のキャンバス直接ロード対応

**背景**: SPAは `window.open(url, "_blank")` でComfyUIとは別タブとして開かれる。同一オリジンの別タブでは `window.opener` 経由でComfyUIウィンドウのJavaScriptに直接アクセスできる。従来の「タイトルドラッグ（Send to Canvas）」はSPAウィンドウ→ComfyUIウィンドウのクロスウィンドウDnDだったが、`dragover` イベント中はブラウザのセキュリティ制限でカスタムMIMEタイプが `DataTransfer.types` に含まれず `e.preventDefault()` が呼ばれないため `drop` イベントがキャンバスに届かなかった（Wタブ内DnDは同一ウィンドウなので `app.handleFile` が機能していた）。

**修正（`web/comfyui/node_sets_menu.js`）**
- `window.wfmReceiveWorkflow(data)` グローバル関数を追加: `loadDataOnCanvas(data)` → `app.handleFile(file)` 経由でワークフローをキャンバスにロード（UI/API形式どちらも対応）
- WタブのAPI形式アイテムのグレーアウト（`wfm-nlp-item--disabled` クラス・`draggable=false`・title属性）を削除 → 全フォーマットでDnD・ダブルクリック対応

**修正（`static/js/workflow-tab.js`）**
- `sendToCanvas()`: `window.opener.wfmReceiveWorkflow` が存在する場合は直接呼び出す（UI/API形式両対応）。存在しない場合（ブックマーク等から直接開いた場合）はlocalStorageフォールバック（UI形式のみ、API形式はエラートーストで案内）
- サイドパネル・詳細モーダルのSend to CanvasボタンのAPI形式 `disabled` 属性を削除

**修正（`static/js/gallery-tab.js`）**
- `_updateCopyCanvasBtn()`: API形式による `disabled` 制限を削除（workflow存在チェックのみ）
- Copy & Send Canvasクリックハンドラ: `window.opener.wfmReceiveWorkflow` 優先に変更（フォールバックはlocalStorage + タイトルドラッグ）

**修正（`static/js/i18n.js`）**
- `apiFormatCanvasNoOpener` キーを追加（EN/JA/ZH）: window.openerなしでAPI形式を送ろうとした場合のエラーガイドメッセージ
- `helpGallery8` / `helpSidepanel17` を新しい動作（直接送信・フォールバック説明）に合わせて更新（3言語）

---

## 2026-06-20: API形式ワークフローのキャンバス読み込み修正・画像メタデータ埋め込み修正

### API形式ワークフローをキャンバスへドラッグすると空になる問題を修正

**症状**: Workflowタブ「Send to Canvas」やLibraryからのDnDで、API形式（`_api.json`）のワークフローをComfyUIキャンバスへドロップすると空のグラフになる。ファイルエクスプローラーからのドロップは正常。

**原因**: `app.loadGraphData()` はUIフォーマット（`{nodes:[...], links:[...]}`）を期待するが、API形式（`{nodeId: {class_type, inputs}}`）が渡されていた。

**修正（`web/comfyui/node_sets_menu.js`）**
- `isApiWorkflowFormat(data)`: API形式かUI形式かを判定するヘルパーを追加
- `convertApiToUiWorkflow(api)`: API形式→UI形式に変換するヘルパーを追加（ノードはグリッド自動配置、リンクタイプは `"*"`、`last_node_id`/`last_link_id` を正しく設定）
- `loadWorkflowOnCanvas`: `fetchWorkflowRaw` 後にAPI形式を検出・変換してから `app.loadGraphData()` を呼ぶよう修正
- `pendingRaw` ドロップハンドラ: Send to Canvas経由のタイトルDnD時にも同様の変換を挿入

**修正（`static/js/workflow-tab.js`）**
- `sendToCanvas()`: `comfyWorkflow.detectFormat` でフォーマット判定し、API形式なら `comfyWorkflow.convertApiToUi()` でUI形式に変換してからlocalStorageに保存

**修正（`static/js/gallery-tab.js`）**
- `comfyWorkflow` を `comfyui-workflow.js` からimport追加
- 「Copy & Send Canvas」ハンドラ: クリップボードにはオリジナルJSON（API形式のまま）をコピーしつつ、localStorage保存前にAPI→UI変換を適用

---

### 生成UIタブから生成した画像にワークフローメタデータが含まれない問題を修正

**症状**: 生成UIタブ（およびFeederタブ）から実行した画像生成で、SaveImageノードが保存するPNGに `workflow` テキストチャンクが埋め込まれず、GalleryタブでのWorkflow表示や他ツールでのメタデータ読み込みができない。

**原因**: `comfyui-client.js` の `queuePrompt()` が ComfyUI の `/prompt` エンドポイントに `extra_data` を渡していなかった。ComfyUIのSaveImageノードは `extra_data.extra_pnginfo.workflow` を受け取ってPNGの `workflow` テキストチャンクに埋め込むが、これが未設定のため埋め込みが行われなかった。

**修正（`static/js/comfyui-client.js`）**
- `queuePrompt(workflow, extraData = null)`: `extraData` 引数を追加。存在する場合に `body.extra_data` として `/prompt` リクエストに含める
- `generate()`: `queuePrompt` 呼び出し時に `{ extra_pnginfo: { workflow } }` を渡し、SaveImageノードがワークフロー（API形式）をPNGメタデータとして埋め込むよう修正

---

## 2026-06-20: セキュリティ修正（XSS・パスバリデーション）

### 修正内容

**XSS — タグ名がエスケープなしで `innerHTML` に挿入される（`static/js/gallery-tab.js`）**
- `createTable` (L425): `tdTags.innerHTML` のタグ名を `escapeHtml` でエスケープ
- `renderTagsDisplay` (L605): タグ名と `data-tag` 属性を `escapeHtml` でエスケープ
- 悪意あるタグ名（例: `<img onerror=...>`）を保存→表示したときに JS が実行される問題

**XSS — ファイル名がエスケープなしで `innerHTML` に挿入される（`static/js/gallery-tab.js`）**
- `loadImageDetail` (L566): `alt="${img.filename}"` を `escapeHtml` でエスケープ
- `openLightbox` (L1175-1176): `alt` 属性とライトボックスフッターの両方をエスケープ

**XSS — エラーメッセージが `innerHTML` に未エスケープ（`static/js/gallery-tab.js`）**
- フォルダツリーエラー (L139, L155) と 画像グリッドエラー (L263) を `escapeHtml` でエスケープ
- サーバーエラーメッセージにパス名等の特殊文字が含まれる場合の対策

**メタデータ書き込みエンドポイントにパスバリデーション追加（`py/services/gallery_service.py`）**
- `save_image_meta`, `toggle_favorite`, `add_to_group`, `remove_from_group` に `_check_path_allowed()` を追加
- delete/move など他の書き込みエンドポイントには既にあったが、これら4メソッドのみ漏れていた
- 修正により `gallery_metadata.json` に許可ルート外のパス文字列が書き込まれるのを防止

**`list_folder_tree` が `_allowed_root` を任意パスで上書きできる問題（`py/routes/gallery_routes.py`）**
- `gallery_routes.py` のモジュールロード時に `_init_allowed_root()` を呼び出し、保存済み `gallery_output_dir`（なければ ComfyUI デフォルト output ディレクトリ）で `_allowed_root` を初期化
- `_allowed_root` が起動直後に設定済みになるため、`list_folder_tree` の `if self._allowed_root is None` ブランチが発火せず、任意パスによる上書き不可
- 副次効果として、Gallery タブを一度も開かない状態でも `serve_image` が正常動作（→ Feeder Gallery モードでの 404 バグ修正に直結）

**`escapeHtml` にシングルクォートのエスケープを追加（`static/js/util.js`）**
- `'` → `&#x27;` を追加
- 現在の使用箇所はすべて二重引用符属性のため即時影響はないが、将来の誤用を防止

---

## 2026-06-20: WFS_GalleryFeeder — ComfyUI キャンバス上コントロール追加

### 新規ファイル（`web/comfyui/gallery_feeder_extension.js`）
`app.registerExtension` を使い、ComfyUI キャンバス上の `WFS_GalleryFeeder` ノードに直接コントロールを追加。

- **After Gen** コンボ（`loop` / `increment` / `fixed`）: `serialize: false` で prompt には含まれない
- **▶ Run ボタン**: グループ画像を取得 → `index` ウィジェットを更新 → `app.queuePrompt` → 完了待ち → 繰り返し
- **■ Stop ボタン**: `app.api.interrupt()` で現在の生成を中断し、ループフラグをクリア
- `waitForExecution()`: `executing` (null)・`execution_interrupted`・`execution_error` の3イベントを購読して1プロンプトの完了を Promise で待つ
- `onRemoved` フックでノード削除時にループを自動停止・状態をクリーンアップ

---

## 2026-06-20: __Feeder__ グループ保護 + サムネイル F ボタン + seed バグ修正

### `__Feeder__` グループの予約済み保護

**サーバーサイド（`py/routes/gallery_routes.py`）**
- `_RESERVED_GROUPS = {"__Feeder__"}` 定数を追加
- `rename_group` / `delete_group` エンドポイントで予約グループへの操作を 403 で拒否

**クライアントサイド（`static/js/gallery-tab.js`）**
- グループ管理ドロップダウンで `__Feeder__` を選択したとき、リネーム・削除ボタンを `disabled` に
- セレクトオプションに 🔒 プレフィックスを追加して視覚的に区別
- `change` イベントリスナーで動的に切り替え

### ギャラリーサムネイル「F」オーバーレイボタン（`static/js/gallery-tab.js`, `static/css/gallery-tab.css`）
- モデルタブの「B」バッチ登録ボタンと同様の位置（カード左上）に「F」ボタンを追加
- `inFeeder` 初期状態は `img.groups` 配列から判定（`list_images()` が返す `groups` フィールドを使用）
- クリックで `__Feeder__` グループへの追加 / 除外をトグル（APIコール + in-memory キャッシュ更新）
- アクティブ時はシアン色 (`#38bdf8`)、ホバー時のみ表示（active 時は常時表示）

**i18n（`static/js/i18n.js`）**
- 英/日/中に `addedToFeeder` / `removedFromFeeder` キーを追加

### seed バリデーションエラー修正（`py/nodes/gallery_feeder_node.py`）
**症状**: Feeder run 実行時に "Prompt outputs failed validation" エラーが発生

**原因**: `comfyui-client.js` の `applySeedToWorkflow()` がグラフ内の全ノードの seed を `Number.MAX_SAFE_INTEGER`（約 9×10¹⁵）以下のランダム値に上書きする。`WFS_GalleryFeeder` が宣言していた `max: 0x7FFFFFFF`（約 2.1×10⁹）を大幅に超えるため、ComfyUI の `validate_prompt()` が `value_bigger_than_max` でリジェクト。

**修正**: seed の `max` を `0x7FFFFFFF` → `0xffffffffffffffff`（KSampler と同値）に変更。

---

## 2026-06-20: Gallery Feeder 機能追加（WFS_GalleryFeeder ノード）

### 概要
Feeder タブにギャラリー連携モードを追加。外部プラグイン（comfyui-image-feeder）に依存せず、本プラグイン単独でギャラリーグループの画像を連続生成ループに利用できるようになった。

### 新規ノード（`py/nodes/gallery_feeder_node.py`）
- **`WFS_GalleryFeeder`**（Workflow Studio カテゴリ）
  - 入力: `group_name` (STRING), `index` (INT), `sort_mode` (COMBO: filename_asc/filename_desc/random), `seed` (INT)
  - 出力: `IMAGE`
  - `gallery_metadata.json` を直接読み込み、指定グループの画像を `index % len(images)` で1枚出力
  - ファイルの存在チェックつき（削除済み画像はスキップ）
  - `IS_CHANGED` で毎回実行（インデックスが変わるためキャッシュ無効化）
  - データファイルの場所は `Path(__file__)` ベースで自動解決（ComfyUI のパス構成に依存しない）

### ノード登録（`__init__.py`）
- `WFS_GalleryFeeder` を `_NODE_MODULES` に追加（`"Gallery Feeder (WFS)"` として表示）
- あわせて既存の `WFS_PromptText` のディスプレイ名がハードコードされていたバグを修正（`_NODE_MODULES` にディスプレイ名を持たせる構造に変更）

### Feeder グループ管理（`py/services/gallery_metadata.py`, `py/services/gallery_service.py`）
- `clear_group(group_name)`: グループ内の全画像を除外（グループ自体は残す）
- `ensure_group(name)`: グループが存在しない場合のみ作成

### API エンドポイント（`py/routes/gallery_routes.py`）
- `POST /wfm/gallery/groups/{name}/clear` — グループの全画像を除外（FC ボタン用）
- `POST /wfm/gallery/groups/ensure` — グループが存在しない場合のみ作成（Feeder タブ初期化時に `__Feeder__` を自動作成）

### ギャラリータブ FC ボタン（`static/js/gallery-tab.js`, `templates/index.html`）
- `FEEDER_GROUP = "__Feeder__"` 定数を export
- `ensureFeederGroup()` を export（Feeder タブ初期化時に呼び出す）
- `clearFeederGroup()`: `/wfm/gallery/groups/__Feeder__/clear` を呼び出してグループをクリア
- ギャラリーツールバーのグループフィルタ横に **[FC]** ボタンを追加（BC/SC ボタンと同様の位置）
- API 定数に `groupEnsure`, `groupClear`, `groupImages` を追加

### Feeder タブ Gallery モード（`static/js/feeder-tab.js`, `templates/index.html`）
- 左ペイン上部に **[Image Loop] / [Gallery]** のモード切り替えボタンを追加（`localStorage` に保存）
- **Image Loop モード**（既存機能）: 変更なし
- **Gallery モード**（新機能）:
  - 左ペイン: `WFS_GalleryFeeder` ノード選択・Apply・グループ選択・Sort Mode / Index / Seed・After gen (Loop/Increment/Fixed)・Run/Stop
  - 中央ペイン: 選択グループの画像グリッド（`/wfm/gallery/image/serve` でサムネイル表示）。クリックで Index を更新
  - 右ペイン: プレビュー（既存と共通）
  - Run ループ: JS 側でインデックスを管理（WebSocket sync 不要）。Increment モードで末尾到達時に自動停止
  - タブ初期化時に `ensureFeederGroup()` を呼び出して `__Feeder__` グループを自動作成

### i18n（`static/js/i18n.js`）
- 英・日・中に3キー追加: `feederGalNoNode`, `feederGalEmptyGroup`, `feederGroupCleared`

---

## 2026-06-19: Generate UI — ImpactWildcardEncode/Processor プロンプト検出バグ修正（v0.3.41）

### 修正内容（`static/js/comfyui-workflow.js`）

**症状**：comfy-impact-pack の `ImpactWildcardEncode` / `ImpactWildcardProcessor` ノードを含むワークフローを Generate UI に読み込んだとき、Prompt タブにプロンプトが表示されない（ID は正しく表示されていた）。

**原因1: CLIPTextEncodeEditPlus 経由の BFS ロール伝播漏れ**
- これらのワークフローでは ImpactWildcard ノードの出力が `CLIPTextEncodeEditPlus` の `text2` 入力に接続され、CLIPTextEncodeEditPlus が KSampler の positive に繋がる構成。
- BFS 伝播で `CLIPTextEncodeEditPlus` の STRING 入力（text1, text2）に positive/negative ロールを伝播するコードが未実装だったため、上流の ImpactWildcard ノードのロールが `unknown` のままになっていた。
- **修正**: BFS ループに `CLIPTextEncodeEditPlus` の `text1` / `text2` への伝播を追加。

**原因2: CLIPTextEncodeEditPlus が空の text_edit で prompt_nodes の先頭に入り込む**
- CLIPTextEncodeEditPlus 自体も positive ロールとして検出され、`text_edit = ""` でノードIDが小さいため `positiveNodes[0]` になっていた。
- これによりテキストエリアに空文字が表示され、ImpactWildcard ノードのプロンプトが埋もれていた。
- **修正**: `text_edit` が空文字列の場合は `prompt_nodes` に追加しないよう条件を追加（`textVal !== ""`）。空の text_edit は「上流ノードからプロンプトが来る場合のデフォルト状態」であり、UI で表示する必要がない。

**原因3: object_info マッピングの不確実性**
- `convertUiToApi()` で impact-pack バージョンによる `object_info` のウィジェット順序差異が発生した場合、`wildcard_text` が正しくマッピングされない可能性があった。
- **修正1**: ポストプロセスで `widgets[0]` を常に `wildcard_text` として上書き（`!("wildcard_text" in inputs)` ガードを除去）。
- **修正2**: `_getWidgetMapping()` フォールバックに `ImpactWildcardProcessor: ["wildcard_text"]`、`ImpactWildcardEncode: ["wildcard_text"]` を追加（ComfyUI オフライン時の対応）。

---

## 2026-06-19: AI TOOL タブ Chat ペイン・ワイルドカード生成追加（v0.3.40）

### Chat ペイン（`templates/index.html`, `static/css/main.css`, `static/js/ai-tab.js`, `web/comfyui/node_sets_menu.js`）
- AI TOOL タブを 3ペイン → **4ペイン**（Translation | Chat | TOOLS | Settings）に変更
- Chat ペイン: LLM とのマルチターン会話；会話履歴を毎回送信；Enter で送信、Shift+Enter で改行；Clear ボタンで履歴リセット
- Ollama: `/api/chat` エンドポイント（`messages` 配列）、LM Studio: `/v1/chat/completions`（同形式）
- 送信失敗時は入力テキストを復元してリトライ可能
- サイドパネル Aタブにも Chat サブタブを追加（Translation → **Chat** → TOOLS → Settings の4タブ構成）
- CSS: `.wfm-ai-chat-*` / `.wfm-nlp-ai-chat-*` でユーザーバブル（右）・アシスタントバブル（左）スタイル追加

### ワイルドカード生成（`templates/index.html`, `static/css/main.css`, `static/js/ai-tab.js`, `web/comfyui/node_sets_menu.js`）
- TOOLS ペインのドロップダウンに「Create wildcards」オプションを追加
- タスク切替で UI を動的切り替え：VLM選択時→ドロップゾーン表示、Wildcard選択時→Name・Count入力フォームを表示
- プロンプト: `Generate ${count} wildcard entries for the category "${name}". Output only plain text in English, one entry per line, no numbers, no markdown, no asterisks, no bold, nothing else.`
- 後処理: `**` / 行頭 `*` / 行頭数字（`\d+\.\s*`）を除去してプレーンテキストを保証
- SPA（`static/js/ai-tab.js`）とサイドパネル（`web/comfyui/node_sets_menu.js`）両方に実装

### ヘルプ・i18n（`static/js/i18n.js`, `static/js/app.js`, `templates/index.html`）
- AI TOOL タブヘルプを5項目→6項目に再構成（ai-3: Chat、ai-4: VLM、ai-5: Wildcards、ai-6: 設定）
- `helpSidepanel16` を EN/JA/ZH 更新（Chat・ワイルドカード機能を追記）
- `helpAi1`〜`helpAi6` を EN/JA/ZH 全更新
- 新 i18n キー追加（3言語）: `aiStatusChatting`, `aiToastChatFailed`, `aiToastWcNoName`

---

## 2026-06-18: Send to Canvas機能追加（ワークフロータブ・ギャラリータブ→LibraryタイトルDnD）

### ワークフロータブ — Send to Canvas（`static/js/workflow-tab.js`, `static/js/app.js`, `templates/index.html`）
- ツールバーおよび詳細モーダルの **Open in ComfyUI** ボタンを **Send to Canvas** に変更
- `sendToCanvas(workflowData)`: ワークフローJSONを `localStorage["wfm_pending_workflow"]` に保存してトースト表示（新しいブラウザタブを開かない）
- `openInComfyUI()` 関数は後方互換のため残置

### ギャラリータブ — Copy & Send Canvas（`static/js/gallery-tab.js`, `templates/index.html`）
- **Copy Workflow** ボタンを **Copy & Send Canvas** にリネーム
- クリック時にクリップボードコピーと `localStorage["wfm_pending_workflow"]` への保存を同時実行

### Workflow Studio Library — タイトルドラッグ（`web/comfyui/node_sets_menu.js`）
- `createPanel()` 内でタイトル要素（`.wfm-nlp-title`）にドラッグロジックを追加
  - `updateTitlePendingState()`: `localStorage` の `wfm_pending_workflow` 有無を検出して `draggable` 属性・CSS クラス・`title` 属性を動的切り替え
  - `panel.mouseenter` / `window.storage` イベントで状態を自動更新（メインアプリ→ComfyUI切り替え後も検出）
  - `dragstart`: pending JSON を `application/x-wfm-pending` MIME タイプにセット
- `installCanvasDropHandler()`: `application/x-wfm-pending` を dragover と drop の両ハンドラに追加
  - drop 時に `JSON.parse` → `app.loadGraphData()` → localStorage削除 → タイトルリセット
- CSS: `.wfm-nlp-title-pending { color: #66aaff; cursor: grab }` + `::after` で緑●インジケーター表示

### i18n・ヘルプ（`static/js/i18n.js`, `static/js/app.js`, `templates/index.html`）
- `sendToCanvas` / `copyAndSendCanvas` / `workflowSentToCanvas` を EN/JA/ZH に追加
- ヘルプ: `helpWf6`（send to canvas）・`helpGallery8`（Copy & Send Canvas説明）を3言語更新
- ヘルプ: `helpSidepanel17` 新規追加（タイトルドラッグ機能説明）を3言語で追加、app.jsマッピング・index.html li要素も追加

---

## 2026-06-15: TaggerシングルGenUI:Pボタン追加＋生成UIのZITワークフロープロンプト解析修正

### TaggerシングルGenUI:Pボタン（`templates/index.html`, `static/js/tagger-tab.js`, `static/js/i18n.js`）
- Single タブの結果アクション行に **GenUI:P** ボタンを追加（「プロンプトに送信」の左隣）
- クリックすると生成UIタブの `#wfm-prompt-pos-text`（ポジティブプロンプトtextarea）末尾にタグを追記し、`#wfm-prompt-pos-apply` を自動クリックしてワークフローへ即時反映
- 生成UIにワークフローが読み込まれていない場合は警告トーストを表示
- i18n: `taggerSendToGenUI` / `taggerSentToGenUI` / `taggerNoGenUI` を EN/JA/ZH に追加
- ヘルプ: `helpTagger6` を5項目に更新（GenUI:P を先頭に追加）

### 生成UIのZIT/Lumina2ワークフロープロンプト解析修正（`static/js/comfyui-workflow.js`, `py/services/workflow_analyzer.py`）
- `comfyui-workflow.js` の `COND_PASSTHROUGH` から `"ConditioningZeroOut"` を除外
  - ZITワークフローでは KSampler.negative → ConditioningZeroOut → CLIPTextEncode という接続を持つが、ConditioningZeroOut は上流テキストを完全に破棄するため negative ロールを上流に伝播すべきでない
  - 修正前: CLIPTextEncode が positive / negative 両ロール付与 → `getRole()` が "unknown" → Generate UI のプロンプト欄に表示されない
  - 修正後: CLIPTextEncode は positive ロールのみ → 正常にポジティブプロンプトとして表示
- `workflow_analyzer.py` の `_CLIP_TYPE_TO_MODEL` に `"lumina2": "Z-IMAGE"` を追加
  - CLIPLoader の `type` フィールドが `"lumina2"` のワークフローを Z-IMAGE として正確に分類

---

## 2026-06-15: Taggerバッチ.txt出力追加＋Galleryタグ保存バグ修正

### Taggerバッチ.txt出力（`templates/index.html`, `static/js/tagger-tab.js`, `static/js/i18n.js`, `py/routes/tagger_routes.py`, `py/services/tagger_service.py`）
- バッチ出力オプションに **Write .txt** チェックボックスを追加
- 有効にすると処理した各画像と同一フォルダに `<ファイル名>.txt`（UTF-8）を生成、Interrogator + VLM タグのカンマ区切り文字列を書き込む
- `batch_start()` シグネチャに `write_txt: bool` パラメータを追加、ルート・フロントエンドも連動更新
- i18n: `taggerBatchWriteTxt` キーを EN/JA/ZH に追加

### Galleryタグ保存バグ修正（`static/js/tagger-tab.js`）
- `_saveToGallery()` がタグをカンマ区切り文字列のまま POST していたため、Gallery が `img.tags.forEach is not a function` エラーで更新不能になっていた
- 修正: 送信前に `tags.split(",").map(s => s.trim()).filter(Boolean)` で配列に変換

---

## 2026-06-15: Taggerタブ新規実装＋ギャラリー詳細パネルUI改善＋パストラバーサル修正

### Taggerタブ新規実装

#### バックエンド（`py/config.py`, `py/services/tagger_service.py`, `py/services/tagger_db_service.py`, `py/routes/tagger_routes.py`, `py/wfm.py`）
- `py/config.py`: `TAGGER_DB_FILE` / `TAGGER_SETTINGS_FILE` / `TAGGER_MODELS_DIR`（`ComfyUI/models/tagger/`）定数追加
- `TaggerService`: WD Tagger（ONNX）・SwinV2・DeepDanbooru（.h5 / TensorFlow optional）推論、Ollama VLM連携（`/api/chat`）、JPEGへのpiexif EXIF書込・PNGへのPngInfo書込・サイドカー.tags.json書込、スレッドベースバッチ処理（`batch_start` / `batch_stop` / `batch_status`）、設定の永続化
- `TaggerDbService`: SQLite（`tagger.db`）によるタグ保存・一覧・検索・更新・削除・CSV出力
- `tagger_routes.py`: `/wfm/tagger/` 配下に17エンドポイントを登録（models・predict・ollama/models・ollama/predict・batch/start/status/stop・db CRUD・write_meta・settings）、全CPU処理を `asyncio.to_thread()` でラップ
- `py/wfm.py`: `tagger_routes.setup_routes(app)` を追加
- `requirements.txt` 新規作成: `onnxruntime>=1.16`・`piexif>=1.1.3` を必須、TensorFlow をオプション（コメントアウト）として記載

#### フロントエンド（`templates/index.html`, `static/css/tagger-tab.css`, `static/js/tagger-tab.js`, `static/js/i18n.js`, `static/js/app.js`）
- `templates/index.html`: Taggerタブナビボタン追加、`<section id="wfm-tab-tagger">` を追加（Single / Batch / DBの3サブタブ構成）
- `static/css/tagger-tab.css` 新規作成: サブタブナビ・シングルレイアウト・プレビューエリア（破線ボーダー＋ドラッグオーバーハイライト）・バッチ進行状況バー・DBテーブルのスタイル
- `static/js/tagger-tab.js` 新規作成:
  - `initTaggerTab()`: i18n適用・サブタブ切り替え・スライダー連動・Ollamaトグル・各種イベント登録・モデル一覧ロード・設定読み込み
  - `openImageInTaggerTab(img)`: Gallery→Taggerタブ遷移＋画像ロード（`/wfm/gallery/image/serve` 経由でbase64変換）
  - Single: ドラッグ＆ドロップ・ファイルアップロード・タグ生成（WD Tagger＋Ollama並行）・4出力先（Prompt送信・Gallery保存・ファイル書込・DB保存）
  - Batch: バッチ開始/停止・1秒間隔ポーリングによるリアルタイム進行状況更新
  - DB: 一覧表示・検索・行選択編集・保存・削除・CSV出力
- `static/js/i18n.js`: `tabTagger`・Taggerタブ関連キー約50件を EN/JA/ZH 3言語で追加
- `static/js/app.js`: `tabMap` に `tagger` 追加、`initTaggerTab()` インポート＆呼び出し追加

### ギャラリー詳細パネルUI改善（`templates/index.html`, `static/css/gallery-tab.css`, `static/js/gallery-tab.js`, `static/js/app.js`）
- タブ行（Info / JSON / Groups）とアクションボタン行（Metadata / Load GenUI / Tagger）を分離: タブは `wfm-side-tab-nav`、ボタンは新設の `wfm-gallery-detail-action-row` へ移動
- `.wfm-gallery-detail-action-row` のCSSを `gallery-tab.css` に追加（`flex`・`flex-wrap`・`padding`）
- Galleryの詳細パネルに **Tagger** ボタン（`wfm-gallery-open-tagger-btn`、紫）追加: クリックで選択画像を `openImageInTaggerTab()` へ渡してTaggerタブへ遷移・画像ロード
- `.wfm-gallery-action-btn-tagger` スタイル（`gallery-tab.css`）追加
- `app.js` の `applyI18nToHtml()` でTaggerボタンのテキストを `t("tabTagger")` に設定

### セキュリティ修正: パストラバーサル対策（`py/services/tagger_service.py`, `py/services/gallery_service.py`）
- `TaggerService._validate_model_name()`: モデル名に `/` `\` `..` `\x00` が含まれる場合はロード拒否（`mdir / model_name` のパストラバーサルを防止）
- `TaggerService.write_meta_to_file()`: ユーザー指定パスを `resolve()` した上で許可拡張子（`.jpg/.jpeg/.png/.webp/.bmp/.gif`）のみ処理、それ以外はエラー返却
- `GalleryService._check_path_allowed()`: `_allowed_root is None` のときに tautology（`resolved == path.resolve()`、常にTrue）だった判定を `return False` に修正（`list_folder_tree` 呼び出し前に全パスが通る問題を解消）

### ヘルプ更新（`templates/index.html`, `static/js/i18n.js`, `static/js/app.js`）
- ヘルプナビに「Tagger Tab」追加
- Taggerタブのヘルプページ新設（9項目: モデル配置・Single操作・閾値・Ollama・出力先・Batch・DB・インストール手順）EN/JA/ZH
- Galleryタブヘルプに `helpGallery14`（Taggerボタン説明）を EN/JA/ZH で追加
- トラブルシューティングに `helpTrouble7`（Taggerモデル未表示時の対処）を EN/JA/ZH で追加

---

## 2026-06-15: 全選択ボタン追加＋ギャラリーバルクバーi18n対応

### 変更内容

#### Modelsタブ: 複数選択バーに「全選択」ボタン追加（`static/js/models-tab.js`, `static/js/i18n.js`）
- `selectAll()` 関数を追加: `filterModels()` の結果（フィルター・検索適用後の表示中モデル）を `state.selectedModels` に一括追加して `renderModelGrid()` / `renderBulkActionBar()` を呼び出す
- `renderBulkActionBar()` のバーHTMLに `wfm-bulk-select-all-btn` を Deselect All ボタンの右隣に追加
- イベントリスナーを追加（`"wfm-bulk-select-all-btn"` → `selectAll`）
- i18n: `modelBulkSelectAll` を英語 "Select All" / 日本語 "全選択" / 中国語 "全选" で追加

#### Galleryタブ: 複数選択バーに「全選択」ボタン追加＋全ボタンi18n対応（`templates/index.html`, `static/js/gallery-tab.js`, `static/js/app.js`, `static/js/i18n.js`）
- `wfm-gallery-bulk-select-all` ボタンを Deselect All ボタンの右隣に追加（`templates/index.html`）
- クリックリスナー: `state.images` の全パスを `state.selectedImages` に追加し `renderImages()` / `updateBulkBar()` を呼び出す
- バルクバーの全ボタン・セレクトのテキストを空にして `applyI18nToHtml()` 経由で `t()` 設定に変更（ハードコード英語文字列を排除）
- `updateBulkBar()` の選択件数表示を `t("galleryBulkSelected")` でi18n化（`"${count} selected"` → `"${count} ${t(...)}"` ）
- グループセレクトの初期オプションを `t("galleryBulkAddToGroup")` でi18n化
- `app.js` の `applyI18nToHtml()` にギャラリーバルクバー全要素のi18n設定処理を追加
- i18n: 英語 / 日本語 / 中国語の3言語でギャラリーバルクバー用キー10個を新規追加: `galleryBulkSelected` / `galleryBulkDeselectAll` / `galleryBulkSelectAll` / `galleryBulkAddToGroup` / `galleryBulkAdd` / `galleryBulkFavAll` / `galleryBulkUnfavAll` / `galleryBulkMoveTo` / `galleryBulkDelete`

---

## 2026-06-10: v0.3.36 — コードレビュー修正＋リファクタリング＋README刷新

### コードレビュー修正（v0.3.35の不具合10件）

#### ヘルプi18n配線の修正（`static/js/i18n.js`, `static/js/app.js`, `templates/index.html`）
- **バグ**: `applyI18nToHtml()` が起動時に全言語でヘルプ文を上書きするため、v0.3.35でindex.htmlに追記したヘルプ更新（Saveボタン・ソート・JSONタブ改名）が一切表示されなかった
- `helpGen2` / `helpModels2` / `helpGallery8` / `helpGallery10` を3言語ともindex.htmlの新文言に同期
- `helpGallery12` / `helpGallery13` キーを3言語で新規追加（Metadata / Load GenUI ボタン説明）
- `helpIdMap` に `wfm-help-models-12` / `wfm-help-trouble-6` / `wfm-help-gallery-12` / `wfm-help-gallery-13` を登録
- index.html の「Thumbnail, Card, and Table」誤記を修正（カードビューはv0.3.22で廃止済み）

#### GenerateUI Save の安全化（`static/js/generate-tab.js`）
- **上書き確認**: 保存前に `GET /api/wfm/workflows` で既存ファイルを照会し、同名があれば confirm 表示。保存先が **UI形式**（`analysis.format === "ui"`）の場合はAPI形式上書きでノード配置が失われる旨の専用警告
- **Raw JSON同期**: Raw JSONテキストエリアに未Applyの編集があればパースして保存対象に反映し、保存後エディタへ同期。不正JSONはエラーで中断（従来は古い内容を黙って保存していた）
- **HTML注入防止**: ファイル名を `value="${...}"` 属性埋め込みからDOM経由の `input.value` 設定に変更
- **デフォルト名**: 拡張子除去を `.json` のみ→画像拡張子（.png/.jpg/.jpeg/.webp/.gif）にも拡大
- **二重送信ガード**: `saving` フラグでEnter連打・多重POSTを防止

#### その他
- `sortModels` を decorate-sort-undecorate 方式に変更（`sortKeyOf()` で1モデル1回だけキー計算。比較ごとの `parseModelPath` 再計算を解消）（`static/js/models-tab.js`）
- ギャラリーの Metadata / Load GenUI ボタンを `.wfm-gallery-detail-tab-btn` から専用の `.wfm-gallery-action-btn` に分離し、CSSの `!important` 16箇所を全廃（`templates/index.html`, `static/css/gallery-tab.css`）
- Save関連・ギャラリーの新規文字列をi18n化（`saveWorkflowTitle` / `savedAs` / `overwriteConfirm` / `gallerySelectImageFirst` 等を3言語追加）

### リファクタリング

#### util.js 新設（`static/js/util.js` 新規）
- `escapeHtml()`: 5ファイル（gallery / metadata / models / nodes / workflow）の重複定義を統一。metadata-tab版は `"` エスケープが抜けており属性値でHTML注入の恐れがあった（修正済み）
- `readJsonStorage(key, fallback)` / `getSettings()`: `JSON.parse(localStorage.getItem(...))` の直書き15箇所（8ファイル）を置換。try/catchの重複も削減

#### トーストi18n化（全タブJS, `static/js/i18n.js`）
- ハードコード英語トースト約115箇所をすべて `t()` 化（残り0件）
- 共通キー約60個を3言語（EN/JA/ZH）で追加: `errorWithMsg` / `groupCreated` / `presetSavedName` / `batchNoneSelected` / `generationComplete` など
- 既存キーとの衝突回避: 文字列型の既存 `importError` / `presetSaved` と重複したため、新関数型キーは `importErrorMsg` / `presetSavedName` に命名
- 既存バグ修正: Settings画面の `textSizeLabel` / `jsonColor*` 系11キーが未定義で生キー名が表示されていた（v0.3.14由来。`t() || "fallback"` はt()がキー名を返すため機能しない）→ 3言語で定義追加
- ZHブロックに欠落していた `copyPositivePrompt` / `copyNegativePrompt` / `copiedToClipboard` / `noTextToCopy` を追加
- 検証: 全 `t()` 呼び出しキーの定義確認・3言語のキー完全一致・重複キーなし・全JS構文チェック通過

### README刷新（`README.md`, `pyproject.toml`, `docs/`）
- 冒頭説明文を3本柱構成に書き換え: 📁 Management（ワークフロー/モデル/画像/プロンプト管理、AIプロンプト支援・翻訳・タグ生成、ファイルドロップ＆ギャラリー連携メタデータ）/ ⚡ GenerateUI（全タブ連携、モデル・サンプラー等バッチ生成、Image Feeder）/ 📚 Workflow Studio Library（キャンバスドロップ、画像/JSONメタデータ表示＆ドロップ、AIツール）
- スクリーンショット差し替え・追加: `6_ws_library.png` 差し替え、`9_GenUI_LoraStack.png`（GenUI LoRA Stack）・`10_GenUI_Batch.png`（GenUI Batch）・`11_multiple_select_menu.png`（Models Multi-select Menu）を新規追加し、生成UI系3枚が連続するよう表を再配置
- `pyproject.toml` の `description` をREADME新説明文と整合する内容に更新

---

## 2026-06-10: v0.3.35 — テーブルソート・Load GenUI・ワークフロー保存

### 変更内容

#### Modelsタブ テーブルビュー: 列ヘッダークリックでソート（`static/js/models-tab.js`, `static/css/main.css`）
- `state` に `sortColumn`（null または列キー）と `sortDir`（`"asc"` / `"desc"`）を追加
- `sortModels(models)` 関数を追加：ソート列に応じて ★・ファイル名・サブディレクトリ・Type・Base Model・拡張子・Tags・Memo・E/D の各キーで昇降順ソートを実行
- `filterModels()` の末尾で `sortModels()` を呼び出し、フィルタ後の全ビューに適用
- `thSortHtml(label, col, extraClass, extraStyle)` ヘルパーを追加：アクティブ列はアクセントカラー（`--wfm-accent`）に変色し ▲/▼ 矢印を表示
- `renderTableView` のヘッダーをすべて `thSortHtml` ベースに変更。クリックで asc → desc → 解除のサイクル
- Enable/Disable 列の空ヘッダーを **E/D** に変更
- `.wfm-table-th-sortable` CSS を追加（`cursor: pointer`、`-webkit-user-select: none`、`white-space: nowrap`、ホバー時アクセントカラー）

#### ギャラリータブ: Load GenUI ボタン追加（`templates/index.html`, `static/js/gallery-tab.js`, `static/css/gallery-tab.css`）
- 詳細パネルのタブナビに **Load GenUI**（青）ボタン（`wfm-gallery-load-genui-btn`）を Metadata ボタンの右隣に追加
- `gallery-tab.js` に `loadWorkflowIntoEditor` を `generate-tab.js` からインポート
- クリック時の動作：画像未選択 → warning トースト / ワークフロー未埋め込み → warning トースト / 非対応フォーマット → `loadWorkflowIntoEditor` 内でトースト表示 / 成功時 → GenerateUI タブへ自動切り替え
- **Metadata** ボタンに `wfm-gallery-action-btn-green` クラスを追加し緑色背景に変更
- `gallery-tab.css` に `.wfm-gallery-action-btn-green`（緑）・`.wfm-gallery-action-btn-primary`（`--wfm-primary` 青）スタイルを追加：`padding`・`border-radius`・`align-self: center`・`margin` を共通指定

#### GenerateUIタブ: Save ボタン追加（`templates/index.html`, `static/js/generate-tab.js`）
- `wfm-gen-subtab-nav` の右端（`margin-left:auto`）に **Save** ボタン（`wfm-gen-save-btn`、`wfm-btn-primary`）を設置
- `generate-tab.js` のインポートに `openModal`・`closeModal` を追加
- `saveCurrentWorkflow()` 関数を追加：
  - ワークフロー未ロード時は warning トースト
  - モーダルでファイル名を入力（デフォルト: 現在のワークフロー名）。Enter キーでも確定可能
  - `comfyUI.currentWorkflow` を JSON シリアライズして `File` オブジェクトを生成、`POST /api/wfm/workflows/import` で Workflow タブに保存
  - 保存成功後 `wfm-gen-wf-name` の表示・`dataset.filename` を新ファイル名に更新
  - エラー時はトーストでメッセージ表示

#### ヘルプ更新（`templates/index.html`）
- GenerateUI Tab（`wfm-help-gen-2`）：Save ボタンの説明を追加
- Gallery Tab（`wfm-help-gallery-8/10`）：「Metadata tab」→「JSON tab」に表記修正；`wfm-help-gallery-12/13` として Metadata（緑）・Load GenUI（青）ボタンの説明を新規追加
- Models Tab（`wfm-help-models-2`）：テーブルヘッダークリックソートと E/D 列の説明を追記

---

## 2026-06-09: v0.3.34 — Modelsタブ テーブルビュー強化・バルク操作改善

### 変更内容

#### テーブルビュー: Type / Base Model 列追加（`static/js/models-tab.js`, `static/css/main.css`）
- `renderTableView` にて Subdirectory と Extension 列の間に **Type** / **Base Model** 列を追加
- データは `state.civitaiCache[sha256]` から取得（追加API呼び出しなし）
- `.wfm-table-th-civtype` / `.wfm-table-td-civtype`（70px）、`.wfm-table-th-basemodel` / `.wfm-table-td-basemodel`（110px）を追加
- `.wfm-table-th-filename` / `.wfm-table-td-filename` の `max-width` を 160px に制限し、overflow ellipsis 適用

#### モーダル: Delete ボタン追加（`static/js/models-tab.js`）
- 詳細モーダルにモデル削除ボタンを設置
- `POST /api/wfm/models/delete` を呼び出してモデルファイル本体および全サイドカーファイル（`.preview.png`、`.json`、`.civitai.info`、`.metadata.json`、`.cm-info.json` など）を削除
- 削除後にローカルステート（`modelsByType`、`modelMetadata`、`disabledModels`、`selectedModels`）を差分更新して `renderModelGrid()` を呼び出す

#### バルクアクションバー: ファイル移動機能追加（`static/js/models-tab.js`, `static/css/main.css`）
- `fetchSubdirs()` 関数追加：`GET /api/wfm/models/subdirs?type=` でルート直下のサブフォルダ一覧を取得し `state.subdirs` にキャッシュ
- `bulkMoveModels(destSubdir)` 関数追加：`POST /api/wfm/models/move` で選択モデルをサブフォルダへ移動（サイドカーファイルも同時移動）。ローカルステートのキー（`modelsByType`、`modelMetadata`、`disabledModels`）を移動後の相対パスに更新
- 移動後に `fetchSubdirs()` → `renderDirFilter()` → `renderModelGrid()` → `renderBulkActionBar()` を連続実行

#### バルクアクションバー: UI再構成（`static/js/models-tab.js`, `static/css/main.css`）
- バーを **ヘッダー行**（件数表示・Deselect All・Favorite 操作）＋**3行グリッド**（Group / Badge / File）に再構成
- **Group 行**：グループ選択ドロップダウン・Add / Remove ボタン・新規グループ名入力・Create & Add
- **Badge 行**：バッジ選択ドロップダウン・+Badge / −Badge ボタン
- **File 行**：移動先フォルダ選択ドロップダウン・Move ボタン・新規フォルダ名入力・Create & Move・Delete Files（行右端）
- Select ボタンを緑色（`.wfm-btn-success`）に変更（`templates/index.html`）
- X（Clear Selection）ボタンを削除。Deselect All のみを使用
- 各ドロップダウン幅を 110px → 330px に拡大

#### バックエンド: subdirs / move エンドポイント追加（`py/services/models_service.py`, `py/routes/models_routes.py`）
- `ModelsService.get_subdirs(model_type)` — ルート直下のディレクトリ名一覧を返す
- `ModelsService.move_models(model_type, model_names, dest_subdir)` — モデルと全サイドカーを `shutil.move` で移動。パストラバーサル防止（`..` チェック・セパレーター禁止・絶対パス禁止・`resolve().relative_to()` containment検証）・上書き防止を実装
- `GET /api/wfm/models/subdirs`、`POST /api/wfm/models/move` ルートを登録。`_VALID_MODEL_TYPES` frozenset でモデルタイプをホワイトリスト検証
- `_SIDECAR_EXTENSIONS` に `.metadata.json`、`.cm-info.json` を追加（delete / move 両操作に反映）

#### B/S ボタン: 行移動バグ修正（`static/js/models-tab.js`）
- `toggleBatch` / `toggleStack` から `renderModelGrid()` 呼び出しを削除
- テーブルビュー・カードビュー両方の B / S ボタンハンドラーを `async` に変更し、`await` 後にボタンの `active` クラスのみを差分更新（`classList.toggle`）
- `state.showBatchOnly` フィルター有効時（バッチから外すと行が消えるべき場合）のみ `renderModelGrid()` を呼び出す

#### ギャラリー → Metadata タブ連携（`static/js/gallery-tab.js`, `static/js/metadata-tab.js`）
- `metadata-tab.js` に `loadFileIntoMetadataTab(file)` をエクスポート：Metadata タブへ切り替えてファイルを読み込む外部 API
- `gallery-tab.js` に `openImageInMetadataTab(img)` を追加：画像を fetch してバイナリを Metadata タブに渡す
- ギャラリー画像カード（サムネイル・テーブル両ビュー）で **Alt+クリック** すると Metadata タブで開く
- 詳細パネルに **Metadata ボタン** を追加（`index.html` の `wfm-gallery-open-metadata-btn`）：選択中の画像を Metadata タブで開く
- 詳細タブ切り替えロジックを修正（`data-detail-tab` を持つボタンのみ active/display を切り替え、Metadata ボタンを除外）

#### ヘルプ更新（`templates/index.html`）
- Models Tab ヘルプ（`wfm-help-models-2`、`-6`、`-7`、`-11`）を今回の変更に合わせて更新

---

## 2026-06-09: v0.3.33 — LoRAペイン・ワークフロー解析バグ修正

### 変更内容

#### LoRAペイン：ワークフロー読み込み時のLoraManager上書き防止（`static/js/comfyui-editor.js`）
- `renderLoraPane` 末尾にあった「Auto-apply Stack to LoraManager on load」ブロックを削除
- ワークフロー読み込み時にModelタブのStackグループ内容が `inputs.loras` / `inputs.text` を上書きし、RAW JSONが変わるバグを修正
- Apply ボタン押下時のみStackがLoraManagerに書き込まれる正しい動作に

#### LoRAペイン：🔄ボタン押下でSingleタブに戻るバグ修正（`static/js/comfyui-editor.js`）
- `renderLoraPane` 呼び出し前に現在のアクティブタブを `_prevActiveTab` に保存
- `el.innerHTML` 再構築後にタブ状態（activeクラス・display）を復元する処理を追加
- 🔄ボタン・モデルタブ切り替えによる再レンダリング後もStackタブに留まるよう修正

#### ModelsタブCheckpointへのStackグループ非表示（`static/js/models-tab.js`）
- `loadModelsForCurrentType` のグループロード後、`STACK_MODEL_TYPES`（lora のみ）に含まれないタイプでは `state.modelGroups["Stack"]` をメモリ上から削除
- Checkpointなどのタイプでグループフィルターおよびサイドパネルのグループ管理にStackが表示されなくなった

#### CLIPTextEncodeEditPlus ウィジェット値マッピング修正（`static/js/comfyui-workflow.js`）
- `convertUiToApi` でUIスロット入力にリンクが接続されている場合（`linkedSlotNames`）、`widgets_values` のインデックスを進めないよう変更
- 従来は `object_info` の STRING 型オプション入力（`text1` 等）がウィジェット名リストに含まれ、リンクあり判定でインデックスがズレていた
- `widgets_values: ["girl", "+af", ""]` で `text_edit="girl"` / `mode="+af"` が正しくマッピングされるよう修正

#### Stack Apply時のTrigger Words処理修正（`static/js/comfyui-editor.js`）
- Applyクリックハンドラー内でトリガーワードをレンダリング時のスナップショット変数から取得していたため、チェックボックス変更が反映されないバグを修正
- `currentAllTriggers` / `currentActiveTriggers` を Apply 時点で `_stackActive` + `metadata` + `civitaiCache` から動的に再計算するよう変更
- 修正前の不具合：1回目ApplyはLORA SYNTAXのみ（TRIGGER WORDSなし）、2回目で追加される / モデル無効でApply後もTRIGGER WORDSが残る

---

## 2026-06-08: v0.3.32 — Lora Loader (LoraManager) LoRA検出対応・ライブラリ機能拡張

### 変更内容

#### Lora Loader (LoraManager) LoRA検出対応（`web/comfyui/node_sets_menu.js`, `static/js/metadata-tab.js`）
- `_extractLoRAs` / `extractLoRAs` の `add` 関数を `parseFloat` ベースに変更。LoraManager ノードは `strength` / `clipStrength` を文字列 (`"0.20"`) で保存するため `typeof === "number"` では `1.0` にフォールバックしていたバグを修正
- APIフォーマット（`class_type` ベース）の `else` 節に `Lora Loader (LoraManager)` を追加。`inputs.loras.__value__` からLoRAリストを取得（`Array.isArray(inputs.loras)` をフォールバックとして併用）
- Iタブ（ライブラリ）・Metadataタブの両方に同様の修正を適用

#### `placeLoraMgrNode` textウィジェット同期（`web/comfyui/node_sets_menu.js`）
- LoraManagerノード配置時に `loras` ウィジェット（配列）だけでなく `text` ウィジェット（LoRA構文）も明示的に更新するよう修正
- strength = clipStrength の場合 `<lora:name:s>`、異なる場合 `<lora:name:s:c>` の形式で構文を生成
- `l.strength` フォールバックを追加し、GroupsのloraList形式（`strength` キー直接）にも対応

#### Mタブ Groupsの LoRAグループ → LoraManagerドロップ対応（`web/comfyui/node_sets_menu.js`）
- `renderModelGroups` でLoRAタイプのグループリスト末尾に「All N LoRAs → Lora Loader (LoraManager)」アイテムを追加
- ドラッグで `application/x-wfm-lora-multi` データ送出 → キャンバスに Lora Loader (LoraManager) ノードを全LoRAセット済みで配置
- ダブルクリックでも即時配置（`placeLoraMgrNode`）
- モデルファイル名から stem（拡張子・パス除去）に変換して LoraManager 名前形式に合わせる

#### Pタブ Groupsサブタブ追加（`web/comfyui/node_sets_menu.js`）
- `state` に `promptSubTab2` と `promptGroups` を追加
- `loadPromptData` で `localStorage["wfm_prompt_preset_groups"]` からグループを読み込み、存在しないIDをクリーンアップ
- Pタブのrow2に「📁 Groups」サブタブを追加（Wタブ・Nタブと同様の2段構成）
- `renderPromptGroups` 関数を実装：グループ名セクション展開・検索フィルター対応・`createDraggablePromptItem` でドラッグ動作を継承
- Batchで作成したPromptグループが同じlocalStorageを参照するためそのままライブラリから利用可能

#### ヘルプ更新（`static/js/i18n.js`）
- `helpSidepanel11`（EN/JA/ZH）：PタブGroups追加・MタブLoRAグループ→LoraManagerドロップを追記
- `helpSidepanel13`（EN/JA/ZH）：Lora Loader (LoraManager) ノードタイプ対応を追記
- `helpSidepanel15`（EN/JA/ZH）：LoRA検出ノードタイプ一覧・APIフォーマット対応・LoRA構文自動入力を追記

---

## 2026-06-08: v0.3.31 — LoRAペイン Single/Stack タブ分割・GenUI Model LoRA対応強化

### 変更内容

#### LoRAペイン Single/Stack タブ分割（`static/js/comfyui-editor.js`, `static/css/main.css`）
- `renderLoraPane` を全面書き換え。Single / Stack の2タブ構成に変更
- **Single タブ**: フィルター・モデルドロップダウン・強度（M/C）・ターゲットノード選択・Apply・P・LORA SYNTAX表示・TRIGGER WORDS表示
  - モデル選択・強度変更時にLORA SYNTAX が自動更新
  - Apply: ワークフローノードへの適用 + LORA SYNTAX/TRIGGER WORDS を Positive プロンプトへ差分更新
  - P: Positive プロンプトをワークフローに反映
- **Stack タブ**: ターゲットノード選択・Apply・P・Toggle-all・グローバル強度調整（+/−）・LORA SYNTAX・TRIGGER WORDS・モデルリスト
  - 検索フィルターとモデルドロップダウンを削除（Stack専用UIに整理）
- `_refreshLoraSingleDynamic(metadata, civitaiCache)` 関数を追加（Single タブの動的更新）
- `comfyEditor.switchLoraSingleTab()` メソッドを追加（外部からSingleタブへ切り替え）
- `comfyEditor.disableAllStack()` メソッドを追加（外部からStack全無効化）

#### GenUI Model LoRA対応強化（`static/js/models-tab.js`）
- `Lora Loader (LoraManager)` ノード対応: `lora_name` 検索ではなく `currentAnalysis.lora_nodes` を参照し `is_lora_manager` で書き込み形式を分岐
- LoRA適用時: Singleタブへ切り替え・Stack全無効化・`wfm-lora-single-syntax`/`wfm-lora-single-triggers` を更新
- Positive promptへの直接書き込みを廃止（Apply/Pボタンで明示的に反映する設計に統一）

#### ヘルプ更新（`static/js/i18n.js`）
- `helpGen5`: LoRA に「(Single/Stack タブ)」の説明を追加（EN/JA/ZH）
- `helpModels8`: GenUI Model LoRA 動作の詳細を追記（EN/JA/ZH）

---

## 2026-06-08: v0.3.30 — LoRAスタック トリガーワードバグ修正・ヘルプ更新

### 変更内容

#### LoRAスタック TRIGGER WORDS 表示バグ修正（`static/js/comfyui-editor.js`）
- **問題**: スタックで1つのモデルを無効にしてもTRIGGER WORDSに無効モデルのトリガーワードが残っていた
- **原因1**: 初期表示の `triggerHtml` が `allTriggerWords`（全モデル分）を使っていた → `activeTriggerWords` に修正
- **原因2**: チェックボックス切り替え・toggle-all・強度調整時に呼ばれる `_refreshLoraPaneDynamic` がLORA SYNTAXのみ更新してTRIGGER WORDSを更新していなかった
- **修正**: `_refreshLoraPaneDynamic(stackModels, metadata, civitaiCache)` でTRIGGER WORDSも再計算・再描画するよう拡張（アクティブモデルのみ表示）

#### ヘルプ トラブルシューティング追加（`templates/index.html`, `static/js/i18n.js`, `static/js/app.js`）
- LoRAスタック実行時に「No such file or directory」エラーが出る場合のトラブルシューティングを追記
- 原因: comfyui-lora-managerが該当LoRAを認識していない（既知の問題）
- 対処: 別のLoRAで試す、またはLora Manager自体のUIでファイルが表示されるか確認

---

## 2026-06-08: v0.3.29 — LoRAセクション統合・ヘルプタブサイドバー・UI細部改善

### 変更内容

#### LoRAセクション統合（`static/js/comfyui-editor.js`, `static/css/main.css`）
- 単体LoRAセクションとStackセクションを1つの統合レイアウトに統合（重複を削除）
  - 表示順: Filter → Model select → ID行（ID select / Apply / P） → Strength行（Stack label / ☑ / M / C / Str M adjuster / C adjuster） → Lora syntax → Trigger words → Stack model一覧
- **Apply ボタン統合**: 単体・スタック共通の1ボタンに
  - スタックモデルあり → 全アクティブモデルをノードに適用 + プロンプト同期
  - スタックモデルなし → 選択中の単体LoRAをM/C強度でノードに適用 + プロンプト同期
- **単体モードのプロンプト同期対応**: スタックなし時も `<lora:stem:M:C>` syntax とCivitAIトリガーワードをPositiveプロンプトへ追記・差分更新
- **Ctrl+Apply → 通常Apply に変更**: 以前のCtrl限定操作を通常クリックに変更（デフォルト動作）
- **P ボタン追加**: Apply右隣に配置。InputタブのPositiveプロンプト内容をワークフローへ即時反映（プロンプトタブに切り替える手間を省略）
- **IDドロップダウン幅調整**: `flex:1` で利用可能な幅いっぱいに広げ、max-width制限を撤廃
- **"Stack"ラベルの位置変更**: ID行から削除し、Strength行左端（チェックボックス横）に移動
- **Stack toggle-all チェックボックスの移動**: ヘッダー行からStrength行左端に移動
  - 個別モデル行のチェックボックス列と視覚的に揃い、全体ON/OFFの役割が明確に
- **M/C入力幅修正**: 54px → 60px に拡大（スピナーボタン分の余裕を確保し数値が切れる問題を修正）
- **Str M / C ラベルの位置変更**: 別ヘッダー行から All 調整行（Strength行）に統合
- **All調整行をグリッドレイアウトに変更**: 個別モデル行と同じ `grid-template-columns` で右揃えに

#### Modelsタブ — モデル選択時のデフォルトタブ変更（`static/js/models-tab.js`）
- サイドパネルのデフォルト表示タブを「Info」から「CivitAI」に変更
- モデル選択のたびにCivitAI情報が即座に表示される

#### ヘルプタブ — 左サイドバー化（`templates/index.html`, `static/js/app.js`, `static/css/main.css`）
- 1カラムスクロールから「左サイドバー（170px） + 右コンテンツペイン」の2カラムレイアウトに変更
- サイドバーに14項目のナビゲーションボタンを配置、選択中項目をハイライト（左ボーダー + プライマリカラー）
- Supportを最下部に固定表示（`border-top` セパレーター付き）
- 各項目クリックで右ペインのコンテンツを切り替え（`.wfm-help-page.active` の付け替え）
- `initHelpTab()` を `app.js` の `DOMContentLoaded` に追加

#### ヘルプコンテンツ更新（`templates/index.html`）
- **GenerateUI Tab (gen-2)**: Reset Workflowボタンの説明を追加
- **GenerateUI Tab (gen-4)**: InputタブのPrompt/Imageタブ化・テキストボックス高さ2倍の説明に更新
- **GenerateUI Tab (gen-5)**: LoRA Stack ApplyによるLoRA Syntax + Trigger Words同期の説明を追加
- **Feeder subtab (feeder-4)**: (root)フォルダ自動選択の説明を追加
- **Feeder subtab (feeder-6)**: PREVIEWペインが右端固定・RUN中に現在画像表示の説明に更新
- **Models Tab (models-4)**: CivitAIタブがデフォルト表示になった旨を追記

---

## 2026-06-08: 生成UIタブ 複数改善 — LoRA Stackトリガーワード連携・Reset Workflowボタン・Inputタブタブ化

### 変更内容

#### LoRA Stack Ctrl+Apply — トリガーワード追加 + 再適用時の差分更新（`static/js/comfyui-editor.js`）
- Ctrl+Apply 時に LORA SYNTAX に続いてアクティブモデルのトリガーワードをプロンプトへ追加
  - 追加形式：`既存プロンプト, <lora:...>, triggerA, triggerB`
- `activeTriggerWords`（アクティブのみ）と `allTriggerWords`（UI表示用・全モデル）を分離
  - 非アクティブモデルの lora syntax は除外済みだったが、トリガーワードも同様に除外
- 再 Ctrl+Apply 時はプロンプトを差分更新（全スタック分を除去 → アクティブ分を再追加）
  - `<lora:stem:...>` トークンを stem 単位で正規表現除去
  - 全スタックモデルのトリガーワードをカンマ分割で除去してから再追加

#### Reset Workflow ボタン（`templates/index.html`, `static/js/generate-tab.js`）
- 上部ツールバーの「Refresh Models」右隣に「Reset Workflow」ボタンを追加
- 現在読み込まれているファイル（`.json`）を `/api/wfm/workflows/raw` から再取得して再ロード
- `loadWorkflowIntoEditor` でファイル名を `data-filename` 属性に保存し Reset 時に参照
- ファイルベースでない場合（Raw JSON貼り付け等）は警告トーストを表示

#### Inputタブ — Prompt/Image タブ化 + テキストボックス高さ2倍
**タブ化**（`templates/index.html`, `static/js/generate-tab.js`, `static/css/main.css`）
- Prompt と Image を上下スタックから「Prompt | Image」の内部タブ構成に変更
- `.wfm-input-inner-tabnav` / `.wfm-input-inner-tab` / `.wfm-input-inner-panel` を新規追加
- アクティブタブにはアンダーライン強調スタイルを適用

**テキストボックス高さ2倍**（`static/js/comfyui-editor.js`）
- Positive Prompt: `rows="4"` → `rows="8"`
- Negative Prompt: `rows="3"` → `rows="6"`

---

## 2026-06-08: Feederタブ UI改善 — (root)自動選択・PREVIEWペイン右移動・RUN中プレビュー反映

### 変更内容

#### (root)フォルダの自動選択（`static/js/feeder-tab.js`）
- `initFeederTab()` 末尾に `_selectDir("")` を追加
- タブを開いた初期状態で (root) がハイライトされ、画像一覧が即座に表示される

#### PREVIEWペインをレイアウト最右に移動（`templates/index.html`）
- `wfm-feeder-preview-pane` を `wfm-feeder-library-body`（内側 flex row）から
  `wfm-feeder-layout`（外側 flex row）の直接子に移動
- IMAGES グリッドが横幅を最大限確保できるようになった
- レイアウト構造：`Settings (220px) | Library (flex:1) | Preview (160px)`

#### RUN中のプレビュー自動更新（`static/js/feeder-tab.js`）
- `_startRun()` 内の `_syncHandler` で `thumbnail_path` 受信時に `_showPreview()` を呼び出し
- ノード実行完了のたびに処理中の画像サムネイル・ファイル名・解像度がPREVIEWペインに反映される

---

## 2026-06-07: v0.3.28 — Batchタブ Sampler/Scheduler対応 + Modelsサムネイルバグ修正

### 概要

GenerateUI の Batch タブにサンプラー・スケジューラーのバッチ処理を追加。
また Models タブでサムネイル変更後に画像が更新されなかった問題を修正した。

### 変更内容

#### Modelsタブ サムネイル変更バグ修正

**原因1: ブラウザキャッシュ**（`py/routes/models_routes.py`）
- `handle_get_preview` の `Cache-Control` を `public, max-age=3600` → `no-cache` に変更
- モーダルを閉じて再度開いた際、ブラウザが1時間キャッシュした古い画像を返し続けていた

**原因2: 破損ファイルの検出なし**（`py/services/models_service.py`）
- `find_preview_image` でファイルサイズが 100バイト未満のファイルをスキップするよう変更
- 0バイトや極小の破損プレビューファイルが返されてカードが黒く表示される問題を解消

**原因3: disabledモデルの非対応**（`py/routes/models_routes.py`）
- `handle_change_preview` でモデルファイルを検索する際、`.disabled` 拡張子付きファイルも候補に追加
- 無効化済みモデルのサムネイル変更が「Model file not found」エラーになっていた

#### GenerateUI Batchタブ Sampler/Scheduler対応

**左ペインのタブ化**（`templates/index.html`, `static/js/generate-tab.js`, `static/css/main.css`）
- 左ペインを Checkpoints / Sampler / Scheduler の3タブ構成に変更
- Sampler・Scheduler タブには KSampler ノードから取得したリストをチェックボックスで表示
- 各リストは Checkpoint と同様の `(root)` グループ行（全選択チェックボックス + 折りたたみ）で構成
- All/None ツールバーボタンも各タブに配置

**BATCH QUEUE 拡張**（`templates/index.html`）
- Sampler 列・Scheduler 列を追加し合計6列（Checkpoint / Lora / Prompt / Workflow / Sampler / Scheduler）
- `.wfm-batch-right` の最小幅を 320px → 380px に拡張

**バッチ処理ロジック追加**（`static/js/generate-tab.js`）
- `_batchGroupState` に `_samplerSelected`・`_schedulerSelected`（Set）を追加
- `_buildSimpleGroupList()` 共通関数を新規追加（Sampler・Scheduler リストの (root) グループ描画）
- `_renderBatchPreview()` に Sampler・Scheduler 列を追加
- `_runBatchGenerate()` に `case "sampler"` / `case "scheduler"` を追加
  - ワークフロー内の全 `sampler_nodes` の `sampler_name` / `scheduler` を差し替えて順次生成
- モデルリフレッシュ時に Sampler・Scheduler リストも再描画

#### ヘルプ更新（3言語）

- `helpGen11`〜`helpGen14` を Sampler/Scheduler 対応後の内容に更新（英/日/中）
- `helpGen15` を新規追加（Sampler/Scheduler バッチの操作説明）
- `helpModels6` を更新（サムネイル変更の詳細：即時反映・破損ファイル自動スキップ）
- `app.js` に `wfm-help-gen-15` のマッピングを追加

---

## 2026-06-07: v0.3.27 — model-and-prompt-from-metadata カスタムノード対応 + README修正

### 概要

`model-and-prompt-from-metadata` カスタムノードパックの全ノードをワークフロー解析に対応。
また README の LoraManager リポジトリリンクの誤記を修正した。

### 変更内容

#### ワークフロー解析対応（`comfyui-workflow.js`）

| ノード表示名 | クラス名 | 検出区分 |
|---|---|---|
| CLIP Text Encode edit+ | `CLIPTextEncodeEditPlus` | prompt_nodes |
| Model from Metadata | `ImageMetadataCheckpointLoader` | 既存 `CheckpointLoader` 判定で検出済み |
| Model-Prompt from Metadata | `ImageMetadataPromptLoader` | checkpoint_nodes + prompt_nodes（両方） |
| LoRA from Metadata | `ImageMetadataLoRALoader` | lora_nodes（3スロット） |

**`CLIPTextEncodeEditPlus`**
- `text1` は `forceInput`（常にリンク接続）のため直接読み取り不可
- ローカル上書きテキスト `text_edit` を編集ターゲット（`textKey: "text_edit"`）として prompt_nodes に登録

**`ImageMetadataPromptLoader`**
- 単一ノードが checkpoint + positive/negative プロンプトを兼ねる構造
- `checkpoint_nodes` に `ckpt_name` で登録
- `positive_text` を role `"positive"`、`negative_text` を role `"negative"` として prompt_nodes に登録
- ロールはハードコード（sampler → CONDITIONING のスロット番号で両方参照される可能性があるため `getRole()` に依存しない）

**`ImageMetadataLoRALoader`**
- `lora_1`〜`lora_3` を順にチェックし、`"None"` 以外のスロットを lora_nodes に登録
- 各スロットの `strength_model_N` / `strength_clip_N` も合わせて取得

**`_getWidgetMapping` 静的フォールバック追加**
- `object_info` 取得失敗時の UI→API 変換用マッピングに上記4ノードを追加

#### README 修正（`README.md`）

- LoraManager リポジトリ URL の誤記を修正
  - 誤: `https://github.com/willchil/ComfyUI-Lora-Manager`
  - 正: `https://github.com/willmiao/ComfyUI-Lora-Manager`

---

## 2026-06-07: v0.3.26 — Stack LORA SYNTAX 表示修正 + 全体強度調整 UI

### 概要

Stack ペインの LORA SYNTAX が空表示になるバグを修正し、全モデルの強度を一括増減できる調整ボックスを追加した。

### 変更内容

#### LORA SYNTAX 空表示バグ修正（`comfyui-editor.js`）

- **原因**: `<lora:name:str>` 構文を `el.innerHTML` テンプレートリテラルに埋め込んでいたため、
  ブラウザが `<lora:...>` を未知の HTML タグとして解析し、本文が消えていた。
  `, ` 区切り文字のみが残って表示される症状だった。
- **修正**: `el.innerHTML` 代入直後に `getElementById("wfm-lora-stack-syntax").textContent` で
  テキストとして上書きするよう変更。`_refreshLoraPaneDynamic` は既に `textContent` を使用しており問題なし。

#### 全体強度調整ボックス追加（`comfyui-editor.js`, `main.css`）

- Stack モデル一覧ヘッダーの直下に `All` 調整行を追加
- `M`・`C` それぞれに `[−][step][+]` コントロールを配置
  - `+` / `−` ボタン: step 入力欄の値（デフォルト 0.05）を全モデルの強度に加減算
  - step 入力欄は直接編集可能（min: 0.01、max: 2.0）
  - 有効・無効状態に関わらず全モデルの強度値を更新（無効モデルの保持値も変更）
- 調整後は各行の入力欄と LORA SYNTAX 表示を自動更新
- `.wfm-lora-stack-global-adj` / `.wfm-lora-stack-global-adj-group` / `.wfm-lora-stack-adj-step` / `.wfm-btn-xs` CSS を追加

#### 強度入力欄の表示切れ修正（`main.css`, `comfyui-editor.js`）

- **原因**: `.wfm-input` の `padding: 8px 12px` が大きすぎ、56px 幅にスピナーと合わせて
  数値が収まらず右端が切れていた。
- CSS グリッド列幅を `56px → 64px` に拡大（ヘッダー・入力欄とも）
- `.wfm-lora-stack-strengths input[type="number"]` に `padding: 4px 4px; text-align: center` を適用
- WebKit / Firefox スピナーボタンを非表示化
  （グローバル調整の `+/−` ボタンで代替できるため、個別スピナーは不要と判断）

---

## 2026-06-07: v0.3.25 — Lora Loader (LoraManager) 対応 + Stack 有効無効切り替え

### 概要

生成UI の Lora ペインを `Lora Loader (LoraManager)` ノードに対応。
ワークフロー解析・単体適用・Stack 適用・バッチ生成の全経路で LoraManager 専用フォーマット
（`inputs.loras.__value__` 配列 + `inputs.text` 構文）への書き込みに対応した。
また Stack の各モデルと Stack 全体の有効 / 無効を切り替えるチェックボックス UI を追加。
Model サブタブを開くたびに LoRA ペインを再描画することで、
Models タブでの Stack グループ更新が即座に反映されるようにした。

### 変更内容

#### 生成UI Model タブ — 左右ペイン等幅化（`main.css`）

- `wfm-gen-params-col--narrow` を `flex: none; width: 220px;` から `flex: 1;` に変更
- 左ペイン（Checkpoint / VAE 等）と中央ペイン（LoRA）が均等幅になった

#### `Lora Loader (LoraManager)` ノード対応

**ワークフロー解析 (`comfyui-workflow.js`)**
- `analyzeWorkflow()` に `Lora Loader (LoraManager)` 検出ブロックを追加
- `lora_nodes` に `{ id, type, title, is_lora_manager: true }` として登録

**ヘルパー関数追加 (`comfyui-editor.js`)**
- `_buildLoraManagerSyntax(stackModels)` — `<lora:name:strM:strC>` 形式（スペース区切り）
- `_applyLoraToNode(nodeId, loraPath, strModel, strClip, isLoraManager)` — ノード種別に応じた書き込み
  - LoraManager: `inputs.loras.__value__` + `inputs.text` を更新
  - 標準 LoraLoader: `inputs.lora_name` / `strength_model` / `strength_clip` を更新

**単体 Apply (`comfyui-editor.js`)**
- Apply ボタンが `is_lora_manager` フラグを確認し、LoraManager 形式で書き込み

**Stack Apply (`comfyui-editor.js`)**
- LoraManager ターゲット: Stack の全モデルを `__value__` 配列に一括適用
  - 無効モデルは `active: false` で配列に保持（データを削除しない）
- 標準 LoraLoader ターゲット: 従来通り先頭モデルのみ適用

**バッチ生成 (`generate-tab.js`)**
- "lora" バッチケースで `is_lora_manager` を確認
- LoraManager ノードには `inputs.loras.__value__` + `inputs.text` を書き込み
- 標準 LoraLoader ノードは従来通り `inputs.lora_name` を書き込み

#### Stack 有効 / 無効切り替え UI (`comfyui-editor.js`, `main.css`)

- モジュールレベルに `_stackActive` 状態（`{ modelPath: boolean }`）を追加
- `_syncStackToggleAll(stackModels)` — Toggle All チェックボックスの checked / indeterminate 状態を同期
- `_buildLoraSyntax` / `_buildLoraManagerSyntax` — 無効モデルをフィルタリングして構文を生成
- **Toggle All チェックボックス** — Stack ヘッダー左端に追加（全ON / 全OFF / 中間状態に対応）
- **モデルごとのチェックボックス** — 各 Stack モデル行の左端に追加
  - 無効時: モデル名に取り消し線 + 透過（opacity 0.4）、入力欄も透過 + `disabled`
  - Stack Apply 時: 無効モデルを `active: false` で `__value__` に保持（LoraManager がスキップ）
- CSS グリッド更新:
  - `.wfm-lora-stack-models-header`: `1fr 56px 56px` → `16px 1fr 56px 56px`
  - `.wfm-lora-stack-model-row`: `1fr auto` → `16px 1fr auto`
  - `.wfm-lora-stack-model-row--off` スタイルを追加

#### Stack の自動適用 (`comfyui-editor.js`, `generate-tab.js`)

- `stackTargetOpts` を新設: Stack ターゲットのドロップダウンが LoraManager ノードを優先的に selected
- `renderLoraPane` 末尾で自動適用: LoraManager がターゲットかつ Stack にモデルがある場合、
  ワークフロー読み込み時に自動で `inputs.loras` / `inputs.text` を更新
- Model サブタブをクリックするたびに `renderLoraPane` を再実行
  → Models タブで Stack グループを更新した後、すぐに GenerateUI に反映

---

## 2026-06-06: v0.3.24 — Lora Stack 登録機能 + 生成UI Model タブ 3ペイン化

### 概要

Models タブに Lora 専用の Stack グループ登録機能を追加。
生成UI の Model タブを 3ペイン（モデル選択 / Lora 専用 / RAW JSON）に分割し、
Lora ペインに単体適用セクションと Stack セクション（構文自動生成・トリガーワード表示・強度設定）を実装。

### 変更内容

#### Models タブ — Batch B ボタンの Lora/Checkpoint 限定表示（`models-tab.js`）

- サムネイルビュー・テーブルビューともに、`showBatchBtn` フラグを導入し
  Checkpoint・Lora 以外のモデルタイプでは B ボタン／B 列を非表示に変更
- イベントリスナーを `?.addEventListener` でヌルセーフ化

#### Models タブ — Stack グループ登録機能（`models-tab.js`, `index.html`, `main.css`）

- `RESERVED_GROUPS` に `"Stack"` を追加（削除不可）
- `STACK_MODEL_TYPES = ["lora"]` 定数を追加
- Lora タイプ読み込み時に `Stack` グループを自動初期化（2箇所）
- `isInStack` / `toggleStack` / `clearStackGroup` 関数を追加
- **サムネイルビュー**: Lora のみ左下に `S` オーバーレイボタン追加（active 時は緑色 `#60d0a0`）
- **テーブルビュー**: B 列の右に S 列を追加（ヘッダー含む）
- **SC ボタン**: ツールバーの BC ボタン右隣に Stack Clear ボタンを追加
- セレクトモード時の click 除外対象に `.wfm-stack-btn` を追加

#### 生成UI Model タブ — 3ペイン化（`index.html`, `main.css`, `comfyui-editor.js`）

- Model タブの `wfm-gen-tab-cols` を 3列構成に変更
  - 左ペイン: `wfm-gen-params-col--narrow`（`width: 220px` 固定）— Checkpoint / VAE 等
  - 中央ペイン: `wfm-gen-lora-col`（`flex: 1`）— Lora 専用
  - 右ペイン: RAW JSON（変更なし）
- `renderModelTab` から LoRA セクションを削除
- `renderAll` に `renderLoraPane` 呼び出しを追加

#### 生成UI Lora ペイン（`comfyui-editor.js`, `main.css`）

**単体セクション（上部）**
- フィルター入力 / モデルセレクト / ノード ID + Apply ボタン / Strength M・C

**Stack セクション（下部）**
- Stack ラベル + ノード ID セレクト + Apply ボタン
  - 通常クリック: 選択ノードに Stack 先頭 Lora を適用
  - **Ctrl+クリック**: Input タブ Positive プロンプト末尾に Lora 構文をカンマ区切りで追加し、ワークフローにも反映
- **Lora 構文表示**: `<lora:stem:strength>` 形式を自動生成（Strength 変更でリアルタイム更新）
- **トリガーワード表示**: Stack 登録モデルの CivitAI `trainedWords` を一括表示
- **モデルリスト**: Stack 登録 Lora を行単位で表示、各行に Strength M / C 入力
- モジュールレベルの `_stackStrengths`（強度状態）、`_loraBasename`、`_buildLoraSyntax`、`_refreshLoraPaneDynamic` を追加

---

## 2026-06-05: v0.3.23 — バグ修正2件

### バグ修正

**ワークフローバッチ 404 エラー修正（`generate-tab.js`）**
- `_runBatchGenerate()` の workflow ケースで、ワークフローファイル取得 URL が
  `/api/wfm/workflows/{filename}`（存在しないルート）になっていた
- 正しいエンドポイント `/api/wfm/workflows/raw?filename={filename}` に修正

**ワークフローリネーム二重送信バグ修正（`workflow-tab.js`）**
- モーダルを開くたびに `titleInput.addEventListener("blur", commitRename)` が累積していた
- 2回目以降のリネーム時に blur が複数発火し、同一ファイルへのリネームリクエストが
  2本送られて 1本目成功後に 2本目が 409 または 404 になっていた
- `titleInput._commitRename` で前回のリスナー参照を保持し、
  再オープン時に `removeEventListener` で除去してから登録するよう修正

---

## 2026-06-05: v0.3.22 — カードビュー廃止 + Batch タイプ切り替え UI + 4タイプバッチ生成

### 概要

WorkflowタブとModelsタブのカードビューを廃止（サムネイル／テーブルの2択に統一）。
生成UIタブのBatch機能を4タイプ（Checkpoint/Lora/Prompt/Workflow）のいずれかを有効化する
ラジオ選択型に拡張し、バッチ実行ループも全タイプ対応。

**カードビュー廃止（Workflow・Models タブ）**
- ビュー切り替えボタンから Card（&#9776;）を削除（Thumb・Table の2択）
- `viewMode` の初期値に `"card"` が保存されている場合は `"thumb"` にフォールバック
- Nodes タブのカードビューは変更なし

**Batch タイプ切り替え（BATCH QUEUE ヘッダー）**
- 各列ヘッダー右端にチェックボックスを追加（Checkpoint / Lora / Prompt / Workflow）
- ラジオ動作：1つを選択すると他3つは自動解除（`_activeBatchType` 変数で管理）
- バッチ有効時に Generate ボタンを押すと対応タイプのバッチ実行

**Batch ステータスパネル（旧 Checkpoint Batch）**
- "Checkpoint Batch" チェックボックス＋ラベルを廃止
- 「Batch」+ アクティブタイプ名の常時表示に変更（実行中は青色ハイライト）
- 進捗バー・Pause ボタンはバッチ実行中のみ表示

**バッチ生成 4タイプ対応**
- 汎用ループ `_runBatchLoop(items, applyFn, labelFn)` を実装
- `_runBatchGenerate()` が `_activeBatchType` に応じてディスパッチ：
  - Checkpoint: `checkpoint_nodes` の `ckpt_name` を差し替え
  - Lora: `lora_nodes` の `lora_name` を差し替え
  - Prompt: `prompt_nodes` の positive に `text`、negative に `negText` を適用（`textKey` 経由）
  - Workflow: 各ファイルをロード → 生成 → 完了後に元ワークフローを復元

**バグ修正**
- Prompt バッチ: `_getSelectedPromptGroupItems()` がすでにプリセットオブジェクト配列を返すにもかかわらず、ID として再解決しようとして `list` が空になるバグを修正

### 変更内容

#### `templates/index.html`

- Workflow タブ・Models タブのビュー切り替えから Card ボタンを削除
- BATCH QUEUE 各列ヘッダー: テキストを `<span>` でラップ + `<input class="wfm-batch-type-cb" data-batch-type="...">` を追加
- Checkpoint Batch パネル: チェックボックス削除 → `wfm-batch-type-label` スパン（アクティブタイプ名表示）に置換。`wfm-ckpt-batch-body` の `display:none` 初期非表示を廃止

#### `static/js/workflow-tab.js`

- `viewMode` 初期値: `localStorage` の値が `"table"` 以外なら `"thumb"` にフォールバック
- `renderGrid()`: `thumb`/`card` の分岐を削除。常にサムネイルビューを描画
- `tags` 変数宣言を削除（カードビューでしか使用していなかったため）

#### `static/js/models-tab.js`

- `viewMode` 初期値: 同上フォールバック
- `renderModelGrid()`: `else if (viewMode === "card")` 分岐を削除。`thumb`/`table` の2択に
- `renderCardView()` 関数を削除（62行）

#### `static/js/generate-tab.js`

- `_activeBatchType` 変数追加（`null | "checkpoint" | "lora" | "prompt" | "workflow"`）
- `_updateBatchTypeLabel(running)`: バッチステータスパネルのタイプ名ラベルを更新
- `initCheckpointBatch()`: 旧チェックボックスハンドラを削除 → `.wfm-batch-type-cb` のラジオ動作ハンドラに置換
- `_runBatchLoop(items, applyFn, labelFn)`: 汎用バッチループ実装（進捗表示・一時停止・中断対応）
- `_runBatchGenerate()`: Checkpoint単体から4タイプディスパッチャに書き換え
- `handleGenerate()`: `wfm-ckpt-batch-enabled` チェック → `_activeBatchType !== null` に変更

#### `static/css/main.css`

- Workflow/Models カードビュー関連スタイルを削除（計約86行）：
  - `.wfm-view-card` 系全ルール / `.wfm-card-io` / `.wfm-model-card` / `.wfm-view-card .wfm-toggle-btn` 等
- `.wfm-batch-queue-col-header`: `display: flex; justify-content: space-between` 追加
- `.wfm-batch-type-cb`: チェックボックス用スタイル追加（12px、accent-color 指定）

---

## 2026-06-05: (未リリース) — 生成UIタブ Batch 4タイプ対応（Lora/Prompt/Workflow グループ選択 + BATCH QUEUE 4列化）

### 概要

生成UIタブの Batch ペインを Checkpoint 単体から Lora・Prompt・Workflow を含む4タイプ対応に拡張。
グループチェックペイン（中央ペイン）の Lora・Prompt・Workflow タブに実際のグループリストを実装し、
BATCH QUEUE（右ペイン）を4列横並びレイアウトに変更。

**グループチェックペイン（中央）**
- Lora タブ: `/api/wfm/models/groups?type=lora` からグループ取得。ファイル名（末尾）を表示
- Prompt タブ: `/api/wfm/prompts` でプリセット取得 + `localStorage[wfm_prompt_preset_groups]` でグループ取得。ID を `name` フィールドで解決して表示
- Workflow タブ: `localStorage[wfm_groups]` からグループ取得。`.json` 除去したファイル名を表示
- 各タブクリック時に対応するグループを再ロード。Batchサブタブ表示時は全タイプを一括ロード

**BATCH QUEUE（右ペイン）**
- Checkpoint / Lora / Prompt / Workflow の4列横並び表示
- 各列ヘッダー・件数・アイテムリストを独立表示
- 右ペイン幅を `flex: 1.2; min-width: 320px` に拡大

**バグ修正**
- ワークフロー カードビュー の B ボタンを左端から右下（★の下）に移動
- Prompt グループ選択ペインで UUID がそのまま表示されていた問題を修正（`title` → `name` フィールド）

### 変更内容

#### `templates/index.html`

- Lora/Prompt/Workflow タブ: "Coming soon" プレースホルダー → グループリストコンテナ（`wfm-batch-lora-group-list` / `wfm-batch-prompt-group-list` / `wfm-batch-wf-group-list`）に置換
- BATCH QUEUE 右ペイン: 単一リスト → `wfm-batch-queue-grid` 内に4列（各 `wfm-batch-queue-col`）

#### `static/js/generate-tab.js`

**`_batchGroupState` 拡張**
- Lora: `loraGroups` / `loraSelectedGroups` / `loraPartialSelections`
- Prompt: `promptGroups` / `promptPresets` / `promptSelectedGroups` / `promptPartialSelections`
- Workflow: `wfGroups` / `wfSelectedGroups` / `wfPartialSelections`

**新規汎用関数**
- `_getItemsFromGroupState(groupsData, selectedGroups, partialSelections)` — グループ状態からメンバーSet取得
- `_getGroupSelCountFrom(name, ...)` — 汎用選択数カウント
- `_renderAnyGroupList(listEl, groupsData, ...)` — Checkpoint と同じグループリストUIを任意タイプで再利用

**新規選択取得関数**
- `_getSelectedLoraGroupItems()` / `_getSelectedPromptGroupItems()` / `_getSelectedWfGroupItems()`

**新規ロード/レンダー関数**
- `_loadBatchLoraGroups()` / `_renderBatchLoraGroupList()`
- `_loadPromptGroupsForBatch()` / `_renderBatchPromptGroupList()`
- `_loadWorkflowGroupsForBatch()` / `_renderBatchWfGroupList()`

**`_renderBatchPreview()` リファクタリング**
- `_renderQueueColumn(countId, listId, items, displayFn, singular, plural)` を抽出
- 4タイプ（Checkpoint/Lora/Prompt/Workflow）を各列に独立レンダリング

**`initBatchTab()` 更新**
- 内部タブクリック時に対応する load 関数を呼び出し
- Batch サブタブ表示時に全タイプを一括ロード

**バグ修正**
- Prompt グループ表示: `presetsMap.get(id)?.title` → `presetsMap.get(id)?.name`（APIフィールド名修正）

#### `static/js/workflow-tab.js`

- カードビュー HTML: B ボタンと★ボタンを `wfm-card-actions` ラッパーで包み縦並び（★上・B下）に変更

#### `static/css/main.css`

- `.wfm-batch-right`: 固定210px → `flex: 1.2; min-width: 320px`
- `.wfm-batch-queue-grid` / `.wfm-batch-queue-col` / `.wfm-batch-queue-col-header`: 4列横並びレイアウト用スタイル追加
- `.wfm-view-card .wfm-card`: `align-items: stretch` に変更
- `.wfm-view-card .wfm-card-actions`: `flex-direction: column; justify-content: space-between` で縦並び配置

---

## 2026-06-05: (未リリース) — Prompt・Workflow Batchグループ登録UI

### 概要

Prompt タブと Workflow タブに Batch グループへの登録・解除 UI を追加。
モデルタブと同じ操作感で統一されており、B ボタンで登録/解除、B フィルターで絞り込み、BC ボタンで一括解除が可能。

**Prompt タブ**
- 各プリセットアイテムの★ボタン左隣に B ボタンを追加（黄色=登録済み）
- 検索ボックス右端に BC ボタンを追加（`wfm-pm-search` 行を flex 化）

**Workflow タブ**
- サムネイルビュー：`wfm-card-thumb` 左上に B ボタン（絶対配置）
- カードビュー：カード左下に B ボタン（絶対配置）
- テーブルビュー：右端に B 列追加
- フィルター行の★ボタン右隣に B フィルタリングボタンを追加
- View Settings ボタン右隣に BC ボタンを追加

### 変更内容

#### `static/js/prompt-tab.js`

**新規関数**
- `isInBatchPreset(id)` — `pmGroups["Batch"]` に id が含まれるか判定
- `toggleBatchPreset(id)` — バッチへの登録/解除トグル → `saveGroups()` で LocalStorage 保存
- `clearBatchPresets()` — `pmGroups["Batch"] = []` で一括解除

**`createPmItem()`**
- `inBatch` 変数を追加し `.pm-batch-btn` クラスに `batch-active` を付与
- ★ボタンの左に `<button class="wfm-pm-action-btn pm-batch-btn">B</button>` を追加
- `.pm-batch-btn` クリックで `toggleBatchPreset()` を呼び出し

**`initPromptTab()`**
- `wfm-pm-batch-clear-btn` クリック → `clearBatchPresets()` 呼び出し

#### `static/js/workflow-tab.js`

**新規 state フィールド**
- `state.showBatchOnly: false`

**新規関数**
- `isInBatch(filename)` / `toggleBatch(filename)` / `clearBatch()` — groups.data["Batch"] を操作

**`filterWorkflows()`**
- `state.showBatchOnly` が true のとき Batch グループメンバーのみに絞り込む処理を追加

**`renderModelFilters()`**
- ★フィルターボタンの右に B フィルタリングボタン（`.wfm-wf-batch-filter-btn`）を追加
- クリックで `state.showBatchOnly` トグル

**`renderGrid()` — thumbビュー**
- `wfm-card-thumb` 内に `<button class="wfm-batch-btn">B</button>` を追加（左上絶対配置）

**`renderGrid()` — cardビュー**
- favBtnの前に `<button class="wfm-batch-btn">B</button>` を追加（左下絶対配置）

**`renderTableView()`**
- thead 右端に空の th を追加（width:30px）
- 各行右端に `<td class="wfm-table-td-batch">B ボタン</td>` を追加

**`initWorkflowTab()`**
- `wfm-wf-batch-clear-btn` クリック → `clearBatch()` 呼び出し

#### `templates/index.html`

- Prompt タブ: `wfm-pm-search` 内にBC ボタン（`wfm-pm-batch-clear-btn`）を追加、入力ボックスに `flex:1` 追加
- Workflow タブ: View Settings ボタン（`wfm-badge-settings-btn`）の右に BC ボタン（`wfm-wf-batch-clear-btn`）を追加

#### `static/css/main.css`

- `.wfm-pm-search { display: flex; gap: 4px; align-items: center; }` — BC ボタン配置用
- `.wfm-pm-action-btn.batch-active { color: #f0c040; }` — Prompt タブ Bボタン active 時
- `.wfm-card-thumb { position: relative; }` — ワークフローthumbビューの Bボタン絶対配置基準
- `#wfm-workflow-grid.wfm-view-card .wfm-batch-btn { position: absolute; bottom: 6px; left: 6px; }` — ワークフローcardビュー専用（モデルタブと区別）

#### `static/js/i18n.js`

- `promptBatchClear` / `wfBatchClear` を英語・日本語・中国語で追加

---

## 2026-06-04: (未リリース) — モデルBatchグループ登録UI（サムネイル/カード/テーブル・フィルター・一括解除）

### 概要

Models タブ（Checkpoint / Lora）の Batch グループへの登録・解除 UI を全ビューに追加。
お気に入り（★）と同じ操作感で、1クリックで登録/解除できる「B」ボタンをサムネイル・カード・テーブルの各ビューに配置。
フィルターボタン（B）でバッチ登録済みモデルのみ絞り込み表示、BC ボタンで一括解除が可能。

### 変更内容

#### `templates/index.html`

- ★フィルターボタンの右隣に **B** フィルターボタン（`wfm-models-batch-filter-btn`）を追加
- Select ボタンの右隣に **BC** ボタン（`wfm-models-batch-clear-btn`）を追加

#### `static/css/main.css`

- `.wfm-batch-btn` スタイルを追加
  - 通常時: グレー (`var(--wfm-text-secondary)`)・opacity 0.5
  - `.active` 時: 黄色 (`#f0c040`)・opacity 1
  - サムネイルビュー: `position: absolute; top: 6px; left: 6px;`（プレビュー左上）
  - カードビュー: `position: static; flex-shrink: 0;`（★ボタンの左隣）
  - テーブルビュー: `position: static`
- `.wfm-table-td-batch` セル幅スタイルを追加

#### `static/js/models-tab.js`

**新規 state フィールド**
- `state.showBatchOnly: false` — Bフィルターの有効状態

**新規ヘルパー関数**
- `isInBatch(modelName)` — `state.modelGroups["Batch"]` に含まれるか判定
- `toggleBatch(modelName)` — バッチへの登録/解除トグル → `saveModelGroups()` でサーバー保存
- `clearBatchGroup()` — `state.modelGroups["Batch"] = []` で一括解除、Bフィルターも解除

**フィルター処理**
- `state.showBatchOnly` が true のとき `modelGroups["Batch"]` メンバーのみに絞り込む処理を追加（`showFavoritesOnly` の直後）

**renderThumbView**
- `batchClass` 変数を追加（active で黄色クラス付与）
- プレビュー画像エリア左上に `<button class="wfm-batch-btn">B</button>` を追加
- `.wfm-batch-btn` クリックで `toggleBatch()` を呼び出し
- selectMode のクリックガードに `.wfm-batch-btn` を追加

**renderCardView**
- 同様に `batchClass` を追加し ★ボタンの左に `<button class="wfm-batch-btn">B</button>` を追加
- イベントハンドラ・selectMode ガードを同様に追加

**renderTableView**
- 各行に `<td class="wfm-table-td-batch">B ボタン</td>` を右端に追加
- thead に `<th style="width:30px;">B</th>` を追加
- `.wfm-batch-btn` クリックイベントを各行にバインド
- selectMode のクリックガードに `.wfm-batch-btn` を追加

**イベントハンドラ**
- `wfm-models-batch-filter-btn` クリック → `state.showBatchOnly` トグル・`renderModelGrid()` 呼び出し
- `wfm-models-batch-clear-btn` クリック → `clearBatchGroup()` 呼び出し

#### `static/js/i18n.js`

- `modelsBatch` / `modelsBatchClear` を英語・日本語・中国語で追加

---

## 2026-06-04: (未リリース) — Batch予約グループ・Presets Save後リセット・グループフィルター種別絞り込み

### 概要

Workflow / Prompt / Models（Checkpoint・Lora）に「Batch」予約グループを追加。
予約グループはシステム側で自動作成され、ユーザーによる削除・リネームをブロックする。
合わせて Prompt タブの Presets で Save 後に選択が `--New Preset--` へリセットされるよう修正し、
Models タブのグループフィルタードロップダウンが現在選択中のモデル種別のグループのみ表示するよう改善。

### 変更内容

#### `static/js/models-tab.js`

**Batch 予約グループの自動作成（Checkpoint / Lora）**
- `RESERVED_GROUPS = ["Batch"]` / `BATCH_MODEL_TYPES = ["checkpoint", "lora"]` 定数を追加
- `loadModelsForCurrentType()` のキャッシュヒット時・フル読み込み時の両パスで、対象タイプに "Batch" グループが存在しなければ API 経由で自動作成

**削除・リネームのブロック**
- グループ削除ボタン・リネームボタンのイベントハンドラで `RESERVED_GROUPS` チェックを追加
- 予約グループを操作しようとした場合 `modelsGroupReserved` トーストを表示して処理を中断

**グループフィルター種別絞り込み**
- `renderGroupFilter()` を改修: 全タイプ横断表示から `state.activeModelType` のグループのみ表示するよう変更
- `[タイプラベル] グループ名` 形式を廃止し、グループ名のみを表示

#### `static/js/prompt-tab.js`

**Batch 予約グループの自動確保**
- `PROMPT_RESERVED_GROUPS = ["Batch"]` 定数を追加
- `loadAllPresets()` のクリーニング処理で予約グループを空でも削除しないよう修正
- クリーニング後に予約グループが存在しなければ `pmGroups["Batch"] = []` で確保し `saveGroups()` へ反映

**削除ブロック**
- グループ削除ボタンのイベントハンドラで `PROMPT_RESERVED_GROUPS` チェックを追加

**Save 後の Preset 選択リセット**
- Preset 保存（新規作成・更新どちらも）成功後に `pmSelectedId = null` / `presetSelect.value = ""` で `--New Preset--` へ戻す
- 旧: 新規作成後は保存した Preset が選択されたまま → 誤って上書きするリスクがあった

#### `static/js/workflow-tab.js`

**Batch 予約グループの自動作成**
- `WF_RESERVED_GROUPS = ["Batch"]` 定数を追加
- `groups.load()` に予約グループ確保ロジックを追加（存在しなければ LocalStorage へ即時保存）

**削除・リネームのブロック**
- `groups.deleteGroup()` / `groups.renameGroup()` に `WF_RESERVED_GROUPS` チェックを追加（`false` 返却で中断）
- 削除・リネームボタンのイベントハンドラにもフロントエンド側チェックを追加してトースト表示

#### `static/js/i18n.js`

- `modelsGroupReserved` を英語・日本語・中国語で追加（「予約済みグループは削除・リネーム不可」のメッセージ）

---

## 2026-05-31: v0.3.21 — CivitAI ホスト設定・Sample サブタブ・URL 修正・ヘルプ i18n 整備

### 概要

CivitAI 連携に 3 つの改善を追加。モデルリンクを開くサイトを civitai.com / civitai.red から選択できる
ホスト設定を Settings タブに追加。CivitAI パネルを Info / Sample のサブタブに分割し、
サンプル画像を専用タブに移動。`modelId` が null のキャッシュエントリの URL を
`/model-versions/{versionId}` にフォールバックさせ、全 324 件の既存キャッシュも即時修正。
ヘルプを Batch tab / Text Size / RAW JSON などの新項目を含めて更新し、JA/ZH 翻訳の英語混じりも解消。

### 変更内容

#### `py/services/civitai_service.py`

**`_extract_info()` — `modelUrl` フォールバックを修正**
- 旧: `modelId` が null のとき `https://civitai.com/models?modelVersionId={id}`（モデル一覧ページに飛ぶ壊れた URL）
- 新: `https://civitai.com/model-versions/{versionId}` にフォールバック（モデルページへリダイレクト）

#### `static/js/models-tab.js`

**`renderCivitaiInfo()` — Info / Sample サブタブを追加**
- CivitAI パネルを「情報」「サンプル (N)」の 2 サブタブに分割
- Info タブ: モデル名リンク・Type/Base Model/Hash 詳細行・タグ・トリガーワード・説明・更新ボタン
- Sample タブ: 全サンプル画像（件数をタブ名に表示）。画像は別タブで開く

**`renderCivitaiInfo()` — URL 修正（クライアントサイド）**
- `info.modelId` がある場合: `https://{host}/models/{modelId}?modelVersionId={versionId}`
- `info.modelId` が null: `https://{host}/model-versions/{versionId}` にフォールバック
- `{host}` は `localStorage.getItem("wfm_civitai_host")` から取得（デフォルト `civitai.com`）

#### `static/js/settings-tab.js`

**CivitAI セクションにホスト選択を追加**
- CivitAI API Key アコーディオンの先頭に `wfm-select` ドロップダウンを追加
- 選択肢: `civitai.com（SFW のみ）` / `civitai.red（制限なし）`
- 変更で即座に `POST /api/wfm/settings` へ保存 + `localStorage.setItem("wfm_civitai_host", host)` を実行
- 設定タブ読み込み時に `civitai_host` を localStorage へ同期（他タブが追加 fetch 不要で参照できる）

#### `static/js/i18n.js`

**新規文字列（EN / JA / ZH）**
- `civitaiTabInfo` / `civitaiTabSample` / `civitaiNoImages`: サブタブ名・空メッセージ
- `civitaiHostSetting` / `civitaiHostHint` / `civitaiHostCom` / `civitaiHostRed` / `civitaiHostSaved`: ホスト設定
- `helpGen12` / `helpGen13` / `helpGen14`: Batch タブの 3 ペイン詳細
- `helpSettings11` / `helpSettings12` / `helpSettings13`: Text Size・RAW JSON Colors・CivitAI ホスト

**既存文字列を更新（JA / ZH）**
- `helpGen3`: 「4タブ → 5タブ（Batch 追加）」
- `helpGen11`: Batch トグルの説明に更新、Filter/Pause/Resume/Stop の英語混じりを解消

#### `static/js/app.js`

- `wfm-help-gen-12/13/14` → `helpGen12/13/14` のマッピングを追加
- `wfm-help-settings-11/12/13` → `helpSettings11/12/13` のマッピングを追加

#### `templates/index.html`

- `wfm-help-settings-13`（CivitAI ホスト）を Settings カードに追加

---

## 2026-05-31: v0.3.20 — CivitAI 詳細パネル強化（Type / Hash 表示・URL 修正・画像別タブ）

### 概要

Models タブのサイドパネル CivitAI タブを強化。Type・Base Model・Hash（BLAKE3/SHA256）の詳細行を追加し、
サンプル画像をクリックで別タブ表示できるようにした。バッチ POST API の `model.id` 欠落による
モデルページ URL の壊れを修正。CivitAI タブの 3 状態 UI と再描画タイミングも改善。

### 変更内容

#### `py/services/civitai_service.py`

**`_extract_info()` — `fileHashes` フィールドを追加**
- プライマリファイルの `hashes` オブジェクト（BLAKE3 / SHA256 / AutoV2 等）を `fileHashes` として保存
- 新規取得・更新後はサイドパネルで各ハッシュ値を表示できる

**`_extract_info()` — `modelId` フォールバックを追加**
- バッチ POST API（`POST /model-versions/by-hash`）はレスポンスの `model` オブジェクト内に `id` を含まない場合がある
- `model.get("id") or data.get("modelId")` でトップレベルの `modelId` をフォールバックとして使用
- これにより `modelUrl` が `https://civitai.com/models?modelVersionId=XXXX`（モデル一覧ページ）になる問題を修正

#### `static/js/models-tab.js`

**`renderCivitaiInfo()` — 詳細行を追加**

| 追加要素 | 内容 |
|---|---|
| Type | `info.type` を大文字バッジで表示（"CHECKPOINT"、"LORA" 等）|
| Base Model | `info.baseModel` をラベル付き行で表示（旧サブタイトルから分離）|
| Hash | BLAKE3 優先・SHA256 フォールバック。先頭 16 文字を表示、クリックでフルハッシュをクリップボードコピー |

- ローカルメタデータの `sha256`（既存キャッシュでも利用可能）を SHA256 として自動補完
- 既存キャッシュで `modelUrl` が壊れている場合も `info.modelId` + `info.versionId` から URL を再構築（更新不要）
- サンプル画像を `<a target="_blank">` でラップ → クリックで原寸画像を別タブに表示
- モデル名サブタイトル行から `baseModel` を除去（Detail 行に移動）

**`renderSideCivitai()` — 3 状態 UI に変更**
- `sha256` なし → 「CivitAIから取得」ボタン（未確認）
- `sha256` あり・キャッシュなし → 「確認済みですが、CivitAIに見つかりませんでした。」＋「再確認する」ボタン
- キャッシュあり → CivitAI 情報を表示

**CivitAI タブ切り替え時の再描画**
- サイドパネルのタブ切り替えハンドラで CivitAI タブをクリックした際に `renderSideCivitai` を呼び出すよう追加
- バッチ取得後に状態が更新されていても、タブをクリックすれば必ず最新内容が表示される

#### `static/js/i18n.js`

新規文字列を追加（EN / JA / ZH）:
`civitaiType` / `civitaiBaseModel` / `civitaiHashLabel` / `civitaiCopyHash` / `civitaiHashCopied` / `civitaiOpenImage`

---

## 2026-05-31: v0.3.19 — CivitAI 連携強化（バッチ高速化・リトライ・APIキー・フィールド拡充）

### 概要

CivitAI API との連携を全面的に改善。バッチ取得を `POST /model-versions/by-hash` 一括リクエストに変更して大幅に高速化。
429/5xx エラーへの指数バックオフリトライを追加。APIキーをオプション対応し設定UIとエクスポート除外を実装。
取得フィールドを `nsfwLevel`・`air`・`stats`・`updatedAt` 等に拡充。

### 変更内容

#### `py/services/civitai_service.py` — 全面改修

**バッチ高速化 (POST 一括取得)**
- `_batch_fetch_post(sha256_hashes)` を新設 — `POST /model-versions/by-hash` で最大 100 件を 1 リクエストで取得
  - レスポンスの `files[].hashes.SHA256` でリクエストのハッシュと照合してキャッシュに保存
  - 100 件超は `_BATCH_CHUNK_SIZE = 100` 単位でチャンク処理
- `batch_fetch()` を 2 フェーズ構成に変更
  - **Phase 1 (hashing)**: 全モデルの SHA256 を計算。キャッシュ済みはここでスキップ
  - **Phase 2 (fetching)**: 未キャッシュ分をまとめて `_batch_fetch_post()` に投げる
  - 以前の 1 件ずつ GET + 0.5 秒ウェイト方式を廃止 → 100 モデルで約 50 秒→数秒に短縮

**429/5xx 指数バックオフリトライ**
- `fetch_by_hash()` および `_batch_fetch_post()` 両方に実装
- 対象コード: `{429, 500, 502, 503, 504}`。1s → 2s → 4s、最大 3 回
- 404 はリトライせず即 `None` を返す（従来通り）

**APIキー対応**
- `_get_api_key()` を新設 — 環境変数 `CIVITAI_API_KEY` を優先し、なければ `settings.json` の `civitai_api_key` にフォールバック
- `_build_headers()` を新設 — APIキーがあれば `Authorization: Bearer ...` ヘッダーを付与

**ハッシュの大文字/小文字統一**
- キャッシュキー: 小文字 `sha256_lower`
- API 送信 (GET URL パス・POST ボディ): `sha256.upper()`
- `get_cached()` も `.lower()` を適用してキー不一致を防止

**`_extract_info()` 拡張**
| 追加フィールド | 内容 |
|---|---|
| `nsfwLevel` | 数値 NSFW レベル（0〜6）|
| `air` | AIR 識別子 (`urn:air:sdxl:lora:civitai:xxx@yyy`) |
| `stats` | `downloadCount` / `thumbsUpCount` / `thumbsDownCount` |
| `updatedAt` | バージョン最終更新日時 |
| `publishedAt` | バージョン公開日時 |
| `imageDetails` | 画像の `url`・`width`・`height`・`nsfwLevel` を含む配列 |
| `fileMeta` | プライマリファイルの `fp`・`size`・`format` |

- `images` URLリストは後方互換のため維持

#### `py/routes/settings_routes.py`

- `_SETTINGS_EXPORT_EXCLUDE = {"civitai_api_key"}` を定義
- `_build_export_bundle()` でエクスポート時に `settings.json` から除外キーをフィルタリング — APIキーが誤って他人に渡るリスクを排除

#### `static/js/settings-tab.js`

- Ollama 設定セクションの直後に **CivitAI API Key** セクションを追加
  - `type="password"` 入力フィールド（`wfm-settings-civitai-api-key`）
  - 保存ボタン → `saveServerSettings({ civitai_api_key })` を呼び `settings.json` に保存

#### `static/js/i18n.js`

- `civitaiApiKeySetting` / `civitaiApiKeyHint` / `civitaiApiKeyPlaceholder` / `civitaiApiKeySave` / `civitaiApiKeySaved` を EN・JA・ZH の 3 言語に追加

#### `static/js/models-tab.js`

- バッチ完了 `done` イベント処理で `data.hashes`（`{モデル名: sha256}`）を直接 `state.modelMetadata` に適用
  - `fetchModelMetadata()` の結果に sha256 が含まれない場合のタイミング問題によるサイドパネル CivitAI タブ表示バグを修正

---

## 2026-05-31: v0.3.18 — Batch タブ追加・Models 複数選択強化

### 概要

GenerateUI タブに **Batch** サブタブを追加。チェックポイントの一括生成キューを 3 ペインで組み立てられる専用 UI を実装。
Models タブの複数選択バルクアクションバーにお気に入り・バッジ操作・Deselect All を追加。

### 変更内容

#### `templates/index.html`

- **GenerateUI サブタブナビ** に `<button data-subtab="batch">Batch</button>` を追加（5 タブ目）
- **`#wfm-gen-subtab-batch`** コンテンツを追加（3 ペインレイアウト）
  - 左ペイン (`.wfm-batch-left`): `wfm-ckpt-search` 検索入力 + `wfm-ckpt-list` フォルダツリー + All/None ボタン
  - 中央ペイン (`.wfm-batch-center`): 内部タブナビ（Checkpoint / Lora / Prompt / Workflow）+ Checkpoint タブにグループリスト `#wfm-batch-group-list`; Lora/Prompt/Workflow は "Coming soon" プレースホルダー
  - 右ペイン (`.wfm-batch-right`): Batch Queue (`#wfm-batch-preview-count` + `#wfm-batch-preview-list`)
- **Checkpoint Batch Panel** の `body` を簡略化
  - 削除: `wfm-ckpt-dropdown-wrap`（フォルダツリー全体）・`wfm-ckpt-batch-info`
  - 残す: 有効/無効チェックボックスとプログレス表示（`wfm-ckpt-batch-progress`）のみ
- ヘルプ更新
  - `wfm-help-gen-3`: 「4-tab」→「5-tab」、Batch タブを追記
  - `wfm-help-gen-11`: Checkpoint Batch をパネルのトグル説明のみに簡略化
  - `wfm-help-gen-12〜14`: Batch タブ 3 ペインの説明を新規追加
  - `wfm-help-models-11`: バルクアクションの全ボタン（Deselect All / ★ / ☆ / グループ / +Badge / −Badge / Delete）を網羅した説明に更新

#### `static/js/generate-tab.js`

**状態管理の刷新**

- `_batchGroupState` の `selectedModels: Set<modelName>` を廃止
  - 旧: グループ選択時にメンバーをフラットな Set に追加 → グループのメンバー変更が反映されない
  - 新: `selectedGroups: Set<groupName>` + `partialSelections: { groupName: Set<modelName> }` に変更
- **`_getSelectedGroupModels()`** 追加 — `_batchGroupState.groups` から常に最新のメンバーを解決して返す; グループのメンバーが変わっても自動反映
- **`_getGroupSelCount(name)`** 追加 — グループの選択済みモデル数を返す（ヘッダー CB のカウント表示用）
- **`_getSelectedCheckpoints()`** 更新 — 左ペイン選択 + `_getSelectedGroupModels()` を統合（重複排除）

**Batch タブ初期化**

- **`_loadBatchCheckpointGroups()`** — `/api/wfm/models/groups?type=checkpoint` でグループを取得; 削除されたグループを `selectedGroups` / `partialSelections` からクリーンアップ; 完了後 `_renderBatchGroupList()` と `_renderBatchPreview()` を呼ぶ
- **`_renderBatchGroupList()`** — グループリストを DOM 生成
  - グループヘッダー CB: `selectedGroups` に昇格/降格ロジック付き
  - 個別メンバー CB: グループ全体選択中に1つ外すと自動的に `partialSelections` に移行; 全員選択になると `selectedGroups` に昇格; 空になると `partialSelections` エントリ削除
- **`initBatchTab()`** — 内部タブ切り替え・左ペイン検索 / All / None・Batch タブ表示時の `_loadBatchCheckpointGroups()` 呼び出しを登録
- **`_renderBatchPreview()`** 追加 — Batch Queue 右ペインを更新（件数 + ファイル名リスト）

**既存コード整理**

- `_updateDropdownLabel()` / `_updateBatchInfo()` を削除 → `_renderBatchPreview()` に統一
- `initCheckpointBatch()` からドロップダウン開閉ロジック（`wfm-ckpt-dropdown-*` 関連）を削除; Pause/Resume ハンドラのみ残す
- `moveRawJsonToTab()`: `"feeder"` に加えて `"batch"` も Raw JSON 非表示対象に追加
- 初期選択状態を `_ckptState = { mode: "none" }` に変更（デフォルト全チェックなし）

#### `static/js/models-tab.js`

**新規関数**

- **`bulkSetFavorite(isFav)`** — 選択中モデルのお気に入りを一括設定（既に同状態のモデルはスキップ）
- **`bulkApplyBadge(badgeLabel, add)`** — 選択中モデルに指定バッジを一括追加 / 削除（重複・不在はスキップ）

**`renderBulkActionBar()` 更新**

- `Deselect All` ボタンを件数表示直後に追加（`clearSelection()` 呼び出し）
- `★ Favorite` / `☆ Unfavorite` ボタンを追加（グループ操作の前）
- バッジセレクト (`wfm-bulk-badge-select`) + `+Badge` / `−Badge` ボタンを追加（バッジ未定義時は disabled）

#### `static/js/i18n.js`

EN / JA / ZH 全言語に以下を追加:
- `modelBulkDeselectAll` — Deselect All / 選択解除 / 取消全选
- `modelBulkFavAdd` / `modelBulkFavRemove` — ★ Favorite / ☆ Unfavorite
- `modelBulkFavDone` / `modelBulkUnfavDone` — 完了トースト
- `modelBulkBadgeApply` / `modelBulkBadgeRemove` — +Badge / −Badge ボタンラベル
- `modelBulkBadgeApplyDone` / `modelBulkBadgeRemoveDone` — 完了トースト
- `modelBulkNoBadge` — バッジ未選択プレースホルダー

#### `static/css/main.css`

`.wfm-batch-*` スタイル一式を追加（Feeder タブの直前）:
- `.wfm-batch-layout` — flex 3 ペインレイアウト
- `.wfm-batch-pane` / `.wfm-batch-left` / `.wfm-batch-center` / `.wfm-batch-right` — ペイン幅・ボーダー
- `.wfm-batch-pane-header` / `.wfm-batch-toolbar` / `.wfm-batch-list` — 左ペイン構造
- `.wfm-batch-inner-tab-nav` / `.wfm-batch-inner-tab` / `.wfm-batch-inner-content` — 中央ペイン内部タブ
- `.wfm-batch-group-list` / `.wfm-batch-group-item` / `.wfm-batch-group-header` / `.wfm-batch-group-name` / `.wfm-batch-group-count` / `.wfm-batch-group-members` — グループリスト
- `.wfm-batch-count` / `.wfm-batch-preview-list` / `.wfm-batch-preview-item` — 右ペイン（Batch Queue）

#### `README.md`

- バージョンバッジを `0.3.17` → `0.3.18` に更新
- GenerateUI Tab: "4-tab" → "5-tab"、Checkpoint Batch の説明を簡略化、Batch タブの説明を追加
- Models Tab: bulk operations の説明を全ボタン網羅に更新
- Changelog に `v0.3.18` エントリを追加

---

## 2026-05-31: v0.3.17 patch — SSLコンテキスト セキュリティ強化

### 概要

v0.3.17 のSSL修正で `CERT_NONE`（SSL検証無効）フォールバックがあり、MitM攻撃への脆弱性が指摘された。セキュリティレビューを経て当該フォールバックを削除し、SSL検証が常に維持されるよう修正。

### 変更内容

#### `py/services/civitai_service.py`

- **`_make_ssl_context()`** のフォールバックロジックを変更
  - 変更前: 3段目フォールバックとして `ctx.verify_mode = ssl.CERT_NONE`（SSL検証無効）を設定していた
  - 変更後: `CERT_NONE` を削除。certifi・システムSSLの両方が失敗した場合は `None` を返し、`urlopen(context=None)` でPythonデフォルトのSSL検証（`ssl.create_default_context()` 相当）にフォールバック。SSL検証が無効になるパスを完全に排除

---

## 2026-05-30: v0.3.17 — SSL証明書エラー修正・Lora Manager対応

### 概要

2つのバグ修正。CivitAI APIへのリクエストでSSL証明書の検証エラーが発生する問題（Windows Portable Python環境で再現）の修正と、ComfyUI-Lora-ManagerのLoRAローダーノードをGenerateUIタブで正しく変換・生成できるよう対応。

### 変更内容

#### `py/services/civitai_service.py`

- **`_make_ssl_context()`** ヘルパー関数を追加
  1. `certifi` がインストールされていればそのCA束を使用
  2. `certifi` がなければシステムデフォルトのSSLコンテキストを使用
  3. いずれも失敗した場合（Windows Portable Python等でCA束が壊れている環境）は `CERT_NONE` でフォールバック（ログ警告を出力）
- **`_get_ssl_context()`** — モジュールレベルでSSLコンテキストを1回だけ生成してキャッシュ
- `fetch_by_hash()` および `download_image()` の `urlopen` 呼び出しに `context=_get_ssl_context()` を追加
- 修正対象エラー: `SSL: CERTIFICATE_VERIFY_FAILED certificate verify failed: certificate has expired`

#### `static/js/comfyui-workflow.js`

- **`convertUiToApi()`** — Lora Loader (LoraManager) ノードの特殊ウィジェットマッピングを追加
  - ノードの `properties.__lm_widget_ids`（LoRA Managerが設定するウィジェット識別子配列）が存在する場合、`widgets_values` をその配列のインデックスで直接マッピング
  - `loras` キーの値（UI形式: 配列 `[...]`）をAPI形式 `{"__value__": [...]}` にラップして出力
  - 修正前は `object_info` ベースのウィジェットマッピングが LoRA Manager の独自型（非 INT/FLOAT/STRING/BOOLEAN/COMBO）を認識できずスキップされていた

---

## 2026-05-20: v0.3.16 — CivitAIプレビューフォールバック表示

### 概要

CivitAI情報を取得済みのモデルで、ローカルのプレビューファイルがない場合（バックエンドのダウンロード失敗時など）でも、CivitAIキャッシュの`images[0]`をブラウザが直接表示するフォールバックを追加。

### 変更内容

#### `static/js/models-tab.js`

- **`loadPreviewImage()`** — `onerror` ハンドラーを拡張
  - APIプレビューが404の場合、`state.modelMetadata[modelName].sha256` → `state.civitaiCache[sha256].images[0]` を参照してブラウザから直接表示
  - CivitAI画像URLも取得できない場合のみ「プレビューなし」プレースホルダーを表示
- **`fetchCivitaiForModel()`** — `preview_saved` に依存せず常に更新
  - CivitAI情報取得成功時は `preview_saved` の値に関わらずサイドパネルと `renderModelGrid()` を更新
  - ローカル保存なし（`preview_saved: false`）の場合もサイドパネルに `civitai.images[0]` を直接セット

---

## 2026-05-20: v0.3.15 — サンプルワークフロー同梱・CivitAI自動プレビュー・Create Tagsオプション

### 概要

3つの機能追加。サンプルワークフローをパッケージに同梱、CivitAI情報取得時のプレビュー自動保存、AI TOOLタブのTOOLSペインにタグ作成タスクを追加。

### 変更内容

#### `workflows/`（新規）

- SD1.5・SDXL・DWPose・Face Detailer・Image Editing の 13 ワークフロー（JSON + PNG サムネイル）を追加
- Git 追跡対象に追加し、`comfy node publish` 時にパッケージへ同梱される

#### `py/services/civitai_service.py`

- **`download_image(url, save_path, timeout=15)`** 静的メソッドを追加
  - `urlopen` で画像バイナリを取得し `save_path` に保存。失敗時は `False` を返しログ出力

#### `py/routes/models_routes.py`

- **`handle_civitai_fetch`**（個別取得）: CivitAI 情報取得成功後、`find_preview_image` でプレビューの有無を確認し、なければ `images[0]` を `{model_stem}.preview.png` として自動ダウンロード。レスポンスに `preview_saved: true/false` を追加
- **`handle_civitai_batch`**（一括取得）: バッチ完了後、CivitAI 情報があってプレビューのない各モデルに対して同様の自動ダウンロードを実行。サマリーに `preview_saved` 件数を追加

#### `static/js/models-tab.js`

- 個別取得成功時: `data.preview_saved` が `true` の場合、サイドパネルのプレビュー画像を即時更新（`&t=` キャッシュバスター付き URL を再セット）し `renderModelGrid()` を呼び出してカードを更新
- 一括取得完了時: `done` イベントのトーストに `+N preview` を付記（`preview_saved > 0` の場合のみ）

#### `static/js/ai-tab.js`

- **`VLM_PROMPTS`** に `tags` キーを追加:
  `"Generate a list of descriptive tags for this image. Output only comma-separated tags in English, nothing else."`

#### `templates/index.html`

- SPA AI TOOL タブの `#wfm-ai-vlm-task` に `<option value="tags">Create tags</option>` を追加

#### `web/comfyui/node_sets_menu.js`

- Library A タブの `#wfm-nlp-ai-vlm-task` に `<option value="tags">Create tags</option>` を追加
- ローカルの `VLM_PROMPTS` に `tags` キーを追加

#### `static/js/i18n.js`

- `helpModels5` (EN/JA/ZH): 「プレビューなしモデルに自動ダウンロード」の説明を追記
- `helpAi3` (EN/JA/ZH): タスク一覧に「Create Tags / タグ作成 / 标签生成」を追加、ペイン名を「VLM サブタブ」→「TOOLS ペイン」に修正

#### `README.md`

- バージョンバッジを `0.3.14` → `0.3.15` に更新
- Sample Workflows セクションを追加（Installation と Usage の間）
- Models Tab Features: CivitAI 関連行にプレビュー自動保存の説明を追記
- AI TOOL Tab Features: TOOLS ペインのタスクに `Create Tags` を追加
- Changelog に `v0.3.15` エントリを追加

---

## 2026-05-20: AI TOOL タブ 英語化（SPA・Libraryパネル）

### 概要

SPA の AI TOOL タブおよびサイドパネル（Library）の AI タブで日本語固定になっていた静的ラベルをすべて英語に統一。他タブと同じ「英語固定の静的 HTML + JS 動的部分のみ `t()`」方式に揃えた。

### 変更内容

#### `templates/index.html`

- ペインヘッダー: `翻訳` → `Translation`、`設定` → `Settings`
- 言語 option: `日本語 / 英語 / 中国語` → `Japanese / English / Chinese`
- ボタン: `翻訳` → `Translate`、`コピー` → `Copy`、`実行` → `Run`、`接続テスト` → `Test connection`、`更新` → `Refresh`、`設定を保存` → `Save`
- タスク option: `画像の解説` → `Describe image`、`プロンプト作成` → `Create prompt`
- プレースホルダー・ラベル: `翻訳するテキストを入力...` → `Enter text to translate...`、`翻訳結果がここに表示されます...` → `Translation result...`、`実行結果がここに表示されます...` → `Result...` 等
- ドロップ説明: `PNG / JPG / WebP をドロップまたはクリック` → `Drop or click PNG / JPG / WebP`
- 設定ラベル: `バックエンド` → `Backend`、`接続設定` → `Connection`、`モデル選択` → `Model`、`Free 言語設定` → `Free language`、`入力言語` → `Source`、`翻訳言語` → `Target`

#### `web/comfyui/node_sets_menu.js`

- サブタブラベル: `翻訳` → `Translation`、**`VLM` → `TOOLS`**、`設定` → `Settings`
- HTML 内ラベル: SPA と同内容をすべて英語化
- JS 動的文字列: `翻訳中...` → `Translating...`、`接続中...` → `Connecting...`、`実行中...` → `Running...`、`設定を保存しました` → `Settings saved`、`コピーしました` → `Copied`、`モデルが見つかりません` → `No models found`、`画像をドロップしてください` → `Please drop an image` 等

---

## 2026-05-19: v0.3.14 — AI TOOL タブ 3ペイン化・RAW JSON 文字色カスタマイズ

### 概要

AI タブの UI を刷新し、サブタブ廃止・3 ペイン同時表示レイアウトへ移行。また Settings タブに RAW JSON シンタックスハイライトの文字色カスタマイズ機能を追加。

### 変更内容

#### `templates/index.html`

- タブボタンラベルを `"A"` → `"AI TOOL"` に変更
- `<section id="wfm-tab-ai">` をサブタブ構成から **3 ペインレイアウト** に刷新
  - サブタブナビ（翻訳 / VLM / 設定ボタン）を削除
  - `<div class="wfm-ai-pane wfm-ai-pane-translate">` — 翻訳ペイン（flex: 4）
  - `<div class="wfm-ai-pane-divider">` — 縦区切り線
  - `<div class="wfm-ai-pane wfm-ai-pane-tools">` — TOOLS ペイン（flex: 4、旧 VLM）
  - `<div class="wfm-ai-pane-divider">` — 縦区切り線
  - `<div class="wfm-ai-pane wfm-ai-pane-settings">` — 設定ペイン（flex: 2）
  - 各ペインに `<div class="wfm-ai-pane-header">` を追加（翻訳 / TOOLS / 設定）
- ヘルプタブ更新
  - `wfm-help-sidepanel-16`: 「AI TOOL tab: Translation and TOOLS (VLM) panes … 3-pane layout always visible」に変更
  - `wfm-help-ai-title`: "AI Tab (A)" → "AI TOOL Tab"
  - `wfm-help-ai-1`〜`5`: 3 ペインレイアウトの説明に書き直し（項目数 6→5）
  - `wfm-help-settings-12` 新規追加: RAW JSON Colors 設定の説明

#### `static/css/main.css`

- `#wfm-tab-ai` の `flex-direction` を `column` → `row` に変更
- サブタブ関連 CSS を削除: `.wfm-ai-subtab-nav`、`.wfm-ai-subtab-btn`（`.active` 含む）、`.wfm-ai-subtab-content`
- 3 ペイン用 CSS を追加:
  - `.wfm-ai-pane` — `display:flex; flex-direction:column; overflow:hidden; min-width:0`
  - `.wfm-ai-pane-translate { flex:4 }` / `.wfm-ai-pane-tools { flex:4 }` / `.wfm-ai-pane-settings { flex:2 }`
  - `.wfm-ai-pane-header` — ペイン見出し（uppercase、border-bottom）
  - `.wfm-ai-pane-divider` — 幅 1px の縦区切り線

#### `static/js/ai-tab.js`

- `initSubTabs()` 関数を削除（サブタブ切り替えロジック全体）
- `initAiTab()` から `initSubTabs()` の呼び出しを削除
- `initTranslateTab()`・`initVlmTab()`・`initSettingsTab()` はそのまま維持

#### `static/js/i18n.js`

- `tabAi` を `"A"` → `"AI TOOL"` に EN/JA/ZH 全言語で変更（`replace_all` で 3 箇所一括）

#### `static/js/settings-tab.js`

- **`JSON_COLOR_STYLE_ID`** 定数を追加 (`"wfm-json-color-style"`)
- **`JSON_COLOR_DEFS`** 配列を追加（6 色定義: base / yellow / pink / green / cyan / red）
  - 各要素: `{ id, label: () => t(key) || fallback, def: "#xxxxxx" }`
- **`export function applyJsonColors(colors)`** を追加
  - `<style id="wfm-json-color-style">` を動的生成・更新
  - `.wfm-json-highlight`・`.json-key-*`・`.json-val-*` の 6 クラスを上書き
  - `colors` が `undefined` のときはすべてデフォルト値を使用
- 設定 HTML テンプレートに `<!-- RAW JSON Colors -->` セクションを追加
  - `<details>` アコーディオン、`<div id="wfm-json-color-grid">` に 6 個のカラーピッカー
  - `<button id="wfm-json-color-reset">` でデフォルト復元
- イベントハンドラを追加
  - `#wfm-json-color-grid` の `input` イベント: 色変更を即時反映 + `jsonColors` キーとして localStorage 保存
  - `#wfm-json-color-reset` の `click` イベント: `jsonColors` キー削除・UI リセット・`applyJsonColors(undefined)` 呼び出し

#### `static/js/app.js`

- `import` に `applyJsonColors` を追加
- 起動時ブロックに `applyJsonColors(_s.jsonColors)` を追加（テーマ・フォントサイズと同様に DOMContentLoaded 前に適用）

---

## 2026-05-19: v0.3.13 — AI タブ（A）追加

### 概要

SPA および Workflow Studio Library サイドパネルの両方に AI タブ（A）を追加。Ollama・LM Studio をバックエンドとして翻訳・VLM（画像解析）機能を提供する。設定は `localStorage` 経由で両インターフェース間で共有。

### 変更内容

#### `templates/index.html`

- タブバーに `<button class="wfm-tab" data-tab="ai">A</button>` を右端に追加
- `<section id="wfm-tab-ai">` を新規追加（3 サブタブ構成）
  - **翻訳サブタブ** (`wfm-ai-subtab-translate`): 入力テキストエリア・言語セレクター（日/英/中/Free）・⇄ 入替ボタン・翻訳ボタン・出力テキストエリア・コピーボタン・ステータス表示
  - **VLM サブタブ** (`wfm-ai-subtab-vlm`): ドロップゾーン（110px）・タスクドロップダウン（画像の解説/プロンプト作成）・実行ボタン・結果エリア・コピーボタン
  - **設定サブタブ** (`wfm-ai-subtab-settings`): バックエンド選択ラジオ・API URL 入力・接続テストボタン・モデル選択＋更新ボタン・Free 言語入力（入力/出力）・保存ボタン
- ヘルプタブにAI タブ説明カード追加、Sidepanel カードに `wfm-help-sidepanel-16` を追加

#### `static/js/ai-tab.js`（新規）

- `import { showToast } from "./app.js"` / `import { t } from "./i18n.js"`
- **定数**: `SETTINGS_KEY = "wfm_ai_settings"`、`LANG_NAMES`、`VLM_PROMPTS`（describe / prompt）
- **`isValidBackendUrl(url)`**: `new URL()` で `http:` / `https:` スキームのみ許可
- **`fileToBase64(file)`**: FileReader → `{ base64, mimeType }`
- **`callVLM()`**: Ollama は `images:[b64]`、LM Studio は `image_url` コンテンツブロック
- **`callLLM()`**: テキスト翻訳用 LLM 呼び出し（Ollama / LM Studio）
- **`fetchModels()`**: Ollama `/api/tags`、LM Studio `/v1/models` からモデル一覧取得
- **`buildTranslationPrompt()`**: Free 言語設定対応の翻訳プロンプト生成
- **`initSubTabs()`** / **`initTranslateTab()`** / **`initVlmTab()`** / **`initSettingsTab()`**
- すべての動的文字列を `t()` 経由で i18n 対応済み
- **`export function initAiTab()`**: 全 init 関数のエントリポイント

#### `static/js/app.js`

- `import { initAiTab } from "./ai-tab.js"` を追加
- `DOMContentLoaded` 内に `initAiTab()` を追加
- `tabMap` に `ai: "tabAi"` を追加
- `applyI18nToHtml()` に AI タブの全要素 id マッピングを追加
  - サブタブボタン、言語セレクター option、placeholder、ボタンテキスト、セクションタイトル、ラベル
  - ヘルプタブ新規 id（`wfm-help-sidepanel-16`、`wfm-help-ai-title`、`wfm-help-ai-1`〜`6`）

#### `static/js/i18n.js`

- `tabAi: "A"` を EN/JA/ZH に追加（タブボタンラベル）
- AI タブ全キーブロックを EN/JA/ZH に追加（計 3 言語 × 約 40 キー）
  - サブタブ名、言語オプション、placeholder、ボタンテキスト、ステータス文字列、トースト文字列
  - `aiToastNoText`、`aiToastNoModel`、`aiToastInvalidUrl`、`aiToastInvalidUrlInput`
  - `aiStatusTranslating`、`aiStatusRunning`、`aiStatusDone`、`aiStatusConnecting`、`aiStatusConnectOk`、`aiStatusConnectFail`
  - `aiToastTransFailed`、`aiToastNoCopyText`、`aiToastCopied`、`aiToastNoModels`、`aiToastModelsFailed`
  - `aiToastSettingsSaved`、`aiToastNoImage`、`aiToastVlmFailed`、`aiModels`
  - ヘルプキー: `helpSidepanel16`、`helpAiTitle`、`helpAi1`〜`helpAi6`
- `ollamaSettings` を EN/JA/ZH で "（プロンプトタブ）" サフィックス付きに改名

#### `static/css/main.css`

- AI サブタブナビ: `.wfm-ai-subtab-nav`、`.wfm-ai-subtab-btn`（`.active` 状態含む）、`.wfm-ai-subtab-content`
- 翻訳タブ: `.wfm-ai-trans-container`、`.wfm-ai-trans-lang-row`、`.wfm-ai-lang-select`、`.wfm-ai-swap-btn`、`.wfm-ai-trans-textarea`、`.wfm-ai-trans-output`、`.wfm-ai-trans-actions`、`.wfm-ai-trans-status`
- ステータス色: `.wfm-ai-status-working`（amber）、`.wfm-ai-status-ok`（green）、`.wfm-ai-status-error`（red）
- VLM タブ: `.wfm-ai-vlm-container`、`.wfm-ai-vlm-drop`（height: 110px、破線ボーダー、I タブと統一）、`.wfm-ai-vlm-label`、`.wfm-ai-vlm-preview`、`.wfm-ai-vlm-task-row`、`.wfm-ai-vlm-result`、`.wfm-ai-vlm-copy-btn`
- 設定タブ: `.wfm-ai-settings-*` 各セクション

#### `web/comfyui/node_sets_menu.js`

- `state` に `aiSubTab: "ai-translate"` を追加
- トップタブバーに `data-toptab="ai"` の A ボタンを I タブの右に追加
- `rebuildSubTabs()`: AI ケースを追加（翻訳/VLM/設定 サブタブ）
- `renderContent()`: `topTab === "ai"` 分岐を追加、検索バー非表示、`renderAiTab()` を呼び出し
- 追加関数:
  - `isValidAiUrl()`: URL セキュリティ検証
  - `loadAiCfg()` / `saveAiCfg()`: `localStorage` への設定読み書き（SPA と共有）
  - `aiFileToBase64()` / `aiCallVLM()` / `aiCallLLM()` / `aiFetchModels()`: バックエンド API ラッパー
  - `renderAiTab(container)`: 初回のみ HTML を構築し `setupAiHandlers()` を呼び出す
  - `renderAiSubContent()`: サブタブに応じてペインを表示切替
  - `setupAiHandlers(container)`: 翻訳・VLM・設定の全イベントハンドラ
- `injectStyles()`: AI タブ CSS を追加（VLM ドロップゾーン高さ 110px を含む）

#### `docs/6_ws_library.png`

- A タブ追加後の Library パネルスクリーンショットに更新

#### `README.md`

- バージョンバッジを `0.3.13` に更新
- Features に **AI Tab (A)** セクションを追加
- Workflow Studio Library のタブ説明を `W/N/P/M/I` → `W/N/P/M/I/A` に更新、A タブ説明を追加
- Requirements — Optional に LM Studio を追記
- Project Structure に `ai-tab.js` を追加
- Changelog に v0.3.13 エントリを追加

---

## 2026-05-18: v0.3.12 リリース — README スクリーンショット刷新 / workflow_analyzer 拡張

### 概要

- README Screenshots を旧タブ別画像（12枚）から機能特徴別の新画像（8枚）に刷新
- `workflow_analyzer.py` に CLIPLoader type フィールド対応・新モデル種別検出を追加（NewBie / Ovis / HiDream / Wan / Cosmos / Lumina 等）

### 変更内容

#### `README.md`

- バージョンバッジを `0.3.12` に更新
- Screenshots セクションを全面刷新
  - 旧: `docs/screenshot_*.png` 参照の 6 テーブル（タブ別 12 枚）
  - 新: `docs/1_workflowtab.png`〜`docs/8_Customize.png` の機能特徴別 8 枚を 2 カラムグリッドで表示
  - キャプションはファイル名のプレフィックスを除いて整形（例: `1_workflowtab` → **Workflow Tab**）
- `v0.3.12` changelog エントリを新規追加（RAW JSON 検索 + workflow_analyzer 拡張）

#### `docs/`

- 旧スクリーンショット 11 枚（`screenshot_*.png`）を削除
- 新スクリーンショット 8 枚（`1_workflowtab.png`〜`8_Customize.png`）を追加

#### `py/services/workflow_analyzer.py`

**`_CLIP_TYPE_TO_MODEL` 追加**

- CLIPLoader の type 文字列（`"flux"`, `"hidream_i"`, `"wan"`, `"cosmos"` 等）→ モデル種別名のマッピング辞書

**`_clip_type_from_ui_node(node)` 追加**

- UI フォーマットノードの `widgets_values` から CLIPLoader / DualCLIPLoader / TripleCLIPLoader の type 文字列を取得

**`_collect_all_ui_nodes(workflow_data)` 追加**

- `nodes[]` だけでなく `definitions.subgraphs[].nodes[]` も走査するジェネレータ
- サブグラフ内のローダーノードも model_type 検出の対象になった

**`_detect_model_type_from_name(mn_base, model_types)` 追加**

- モデルファイル名から種別を判定するヘルパー関数に切り出し（従来はインライン記述）
- 追加対応: NewBie / Ovis / HiDream / Wan（`wan-N` / `wan-video` パターン）

**`analyze_workflow()` 改修**

- ファイル名検出に NewBie / Ovis / HiDream / Wan を追加
- `UnetLoaderGGUF` 等を含む `UnetLoader` 系を一括マッチ (`"UnetLoader" in ntype`)
- CLIPLoader 系ノードで `clip_type` → `_CLIP_TYPE_TO_MODEL` → モデル種別を検出
- `_model_name_from_api_node` に `clip_name1` / `clip_name` を追加（CLIPLoader の API フォーマット対応）
- node_iter のタプルに `clip_type` を追加（`(ntype, title, mn, clip_type)`）
- タイトル検出に HiDream / Ovis / NewBie を追加

---

## 2026-05-17: RAW JSON パネルに検索機能を追加

### 概要

生成 UI タブの RAW JSON パネルに VSCode 風の検索バーを追加。常時表示で、マッチ間ナビゲーションとクリアボタンを備える。

### 変更内容

#### `templates/index.html`

- `#wfm-gen-rawjson-widget` 内にヘッダーとエディターの間で `.wfm-rawjson-search` バーを追加
  - 検索入力 (`#wfm-gen-raw-search`)
  - マッチ数表示 (`#wfm-gen-raw-search-count`、例: `3/12`)
  - 前へ ↑ / 次へ ↓ ボタン
  - ✕ クリアボタン
- JSON コンテナ内に検索ハイライト専用オーバーレイ `<pre id="wfm-gen-raw-json-search-overlay">` を追加（シンタックスハイライト層と textarea 層の間）

#### `static/css/main.css`

- `.wfm-rawjson-search` — 検索バー全体のレイアウト
- `.wfm-rawjson-search-input` — 検索入力フィールド（フォーカス時 accent カラーのボーダー）
- `.wfm-rawjson-search-count` — マッチ数表示（min-width: 56px、中央揃え）
- `.wfm-rawjson-search-btn` / `.wfm-rawjson-search-clear` — ナビ・クリアボタン
- `.wfm-json-search-overlay` — 文字色を透明にし `<mark>` の背景のみを表示するオーバーレイ
  - `.wfm-search-match` — 通常マッチ: 黄色半透明
  - `.wfm-search-current` — 現在マッチ: オレンジ強調 + アウトライン
- `.wfm-json-editor` の z-index を 2 → 3 に更新（オーバーレイが z-index: 2 を占有するため）

#### `static/js/generate-tab.js`

既存の「Raw JSON highlight sync on input/scroll」ブロックを拡張:

- `updateSearchOverlay()` — 検索語でテキストを走査し `matchPositions[]` を構築、オーバーレイ HTML を生成
  - マッチなし時: カウント欄を赤字で "No results" 表示
  - 現在マッチへ自動スクロール + テキストエリアのカーソルをマッチ位置に移動
- スクロール同期: エディター scroll イベントでオーバーレイの scrollTop/Left を追従
- エディター入力時: シンタックスハイライト更新と並行して検索オーバーレイも更新
- キーボード: Enter（次へ）/ Shift+Enter（前へ）/ Escape（クリア）対応

---

## 2026-05-17: v0.3.11 Metadata タブ対応ノードタイプ拡張 / Settings テキストサイズ UI 追加

### 概要

- `metadata-tab.js`（Metadata タブ本体）に `UnetLoaderGGUF` / `UNETLoaderGGUF` / `QuadrupleCLIPLoader` 対応を追加
  - `node_sets_menu.js` の I タブには v0.3.10 で追加済みだったが、Metadata タブには未反映だった
- Settings タブに「Text Size」セクションを追加 — プロンプト・チャット系の全テキストエリアのフォントサイズを一括変更するスライダー

### 変更内容

#### `static/js/metadata-tab.js`

**`extractDiffusionModels` 拡張**

- `UNETLoader` のみ → `UNETLoader` / `UnetLoaderGGUF` / `UNETLoaderGGUF` に拡張（Set を使った判定に変更）
- HiDream i1 Full GGUF など GGUF 形式の Diffusion Model が Metadata タブでも正しく読み取れるようになった

**`extractTextEncoders` 拡張**

- `QuadrupleCLIPLoader`（`clip_name1`〜`clip_name4`）を追加、LiteGraph 形式・API 形式の両方に対応
- HiDream の 4-CLIP（clip_l / clip_g / t5xxl / llama_3.1）が全件表示されるようになった

#### `static/js/settings-tab.js`

**`applyTextareaFontSize(size)` 追加（export）**

- `<style id="wfm-ta-font-size-style">` を `<head>` に注入
- 対象セレクタ（対象を 8 箇所に一括適用）:

  | 対象 | ID |
  |---|---|
  | Generate UI — Positive Prompt | `#wfm-prompt-pos-text` |
  | Generate UI — Negative Prompt | `#wfm-prompt-neg-text` |
  | Prompt タブ — AI Assistant チャット | `#wfm-ollama-input` |
  | Prompt タブ — Preset Positive | `#wfm-preset-pos` |
  | Prompt タブ — Preset Negative | `#wfm-preset-neg` |
  | Prompt タブ — Wildcard プロンプト | `#wfm-wc-prompt` |
  | Prompt タブ — Wildcard ファイルエディタ | `#wfm-wc-editor-content` |
  | Metadata タブ — PROMPT 全文プレビュー | `#wfm-meta-prompt-full` |

- 範囲: 10〜28px（clamp）、デフォルト 13px

**Settings タブ HTML「Text Size」セクション追加**

- Language Settings の下、Workflow Data Folder の上に新規 `<details>` セクション
- `<input type="range">` スライダー (min=10, max=28, step=1) + px 値表示
- スライダー操作でリアルタイム適用
- 「Save Settings」ボタンで `textareaFontSize` を localStorage に保存

#### `static/js/app.js`

- `applyTextareaFontSize` をインポート
- ページ読み込み直後（テーマ適用と同タイミング）に localStorage の保存値を読み込んで適用

#### `templates/index.html`

- `wfm-help-metadata-5`: 対応ローダーを明記（UNETLoader / UnetLoaderGGUF / UNETLoaderGGUF / CLIPLoader / DualCLIPLoader / TripleCLIPLoader / QuadrupleCLIPLoader）
- `wfm-help-settings-11` 新規追加: Text Size スライダーの説明

### 検証済みファイル

| ファイル | Metadata タブでの検出内容 |
|---|---|
| `n-hidream_i1_full.png` | Diffusion Model: `hidream-i1-full-Q5_0.gguf`（UnetLoaderGGUF）、Text Encoder: 4 件（QuadrupleCLIPLoader）、VAE: 1 件 |

---

## 2026-05-17: v0.3.10 Information タブ キャンバスドラッグ対応 / ノードタイプ拡張 / バグ修正

### 概要

- サイドパネル I タブ（model / lora / Prompts）からキャンバスへのドラッグ＆ドロップでノードを配置できるようにした
- Multiple LORA セクションの追加（全 LoRA を Lora Loader (LoraManager) に一括配置）
- `UnetLoaderGGUF` / `QuadrupleCLIPLoader` 対応（HiDream 等の GGUF / 4-CLIP ワークフロー）
- `CLIPLoader` のウィジェット名誤りを修正
- プレビューエリアの高さを固定し、モデル/プロンプトリストが潰れる問題を修正

### 変更内容

#### `web/comfyui/node_sets_menu.js`

**キャンバスドラッグ対応（新規）**

- `placeClipTextEncodeNode(text, pos)` 追加 — `CLIPTextEncode` ノードをテキスト入力済みで配置
- `placeLoraMgrNode(loras, pos)` 追加 — `Lora Loader (LoraManager)` ノードを全 LoRA データ付きで配置
- キャンバスドロップハンドラに新 MIME タイプを追加:
  - `application/x-wfm-lora-multi` → `placeLoraMgrNode`
  - `application/x-wfm-clip-text` → `placeClipTextEncodeNode`

**`renderInfoModels` 更新**

- 各セクションに `modelType`（`checkpoint` / `vae` / `unet` / `textencoder`）を追加
- アイテムを `draggable = true` に設定、`dragstart` で `application/x-wfm-model` を送信
- ダブルクリックで `placeModelNode` 呼び出し

**`renderInfoLoras` 更新**

- 各 LoRA アイテムを `draggable = true` に設定、`dragstart` で `application/x-wfm-model`（type: `"lora"`）を送信
- ダブルクリックで `placeModelNode` 呼び出し
- **Multiple LORA セクション追加** — LoRA が 1 件以上あれば下部に表示
  - `application/x-wfm-lora-multi` で全 LoRA データを転送
  - ダブルクリックで `placeLoraMgrNode` 呼び出し

**`renderInfoPrompts` 更新**

- 各プロンプトアイテムを `draggable = true` に設定、`dragstart` で `application/x-wfm-clip-text` を送信
- ダブルクリックで `placeClipTextEncodeNode` 呼び出し

**`_extractDiffusionModels` 更新**

- `UNETLoader` のみ → `UNETLoader` / `UnetLoaderGGUF` / `UNETLoaderGGUF` に拡張（GGUF 形式対応）

**`_extractTextEncoders` 更新**

- `QuadrupleCLIPLoader`（`clip_name1`〜`clip_name4`）を追加（HiDream 等 4-CLIP モデル対応）
- LiteGraph 形式・API 形式の両方に対応

**バグ修正: `MODEL_NODE_MAP` の `textencoder` ウィジェット名**

- `clip_name1`（DualCLIPLoader のウィジェット名）→ `clip_name`（CLIPLoader の正しいウィジェット名）に修正
- これにより Text Encoder ドラッグ時に正しいモデルファイル名が設定される

**プレビューエリア高さ固定**

- `.wfm-nlp-info-drop` を `min-height: 54px`（可変）→ `height: 110px`（固定）に変更
- 大きな画像ロード時にモデル/プロンプトリストが圧迫される問題を解消

**CSS 追加**

- `.wfm-nlp-info-item--draggable` — `cursor: grab`、ホバー背景、ドラッグ中 `opacity: 0.5`
- `.wfm-nlp-info-prompt-item` — `cursor: pointer` → `cursor: grab` に変更、`user-select: none` 追加

**ヘルプ更新**

- `index.html`: `wfm-help-sidepanel-13` 更新、`wfm-help-sidepanel-14` / `15` 新規追加
- `app.js`: i18n マッピングに `14` / `15` 追加
- `i18n.js`: EN / JA / ZH 3 言語すべてに `helpSidepanel13` 更新と `helpSidepanel14` / `15` 追加

### 対応確認済みワークフロー

| ファイル | 検出内容 |
|---|---|
| `non-hidream_i1_full.png` | Diffusion Model: `hidream-i1-full-Q5_0.gguf`（UnetLoaderGGUF）、Text Encoder: 4 件（QuadrupleCLIPLoader）、VAE: 1 件 |

---

## 2026-05-16: v0.3.9 サイドパネル I タブ追加 / トップバーアイコン修正

### 概要

- ComfyUI サイドパネルのタブを W / N / P / M / **I** の 5 タブ構成に変更し、I タブ（Information / Metadata）を追加
- トップバーアイコン（Workflow Studio / カメラ / Node Sets）が表示されない不具合を修正

### 変更内容

#### `web/comfyui/node_sets_menu.js`

**タブラベル短縮（□スタイル）**

- Workflows → **W**、Nodes → **N**、Prompts → **P**、Models → **M**
- ホバー時に `title` 属性でフルネームを表示
- CSS: 細ボーダー + アクティブ時に青ボーダーの□スタイル

**I タブ（Information / Metadata）追加**

- サブタブ: **model** / **lora** / **Prompts**
- ファイルドロップエリア（常時表示、クリックでファイル選択も可）
- ファイル情報行（ファイル名・サイズ・形式、常時表示）
- model: Checkpoint / VAE / Diffusion Model / Text Encoder（LoRA 除く）
- lora: LoRA 名 + strength_model / strength_clip 値
- Prompts: POS / NEG バッジ付きリスト → クリックで全文プレビュー（height: 160px）+ Copy ボタン（1.2 秒「Copied!」表示）
- メタデータ解析ロジックは `metadata-tab.js` から移植（関数名に `_` プレフィックス付き）
- ドロップエリア min-height: 54px、プレビューエリア height: 160px

#### `web/comfyui/top_menu_extension.js`

**バグ修正: トップバーアイコン非表示**

- **原因**: `applyButtonIcon()` 内の `if (button.querySelector("svg")) return` チェックにより、
  新しい ComfyUI が Iconify で MDI クラス（`icon-[mdi--...]`）をインライン SVG に変換した際、
  すでに SVG が存在すると判定されてカスタム SVG への置換がスキップされていた
- **修正**: 早期リターンチェックを削除し、常に `innerHTML` を上書きするよう変更
- MutationObserver ベースの監視を廃止し、lora-manager と同パターンの `requestAnimationFrame` リトライ方式に統一
  - ボタン未発見時のみリトライ（発見後はリトライを停止）

---

## 2026-05-16: v0.3.8 Metadata タブ: data9 対応 / プロンプト判別不能テキスト

### 概要

data9 の新規ワークフロー（Flux.2 Dev fp8、Flux.2 Klein 4B Distilled、Ernie Image、
Qwen-Image-Edit 2511、WAN2.2 14B Animate）の Metadata タブ表示に対応。
あわせて、ポジティブ / ネガティブの判別ができないプロンプトを **Text（バッジなし）** として
区別して表示する仕様に変更した。

### 問題と原因

| ファイル | 問題 |
|---|---|
| image_flux2_fp8.json | `SamplerCustomAdvanced` に positive/negative 入力ポートがなく、リンク解決でプロンプトが空になる |
| image_ernie_image.json | `PrimitiveStringMultiline` がサブグラフ内にあり、ステップ4（トップのみ対象）で見つからない |
| image_qwen_image_edit_2511.json | `TextEncodeQwenImageEditPlus` → `FluxKontextMultiReferenceLatentMethod` → KSampler という中間ノード経由で textMap にプロンプトが登録されない |
| video_wan2_2_14B_animate.json | トップレベルの CLIPTextEncode とサブグラフ内の KSampler がクロスレベル接続され、単一レベル解析では取得できない |

### 変更内容

#### `static/js/metadata-tab.js`

**`extractPromptsFromNodeSet`**

- CLIPTextEncode のテキスト入力リンクのソースノードのタイプ制限を撤廃
  - 旧: `isPromptStylerNode` または `WFS_PromptText` のみ
  - 新: PromptStyler 以外は任意ノードの `widgets_values[originSlot]`（`ComfySwitchNode`、`PrimitiveStringMultiline` 等を包含）
- テキスト入力名に `"prompt"` を追加（`TextEncodeQwenImageEditPlus` 対応）
- `foundSampler = true` かつ pos / neg が両方空の場合（`SamplerCustomAdvanced` 等）、
  textMap のテキストを `{ positives: [], negatives: [], texts: [...] }` として返すよう変更
  （旧: `return null`）

**`extractPromptsLiteGraph`**

- ステップ4 `PrimitiveStringMultiline` — `nodes`（トップのみ）→ `collectAllNodes(wf)`（サブグラフ含む）に変更
  - 戻り値: `{ positives: primTexts, negatives: [] }` → `{ positives: [], negatives: [], texts: primTexts }`
- ステップ7 最終フォールバック — `nodes`（トップのみ）→ `collectAllNodes(wf)`（サブグラフ含む）に変更
  - 戻り値: `{ positives: all, negatives: all }` → `{ positives: [], negatives: [], texts: all }`

**`extractPromptsAPI`**

- フォールバック時の戻り値: `{ positives: all, negatives: all }` → `{ positives: [], negatives: [], texts: all }`

**UI**

- `buildPromptItem`: `type === "text"` のときバッジ（POS/NEG）を表示しない
- `buildPromptItem`: fullLabel に `t("metaPromptText")` を使用
- `handleFile`: `(meta.texts ?? []).map(p => ({ type: "text", text: p }))` を allPrompts に追加

#### `static/js/i18n.js`

- `metaPromptText` を EN / JA / ZH に追加（"Text" / "テキスト" / "文本"）

### 対応済みワークフロー（data/data9）

| ファイル | 適用ステップ | プロンプト結果 |
|---|---|---|
| image_flux2_fp8.json | step5（サブグラフ + SamplerCustomAdvanced fallback） | texts（バッジなし） |
| image_flux2_klein_image_edit_4b_distilled.json | step5（サブグラフ CLIPTextEncode + KSampler） | texts（バッジなし） |
| image_ernie_image.json | step4（PrimitiveStringMultiline in subgraph） | texts（バッジなし） |
| image_qwen_image_edit_2511.json | step5（TextEncodeQwenImageEditPlus fallback） | texts（バッジなし） |
| video_wan2_2_14B_animate.json | step7（全ノード fallback） | texts（バッジなし） |

---

## 2026-05-15: v0.3.7 Metadata タブ: Flux2 / Qwen / Z-Image 対応

### 概要

ComfyUI 公式テンプレート（Flux.2 Dev/Klein、Qwen-Image-Edit、Z-Image）で使われる
**サブグラフ（subgraph）形式**ワークフローの Metadata タブ読み込みに対応。

- `definitions.subgraphs` 内の `UNETLoader` / `CLIPLoader` / `VAELoader` / `LoraLoaderModelOnly` からモデルを抽出
- `MarkdownNote` ノードの `**section** → - [model](url)` パターンからモデルを補完（フォールバック）
- サブグラフ内の `CLIPTextEncode + KSampler` リンクを辿ってプロンプトを取得
- `PrimitiveStringMultiline` ノード（flux2-klein など）からプロンプトを取得

### 変更内容

#### `static/js/metadata-tab.js`

- **`extractPromptsFromNodeSet(nodes, links)`** 新規追加
  CLIPTextEncode + KSampler によるプロンプト抽出ロジックを汎用化。トップレベル・サブグラフの両方で再利用
- **`extractMarkdownNoteModels(wf)`** 新規追加
  `MarkdownNote` の `**section**` → `- [name](url)` を正規表現で解析し、text_encoders / diffusion_models / vae / loras を抽出
- **`extractCheckpoints` / `extractVAEs`** を `collectAllNodes()` 使用に修正
  サブグラフ内のノードも走査対象に
- **`extractPromptsLiteGraph`** を 7 段階フォールバック構成に再設計
  1. ImageMetadataPromptLoader → 2. WFS_PromptText → 3. トップレベルCLIPTextEncode+KSampler →
  4. PrimitiveStringMultiline → **5. サブグラフCLIPTextEncode+KSampler（新規）** →
  6. PromptStyler → 7. 全CLIPTextEncodeテキスト
- **`fromWorkflow`** に MarkdownNote フォールバック補完を追加

### 対応済みワークフロー（data/data8）

| ファイル | モデル抽出 | プロンプト抽出 |
|---|---|---|
| image_flux2_fp8.json | UNETLoader + CLIPLoader + VAELoader + LoraLoader (subgraph) | CLIPTextEncode (subgraph) |
| image_flux2_klein_text_to_image.json | UNETLoader + CLIPLoader + VAELoader (subgraph) | PrimitiveStringMultiline |
| image_qwen_image_edit.json | UNETLoader + CLIPLoader + VAELoader + LoraLoader (subgraph) | なし（画像入力のみ） |
| image_qwen_image_edit_2511.json | 同上 | なし |
| image_qwen_image_layered.json | UNETLoader + CLIPLoader + VAELoader (subgraph) | PrimitiveStringMultiline |
| image_z_image.json | UNETLoader + CLIPLoader + VAELoader (subgraph) | CLIPTextEncode (subgraph) |
| image_z_image_turbo.json | 同上 | CLIPTextEncode (subgraph) |

#### `static/js/i18n.js` + `templates/index.html`

- `metaFormatTodo` を「Flux.2 / Qwen-Image / Z-Image サブグラフ形式に対応済み」に更新（EN/JA/ZH）
- `helpMetadata5` の対応フォーマット一覧を更新し Flux.2 / Qwen-Image / Z-Image を明記（EN/JA/ZH）
- index.html フォールバックテキストも同内容に更新

---

## 2026-05-15: v0.3.6 Metadata タブ追加

### 概要

- PNG / WebP / JSON からモデル・LoRA・プロンプト情報を抽出・表示する Metadata タブを追加
- タブ位置は Prompt タブの右隣（Prompt → Metadata → Gallery）
- プロンプト抽出ロジックを改善し SDXL Prompt Styler を使用したワークフローにも対応
- 抽出プロンプトを GenerateUI タブ・Prompt タブのプリセットへワンクリックで転記するボタンを追加
- 左ペインに対応フォーマット説明と今後の対応予定ノートを追加
- ヘルプタブに Metadata タブの説明カードを追加（EN/JA/ZH i18n 対応）

### 変更内容

#### `static/js/metadata-tab.js` — 新規作成

**メタデータ抽出ロジック（`model-and-prompt-from-metadata` の `workflow_utils.js` ベース）**

- `sanitizeJSON(text)` — JSON に含まれる `NaN` / `Infinity` を `null` に置換
- `readWebPEXIFChunk(file)` — WebP RIFF チャンクから EXIF を読み取る
- `extractWorkflowFromEXIF(exifBytes)` — EXIF バイト列から `workflow:` / `prompt:` キーを検索してワークフロー JSON を返す
- `readAllPNGTextChunks(file)` — PNG tEXt / iTXt チャンクをすべて読み取って `{ keyword: text }` マップを返す（IEND 以降のチャンクも読む）
- `extractCheckpoints / extractVAEs / extractDiffusionModels / extractTextEncoders / extractLoRAs` — LiteGraph 形式・API 形式の両方に対応したモデル抽出関数群
- `extractPrompts(wf)` — 形式を判定して `extractPromptsLiteGraph` / `extractPromptsAPI` に振り分け
- **`resolveLinkedText(wf, srcId, slot)`** — API 形式でのリンク参照 `[nodeId, slot]` を解決。`PromptStyler` 系ノードは `text_positive` / `text_negative` を slot に応じて返す
- `extractPromptsAPI(wf)` — CLIPTextEncode の text 入力がリンク参照（配列）の場合に `resolveLinkedText` で解決するよう修正
- `extractPromptsLiteGraph(wf)` — **`linkSlot` マップを追加**（リンクの origin_slot を追跡）; CLIPTextEncode の inputs にリンクがある場合に `PromptStyler` / `WFS_PromptText` の `widgets_values[originSlot]` を解決; フォールバック時にも `PromptStyler` ノードを直接スキャン
- SD WebUI / SD Forge / Fooocus の `parameters` チャンク解析（`parseSDAParameters`, `parseFooocusMetadata`）
- `extractAllMetadata(file)` — PNG / WebP / JSON を統合して `{ source, checkpoints, vaes, diffusionModels, textEncoders, loras, positives, negatives }` を返す

**UI**

- `buildModelItem(label)` — モデル名アイテム（テキストオーバーフロー省略）
- `buildLoRAItem(lora)` — LoRA 名 ＋ `strength_model/strength_clip` バッジ付きアイテム
- `buildPromptItem(label, type, full, ...)` — POS/NEG バッジ付きクリッカブルアイテム。クリックで下部テキストエリアに全文を表示し選択ハイライト
- `renderSection(sectionEl, listEl, items, buildFn)` — アイテムが空の場合は `.wfm-meta-section-empty` クラスを付与してリストを非表示
- `initMetadataTab()` — タブ初期化
  - ドロップゾーン / クリックでファイル選択 / drag-over スタイル切り替え
  - 画像ファイルはプレビューとして表示、JSON はドロップラベルを維持
  - ファイル処理後に各セクションをレンダリング。最初の positive プロンプトを自動選択
  - セクションタイトル・フォーマットノート・ヘルプカードの i18n 適用
  - **プロンプトアクションボタン**:
    - Copy — `navigator.clipboard.writeText` でプレビュー内容をコピー
    - GenUI:P / GenUI:N — `#wfm-prompt-pos-text` / `#wfm-prompt-neg-text` に値をセット
    - Prompt:P / Prompt:N — `#wfm-preset-pos` / `#wfm-preset-neg` に値をセット
    - 成功時は緑のフラッシュアニメーション（`wfm-meta-btn-flash`）

#### `templates/index.html`

- タブナビに `<button class="wfm-tab" data-tab="metadata">Metadata</button>` を Prompt と Gallery の間に追加
- `#wfm-tab-metadata` セクションを追加（Prompt セクションの直後、Settings セクションの前）:
  - `.wfm-metadata-layout`（3列グリッド: 220px | 1fr | 1fr）
  - Col1: ドロップゾーン（`#wfm-meta-drop`）＋プレビュー画像＋ファイル情報（`#wfm-meta-file-info`）＋対応フォーマットノート（`#wfm-meta-format-note`）
  - Col2: Checkpoint / VAE / Diffusion Model / Text Encoder の各セクション
  - Col3: LoRA セクション＋Prompt セクション（リスト＋全文テキストエリア＋アクションボタン行）
- Help タブ: Prompt Tab カードと Settings Tab カードの間に Metadata Tab カードを追加（`wfm-help-metadata-title/desc/1〜5`）

#### `static/js/app.js`

- `import { initMetadataTab } from "./metadata-tab.js"` を追加
- `tabMap` に `metadata: "tabMetadata"` を追加
- `DOMContentLoaded` 内に `initMetadataTab()` を追加（`initPromptTab()` の直後）

#### `static/js/i18n.js`

EN / JA / ZH の3言語に以下を追加:

- `tabMetadata` — タブラベル
- `metaSectionCkpt / Vae / Diff / Te / Lora / Prompt` — 各セクションタイトル
- `metaDropMain / metaDropSub` — ドロップゾーンラベル
- `metaParsing / metaFileTooLarge / metaNoMetadata / metaParseError` — ステータスメッセージ
- `metaPromptPositive / metaPromptNegative / metaSelectPrompt` — プロンプトエリアラベル
- `metaFormatNoteTitle / metaFmtComfyui / metaFmtSdwebui / metaFmtFooocus / metaFormatTodo` — フォーマットノート
- `helpMetadataTitle / helpMetadataDesc / helpMetadata1〜5` — ヘルプカード

#### `static/css/main.css`

以下のスタイルを末尾に追加:

- `#wfm-tab-metadata` / `.wfm-metadata-layout` — 3列グリッドレイアウト
- `.wfm-metadata-col1/col2/col3` — 各列の flex レイアウト・ボーダー・スクロール
- `.wfm-metadata-drop-zone` (+ `.drag-over` / `:hover`) — ドロップゾーンのボーダー・背景切り替え
- `.wfm-meta-drop-label / main / sub` — ドロップラベル
- `.wfm-meta-preview-img` — プレビュー画像（object-fit: contain）
- `.wfm-meta-file-info` — ファイル情報テキスト
- `.wfm-meta-section` (+ `.wfm-meta-section-empty`) — セクションコンテナ（空時はリストを非表示・タイトルを半透明）
- `.wfm-meta-section-title` — セクション見出し（uppercase + letter-spacing）
- `.wfm-meta-list` — スクロール可能アイテムリスト（`max-height: 140px`）
- `.wfm-meta-item` / `.wfm-meta-item-clickable` (+ `:hover` / `.selected`) — アイテム行
- `.wfm-meta-item-name / badge` — アイテム名・バッジ
- `.wfm-meta-badge-pos / neg` — POS（緑）/ NEG（赤）バッジ
- `.wfm-meta-prompt-section / full-wrap / full-label / full` — プロンプト全文エリア（`min-height: 80px`）
- `.wfm-meta-prompt-actions` — ボタン行（flex wrap）
- `.wfm-meta-btn-flash` — 成功時フラッシュアニメーション
- `.wfm-meta-format-note / note-title / format-list / format-todo` — フォーマットノートスタイル

---

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

