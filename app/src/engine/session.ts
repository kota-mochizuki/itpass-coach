import { ALL_QUESTIONS, STUDY_QUESTIONS, conceptById, primaryConcept, questionById, questionsByConcept } from '../data/content';
import type { Domain, Mode, PlanItem, Question } from '../domain/types';
import { conceptPriorityMap, scoreQuestion, type Ctx, type Scored } from './priority';
import { DAY, PHASES } from './time';

export const MINUTES_PER_QUESTION = 1.1;
export const targetCount = (minutes: number) => Math.max(5, Math.round(minutes / MINUTES_PER_QUESTION));

export interface FreeFilter { domain?: Domain; examId?: string }

/** 今日すでに解いた問題数 */
export function answeredToday(ctx: Ctx): number {
  const start = Date.parse(`${new Date(ctx.now + 9 * 3_600_000).toISOString().slice(0, 10)}T00:00:00+09:00`);
  return ctx.attempts.filter((a) => a.answeredAt >= start).length;
}

/**
 * 優先度順に貪欲に選ぶ。同一Conceptは最大 perConcept 問、連続させない。
 */
const middleOf = (cid: string) => conceptById.get(cid)?.middle_id ?? cid;
/** 本試験の分野配分（100問中 35:20:45） */
const DOMAIN_SHARE: Record<Domain, number> = { strategy: 0.35, management: 0.2, technology: 0.45 };

/** 同じConceptは perConcept 問まで、同じ中分類（例: セキュリティ）は1セッションの3割まで */
function makeLimiter(n: number, perConcept: number, initial: Scored[] = []) {
  const byConcept = new Map<string, number>(), byMiddle = new Map<string | number, number>();
  const byDomain = new Map<Domain, number>();
  const perMiddle = Math.max(3, Math.ceil(n * 0.3));
  const add = (s: Scored) => {
    byConcept.set(s.conceptId, (byConcept.get(s.conceptId) ?? 0) + 1);
    byMiddle.set(middleOf(s.conceptId), (byMiddle.get(middleOf(s.conceptId)) ?? 0) + 1);
    byDomain.set(s.q.domain, (byDomain.get(s.q.domain) ?? 0) + 1);
  };
  initial.forEach(add);
  return {
    ok: (s: Scored) => (byConcept.get(s.conceptId) ?? 0) < perConcept
      && (byMiddle.get(middleOf(s.conceptId)) ?? 0) < perMiddle
      && (byDomain.get(s.q.domain) ?? 0) < Math.ceil(n * DOMAIN_SHARE[s.q.domain]) + 1,
    add,
  };
}

function pickGreedy(scored: Scored[], n: number, perConcept = 2): PlanItem[] {
  const sorted = scored.filter((s) => s.score > 0).sort((a, b) => b.score - a.score);
  const lim = makeLimiter(n, perConcept);
  const picked: Scored[] = [];
  for (const s of sorted) {
    if (picked.length >= n) break;
    if (!lim.ok(s)) continue;
    lim.add(s);
    picked.push(s);
  }
  // 制約で埋まらなければ（候補が少ないモード）、制約を外して埋める
  for (const s of sorted) {
    if (picked.length >= n) break;
    if (!picked.includes(s)) picked.push(s);
  }
  return interleave(picked).map((s) => ({ questionId: s.q.question_id, reason: s.reason, why: s.why, conceptId: s.conceptId }));
}

/** 同じConceptが連続しないよう並べ替える（優先度の高い順はなるべく保つ） */
function interleave(list: Scored[]): Scored[] {
  const rest = [...list];
  const out: Scored[] = [];
  while (rest.length) {
    const prev = out[out.length - 1]?.conceptId;
    const i = rest.findIndex((s) => s.conceptId !== prev);
    if (i >= 0) { out.push(rest.splice(i, 1)[0]); continue; }
    // 残りが同じConceptだけ → 前後が異なる位置に差し込む
    const s = rest.shift()!;
    const j = out.findIndex((x, k) => x.conceptId !== s.conceptId && (k === 0 || out[k - 1].conceptId !== s.conceptId));
    out.splice(j < 0 ? out.length : j, 0, s);
  }
  return out;
}

