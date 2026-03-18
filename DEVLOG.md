# DEVLOG - ComfyUI-Workflow-Studio

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
├── templates/index.html      # SPA (Workflow/GenerateUI/Prompt/Settings)
├── static/                   # CSS/JS
├── web/comfyui/              # ComfyUIメニュー拡張
└── data/                     # ワークフロー・メタデータ・設定
```

### 次のステップ
- Promptタブの実装完了 (CSS・app.js登録)
- GitHub公開準備
- ComfyUI Manager登録
