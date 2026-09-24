# 校正データ形式（data/curation/{exam_id}.json）

キーは問題番号。書いた項目だけが自動抽出データを上書きする。

| 項目 | 説明 |
|---|---|
| text_status | `"verified"` にすると本文テキストで表示（原本画像と照合済みのときだけ） |
| question_text / choices | 校正済み本文・選択肢 `{ "ア": "...", ... }` |
| concept_ids | 主Conceptを先頭に（`concept_source=CURATED` になる） |
| validity_status / validity_notes | `CURRENT` / `LEGACY_BUT_USEFUL` / `OUTDATED` / `REVIEW_REQUIRED` と理由 |
| explanation_answer | **必須**（解説を書く場合）。解説が前提とする正答。公式正答と違えば解説は不採用になり `data/build/explanation_errors.json` に記録 |
| short_explanation / reason / trap_point / memory_tip | 結論 / 理由 / ひっかけ / 一言記憶 |
| wrong_choice_explanations | 各選択肢。正答の選択肢は「正解」で始める |
| detailed_explanation | 「詳しく理解する」で展開する本文 |
| explanation_source | `AI_GENERATED` / `MANUAL` |
| modified / original_text / modification_reason | 問題を改変した場合（画面に「一部改変」と表示） |
