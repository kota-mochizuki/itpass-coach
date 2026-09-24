# iパス専属AI学習コーチ — 設計書 v1（2026-09-24）

> KGI: 2026年11月8日 ITパスポート試験 合格　／　最大化指標: **1分あたりの期待得点向上**
> Feature Gate: 「この機能は11月8日の得点を上げるか？」NOなら作らない。

---

## 1. 要件理解

- 作るのは「過去問アプリ」ではなく、**IPA公式過去問を“何を学ぶ価値が高いか”の分析データとして使い、今この瞬間に最も価値の高い1問を出すコーチ**。
- ユーザーは計画を立てない。ホームの「今日の学習をはじめる」を押して解くだけ。
- 学習期間は約6週間（9/24 → 11/8 = 45日）。長期の理解形成より**得点効率**が重い。
- 合格基準（IPA試験要綱）: 総合評価点600/1000以上 **かつ** 3分野（ストラテジ・マネジメント・テクノロジ）それぞれ300/1000以上。→ **分野別の足切りリスク**も優先度に入れる。
- 出題構成: 100問/120分（ストラテジ約35・マネジメント約20・テクノロジ約45）。
- PCM（パシスター/シンカー/ハーモナイザー）は名称を出さず行動設計に反映:
  - 目的と理由を常に表示（「なぜこの問題？」チップ）、数字で現在地、次にやることが1つ、責めない言葉、落ち着いた配色。

## 2. IPA公式データの取得計画（調査結果）

| 資料 | 所在（一次情報） | 形式 | 状態 |
|---|---|---|---|
| 公開問題（問題冊子） | `www3.jitec.ipa.go.jp/JitesCbt/html/openinfo/pdf/questions/{年度}_ip_qs.pdf` | **画像PDF**（本文テキストなし） | 15回分取得済 |
| 解答例 | 同 `{年度}_ip_ans.pdf` | テキストPDF（1ページ） | 15回分取得・機械抽出済 |
| シラバス Ver.6.5（2026/1） | `www.ipa.go.jp/shiken/syllabus/omgdg50000005kn1-att/syllabus_ip_ver6_5.pdf` | テキストPDF | 取得・構造化済 |
| 試験要綱 Ver.5.6（2026/7） | `www.ipa.go.jp/shiken/syllabus/rcu1hd00000141gq-att/youkou_ver5_6.pdf` | PDF | 参照のみ |
| 2027年度新制度 シラバス案 Ver.0.1・サンプル問題 | `www.ipa.go.jp/shiken/syllabus/henkou/2026/20260630.html` 他 | PDF | **取り込まない**（NEW_SYSTEM_2027） |

- 2026-09-24時点、iパス公式サイトは**9/20〜9/28 システムメンテナンス中**で公式URLからPDFを取得できなかった。
  そのため **同一公式URLの Internet Archive 保存版**（IPA発行PDFそのもの）で取得し、`data/raw/manifest.csv` に取得経路とSHA-256を記録。
  → **メンテナンス明け（9/29以降）に `scripts/fetch_ipa.sh` を再実行し、公式から再取得＋ハッシュ照合する**（TODO）。
- 出典 `source_url` には常にIPA公式URLを保存。

### 利用条件（IPA「試験に関するよくある質問」より）
- 過去問題の使用は**許諾・使用料不要**（法令に特別の定めがある場合を除く）。著作権は放棄されていない。
- 教育目的など試験制度の意義に反しない利用が可能。
- **出典の明記が必要**（例: 「出典：令和8年度 ITパスポート試験 公開問題 問1」）。**改変した場合はその旨も明記**。
- 公表PDF以外の電子データ提供はない → 自前でOCR・構造化する。
→ アプリは全公式問題に出典を表示。改変問題は `modified / original_text / modification_reason` を保持し「一部改変」と表示。個人利用のPWAで、外部公開はしない。

## 3. 過去約10年分のデータ構築方法

対象: 平成28年度春期〜令和8年度（**15回・1,500問**）。2016h28h, 2016h28a, 2017h29h/a, 2018h30h/a, 2019h31h, 2019r01a, 2020r02o(令和2年度10月), 2021r03〜2026r08。

