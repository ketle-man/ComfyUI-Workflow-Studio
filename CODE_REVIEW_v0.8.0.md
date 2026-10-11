# コードレビューレポート（v0.8.0）

- 対象ブランチ: `claude/magical-brown-rkj2fb`
- 比較対象: `origin/main...HEAD`（15コミット / 21ファイル / +1672 -154）
- 対象範囲: 音声対応、ファイル変換、Nodes タブ高速化、メタデータ読み取り修正
- 備考: コードの変更・アプリの実行は行っていません（静的レビューのみ）。行番号は HEAD `1b85fb0` 時点のものです。

---

## 優先して修正すべき項目（推奨: 1・3・5・6）

| # | 重要度 | ファイル | 概要 |
|---|--------|----------|------|
| 1 | 高 | `static/js/nodes-tab.js:324` | 検索0件時に古いカードが残る |
| 2 | 高 | `static/js/metadata-tab.js:755` | サンプラー/スケジューラーの誤表示・グローバル状態の上書き |
| 3 | 中 | `static/js/metadata-tab.js:1054` | 連続で開いた画像の結果が混ざる |
| 4 | 中 | `static/js/metadata-tab.js:276` | サンプラーノードの選択が不正確 |
| 5 | 中 | `py/services/gallery_service.py:620` | `history.jsonl` の異常行でフォルダ全体が失敗 |
| 6 | 中 | `py/services/gallery_service.py:1005` | 同時変換で出力ファイルが上書きされる |
| 7 | 低 | `py/services/gallery_service.py:785` | Gallery と Workflow 読み込みで結果が食い違う |
| 8 | 低 | `static/js/gallery-tab.js:908` | 大量選択時の選択操作が重い |
| 9 | 低 | `py/services/gallery_service.py:598` | `history.jsonl` を毎回全読み込み |
| 10 | 低 | `static/js/gallery-tab.js:28` 他 | 拡張子リスト・キャッシュタグの重複定義 |

---

## バグ

### 1. 検索結果が0件でも古いカードが残る
**`static/js/nodes-tab.js:324`**

- **問題**: 0件のとき `renderNodeGrid` が `state.renderToken` を更新せずに早期 return する。実行中の分割描画（`appendChunked` の `requestAnimationFrame` ループ）はトークンが一致したままなので止まらない。
- **再現**: 約5000ノードをカード表示中（描画途中）に、何もヒットしない文字列を入力する。「No nodes found」の下に古いカードが追加され続け、件数表示は `0 / 5000` のまま。
- **修正案**: 早期 return より前に `state.renderToken++` を実行する（関数の先頭でトークンを更新する）。

### 2. Metadata タブでサンプラー/スケジューラーが誤表示される
**`static/js/metadata-tab.js:755`**

- **問題**: `fromWorkflow` が、サブグラフを含むものだけでなく UI 形式のワークフローすべてに `convertUiToApi` を実行するようになった。`convertUiToApi` の COMBO フォールバックは、未知の値を選択肢の先頭に無言で置き換える。
- **影響**:
  - ローカルに無い sampler_name / scheduler を使った画像で、`Sampler: euler` などの誤った値が表示される。
  - Metadata を開くたびに、初回の重い `/object_info` 取得を待つ（このブランチで Nodes タブから外した処理）。
  - `_lastComboSubstitutions` / `_lastCheckpointSubstitutions` が上書きされる。この2つは Workflow タブの互換性チェックが参照している。
- **修正案**: 以前と同様にサブグラフを含む場合だけ変換するか、表示用にはウィジェット値を直接読む軽量な抽出を使う。変換が必要な場合は、置換を行わないモードを追加し、グローバルの置換記録を更新しないようにする。

### 3. 連続で開いた画像の結果が混ざる
**`static/js/metadata-tab.js:1054`**

- **問題**: `handleFile` は `fetchServerMeta` とプレビューの `onload` を await してから描画するが、新しいリクエストが始まったかを確認していない。
- **再現**: `cc_nanobanana` 内の画像Aで「Metadata」を押し、すぐに画像Bで押す。後から完了したAの処理が `renderNanobanana` / `renderSettings` を実行し、Bのプレビューの横にAの履歴・サイズ・サンプラー設定が表示される。
- **修正案**: モジュール変数のリクエストIDを `handleFile` の冒頭で更新し、各 `await` の後で一致しなければ return する。
  ```js
  let _loadSeq = 0;
  async function handleFile(...) {
      const seq = ++_loadSeq;
      ...
      const meta = await fetchServerMeta(...);
      if (seq !== _loadSeq) return;
      ...
  }
  ```

### 4. サンプラーノードの選び方が不正確
**`static/js/metadata-tab.js:276`**

- **問題**: `extractSamplerSettings` は、`class_type` に "Sampler" を含み、設定キーを1つでも持つ最初のノードを返す。
- **影響**:
  - Flux/SD3 系（RandomNoise + BasicScheduler + KSamplerSelect + CFGGuider + SamplerCustomAdvanced）では `sampler_name` しか持たない `KSamplerSelect` が選ばれ、seed・steps・cfg・scheduler・denoise が表示されない。
  - hires-fix など複数パスのワークフローでは、どちらのパスの値が出るかがオブジェクトのキー順で変わる。
- **修正案**:
  - 単一ノードではなく、関連ノード（`RandomNoise`→seed、`BasicScheduler`→steps/scheduler/denoise、`CFGGuider`→cfg、`KSamplerSelect`→sampler_name）から値を集めて統合する。
  - 複数の KSampler がある場合は、保持する設定キーが最も多いノード、または最終出力に近いノードを優先する。

