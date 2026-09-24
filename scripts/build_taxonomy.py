"""IPA ITパスポート試験シラバス Ver.6.5 から Concept Taxonomy を生成する。

階層: 分野(domain) → 大分類 → 中分類 → 小分類(1〜63) → Concept（小分類内の (n) 項目、①があればその単位）
Concept ID: C{小分類}.{n}[.{①番号}]  例: C63.6 = 情報セキュリティ対策・実装技術 / (6) 公開鍵基盤
各 Concept に用語例・活用例をキーワードとして保持する（過去問の自動Concept分類に使う）。
出力: data/build/taxonomy.json
"""
import json, re, unicodedata, pathlib

ROOT = pathlib.Path(__file__).resolve().parent.parent
SRC = ROOT / 'data/syllabus/syllabus_ip_ver6_5.txt'
OUT = ROOT / 'data/build/taxonomy.json'

CJK = r'[　-ヿ一-鿿！-｠ー]'
CIRCLED = '①②③④⑤⑥⑦⑧⑨⑩⑪⑫'
DOMAIN_OF_LARGE = {1: 'strategy', 2: 'strategy', 3: 'strategy', 4: 'management', 5: 'management', 6: 'management',
                   7: 'technology', 8: 'technology', 9: 'technology'}


def norm(s: str) -> str:
    s = unicodedata.normalize('NFKC', s)
    for _ in range(3):
        s = re.sub(rf'({CJK})\s+({CJK})', r'\1\2', s)
    return re.sub(r'\s+', ' ', s).strip()


def split_terms(s: str) -> list[str]:
    s = norm(s)
    out, depth, cur = [], 0, ''
    for ch in s:
        if ch in '(（': depth += 1
        if ch in ')）': depth -= 1
        if ch in ',，、' and depth == 0:
            out.append(cur); cur = ''
        else:
            cur += ch
    out.append(cur)
    terms = []
    for t in out:
        t = t.strip()
        if not t: continue
        terms.append(t)
        # 「CSR（Corporate Social Responsibility）」→ CSR と括弧内の日本語も別キーワード化
        m = re.match(r'^(.+?)\((.+)\)$', t)
        if m:
            terms.append(m.group(1).strip())
            for inner in re.split(r'[:：,，]', m.group(2)):
                inner = inner.strip()
                if inner and re.search(CJK, inner): terms.append(inner)
    return list(dict.fromkeys(t for t in terms if 1 < len(t) < 40))


def main():
    lines = SRC.read_text().split('\n')
    body_start = next(i for i, l in enumerate(lines) if i > 200 and re.match(r'^1\.\s*経営・組織論\s*$', l.strip()))
    lines = [l for l in lines[body_start:] if not re.match(r'^\s*(- \d+ -|Copyright)', l)]

    # 目次から 大分類・中分類 と 小分類の対応
    toc = SRC.read_text().split('\n')[:body_start]
    large, middle, small_parent = {}, {}, {}
    cur_l = cur_m = None
    for l in toc:
        s = norm(l)
        if m := re.match(r'^大分類 (\d+):(.+)$', s):
            cur_l = int(m.group(1)); large[cur_l] = m.group(2).split('中分類')[0].strip()
            # 「大分類 1:企業と法務 中分類 1:企業活動」のように同じ行に続く場合
            if mm := re.search(r'中分類 (\d+):([^.]+)', s):
                cur_m = int(mm.group(1)); middle[cur_m] = {'name': mm.group(2).strip(), 'large': cur_l}
        elif m := re.match(r'^中分類 (\d+):([^.]+)', s): cur_m = int(m.group(1)); middle[cur_m] = {'name': m.group(2).strip(), 'large': cur_l}
        elif m := re.match(r'^(\d+)\. ([^.]+)', s):
            small_parent[int(m.group(1))] = (m.group(2).strip(), cur_m)

    concepts, smalls = [], []
    cur_small = cur_item = None
    cur_concept = None
    mode = None  # 'terms' | 'uses'

    def new_concept(cid, name, item_name=None):
        nonlocal cur_concept
        sname, mid = small_parent[cur_small]
        lg = middle[mid]['large']
        cur_concept = {
            'concept_id': cid, 'concept_name': name, 'item_name': item_name,
            'domain': DOMAIN_OF_LARGE[lg], 'large_id': lg, 'large_name': large[lg],
            'middle_id': mid, 'middle_name': middle[mid]['name'],
            'small_id': cur_small, 'small_name': sname,
            'points': [], 'terms': [], 'uses': [],
        }
        concepts.append(cur_concept)

    buf = ''
    def flush():
        nonlocal buf
        if buf and cur_concept is not None:
            (cur_concept['terms'] if mode == 'terms' else cur_concept['uses']).extend(split_terms(buf))
        buf = ''

    for raw in lines:
        s = norm(raw)
        if m := re.match(r'^(\d+)\.\s*(.+)$', s):
            n = int(m.group(1))
            if n in small_parent and norm(small_parent[n][0]).replace(' ', '') == m.group(2).replace(' ', ''):
                flush(); mode = None; cur_small = n; cur_item = None; cur_concept = None
                smalls.append({'small_id': n, 'name': small_parent[n][0], 'middle_id': small_parent[n][1]})
                continue
        if cur_small is None: continue
        if m := re.match(r'^\((\d+)\)\s*(.+)$', s):
            flush(); mode = None
            cur_item = (int(m.group(1)), m.group(2))
            new_concept(f'C{cur_small}.{cur_item[0]}', cur_item[1])
            continue
        if s and s[0] in CIRCLED and cur_item:
            flush(); mode = None
            k = CIRCLED.index(s[0]) + 1
            # ①が出たら親 (n) は見出しだけの器なので、中身が空なら捨てる
            if concepts and concepts[-1]['concept_id'] == f'C{cur_small}.{cur_item[0]}' and not concepts[-1]['terms']:
                parent_points = concepts.pop()['points']
            new_concept(f'C{cur_small}.{cur_item[0]}.{k}', s[1:].strip(), cur_item[1])
            continue
        if s.startswith('用語例'):
            flush(); mode = 'terms'; buf = s[3:]; continue
        if s.startswith('活用例'):
            flush(); mode = 'uses'; buf = s[3:]; continue
        if s.startswith('・'):
            flush(); mode = None
            if cur_concept: cur_concept['points'].append(s[1:])
            continue
        if not s or s.startswith('【') or s.startswith('✓') or s.startswith('➢'):
            flush(); mode = None; continue
        if mode: buf += s
        elif cur_concept and cur_concept['points']:
            cur_concept['points'][-1] += s
    flush()

    OUT.parent.mkdir(parents=True, exist_ok=True)
    out = {
        'source': {'title': 'ITパスポート試験 シラバス Ver.6.5', 'organization': 'IPA', 'published': '2026-01',
                   'url': 'https://www.ipa.go.jp/shiken/syllabus/omgdg50000005kn1-att/syllabus_ip_ver6_5.pdf'},
        'large': large, 'middle': middle, 'small': smalls, 'concepts': concepts,
    }
    OUT.write_text(json.dumps(out, ensure_ascii=False, indent=1))
    print(f'small={len(smalls)} concepts={len(concepts)} terms={sum(len(c["terms"]) for c in concepts)}')


if __name__ == '__main__':
    main()