```
fetch_ipa.sh        公式URL → 失敗時のみアーカイブ（同一URL）/ manifest記録
   ↓
ocr_pdf.swift       ページPNG化 + macOS Vision 日本語OCR（座標付き）
   ↓
parse_exam.py       問題番号認識（連番制約）→ 問題文 / 選択肢ア〜エ（桁位置で判定）
                    → 解答PDFから公式正答（OCRを通さない）→ 原本画像の切り出し → 品質チェック
   ↓
build_dataset.py    Concept自動分類 → 現行シラバス照合 → Concept別出題統計 → Frequency Score
                    + data/curation/*.json（校正本文・Concept・解説・判定）を上書きマージ
   ↓
app/src/data/generated/*.json, app/public/q/{年度}/{問}.png
```

- **表示の正本は「公式問題冊子から切り出した原本画像」**。OCR本文は検索・分類用で、校正済み（`text_status=verified`）になった問題だけテキスト表示する。→ OCR誤り（「エ→工」「電子→單子」等）が学習に混入しない。
- 選択肢はア〜エのボタン（原本画像に選択肢本文があるため）。校正済みは本文付きボタン。
- 品質チェック（§38）で疑わしい問題は `REVIEW_REQUIRED` → 通常出題から除外。
- 管理者の代替手段: `data/raw/` にPDFを置けば同じパイプラインが動く（Web取得に依存しない）。校正・解説は `data/curation/{年度}.json` に書く（形式は docs/02_data_format.md）。

**実績（2026-09-24）**: 15回すべて 100/100問を分割、公式正答 1,500/1,500 取得。選択肢テキスト完備は約7割、残りは原本画像表示。問題番号の見出しをOCRが取りこぼした1件（2019秋 問67・68）は混在として要校正。

## 4. Concept Taxonomy案

**シラバスVer.6.5の構造をそのまま背骨にする**（推測で作らない）:

```
分野(3) ストラテジ / マネジメント / テクノロジ
 └ 大分類(9)  例: 9 技術要素
    └ 中分類(23)  例: 23 セキュリティ
       └ 小分類(63)  例: 63 情報セキュリティ対策・情報セキュリティ実装技術
          └ Concept(180)  = 小分類内の (n) 項目、①があればその単位   例: C63.6 公開鍵基盤
```

- Concept ID: `C{小分類}.{項目}[.{①}]`（例 `C63.2` 暗号技術, `C27.1` プロジェクトマネジメント, `C3.1` 会計と財務, `C56.1` データ操作）。
- 各Conceptはシラバスの「用語例・活用例」（計1,552語）を保持 → 自動分類の辞書・解説のConceptカードに使う。
- 用語例が空のConcept用に `data/concept_supplement.json`（出題実態に基づく補足語、シラバス本文とは区別）。
- 粒度の課題: PM（C27.1）等は1 Conceptに多くの論点を含む。**頻出で粗いConceptだけ**を後日分割（例: C27.1 → スケジュール/リスク/スコープ）。分割判断は出題統計で行う。

## 5. データベース設計

**静的コンテンツ（ビルド時生成・読み取り専用JSON）**と**学習者データ（IndexedDB/Dexie）**を分離。

### questions（§34）
`question_id`(IPA-2026r08-001) / `question_text` / `choices{ア..エ}` / `official_answer`（=correct_answer。公式問題ではAIが変更不可）/ `image`（原本画像）/ `has_figure` / `text_status`(ocr|verified) /
`short_explanation`(結論) / `reason` / `wrong_choice_explanations{}` / `trap_point` / `memory_tip` / `detailed_explanation` / `explanation_source`(AI_GENERATED|MANUAL) /
`source_type`(IPA_OFFICIAL|AI_GENERATED|MANUAL|OTHER) / `source_organization` / `source_year` / `exam_name` / `question_number` / `source_url` / `source_document` / `retrieved_at`(manifest) / `citation` /
`domain` / `concept_ids[]`(先頭=主Concept) / `concept_source`(AUTO_KEYWORD|CURATED) / `concept_confidence` /
`difficulty` / `frequency_score` / `recency_weight` / `validity_status`(CURRENT|LEGACY_BUT_USEFUL|OUTDATED|REVIEW_REQUIRED) / `validity_notes[]` / `exam_scope`(CURRENT_2026|NEW_SYSTEM_2027) /
`modified` / `original_text` / `modification_reason` / `qc_flags[]`
（大分類・中分類・小分類はConcept側から引く＝正規化）