### 5. `history.jsonl` の1行の異常でフォルダ全体が失敗する
**`py/services/gallery_service.py:620`**

- **問題**: `_read_nanobanana_entry` は、`json.loads` の戻り値に対して型を確認せずに `entry.get()` を呼ぶ。
- **再現**: `history.jsonl` に `[]`、`"x"`、`123` などの行がある（書き込み途中の破損など）。`AttributeError` が捕捉されず、`cc_nanobanana` 内の全画像で `/wfm/gallery/image/meta` がエラーになる。
- **修正案**:
  ```python
  entry = json.loads(line)
  if not isinstance(entry, dict):
      continue
  ```

### 6. 同じファイルの同時変換で出力が上書きされる
**`py/services/gallery_service.py:1005`**

- **問題**: `convert_file` は出力ファイル名の決定（`exists()` チェックと `_converted` 連番）を `_convert_lock` の外で行っている。
- **再現**: 2つのタブから、またはダブル送信で、`song.wav` を同時に mp3 へ変換する。両方が `song.mp3` を選び、2回目の `av.open(dst, 'w')` が1回目の出力を上書きする。エラー時の `dst.unlink` が、もう一方の完成ファイルを削除する可能性もある。
- **修正案**: 出力名の決定をロック内に移す。あるいは決定時に `open(dst, 'xb')` などで空ファイルを作って名前を予約する。エラー時に削除するのは、自分が作成したファイルだけにする。

### 7. Gallery と Workflow 読み込みで結果が食い違う
**`py/services/gallery_service.py:785`**

- **問題**: IEND での `break` を削除したため、IEND 以降のチャンクも読まれる。`_read_png_metadata` は後のチャンクで上書き（後勝ち）し、`png_extractor.extract_png_workflow` は最初に見つけたものを返す（先勝ち）。
- **影響**: IEND の後ろにデータが付いた PNG（PNG の連結、古い workflow チャンクを追記するツールなど）で、Gallery 詳細・Prompt タブとワークフロー読み込みが別々のワークフローを表示する。末尾のゴミデータがチャンクとして解釈され、`prompt_cache` に不正なキーが入る可能性もある。
- **修正案**: 先勝ちに統一する（`if key not in result:`）。IEND 以降を読む必要が無ければ `break` を戻す。IEND 以降を読む理由がある場合は、CRC 検証かチャンク長の妥当性チェックを入れる。

---

## パフォーマンス・保守性

### 8. 大量選択時の選択操作が重い
**`static/js/gallery-tab.js:908`**

- **問題**: `updateBulkBar` が選択変更のたびに `convertTargets` を呼ぶ。`convertTargets` は選択中の各パスについて `state.images.find` を実行するため、計算量が O(選択数 × 画像数) になる。
- **影響**: 5000件のフォルダで Ctrl+A や Shift+クリックをすると、1回あたり約2500万回の比較が発生し、UI が固まる。
- **修正案**: 音声・動画パスの `Set`（またはパス→画像の `Map`）を `state.images` 更新時に作る。ボタンの表示判定だけなら `some` で1件見つかった時点で打ち切る。

### 9. `history.jsonl` を毎回全読み込みしている
**`py/services/gallery_service.py:598`**

- **問題**: メタデータ要求のたびに、ファイル全体の読み込み、分割、逆順解析を行う。
- **影響**: 長く使った `cc_nanobanana` フォルダでは数MBになり、詳細パネルのクリックや Metadata タブを開くたびに遅延が出る（Metadata タブは `/image/meta` を別途取得するため2回読む）。
- **修正案**: `(path, mtime, size)` をキーに「ファイル名→エントリ」の辞書をキャッシュする。サイズ上限付きの `OrderedDict` を使う（CLAUDE.md「バウンドキャッシュ」参照）。

### 10. 同じ値が複数ファイルに重複している
**`static/js/gallery-tab.js:28` 他**

- **問題**: 次の値が複数箇所に重複しており、すべて同時に変更する必要がある。
  - 音声拡張子のリスト: `AUDIO_EXTENSIONS` 配列、`API.thumb` 内の正規表現、Edit Layers のフィルタ正規表現、Python 側の `AUDIO_EXTENSIONS`
  - 波形キャッシュのタグ: JS 側の `&v=wave2` と Python 側の `:wave2`
- **影響**: 形式（例: `.aac`）を追加するときに正規表現の修正が漏れると、キャッシュバスターが付かず、Edit Layers のフィルタもすり抜ける。Python 側だけタグを更新すると、ブラウザは24時間キャッシュから古い波形を表示し続ける。
- **修正案**: JS 側は `isAudioFile()` / `isVideoFile()` に統一し、波形バージョンは定数1つにまとめる（可能ならサーバーから返す）。

---

## 修正後の確認項目（CLAUDE.md 準拠）

1. `ast.parse()` で変更した .py ファイルの構文を確認する
2. `__pycache__/` を削除し、ComfyUI を完全に再起動する
3. 確認シナリオ:
   - Nodes タブ: カード描画中に0件になる検索をする（#1）
   - Metadata タブ: 画像を素早く連続で開く（#3）。Flux 系ワークフローの画像で設定値を確認する（#2・#4）
   - `history.jsonl` に `[]` 行を追加して Gallery 詳細を開く（#5）
   - 同じファイルを2タブから同時に変換する（#6）
