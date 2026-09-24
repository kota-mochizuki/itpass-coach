#!/bin/bash
# 取得済みの問題冊子PDFをすべてOCR（済みはスキップ）
cd "$(dirname "$0")/.." || exit 1
swiftc -O scripts/ocr_pdf.swift -o data/ocr_pdf 2>/dev/null || true
for f in data/raw/*_ip_qs.pdf; do
  e=$(basename "$f" _ip_qs.pdf)
  [ -f "data/pages/$e/.done" ] && continue
  file "$f" | grep -q PDF || continue
  ./data/ocr_pdf "$f" "data/pages/$e" 2>/dev/null && touch "data/pages/$e/.done" && echo "ocr $e"
done