### concepts（§35）
`concept_id` / `concept_name` / `domain` / `large/middle/small` / `points[]`(シラバスの学習内容) / `terms[]`(用語例) /
`historical_frequency` / `per_exam` / `recent_5y_frequency` / `recent_3y_frequency` / `recency_weighted_per_exam` / `continuity` / `frequency_score` / `importance`(S/A/B/C) /
`syllabus_relevance` / `related_concepts[]` / `first_seen_year` / `last_seen_year`

### IndexedDB（学習者）
- `attempts`（§36）: id, questionId, conceptIds, answeredAt, selected, isCorrect, responseMs, confidence(sure|unsure), attemptNumber, kind(first|review|repeat), sessionId, mode
- `qstates`（問題Mastery＋SRS）: questionId, seen, streak, lapses, incorrectCount, lastAt, lastCorrect, intervalDays, dueAt
- ユーザーConcept（§37）は**attemptsから毎回再計算**（決定的・テスト容易・移行不要）: mastery, confidence, correct_rate, first_try_correct_rate, recent_correct_rate, correct_streak, incorrect_count, last_seen_at, next_review_at
- 間違いノート（§33）は `qstates.incorrectCount>0` のビュー（手作業ゼロ）
- `sessions`, `kv`(設定: 試験日, 1日の学習時間, 診断済み), `logs`(解説不整合などのエラー記録)

## 6. Frequency Score設計

出題回数は**単語ではなくConceptの出題問題数**（主Concept=1、副Concept=0.5）。

```
HistoricalFrequency H = 全15回の出題数 / 15            （1回あたり平均出題数）
RecencyWeighted     R = Σ w_e·n_e / Σ w_e,  w_e = 0.5^((2026.85 − 実施時期)/3年)
RecentFrequencyWeight = clip(R / H, 0.5, 2.0)           （最近伸びている / 減っている）
Continuity          C = 出題された年数 / 全年数
SyllabusRelevance   S = 1.0（Ver.6.5 に存在するConceptのみ採用）
FrequencyScore      = H × RecentFrequencyWeight × S × (0.5 + 0.5·C)  → 最大値で正規化 0〜1
```
- 「古いが今も継続して問われるConcept」は C と H で高く残り、「古い問題そのもの」は問題単位の `recency_weight = max(0.25, 0.5^(経過年/3))` で優先度が下がる。
- 生成AIなど新しいConceptは R/H>1 で押し上げ。
- UIでは「本試験で1回あたり平均○問」（=R）を見せる（シンカー向けの根拠）。
- 暫定結果（自動分類）TOP: 情報セキュリティの概念 / PM / データベース / 会計・財務 / 脅威と脆弱性 / 開発プロセス / セキュリティ対策 / 表計算 …

## 7. Concept Mastery設計

Beta分布ベースの事後平均に、**証拠の質**で重みを付ける（単純正答率にしない）。

```
m = (α0 + Σ wᵢ·cᵢ) / (α0 + β0 + Σ wᵢ)
  cᵢ = 正解&自信あり 1.0 / 正解&迷い 0.6 / 不正解 0     ×（正解でも極端に遅い(>120s) → ×0.85）
  wᵢ = 種別(初見1.0, 別問題での再確認1.0, 同一問題の再出題0.5 ←丸暗記割引)
       × 新しさ 0.5^(経過日数/21)
  α0, β0 = 1 + 2·p_dom, 1 + 2·(1−p_dom)   （p_dom=初回診断の分野正答率。未診断は0.5）
表示用 Mastery = m × (0.7 + 0.3·Retention)   Retention = exp(−経過日数 / 安定度S)
安定度 S(日) = 2 × 2.2^(連続正解数)
Uncertainty = 1 / sqrt(1 + Σwᵢ)
```
- **問題Mastery**（qstates: 同じ問題を覚えたか）と**Concept Mastery**（別の問題でも解けるか）を分離。同一問題の再正解はConceptへの寄与を半分にする。
- 難易度（difficulty）は全体正答率データがないため当面未使用（スキーマのみ）。

## 8. Learning Priority Score設計

