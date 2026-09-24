"""IPA公開問題1回分を構造化する。

入力 : data/raw/{exam}_ip_ans.pdf（テキストPDF）, data/pages/{exam}/pNN.png/json（OCR済みページ）
出力 : data/build/exams/{exam}.json … 問題（OCR本文・選択肢・公式正答・出典・品質チェック結果）
       app/public/q/{exam}/{NNN}.png … 公式問題冊子から切り出した原本画像（表示の正本）

方針:
- 公式正答は解答PDFのテキストから機械的に取得（OCRを通さない）。
- 本文はOCRのため誤認識がありうる → text_status='ocr'。表示は原本画像を正とする。
- 品質チェックで疑わしい問題は qc_flags に理由を残し、validity_status=REVIEW_REQUIRED とする。
使い方: python3 scripts/parse_exam.py 2026r08 [2025r07 ...] | all
"""
import json, re, sys, unicodedata, pathlib
import pypdf
from PIL import Image

ROOT = pathlib.Path(__file__).resolve().parent.parent
RAW, PAGES = ROOT / 'data/raw', ROOT / 'data/pages'
OUT, IMG = ROOT / 'data/build/exams', ROOT / 'app/public/q'
BASE_URL = 'https://www3.jitec.ipa.go.jp/JitesCbt/html/openinfo/pdf/questions/'
LABELS = 'アイウエ'
ERA = {'h': '平成', 'r': '令和'}
TERM = {'h': '春期', 'a': '秋期', 'o': '10月', 'tokubetsu': '特別'}


def exam_meta(exam: str) -> dict:
    m = re.match(r'^(\d{4})([hr])(\d{2})(h|a|o|tokubetsu)?$', exam)
    year, era, n, term = int(m.group(1)), m.group(2), int(m.group(3)), m.group(4)
    era_year = '元' if n == 1 else str(n)
    parts = [f'{ERA[era]}{era_year}年度']
    if term: parts.append(TERM[term])
    label = ' '.join(parts)
    return {'exam_id': exam, 'year': year, 'label': label,
            'exam_name': f'{label} ITパスポート試験' + ('' if term else ' 公開問題'),
            # 年度内の順序（春→秋）。recency計算用に年の小数で持つ
            'time': year + {None: 0.3, 'h': 0.3, 'a': 0.8, 'o': 0.8, 'tokubetsu': 0.5}[term]}


def parse_answers(exam: str) -> dict[int, str]:
    """解答PDFはテキストPDF。年度により layout/plain の抽出可否が違うため多い方を採る。"""
    r = pypdf.PdfReader(str(RAW / f'{exam}_ip_ans.pdf'))
    best = {}
    for mode in ('plain', 'layout'):
        txt = '\n'.join((p.extract_text(extraction_mode=mode) or '') for p in r.pages)
        txt = unicodedata.normalize('NFKC', txt)
        ans = {int(m.group(1)): m.group(2) for m in re.finditer(r'問\s*(\d{1,3})\s+([^\s問]+)', txt)}
        if len(ans) > len(best): best = ans
    return best


def norm_label(s: str) -> str:
    return s.replace('工', 'エ').replace('ェ', 'エ').replace('I', 'エ') if s else s


def load_lines(exam: str):
    lines = []
    for jf in sorted((PAGES / exam).glob('p*.json')):
        page = int(jf.stem[1:])
        for l in json.loads(jf.read_text()):
            if l['y'] < 0.05 or l['y'] > 0.925: continue  # ヘッダ・ページ番号
            t = unicodedata.normalize('NFKC', l['text']).strip()
            if not t: continue
            lines.append({**l, 'text': t, 'page': page})
    lines.sort(key=lambda l: (l['page'], round(l['y'] / 0.012), l['x']))
    return lines


HEAD = re.compile(r'^[・.\s]*[問間]?\s*(\d{1,3})\s*(.*)$')
SECTION = re.compile(r'^問\s*\d+\s*から問\s*\d+\s*まで')
CASE = re.compile(r'中問|次の.*問\s*\d+\s*[~〜～]\s*問?\s*\d+')
CHOICE_RE = re.compile(r'^([アイウエ工])\s*(.*)$')
CHOICE_COLS = ((0.10, 0.175), (0.29, 0.37), (0.47, 0.555), (0.66, 0.74))


class _Choice:
    """選択肢ラベルは所定の桁位置（1列/2列/4列配置）にある行頭のア〜エだけを採る。"""
    def match(self, l):
        if not any(a <= l['x'] <= b for a, b in CHOICE_COLS): return None
        return CHOICE_RE.match(l['text'])


CHOICE = _Choice()


