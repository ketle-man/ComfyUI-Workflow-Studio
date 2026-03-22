# DEVLOG - ComfyUI-Workflow-Studio

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
