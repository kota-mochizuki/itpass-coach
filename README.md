# iパス コーチ（itpass-coach）

2026/11/8 ITパスポート試験に向けた、IPA公式過去問ベースの適応型学習PWA。設計は `docs/01_design.md`。

## 使う
```bash
cd app && npm run dev        # http://localhost:5173 （同じWi-FiのスマホからはMacのIPで）
npm run build && npm run preview   # 本番ビルド（PWA・オフライン可）
npm test                     # エンジン・データ整合性・E2E
```

## データを作り直す
```bash
./scripts/fetch_ipa.sh                 # 公開問題・解答PDF（公式URL優先、失敗時は同一URLのアーカイブ）
./scripts/ocr_all.sh                   # ページ画像化 + macOS Vision OCR
python3 scripts/build_taxonomy.py      # シラバスVer.6.5 → Concept 180
python3 scripts/parse_exam.py all      # 問題分割・公式正答・原本画像・品質チェック
python3 scripts/build_dataset.py       # 分類・シラバス照合・Frequency Score → app/src/data/generated
```
校正・解説の追加は `data/curation/{年度}.json`（形式: `docs/02_data_format.md`）。