def segment(lines, n_questions):
    """問Nの見出しでブロック化。見出しは番号が連番であることを条件に採用する。"""
    blocks, expect, cur = [], 1, None
    for l in lines:
        if SECTION.match(l['text']) and l['x'] < 0.2:
            if cur: cur['end_marker'] = (l['page'], l['y'])
            cur = None; continue
        m = HEAD.match(l['text'])
        has_mon = bool(re.match(r'^[・.\s]*[問間]', l['text']))
        n = int(m.group(1)) if m else -1
        # 見出し: 左余白にある「問N」。OCRで「問」が落ちた場合はより左端のみ許容
        if m and l['x'] < (0.14 if has_mon else 0.12) and (n == expect or (has_mon and n == expect + 1)):
            if n == expect + 1:
                # 問expectの見出しをOCRが取りこぼした → 直前ブロックに2問分が混在。両方を要確認にする
                if cur: cur['merged_missing'] = expect
                blocks.append({'no': expect, 'lines': [], 'start': (l['page'], l['y']),
                               'missing_header': True, 'alias_of': cur['no'] if cur else None})
            cur = {'no': n, 'lines': [], 'start': (l['page'], l['y'])}
            blocks.append(cur); expect = n + 1
            if m.group(2): cur['lines'].append({**l, 'text': m.group(2), 'x': l['x'] + 0.05})
            continue
        if SECTION.match(l['text']) and l['x'] < 0.2:
            if cur: cur['end_marker'] = (l['page'], l['y'])
            cur = None; continue
        if cur is not None: cur['lines'].append(l)
    return blocks


def split_stem_choices(block):
    stem, choices, cur = [], {}, None
    lines = block['lines']
    # 選択肢の開始 = 行頭がアで、以降にイが現れる最初の位置
    start = None
    for i, l in enumerate(lines):
        m = CHOICE.match(l)
        if m and norm_label(m.group(1)) == 'ア' and any(
                (mm := CHOICE.match(x)) and norm_label(mm.group(1)) == 'イ' for x in lines[i + 1:]):
            start = i
    if start is None:
        return lines, {}, []
    # 末尾側から探したアの位置（本文中の箇条書き「ア」誤検出を避ける）
    stem = lines[:start]
    extra = []
    order = iter(LABELS)
    want = next(order)
    for l in lines[start:]:
        m = CHOICE.match(l)
        if m and want and norm_label(m.group(1)) == want:
            cur = want; choices[cur] = m.group(2).strip(); want = next(order, None)
        elif cur and l['x'] > 0.14 and len(l['text']) > 0:
            choices[cur] = (choices[cur] + l['text']).strip()
        else:
            extra.append(l)
    return stem, choices, extra


def join_text(ls):
    out = ''
    for l in ls:
        t = l['text']
        if out and re.match(r'^[a-zA-Z0-9]', t) and re.search(r'[a-zA-Z0-9]$', out): out += ' '
        out += t if not re.match(r'^[a-e]\s', t) else '\n' + t
    return out.strip()


def crop(exam, no, regions):
    parts = []
    for page, y0, y1 in regions:
        im = Image.open(PAGES / exam / f'p{page:02d}.png').convert('L')
        W, H = im.size
        parts.append(im.crop((int(W * 0.07), int(H * max(0, y0)), int(W * 0.93), int(H * min(0.93, y1)))))
    w = max(p.width for p in parts); h = sum(p.height for p in parts)
    canvas = Image.new('L', (w, h), 255); y = 0
    for p in parts: canvas.paste(p, (0, y)); y += p.height
    # 下側の余白を詰める。スキャンのゴミ（小さな点）は無視し、暗い画素が一定数ある最後の行まで残す
    px = canvas.load()
    last = 0
    for yy in range(h):
        dark = sum(1 for xx in range(0, w, 2) if px[xx, yy] < 110)
        if dark >= 4: last = yy
    canvas = canvas.crop((0, 0, w, min(h, last + 28))); h = canvas.height
    target_w = 1000
    canvas = canvas.resize((target_w, int(h * target_w / w)), Image.LANCZOS)
    canvas = canvas.quantize(colors=8)
    (IMG / exam).mkdir(parents=True, exist_ok=True)
    path = IMG / exam / f'{no:03d}.png'
    canvas.save(path, optimize=True)
    return f'q/{exam}/{no:03d}.png'


