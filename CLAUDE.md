# ComfyUI-Workflow-Studio 開発ガイドライン

## プロジェクト概要
ComfyUI用ワークフロー管理プラグイン。aiohttp (ComfyUI PromptServer) 上でSPAを提供する。

## アーキテクチャ
- エントリポイント: `__init__.py` → `py/wfm.py` (WorkflowStudio.add_routes)
- バックエンド: `py/routes/` (aiohttp ルート), `py/services/` (ビジネスロジック)
- フロントエンド: `web/comfyui/` (ComfyUI拡張), `static/` (SPA), `templates/` (Jinja2)
- データ: `data/` (settings.json, metadata.json, node_metadata.json)
- i18n: 英語 / 日本語 / 中国語

---

## ComfyUI カスタムノード開発ルール

### NODE_CLASS_MAPPINGS キーは永久に変更不可
`NODE_CLASS_MAPPINGS` のキー文字列は、保存済みワークフローとノードを紐付ける公開識別子。
一度公開したキーを変更すると、ユーザーの既存ワークフローが壊れる。
将来ノードを追加する場合は、キー名を慎重に決定すること。
- 名前空間衝突を防ぐため、パック名をプレフィックスに付ける (例: `"WFS_MyNode"`)
- リネーム時は旧キーをエイリアスとして残す:
  ```python
  NODE_CLASS_MAPPINGS = {
      "WFS_NewName": MyNodeClass,   # 新名
      "WFS_OldName": MyNodeClass,   # エイリアス（後方互換）
  }
  ```

### ワークフローJSON: ウィジェット値は位置インデックスで格納される
ワークフローJSONはウィジェットの値を「名前」ではなく「位置インデックス」で保存する。
入力の追加・並べ替えは、保存済みワークフローの値を別パラメータにずらす破壊的変更になる。
ワークフロー解析・編集コード (`workflow_analyzer.py`, `workflow_service.py`) を変更する際は、
このインデックスマッピングを必ず考慮すること。

**INPUT_TYPES変更時のチェックリスト:**
- ウィジェット追加: 末尾に追加が最も安全。中間挿入は全保存済みJSONの更新が必要
- ウィジェット削除: 後続のインデックスが全てずれる。全保存済みJSONの`widgets_values`を修正
- 並べ替え: `widgets_values`の順序も合わせて更新
- `INPUT_TYPES`を変更するコミットは、影響を受けるワークフローJSONも同時にコミットする

### ワークフローJSON整合性ルール
- `last_node_id` は最大ノードID以上であること（低いと重複IDが発生し無言で壊れる）
- `last_link_id` は最大リンクID以上であること
- リンクは3箇所で整合する必要がある: `links[]`配列、ソースノードの`outputs[slot].links`、ターゲットノードの`inputs[slot].link`
- いずれかが不一致だと接続が無言で消える

### IS_CHANGED によるキャッシュ制御
ComfyUIはキャッシュ付きデータフローグラフ実行エンジン。入力が変わらないと判断したノードはスキップされる。
- 毎回実行が必要なノード: `IS_CHANGED` で `float("NaN")` を返す
- 本番用: 入力に基づく決定論的なハッシュを返す
- 注意: `IS_CHANGED` はスロット接続された入力に `None` を受け取ることがある。`None`チェックを必ず入れる

### VALIDATE_INPUTS の落とし穴
スロット接続された入力は検証時に `None` として渡される（実行時には実値が来る）。
```python
@classmethod
def VALIDATE_INPUTS(cls, text=None, **kwargs):
    if text is None:
        return True  # スロット接続 — 実行時に実値が来る
    if isinstance(text, str) and text.strip() == "":
        return "Text input cannot be empty"
    return True
```

### ノードの安全な分離読み込み
1つの壊れた依存が全ノードを道連れにしないよう、個別にtry/exceptで読み込む:
```python
NODE_CLASS_MAPPINGS = {}
for name, (mod_path, cls_name) in _NODE_MODULES.items():
    try:
        mod = importlib.import_module(mod_path, package=__name__)
        NODE_CLASS_MAPPINGS[name] = getattr(mod, cls_name)
    except Exception as e:
        print(f"[WARNING] Failed to load '{name}': {e}")
```

### Hidden Inputs (UNIQUE_ID, PROMPT, EXTRA_PNGINFO)
```python
"hidden": {
    "unique_id": "UNIQUE_ID",      # キャッシュの名前空間キーに使用
    "prompt": "PROMPT",
    "extra_pnginfo": "EXTRA_PNGINFO",  # PNG出力にメタデータ埋め込み
}
```
`UNIQUE_ID`を使わずモジュールレベルキャッシュを共有すると、同一ノードの複数インスタンスが干渉する。

