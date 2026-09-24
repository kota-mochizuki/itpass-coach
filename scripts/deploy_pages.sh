#!/bin/bash
# テスト → ビルド → app/dist を gh-pages ブランチへ公開（GitHub Pages）
set -euo pipefail
cd "$(dirname "$0")/../app"
npm test
npm run build
touch dist/.nojekyll
cd dist
rm -rf .git
git init -q -b gh-pages
git add -A
git commit -q -m "deploy $(date '+%Y-%m-%d %H:%M')"
git push -f -q "$(git -C ../.. remote get-url origin)" gh-pages
rm -rf .git
echo "deployed"
