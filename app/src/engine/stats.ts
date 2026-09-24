import { CONCEPTS, conceptById } from '../data/content';
import { DOMAINS, type Attempt, type Domain } from '../domain/types';
import { conceptPriority, type Ctx } from './priority';

const rate = (list: Attempt[]) => (list.length ? list.filter((a) => a.isCorrect).length / list.length : null);

export interface Dashboard {
  totalAnswered: number;
  firstTryRate: number | null;
  recent100Rate: number | null;
  domainRate: Record<Domain, number | null>;
  /** 出題頻度で重み付けした理解度 0〜1（未学習=0） */
  overallMastery: number;
  domainMastery: Record<Domain, number>;
  weakConceptCount: number;
  frequentMastered: { mastered: number; total: number };
  focusTop: { conceptId: string; name: string; why: string }[];
}

/** 頻度重み付き理解度。まだ触れていないConceptは0として数える（根拠のない楽観をしない） */
function weightedMastery(ctx: Ctx, domain?: Domain): number {
  let w = 0, s = 0;
  for (const c of CONCEPTS) {
    if (domain && c.domain !== domain) continue;
    if (c.frequency_score < 0.05) continue;
    w += c.frequency_score;
    s += c.frequency_score * (ctx.concepts.get(c.concept_id)?.mastery ?? 0);
  }
  return w ? s / w : 0;
}

export function dashboard(ctx: Ctx): Dashboard {
  const firsts: Attempt[] = [];
  const seen = new Set<string>();
  for (const a of ctx.attempts) {
    if (!seen.has(a.questionId)) { seen.add(a.questionId); firsts.push(a); }
  }
  const domainRate = {} as Record<Domain, number | null>;
  const domainMastery = {} as Record<Domain, number>;
  for (const d of DOMAINS) {
    domainRate[d] = rate(ctx.attempts.filter((a) => a.domain === d).slice(-60));
    domainMastery[d] = weightedMastery(ctx, d);
  }
  const states = [...ctx.concepts.values()].filter((s) => !s.conceptId.startsWith('D:'));
  const frequent = CONCEPTS.filter((c) => c.importance === 'S' || c.importance === 'A');
  return {
    totalAnswered: ctx.attempts.length,
    firstTryRate: rate(firsts),
    recent100Rate: rate(ctx.attempts.slice(-100)),
    domainRate,
    overallMastery: weightedMastery(ctx),
    domainMastery,
    weakConceptCount: states.filter((s) => s.attempts >= 2 && s.rawMastery < 0.5).length,
    frequentMastered: { mastered: frequent.filter((c) => (ctx.concepts.get(c.concept_id)?.mastery ?? 0) >= 0.7).length, total: frequent.length },
    focusTop: focusConcepts(ctx, 3),
  };
}

/** 今週の重点: 学習優先度の高いConcept（理由つき） */
export function focusConcepts(ctx: Ctx, n: number) {
  return CONCEPTS.map((c) => ({ c, p: conceptPriority(c.concept_id, ctx).total }))
    .sort((a, b) => b.p - a.p)
    .slice(0, n)
    .map(({ c }) => {
      const st = ctx.concepts.get(c.concept_id);
      const why = st
        ? `正答 ${st.correct}/${st.attempts}・本試験で平均${c.recency_weighted_per_exam.toFixed(1)}問`
        : `未学習・本試験で平均${c.recency_weighted_per_exam.toFixed(1)}問`;
      return { conceptId: c.concept_id, name: c.concept_name, why };
    });
}

export type Level = '得意' | '普通' | '要復習';
export const levelOf = (r: number): Level => (r >= 0.7 ? '得意' : r >= 0.45 ? '普通' : '要復習');

/** 診断結果（分野・大分類ごと） */
export function diagnosticSummary(attempts: Attempt[]) {
  const diag = attempts.filter((a) => a.mode === 'diagnostic');
  const byDomain = DOMAINS.map((d) => {
    const l = diag.filter((a) => a.domain === d);
    const r = rate(l);
    return { domain: d, correct: l.filter((a) => a.isCorrect).length, total: l.length, level: r == null ? null : levelOf(r) };
  });
  const byLarge = new Map<string, { correct: number; total: number }>();
  for (const a of diag) {
    const c = conceptById.get(a.conceptIds[0]);
    if (!c) continue;
    const v = byLarge.get(c.large_name) ?? { correct: 0, total: 0 };
    v.total++; if (a.isCorrect) v.correct++;
    byLarge.set(c.large_name, v);
  }
  return { byDomain, byLarge: [...byLarge.entries()].map(([name, v]) => ({ name, ...v, level: levelOf(v.correct / v.total) })) };
}