Concept c ごと:
```
Priority_c = FS_c^a                       試験重要度×頻度（a: フェーズで強くなる）
           × (0.15 + Weakness)            Weakness = 1 − m
           × (0.3 + ForgettingRisk)       ForgettingRisk = 1 − Retention（未学習=1）
           × (0.5 + Uncertainty)
           × DomainBoost                  分野の推定正答率 < 55% で最大1.5（足切り対策）
           × NewConceptFactor             未学習Conceptの扱い（フェーズで変える）
           ÷ LearningCost                 図表・計算問題の多いConceptは1.0〜1.4
```
掛け算に定数を足してゼロ潰れを防ぐ。問題 q の優先度 = max_c Priority_c × recency_weight^0.5 × 期限到来ブースト × 直近出題ペナルティ（7日以内に出した問題は×0.1）。
「頻出 × 現行 × 苦手 × 忘れかけ」がそろうと最大になる。OUTDATED/REVIEW_REQUIRED/NEW_SYSTEM_2027 は候補に入らない。

## 9. Spaced Repetition設計（問題単位）

| 結果 | 次回間隔 |
|---|---|
| 不正解 | 1日（セッション内では同Conceptの**別の公式問題**を数問後に挿入） |
| 正解・迷い | min(3, max(1, 前回×1.2))日 |
| 正解・自信あり（初回） | 3日 |
| 正解・自信あり（2回目以降） | 前回×2.5日、連続3回以上は×3.5 |

- 次回日が**11/8を超える場合は11/7に丸める**（頻出Conceptのみ最終確認、低頻度は打ち切り）。
- 直前期（残り7日以内）は間隔×0.5。

## 10. 11月8日までの学習戦略（残り日数で自動移行）

| フェーズ | 期間（残り日数） | 目的 | パラメータ |
|---|---|---|---|
| 1 全体把握 | 45〜33日（〜10/6） | 3分野を広く触る。完璧主義にしない | a=0.6、新規Concept優遇×1.3 |
| 2 頻出Concept習得 | 32〜18日（〜10/21） | 頻出S/Aを固める | a=1.0、新規×1.0 |
| 3 弱点圧縮 | 17〜8日（〜10/31） | 苦手の頻出Conceptに集中 | a=1.3、新規×0.7、Weakness重視 |
| 4 直前対策 | 7〜0日 | 新規を減らし、頻出×苦手×忘れかけ | a=1.8、新規×0.3、SRS間隔×0.5 |

- 1日の目安: 20分 ≒ 18問（1.1分/問）。設定で10/20/30分。
- 今日の内訳は固定比率ではなく、優先度の貪欲選択の結果として「弱点復習◯・頻出◯・忘却防止◯・新規◯」が決まり、画面に表示する。
- 同一Conceptは1セッション最大2問、連続させない。

## 11. MVP機能一覧

**MVP（今回実装）**: 問題DB（15回1,500問・原本画像・公式正答・出典）/ 一問一答 / 自信度つき即時採点 / 解説（構造化・段階表示、未作成は「準備中」＋Conceptカード）/ 回答履歴 / 試験日カウントダウン / 今日の学習（Adaptive）/ 5分だけ復習 / 弱点克服 / 自由演習（分野・年度）/ 直前対策 / 間違いノート / 初回診断 / 分野別分析 / Concept Mastery / Frequency Score / Priority / SRS / 学習フェーズ / バックアップ
**次**: 解説の順次作成（頻出Concept順）、Concept自動分類の校正、REVIEW_REQUIREDの判定、公式サイトからの再取得・照合
**その後**: AI類題（`source_type=AI_GENERATED`、自己検証つき）、模擬試験（100問120分）、管理画面

## 12. 画面一覧

1. ホーム（試験まであと○日・フェーズ・今日の進捗・[今日の学習をはじめる]・[5分だけ復習]・総合理解度・3分野バー・今週の重点TOP3）
2. 学習（モード選択: 今日の学習／弱点克服／自由演習／直前対策／5分だけ復習／初回診断）
3. 問題（1画面1問・なぜこの問題？・出典・原本画像/本文・ア〜エ・自信あり/迷って回答）
4. 解答結果（正誤・正答・結論・理由・ひっかけ・一言記憶／[詳しく理解する]で誤答選択肢・詳細・Conceptカード）
5. 学習終了（問題数・正解数・定着したテーマ・重点復習・次回予告）
6. 復習（間違いノート: 今日復習すべき間違い / Concept別一覧）
7. 分析（指標6種・3分野・大分類ツリー・Concept一覧（優先度・出題頻度）・過去15回の出題傾向）
8. 設定（試験日・学習時間・バックアップ・データ情報・出典と利用条件）

## 13. 画面遷移

