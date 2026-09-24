import { conceptById, primaryConcept, questionsByConcept } from '../data/content';
import type { Attempt, Domain, PickReason, QState, Question, Settings } from '../domain/types';
import { computeConceptStates, domainPriorFrom, type ConceptState } from './mastery';
import { DAY, daysLeft, phaseOf, type Phase } from './time';

/** エンジンが判断に使う現在の状態（すべて純粋データ） */
export interface Ctx {
  now: number;
  settings: Settings;
  attempts: Attempt[];
  qstates: Map<string, QState>;
  concepts: Map<string, ConceptState>;
  domainAccuracy: Partial<Record<Domain, number>>;
  days: number;
  phase: Phase;
}

export function buildCtx(attempts: Attempt[], qstates: QState[], settings: Settings, now: number, phaseOverride?: Phase): Ctx {
  const diag = attempts.filter((a) => a.mode === 'diagnostic');
  const prior = domainPriorFrom(diag);
  const concepts = computeConceptStates(attempts, now, prior, (id) => conceptById.get(id)?.domain);
  const days = daysLeft(settings.examDate, now);
  return {
    now, settings, attempts,
    qstates: new Map(qstates.map((s) => [s.questionId, s])),
    concepts,
    domainAccuracy: recentDomainAccuracy(attempts),
    days,
    phase: phaseOverride ?? phaseOf(days),
  };
}

/** 分野ごとの直近60問の正答率（10問未満は判断しない） */
export function recentDomainAccuracy(attempts: Attempt[]): Partial<Record<Domain, number>> {
  const out: Partial<Record<Domain, number>> = {};
  for (const d of ['strategy', 'management', 'technology'] as Domain[]) {
    const list = attempts.filter((a) => a.domain === d).slice(-60);
    if (list.length >= 10) out[d] = list.filter((a) => a.isCorrect).length / list.length;
  }
  return out;
}

export function frequencyOf(conceptId: string): number {
  return conceptById.get(conceptId)?.frequency_score ?? 0.1;
}

const figureShare = (() => {
  const cache = new Map<string, number>();
  return (cid: string) => {
    if (!cache.has(cid)) {
      const qs = questionsByConcept.get(cid) ?? [];
      cache.set(cid, qs.length ? qs.filter((q) => q.has_figure).length / qs.length : 0);
    }
    return cache.get(cid)!;
  };
})();

export interface PriorityParts {
  fs: number; weakness: number; forgetting: number; uncertainty: number;
  domainBoost: number; newFactor: number; cost: number; total: number;
}

/**
 * Learning Priority Score（Concept単位）
 * = FS^focus × (0.15+弱さ) × (0.3+忘却リスク) × (0.5+不確かさ) × 分野足切り対策 × 新規係数 ÷ 学習コスト
 */
export function conceptPriority(cid: string, ctx: Ctx): PriorityParts {
  const c = conceptById.get(cid);
  const fs = frequencyOf(cid);
  const st = ctx.concepts.get(cid);
  const weakness = st ? 1 - st.rawMastery : 0.5;
  const forgetting = st ? 1 - st.retention : 1;
  const uncertainty = st ? st.uncertainty : 1;
  const domain = c?.domain ?? (cid.slice(2) as Domain);
  const acc = ctx.domainAccuracy[domain];
  const domainBoost = acc !== undefined && acc < 0.55 ? Math.min(1.5, 1 + (0.55 - acc) * 2) : 1;
  const newFactor = st ? 1 : ctx.phase.newFactor;
  const cost = 1 + 0.4 * figureShare(cid);
  const total = Math.pow(Math.max(fs, 0.01), ctx.phase.focus) * (0.15 + weakness) * (0.3 + forgetting)
    * (0.5 + uncertainty) * domainBoost * newFactor / cost;
  return { fs, weakness, forgetting, uncertainty, domainBoost, newFactor, cost, total };
}

export interface Scored {
  q: Question;
  score: number;
  reason: PickReason;
  why: string;
  conceptId: string;
}

const pct = (x: number) => `${Math.round(x * 100)}%`;

/** 1問の学習価値と、その理由（画面の「なぜこの問題？」） */
export function scoreQuestion(q: Question, ctx: Ctx, cp: Map<string, number>): Scored {
  const cid = primaryConcept(q);
  const base = Math.max(...(q.concept_ids.length ? q.concept_ids : [cid]).map((id) => cp.get(id) ?? 0));
  const s = ctx.qstates.get(q.question_id);
  const st = ctx.concepts.get(cid);
  const c = conceptById.get(cid);
  const due = s?.dueAt != null && s.dueAt <= ctx.now;
  let factor = Math.sqrt(q.recency_weight) * (q.short_explanation ? 1.15 : 1);
  let reason: PickReason;
  let why: string;
  if (s && due && !s.lastCorrect) {
    factor *= 1.8; reason = 'mistake';
    why = `前回まちがえた問題（${Math.max(1, Math.round((ctx.now - s.lastAt) / DAY))}日前）`;
  } else if (s && due) {
    factor *= 1.4; reason = 'forgetting';
    why = `前回正解から${Math.round((ctx.now - s.lastAt) / DAY)}日。記憶が薄れる頃です`;
  } else if (s) {
    // 期限前の既出問題はほぼ出さない（丸暗記防止）。2日以内は出さない
    factor *= ctx.now - s.lastAt < 2 * DAY ? 0 : 0.12;
    reason = 'forgetting'; why = '以前解いた問題の確認';
  } else if (st && st.attempts >= 2 && st.rawMastery < 0.55) {
    reason = 'weak'; why = `このテーマの正答率 ${st.correct}/${st.attempts}`;
  } else if (!st && (c?.frequency_score ?? 0) >= 0.3) {
    reason = 'frequent'; why = `頻出：本試験で1回あたり平均${c!.recency_weighted_per_exam.toFixed(1)}問`;
  } else if (!st) {
    reason = 'new'; why = 'まだ解いていないテーマ';
  } else {
    reason = 'frequent';
    why = c ? `本試験で1回あたり平均${c.recency_weighted_per_exam.toFixed(1)}問・理解度${pct(st.mastery)}` : '演習';
  }
  return { q, score: base * factor, reason, why, conceptId: cid };
}

export function conceptPriorityMap(ctx: Ctx, conceptIds: Iterable<string>): Map<string, number> {
  const m = new Map<string, number>();
  for (const id of conceptIds) m.set(id, conceptPriority(id, ctx).total);
  return m;
}