/** 今日の学習: 期限が来た復習（間違い・忘れかけ）を最大4割まで先に確保し、残りを優先度順で埋める */
function pickWithReviews(scored: Scored[], n: number): PlanItem[] {
  const due = scored.filter((s) => s.reason === 'mistake' || s.reason === 'forgetting').filter((s) => s.score > 0);
  const reserved = new Set(pickGreedy(due, Math.ceil(n * 0.4)).map((p) => p.questionId));
  const picked: Scored[] = scored.filter((s) => reserved.has(s.q.question_id));
  const lim = makeLimiter(n, 2, picked);
  const sorted = scored.filter((s) => s.score > 0 && !reserved.has(s.q.question_id)).sort((a, b) => b.score - a.score);
  // 分野の下限（本試験配分の7割）を先に満たす: 分野別の足切り（各分野300点）対策
  for (const d of Object.keys(DOMAIN_SHARE) as Domain[]) {
    const floor = Math.floor(n * DOMAIN_SHARE[d] * 0.7);
    for (const s of sorted) {
      if (picked.filter((x) => x.q.domain === d).length >= floor || picked.length >= n) break;
      if (s.q.domain !== d || picked.includes(s) || !lim.ok(s)) continue;
      lim.add(s);
      picked.push(s);
    }
  }
  for (const s of sorted) {
    if (picked.includes(s)) continue;
    if (picked.length >= n) break;
    if (!lim.ok(s)) continue;
    lim.add(s);
    picked.push(s);
  }
  return interleave(picked).map((s) => ({ questionId: s.q.question_id, reason: s.reason, why: s.why, conceptId: s.conceptId }));
}

function scoreAll(ctx: Ctx, pool: Question[]): Scored[] {
  const cp = conceptPriorityMap(ctx, questionsByConcept.keys());
  return pool.map((q) => scoreQuestion(q, ctx, cp));
}

export function buildPlan(mode: Mode, ctx: Ctx, opt: { free?: FreeFilter; count?: number } = {}): PlanItem[] {
  switch (mode) {
    case 'today': {
      const n = opt.count ?? Math.max(5, targetCount(ctx.settings.dailyMinutes) - answeredToday(ctx));
      return pickWithReviews(scoreAll(ctx, STUDY_QUESTIONS), n);
    }
    case 'quick5': {
      const due = scoreAll(ctx, STUDY_QUESTIONS).filter((s) => s.reason === 'mistake' || s.reason === 'forgetting');
      const items = pickGreedy(due, 5, 1);
      if (items.length < 5) {
        const have = new Set(items.map((i) => i.questionId));
        const more = scoreAll(ctx, STUDY_QUESTIONS).filter((s) => !have.has(s.q.question_id) && s.reason === 'weak');
        items.push(...pickGreedy(more, 5 - items.length, 1));
      }
      return items;
    }
    case 'weak': {
      const weakIds = new Set([...ctx.concepts.values()].filter((s) => s.attempts >= 1 && s.rawMastery < 0.6).map((s) => s.conceptId));
      const scored = scoreAll(ctx, STUDY_QUESTIONS).filter((s) => weakIds.has(s.conceptId) || s.reason === 'mistake');
      return pickGreedy(scored, opt.count ?? 10, 3);
    }
    case 'final': {
      const finalCtx = { ...ctx, phase: PHASES[4] };
      const scored = scoreAll(finalCtx, STUDY_QUESTIONS).filter((s) => (conceptById.get(s.conceptId)?.frequency_score ?? 0) >= 0.2);
      return pickGreedy(scored, opt.count ?? 20);
    }
    case 'mistakes': {
      const wrong = [...ctx.qstates.values()].filter((s) => s.incorrectCount > 0 && questionById.has(s.questionId));
      wrong.sort((a, b) => {
        const ad = a.dueAt != null && a.dueAt <= ctx.now ? 0 : 1, bd = b.dueAt != null && b.dueAt <= ctx.now ? 0 : 1;
        return ad - bd || (b.lastIncorrectAt ?? 0) - (a.lastIncorrectAt ?? 0);
      });
      return wrong
        .filter((s) => s.dueAt == null || s.dueAt <= ctx.now || !s.lastCorrect)
        .slice(0, opt.count ?? 10)
        .map((s) => {
          const q = questionById.get(s.questionId)!;
          return { questionId: q.question_id, reason: 'mistake', why: `これまでに${s.incorrectCount}回まちがえた問題`, conceptId: primaryConcept(q) };
        });
    }
    case 'free': {
      const f = opt.free ?? {};
      if (f.examId) {
        // 年度別演習: 本試験の順番どおり（出題対象外の問題も出典確認のため含めない）
        return STUDY_QUESTIONS.filter((q) => q.exam_id === f.examId).map((q) => ({
          questionId: q.question_id, reason: 'free', why: `${q.exam_name} 問${q.question_number}`, conceptId: primaryConcept(q),
        }));
      }
      const pool = STUDY_QUESTIONS.filter((q) => !f.domain || q.domain === f.domain);
      return pickGreedy(scoreAll(ctx, pool), opt.count ?? 10);
    }
    case 'diagnostic':
      return diagnosticPlan();
  }
}

