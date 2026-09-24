"""全年度の構造化データ＋校正データ(curation)を統合し、アプリ用データを生成する。

1. Concept自動分類（シラバス用語例＋補足キーワード）… 校正データに concept_ids があればそちらを優先
2. 現行シラバス照合（validity_status）… ルール＋校正データ
3. Concept別 出題統計と Frequency Score
4. 出力: app/src/data/generated/{concepts,questions,meta}.json

使い方: python3 scripts/build_dataset.py
"""
import json, re, math, unicodedata, pathlib, datetime
from collections import defaultdict

ROOT = pathlib.Path(__file__).resolve().parent.parent
TAX = json.loads((ROOT / 'data/build/taxonomy.json').read_text())
SUPP = json.loads((ROOT / 'data/concept_supplement.json').read_text())
EXAMS_DIR, CUR_DIR = ROOT / 'data/build/exams', ROOT / 'data/curation'
OUT = ROOT / 'app/src/data/generated'

NOW = 2026.85            # 基準時点（2026年11月）
HALF_LIFE = 3.0          # 出題の新しさの半減期（年）
LABELS = 'アイウエ'


def norm(s: str) -> str:
    s = unicodedata.normalize('NFKC', s or '').lower()
    return re.sub(r'\s+', '', s)


# ---------- 1. Concept 分類 ----------
concepts = {c['concept_id']: c for c in TAX['concepts']}
unknown = [k for k in SUPP if not k.startswith('_') and k not in concepts]
if unknown: print('WARN supplement ids not in taxonomy:', unknown)

keywords = []  # (normalized term, concept_id, weight)
for c in TAX['concepts']:
    terms = [(t, 1.0) for t in c['terms']] + [(t, 1.0) for t in SUPP.get(c['concept_id'], [])]
    terms += [(t, 0.6) for t in c['uses']] + [(c['concept_name'], 0.8)]
    for t, w in terms:
        n = norm(re.sub(r'\(.*?\)', '', t))
        if len(n) < 2 or n in ('など', 'ほか', '開発者'): continue
        # 短い英字略語は誤検出が多いので単語境界つきで照合
        is_acro = bool(re.fullmatch(r'[a-z0-9/\-]{2,4}', n))
        keywords.append((n, c['concept_id'], w * min(len(n), 8) / 4, is_acro))


def _doc(q): return norm(q['question_text']), norm(' '.join(q['choices'].values()))


def _hit(n, acro, text):
    return re.search(rf'(?<![a-z]){re.escape(n)}(?![a-z])', text) if acro else (n in text)


IDF = {}


def fit_idf(qs):
    """多くの問題に現れる語（例: コンピュータ、システム）は分類の手掛かりとして弱いので下げる。"""
    docs = [''.join(_doc(q)) for q in qs]
    N = len(docs)
    for n, cid, w, acro in keywords:
        if n in IDF: continue
        df = sum(1 for d in docs if _hit(n, acro, d))
        IDF[n] = math.log((N + 1) / (df + 1)) / math.log(N + 1)


DOMAIN_OF = {c['concept_id']: c['domain'] for c in TAX['concepts']}


def classify(q):
    body, ch = _doc(q)
    score = defaultdict(float)
    for n, cid, w, acro in keywords:
        for text, tw in ((body, 1.0), (ch, 0.6)):
            if DOMAIN_OF[cid] != q['domain']: continue   # 公式の分野区分の中でだけ分類する
            if _hit(n, acro, text): score[cid] += w * tw * IDF.get(n, 1.0)
    ranked = sorted(score.items(), key=lambda kv: -kv[1])
    if not ranked: return [], 0.0
    top = ranked[0][1]
    ids = [ranked[0][0]] + [cid for cid, s in ranked[1:3] if s >= top * 0.7]
    second = ranked[1][1] if len(ranked) > 1 else 0
    return ids, round(top / (top + second), 2)


# ---------- 2. 現行シラバス照合ルール ----------
# 法改正・制度変更・技術の陳腐化で、古い公式正答が2026年現在も正しいとは限らない語。
# 該当した2022年以前の問題は REVIEW_REQUIRED（通常出題から外し、校正で判定）にする。
RISK_TERMS = {
    '下請法': 'シラバスVer.6.5で下請法は削除、中小受託取引適正化法に置換',
    '下請代金支払遅延等防止法': 'シラバスVer.6.5で下請法は削除、中小受託取引適正化法に置換',
    '個人情報保護法': '個人情報保護法は2017・2022年に大改正（旧制度前提の可能性）',
    '個人情報取扱事業者': '2017年改正で5,000件要件が撤廃',
    '5,000': '個人情報の5,000件要件は2017年に撤廃（該当なら旧制度）',
    '番号法': 'マイナンバー制度の運用変更の可能性',
    'jisq27001:2006': 'ISMS規格は2014・2023年に改訂',
    'jisq27002:2006': 'ISMS規格は2014・2023年に改訂',
    'itilv2': 'ITILは版改訂（v3/4）',
    '共通フレーム2007': '共通フレームは2013に改訂',
    'システム管理基準(平成16': 'システム管理基準は2018・2023年に改訂',
    'windowsxp': 'サポート終了OS',
    'wep': '無線LANのWEPは現在推奨されない（WPA2/WPA3）',
    '住民基本台帳カード': '住基カードは発行終了',
    'ipv4アドレスの枯渇': '情勢変化',
    'e-文書法': '電子帳簿保存法等の改正あり',
    '電子帳簿保存法': '2022年改正あり',
    '労働者派遣法': '2015年改正（期間制限等）',
    '特定電子メール法': '改正あり',
    'プロバイダ責任制限法': '2024年に情報流通プラットフォーム対処法へ改称・改正',
    'サイバーセキュリティ経営ガイドライン': 'Ver3.0(2023)に改訂',
}
OUTDATED_RULES = []  # 明確に不適切と確定したものは curation 側で OUTDATED を付ける