def regions_of(blocks, i, lines):
    b = blocks[i]
    if b.get('missing_header') and i > 0:
        return regions_of(blocks, i - 1, lines)
    p0, y0 = b['start']
    if 'end_marker' in b: p1, y1 = b['end_marker']
    elif i + 1 < len(blocks): p1, y1 = blocks[i + 1]['start']
    else:
        last = max((l for l in b['lines']), key=lambda l: (l['page'], l['y']), default=None)
        p1, y1 = (last['page'], last['y'] + last['h'] + 0.02) if last else (p0, 0.92)
    # 次の見出しより前にある「中問」導入文は含めない
    regs = []
    for p in range(p0, p1 + 1):
        a = y0 - 0.012 if p == p0 else 0.06
        z = y1 - 0.012 if p == p1 else 0.92
        if p != p0 and p != p1 or True:
            # 途中ページの本文が本当にこの問題のものか（空白ページ・別見出し除外）
            if not any(l['page'] == p for l in b['lines']) and p not in (p0, p1): continue
        if z - a > 0.02: regs.append((p, a, z))
    return regs


def qc(q, raw_ans):
    flags = []
    if q['official_answer'] not in LABELS:
        flags.append(f'公式正答が単一の記号でない: {raw_ans}')
    if len(q['choices']) < 4: flags.append(f'選択肢の抽出不足({len(q["choices"])}/4)')
    if any(not v for v in q['choices'].values()): flags.append('選択肢本文が空（表形式の可能性）')
    if len(q['question_text']) < 10: flags.append('問題文が短すぎる（抽出エラーの可能性）')
    if q['has_figure']: flags.append('図表あり（原本画像で表示）')
    return flags


DOMAIN_JA = {'ストラテジ': 'strategy', 'マネジメント': 'management', 'テクノロジ': 'technology'}


def domain_ranges(lines):
    """問題冊子の「問1から問34までは，ストラテジ系の問題です」から公式の分野区分を得る。"""
    out = []
    for l in lines:
        m = re.search(r'問\s*(\d+)\s*から問\s*(\d+)\s*まで.*?(ストラテジ|マネジメント|テクノロジ)', l['text'])
        if m: out.append((int(m.group(1)), int(m.group(2)), DOMAIN_JA[m.group(3)]))
    return out


def build(exam):
    meta = exam_meta(exam)
    answers = parse_answers(exam)
    lines = load_lines(exam)
    ranges = domain_ranges(lines)
    if len(ranges) != 3 or ranges[-1][1] != 100: raise SystemExit(f'{exam}: 分野区分を取得できない {ranges}')
    blocks = segment(lines, 100)
    out = []
    for i, b in enumerate(blocks):
        stem, choices, extra = split_stem_choices(b)
        text = join_text(stem)
        has_fig = bool(extra) or any(l['x'] > 0.25 and l['w'] < 0.3 for l in stem) or not choices
        raw = answers.get(b['no'], '')
        q = {
            'question_id': f'IPA-{exam}-{b["no"]:03d}',
            'exam_id': exam, 'question_number': b['no'],
            'question_text': text,
            'choices': {k: choices.get(k, '') for k in LABELS if k in choices},
            'official_answer': raw if raw in LABELS else '',
            'image': crop(exam, b['no'], regions_of(blocks, i, lines)),
            'has_figure': has_fig,
            'domain': next(d for a, z, d in ranges if a <= b['no'] <= z),
            'text_status': 'ocr',
            'source_type': 'IPA_OFFICIAL', 'source_organization': 'IPA',
            'source_year': meta['year'], 'exam_name': meta['exam_name'], 'exam_time': meta['time'],
            'source_url': BASE_URL + f'{exam}_ip_qs.pdf', 'answer_url': BASE_URL + f'{exam}_ip_ans.pdf',
            'source_document': f'{exam}_ip_qs.pdf',
            'citation': f'出典：{meta["exam_name"]} 問{b["no"]}',
            'exam_scope': 'CURRENT_2026',
        }
        q['qc_flags'] = qc(q, raw)
        if b.get('missing_header') or b.get('merged_missing'):
            q['qc_flags'].append('問題番号の見出しを抽出できず、前後の問題と混在（要校正）')
        out.append(q)
    missing = sorted(set(answers) - {q['question_number'] for q in out})
    OUT.mkdir(parents=True, exist_ok=True)
    report = {'exam': meta, 'questions_found': len(out), 'answers_found': len(answers),
              'missing_numbers': missing,
              'flagged': sum(1 for q in out if any(not f.startswith('図表') for f in q['qc_flags']))}
    (OUT / f'{exam}.json').write_text(json.dumps({'meta': meta, 'report': report, 'questions': out},
                                                 ensure_ascii=False, indent=1))
    print(exam, report)


if __name__ == '__main__':
    exams = sys.argv[1:]
    if exams == ['all']:
        exams = sorted(p.name for p in PAGES.iterdir() if (p / '.done').exists())
    for e in exams: build(e)