/**
 * 初回診断: 分野の出題比率（35:20:45）で15問。
 * 各分野の頻出Conceptから1問ずつ、直近の回・解説ありの問題を優先。決定的に選ぶ。
 */
export function diagnosticPlan(): PlanItem[] {
  const quota: Record<Domain, number> = { strategy: 5, management: 4, technology: 6 };
  const items: PlanItem[] = [];
  for (const d of Object.keys(quota) as Domain[]) {
    const concepts = [...conceptById.values()].filter((c) => c.domain === d).sort((a, b) => b.frequency_score - a.frequency_score);
    for (const c of concepts) {
      if (items.filter((i) => questionById.get(i.questionId)!.domain === d).length >= quota[d]) break;
      const qs = (questionsByConcept.get(c.concept_id) ?? [])
        .filter((q) => primaryConcept(q) === c.concept_id && q.source_year >= 2023)
        .sort((a, b) => Number(Boolean(b.short_explanation)) - Number(Boolean(a.short_explanation)) || Number(a.has_figure) - Number(b.has_figure) || b.source_year - a.source_year);
      if (qs[0]) items.push({ questionId: qs[0].question_id, reason: 'diagnostic', why: `${c.large_name}の代表問題`, conceptId: c.concept_id });
    }
  }
  return items;
}

/**
 * 不正解のあと、同じConceptの「別の公式問題」を少し後に差し込む（別角度で理解確認・丸暗記防止）。
 */
export function followupFor(q: Question, plan: PlanItem[], ctx: Ctx): PlanItem | null {
  const cid = primaryConcept(q);
  if (cid.startsWith('D:')) return null;
  const inPlan = new Set(plan.map((p) => p.questionId));
  const cands = (questionsByConcept.get(cid) ?? []).filter((x) => {
    if (inPlan.has(x.question_id)) return false;
    const s = ctx.qstates.get(x.question_id);
    return !s || ctx.now - s.lastAt > 7 * DAY;
  });
  if (!cands.length) return null;
  cands.sort((a, b) => b.recency_weight - a.recency_weight || Number(Boolean(b.short_explanation)) - Number(Boolean(a.short_explanation)));
  return { questionId: cands[0].question_id, reason: 'followup', why: `さっきの「${conceptById.get(cid)?.concept_name}」を別の問題で確認`, conceptId: cid };
}

export const EXAM_OPTIONS = [...new Set(ALL_QUESTIONS.map((q) => q.exam_id))]
  .map((id) => ({ id, name: ALL_QUESTIONS.find((q) => q.exam_id === id)!.exam_name }))
  .sort((a, b) => b.id.localeCompare(a.id));