### Lazy Inputs & 条件付き実行
不要な上流実行を防ぐ:
```python
# INPUT_TYPESで宣言
"optional": {"heavy_data": ("IMAGE", {"lazy": True})}

# 必要な入力だけリクエスト
def check_lazy_status(self, **kwargs):
    needed = []
    if self.needs_heavy_data:
        needed.append("heavy_data")
    return needed  # 空リスト = 上流実行をスキップ
```

---

## 開発時の注意事項

### Python変更後は必ずComfyUIを再起動
ComfyUIは起動時に `custom_nodes/` を一度だけインポートする。
Pythonファイルの変更はComfyUIプロセスの完全再起動まで反映されない。

### __pycache__ のクリア
ディレクトリ間のコピーやブランチ切り替え後、古いバイトコードが残ることがある。
動作がおかしい場合は `__pycache__/` を削除してから再起動する。

### 依存パッケージのインストール先
Windows Portable版のComfyUIは `python_embeded/` 内の組み込みPythonを使用する。
システムのPythonにインストールしても認識されない。
```
python_embeded/python.exe -m pip install package_name
```
torch関連パッケージはCUDA index URLを指定:
```
python_embeded/python.exe -m pip install torchaudio --index-url https://download.pytorch.org/whl/cu130
```
インストール後は必ず `torch.cuda.is_available()` で確認する。

### デプロイ
ソースリポジトリと `custom_nodes/` のランタイムディレクトリは分離する。
`custom_nodes/` 内で直接編集せず、同期スクリプトでパッケージ全体をデプロイする。
部分的な同期は原因不明のエラーを引き起こす。
デプロイ後はハッシュ比較でファイル同一性を検証する。

### prestartup_script.py
環境変数の設定は `__init__.py` では遅い。`prestartup_script.py` はノードインポート前に実行される唯一の場所:
```python
# custom_nodes/ComfyUI-Workflow-Studio/prestartup_script.py
import os
os.environ["HF_HOME"] = "D:\\hf_cache"
```

### 依存パッケージの競合防止
- 依存はゆるくピン留め: `transformers>=4.40,<6.0` (厳密な `==` は避ける)
- torchは `requirements.txt` にピン留めしない（ComfyUI本体が管理）
- バージョン依存のインポートは `try/except` でフォールバック

### テスト戦略 (ComfyUI不要のテスト)
1. `ast.parse()` で構文チェック (0.1秒)
2. ビジネスロジックを `execute()` から分離し pytest でテスト (1-2秒)
3. ComfyUI統合テストは最終確認のみ (30-60秒)

### ファイルパスの扱い
出力・一時ファイルは `folder_paths.get_output_directory()` / `folder_paths.get_temp_directory()` を使用。
相対パスはComfyUIの起動方法によって解決先が変わる。

### Windows固有の注意
- PowerShellのデフォルトエンコーディングはUTF-8を壊す。ファイル書き込みはPython経由で行う
- Windows MAX_PATH (260文字) 制限: 浅いパス (`C:\ComfyUI`) にインストールするか、LongPathsEnabled レジストリを有効化
- HuggingFaceのシンボリックリンクは開発者モードなしだと無言でファイルが複製される (`HF_HOME`を短いパスに設定)

### バウンドキャッシュ
モジュールレベルのキャッシュは `OrderedDict` + 最大サイズ制限で実装する。
無制限キャッシュは長時間セッションでメモリを食い潰す。

---

## サイレント障害の診断

| 症状 | 原因 | 対処 |
|------|------|------|
| 編集後も動作が変わらない | 古いコード | ComfyUI再起動 + `__pycache__/` 削除 |
| 変更したのにノードが実行されない | キャッシュ | `IS_CHANGED` で `float("NaN")` を返す |
| ワークフロー読込で値がおかしい | UIマッピングずれ | ウィジェット位置が保存JSONと一致するか確認 |
| ノードが赤い "missing" 表示 | タイプ名不一致 | `NODE_CLASS_MAPPINGS` のキーと大文字小文字を確認 |
| 接続線が消える | リンクID不整合 | links[], outputs[].links, inputs[].link の3箇所を検証 |
| 重複ノード動作 | `last_node_id` が低すぎる | 最大ノードID + 1 に設定 |
| CUDAが使えなくなった | CPU版wheelのインストール | `torch.cuda.is_available()` 確認、CUDA index URLで再インストール |
| ヘッドレスモードで失敗 | UI前提のコード | `{"ui": {...}, "result": (...)}` で分離 |

---

## コミット前チェックリスト
1. 全ファイルを `custom_nodes/` に同期（部分同期しない）
2. 両方の `__pycache__/` をクリア
3. 全 .py ファイルのハッシュ比較で同一性を確認
4. `ast.parse()` で全 .py ファイルの構文チェック
5. `INPUT_TYPES` 変更時は `widgets_values` も同時更新
6. 削除した依存への参照が残っていないか grep で確認
7. ComfyUI完全再起動 → ワークフロー読み込み → エンドツーエンド実行確認