def validity(q, cids):
    notes = []
    t = norm(q['question_text'] + ''.join(q['choices'].values()))
    if q['source_year'] <= 2022:
        for k, why in RISK_TERMS.items():
            if norm(k) in t: notes.append(why)
    if not q['official_answer']: notes.append('公式正答を取得できない（全員正解等の可能性）')
    if any(f.startswith('問題文が短すぎる') for f in q['qc_flags']): notes.append('抽出エラーの可能性')
    status = 'REVIEW_REQUIRED' if notes else 'CURRENT'
    return status, notes


# ---------- 読み込み ----------
questions = []
exams = []
for f in sorted(EXAMS_DIR.glob('*.json')):
    d = json.loads(f.read_text())
    exams.append(d['meta'] | {'report': d['report']})
    cur_path = CUR_DIR / f.name
    cur = json.loads(cur_path.read_text()) if cur_path.exists() else {}
    for q in d['questions']:
        o = cur.get(str(q['question_number']), {})
        q = {**q, **{k: v for k, v in o.items() if not k.startswith('_')}, '_cur': o}
        questions.append(q)

fit_idf(questions)
EXPL_FIELDS = ['short_explanation', 'reason', 'wrong_choice_explanations', 'trap_point', 'memory_tip',
               'detailed_explanation', 'explanation_source']
explanation_errors = []


def guard_explanation(q):
    """解説は、それが前提とする正答（explanation_answer）が公式正答と一致する場合だけ採用する。"""
    if not any(k in q for k in EXPL_FIELDS): return
    ea = q.pop('explanation_answer', None)
    wrong = q.get('wrong_choice_explanations') or {}
    ok = ea == q['official_answer'] and (not wrong or str(wrong.get(ea, '')).startswith('正解'))
    if not ok:
        explanation_errors.append({'question_id': q['question_id'], 'official_answer': q['official_answer'],
                                   'explanation_answer': ea, 'reason': '解説の前提正答が公式正答と一致しない、または未記載'})
        for k in EXPL_FIELDS: q.pop(k, None)


for q in questions:
        o = q.pop('_cur')
        guard_explanation(q)
        auto_ids, conf = classify(q)
        if 'concept_ids' in o:
            q['concept_source'] = 'CURATED'; q['concept_confidence'] = 1.0
        else:
            q['concept_ids'] = auto_ids; q['concept_source'] = 'AUTO_KEYWORD'; q['concept_confidence'] = conf
        if 'validity_status' not in o:
            q['validity_status'], q['validity_notes'] = validity(q, q['concept_ids'])
        q.setdefault('validity_notes', [])
        # 出題の新しさ（年度が古いほど下がるが 0.25 で下げ止まる）
        q['recency_weight'] = round(max(0.25, 0.5 ** ((NOW - q['exam_time']) / HALF_LIFE)), 3)

# ---------- 3. Concept 統計・Frequency Score ----------
exam_times = {e['exam_id']: e['time'] for e in exams}
years = sorted({int(t) for t in exam_times.values()})
w_exam = {e: 0.5 ** ((NOW - t) / HALF_LIFE) for e, t in exam_times.items()}
n_exams = len(exams)
stat = defaultdict(lambda: {'by_exam': defaultdict(float), 'years': set(), 'n': 0})
for q in questions:
    if q['validity_status'] == 'OUTDATED': continue
    for i, cid in enumerate(q['concept_ids']):
        w = 1.0 if i == 0 else 0.5    # 主Concept=1問、副Concept=0.5問として数える
        s = stat[cid]; s['by_exam'][q['exam_id']] += w; s['years'].add(q['source_year']); s['n'] += 1