```
[下部タブ] ホーム ─ 学習 ─ 復習 ─ 分析 ─ 設定
ホーム ─[今日の学習をはじめる]→ 問題 ⇄ 解答結果 →…→ 学習終了 → ホーム
ホーム ─[5分だけ復習]→ 問題 …
学習 ─[各モード]→ 問題 …        復習 ─[今日復習すべき間違い]→ 問題 …
初回起動 → ホーム（診断カードのみ表示）─[診断をはじめる(15問)]→ 問題 … → 診断結果 → ホーム
問題画面・結果画面ではタブを隠す（集中）。途中離脱しても1問ごとに保存。
```

## 14. UI/UX方針

- **知的 × 温かい × シンプル**。モバイルファースト、余白多め、カードUI、親指ゾーンに主ボタン固定、タップ領域48px以上。
- 配色: 深い藍（主）＋生成り背景＋落ち着いた緑（正解）＋テラコッタ（不正解・赤は使わない）。アニメーションはフェード程度。
- 言葉: 不正解は「正解は ウ でした。ここで気づけたのは収穫です」。過剰に褒めない、絵文字・紙吹雪なし。
- 常に「なぜ」を出す: 各問題に理由チップ（例「弱点復習：データベース（正答率40%）」「頻出：本試験で平均2.1問」）。
- 数字は根拠のあるものだけ。**合格率・合格確率は表示しない**。
- ホームに細かい分析を出さない（重点TOP3まで）。

## 15. 技術構成

- React 19 + TypeScript + Vite + PWA（vite-plugin-pwa）、Dexie（IndexedDB）… cfp-study と同じ構成
- 学習者データは端末内のみ（バックアップJSON書き出し/復元）。サーバー不要・通信待ちゼロ。
- 問題・Concept は生成JSONを同梱。原本画像は実行時キャッシュ（初回表示時に保存、オフライン可）。
- データパイプライン: Swift（PDFKit+Vision OCR）/ Python（pypdf, Pillow）。
- テスト: Vitest（エンジン単体・データ整合性・画面）。

## 16. リスクと対策

| リスク | 対策 |
|---|---|
| OCR誤りが学習に混入 | 表示は原本画像が正本。テキストは校正済みのみ表示 |
| 公式正答の誤取得 | 解答はテキストPDFから機械抽出（OCR不使用）、1,500/1,500件・各回100件を検証 |
| 自動Concept分類の誤り → 頻度分析の歪み | 信頼度を保持、頻出上位・直近回から校正（CURATED）で上書き。頻度はConcept単位で集計し個別誤りの影響を薄める |
| 法改正・制度変更で古い正答が現在は誤り | 2022年以前×リスク語（個人情報保護法、下請法、WEP等）は REVIEW_REQUIRED で除外。改変時は原文・改変理由・出典を保持 |
| AI解説のハルシネーション | 解説データに「解説が前提とする正答」を持たせ、公式正答と不一致なら採用せずエラーログ |
| 2027新制度問題の混入 | exam_scope 必須、CURRENT_2026 以外は候補から除外 |
| 取得経路（アーカイブ） | 9/29以降に公式URLから再取得しSHA-256照合 |
| 開発が学習時間を侵食（CFPアプリと同じ罠） | MVP凍結。追加機能は「11/8の得点を上げるか」で判定し docs/03_parking_lot.md へ |
| 解説未作成の問題が多い | 頻出Concept・直近回から順に作成。未作成でもConceptカード（シラバスの学習内容・用語）で最低限の復習が可能 |

## 17. 実装順序

1. ✅ 一次情報調査（公開問題・解答・シラバス・利用条件・2027新制度）
2. ✅ 取得（15回30ファイル）→ OCR → 構造化 → 品質チェック
3. ✅ Taxonomy（シラバスVer.6.5→180 Concept）→ 自動分類 → Frequency Score
4. ✅ アプリ骨格・DB・エンジン（Mastery/Priority/SRS/フェーズ/セッション生成）
5. ✅ 画面（ホーム・問題・結果・終了・学習・復習・分析・設定・診断）
6. ✅ E2E: 令和8年度の少数問題に校正本文・Concept・解説を付けて通し確認
7. ⏭ 解説・Concept校正を頻出順に拡充（令和8→7→6…）、REVIEW_REQUIRED判定
8. ⏭ 9/29以降 公式URLで再取得・照合
9. ⏭ 模擬試験・AI類題（Feature Gateを通れば）
