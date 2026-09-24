#!/bin/bash
# IPA公開問題（ITパスポート）の問題冊子・解答PDFを取得する。
# 1) IPA公式URLを優先。PDFでなければ（メンテナンス等）2) Internet Archive の同一URLの保存版を使う。
# 出典の source_url は常に IPA 公式URLを記録する（取得経路は manifest の fetched_via に残す）。
cd "$(dirname "$0")/../data/raw" || exit 1
BASE="https://www3.jitec.ipa.go.jp/JitesCbt/html/openinfo/pdf/questions"
EXAMS="2016h28h 2016h28a 2017h29h 2017h29a 2018h30h 2018h30a 2019h31h 2019r01a 2020r02o 2021r03 2022r04 2023r05 2024r06 2025r07 2026r08"
echo "file,fetched_via,retrieved_at,sha256" > manifest.csv.tmp
for e in $EXAMS; do for k in qs ans; do
  f="${e}_ip_${k}.pdf"; via=ipa
  if ! file "$f" 2>/dev/null | grep -q PDF; then
    curl -sL -m 120 -o "$f" "$BASE/$f"
    if ! file "$f" | grep -q PDF; then
      via=web.archive.org
      for i in 1 2 3; do
        curl -sL -m 180 -o "$f" "https://web.archive.org/web/2026id_/$BASE/$f"
        file "$f" | grep -q PDF && break; sleep 5
      done
    fi
  else via=cached; fi
  ok=$(file "$f" | grep -q PDF && echo ok || echo NG)
  echo "$f $via $ok"
  echo "$f,$via,$(date -u +%FT%TZ),$(shasum -a 256 "$f" | cut -d' ' -f1)" >> manifest.csv.tmp
done; done
mv manifest.csv.tmp manifest.csv