recent5 = [e for e, t in exam_times.items() if t >= NOW - 5]
recent3 = [e for e, t in exam_times.items() if t >= NOW - 3]
out_concepts = []
for cid, c in concepts.items():
    s = stat.get(cid)
    be = s['by_exam'] if s else {}
    hist = sum(be.values()) / n_exams                                    # 1回あたり平均出題数（全期間）
    r5 = sum(be.get(e, 0) for e in recent5) / max(1, len(recent5))
    r3 = sum(be.get(e, 0) for e in recent3) / max(1, len(recent3))
    recw = sum(w_exam[e] * be.get(e, 0) for e in exam_times) / sum(w_exam.values())  # 新しさ加重の平均出題数
    cont = len(s['years']) / len(years) if s else 0                       # 継続出題性（出題された年の割合）
    syl = 1.0                                                            # Ver.6.5に存在するConceptのみ扱うため1.0
    rfw = min(2.0, max(0.5, recw / hist)) if hist > 0 else 1.0           # 最近の出題の伸び/縮み
    fs = hist * rfw * syl * (0.5 + 0.5 * cont)
    yrs = sorted(s['years']) if s else []
    out_concepts.append({
        'concept_id': cid, 'concept_name': c['concept_name'], 'item_name': c['item_name'],
        'domain': c['domain'], 'large_id': c['large_id'], 'large_name': c['large_name'],
        'middle_id': c['middle_id'], 'middle_name': c['middle_name'],
        'small_id': c['small_id'], 'small_name': c['small_name'],
        'points': c['points'], 'terms': c['terms'][:40],
        'historical_frequency': round(sum(be.values()), 2),
        'per_exam': round(hist, 3), 'recent_5y_frequency': round(r5, 3), 'recent_3y_frequency': round(r3, 3),
        'recency_weighted_per_exam': round(recw, 3), 'continuity': round(cont, 2),
        'syllabus_relevance': syl, 'frequency_raw': round(fs, 4),
        'first_seen_year': yrs[0] if yrs else None, 'last_seen_year': yrs[-1] if yrs else None,
    })
mx = max(c['frequency_raw'] for c in out_concepts) or 1
for c in out_concepts:
    c['frequency_score'] = round(c['frequency_raw'] / mx, 4)
    c['importance'] = 'S' if c['frequency_score'] >= 0.5 else 'A' if c['frequency_score'] >= 0.25 else 'B' if c['frequency_score'] >= 0.08 else 'C'

# 同じ小分類のConceptを関連Conceptとする
by_small = defaultdict(list)
for c in out_concepts: by_small[c['small_id']].append(c['concept_id'])
for c in out_concepts: c['related_concepts'] = [x for x in by_small[c['small_id']] if x != c['concept_id']][:6]

fs_of = {c['concept_id']: c['frequency_score'] for c in out_concepts}
for q in questions:
    q['frequency_score'] = max((fs_of.get(c, 0) for c in q['concept_ids']), default=0)

# アプリに載せる項目だけに絞る
KEEP = ['question_id', 'exam_id', 'question_number', 'question_text', 'choices', 'official_answer', 'image',
        'has_figure', 'text_status', 'source_type', 'source_organization', 'source_year', 'exam_name',
        'source_url', 'citation', 'exam_scope', 'concept_ids', 'concept_source', 'concept_confidence',
        'validity_status', 'validity_notes', 'recency_weight', 'frequency_score', 'domain', 'qc_flags',
        'short_explanation', 'reason', 'wrong_choice_explanations', 'trap_point', 'memory_tip',
        'detailed_explanation', 'explanation_source', 'difficulty', 'modified', 'original_text', 'modification_reason']
qs_out = [{k: q[k] for k in KEEP if k in q} for q in questions]

OUT.mkdir(parents=True, exist_ok=True)
(ROOT / 'data/build/explanation_errors.json').write_text(json.dumps(explanation_errors, ensure_ascii=False, indent=1))
if explanation_errors: print('WARN 解説を不採用:', len(explanation_errors), '件 → data/build/explanation_errors.json')
(OUT / 'questions.json').write_text(json.dumps(qs_out, ensure_ascii=False))
(OUT / 'concepts.json').write_text(json.dumps(sorted(out_concepts, key=lambda c: -c['frequency_score']), ensure_ascii=False))
(OUT / 'meta.json').write_text(json.dumps({
    'built_at': datetime.datetime.now().isoformat(timespec='seconds'),
    'syllabus': TAX['source'], 'exams': exams, 'now': NOW, 'half_life_years': HALF_LIFE,
    'large': TAX['large'], 'middle': TAX['middle'],
}, ensure_ascii=False, indent=1))

from collections import Counter
print('verified', sum(1 for q in qs_out if q.get('text_status') == 'verified'), 'explained', sum(1 for q in qs_out if q.get('short_explanation')))
print('questions', len(qs_out), Counter(q['validity_status'] for q in qs_out))
print('concept_source', Counter(q['concept_source'] for q in qs_out), 'unclassified', sum(1 for q in qs_out if not q['concept_ids']))
print('TOP20 concepts:')
for c in sorted(out_concepts, key=lambda c: -c['frequency_score'])[:20]:
    print(f"  {c['frequency_score']:.2f} {c['per_exam']:.2f}/回 cont={c['continuity']} {c['concept_id']} {c['small_name']} / {c['concept_name']}")
