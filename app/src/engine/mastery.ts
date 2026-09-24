import type { Attempt, Domain } from '../domain/types';
import { DAY } from './time';

/** ユーザー×Concept の状態（attempts から毎回再計算する） */
export interface ConceptState {
  conceptId: string;
  /** 0〜1。忘却を含めた現在の理解度 */
  mastery: number;
  /** 忘却を含めない理解度（Beta事後平均） */
  rawMastery: number;
  /** 有効な証拠量（Σ重み） */
  evidence: number;
  uncertainty: number;
  retention: number;
  attempts: number;
  correct: number;
  firstTry: number;
  firstTryCorrect: number;
  recentCorrectRate: number | null;
  correctStreak: number;
  incorrectCount: number;
  lastSeenAt: number | null;
  /** 自信あり正解の割合 */
  confidenceScore: number;
}

const RECENCY_HALF_LIFE_DAYS = 21;
const SLOW_MS = 120_000;

/** 1回の回答が「理解している」証拠としてどれだけの値か（0〜1） */
export function evidenceValue(a: Pick<Attempt, 'isCorrect' | 'confidence' | 'responseMs'>): number {
  if (!a.isCorrect) return 0;
  let c = a.confidence === 'sure' ? 1 : 0.6;
  if (a.responseMs > SLOW_MS) c *= 0.85;
  return c;
}

/** 回答の重み。同一問題の短期再出題（丸暗記の可能性）は半分 */
export function evidenceWeight(a: Pick<Attempt, 'kind' | 'answeredAt'>, now: number): number {
  const kind = a.kind === 'repeat' ? 0.5 : 1;
  const ageDays = Math.max(0, (now - a.answeredAt) / DAY);
  return kind * Math.pow(0.5, ageDays / RECENCY_HALF_LIFE_DAYS);
}

/** 連続正解数から記憶の安定度（日） */
export const stabilityDays = (streak: number) => 2 * Math.pow(2.2, streak);

export function computeConceptStates(
  attempts: Attempt[], now: number, domainPrior: Partial<Record<Domain, number>> = {},
  conceptDomain: (id: string) => Domain | undefined = () => undefined,
): Map<string, ConceptState> {
  const by = new Map<string, Attempt[]>();
  for (const a of attempts) {
    for (const id of a.conceptIds) {
      const arr = by.get(id) ?? [];
      arr.push(a);
      by.set(id, arr);
    }
  }
  const out = new Map<string, ConceptState>();
  for (const [id, list] of by) {
    list.sort((x, y) => x.answeredAt - y.answeredAt);
    const d = conceptDomain(id) ?? list[0].domain;
    const p = domainPrior[d] ?? 0.5;
    const a0 = 1 + 2 * p, b0 = 1 + 2 * (1 - p);
    let sw = 0, swc = 0, streak = 0, correct = 0, incorrect = 0, sure = 0;
    let firstTry = 0, firstTryCorrect = 0;
    const seenQ = new Set<string>();
    for (const a of list) {
      const w = evidenceWeight(a, now);
      sw += w;
      swc += w * evidenceValue(a);
      if (a.isCorrect) { correct++; if (a.confidence === 'sure') { streak++; sure++; } }
      else { incorrect++; streak = 0; }
      if (!seenQ.has(a.questionId)) {
        seenQ.add(a.questionId);
        firstTry++;
        if (a.isCorrect) firstTryCorrect++;
      }
    }
    const raw = (a0 + swc) / (a0 + b0 + sw);
    const last = list[list.length - 1].answeredAt;
    const retention = Math.exp(-Math.max(0, now - last) / DAY / stabilityDays(streak));
    const recent = list.slice(-5);
    out.set(id, {
      conceptId: id,
      rawMastery: raw,
      mastery: raw * (0.7 + 0.3 * retention),
      evidence: sw,
      uncertainty: 1 / Math.sqrt(1 + sw),
      retention,
      attempts: list.length,
      correct,
      firstTry,
      firstTryCorrect,
      recentCorrectRate: recent.length ? recent.filter((a) => a.isCorrect).length / recent.length : null,
      correctStreak: streak,
      incorrectCount: incorrect,
      lastSeenAt: last,
      confidenceScore: list.length ? sure / list.length : 0,
    });
  }
  return out;
}

/** 初回診断などから分野ごとの事前確率（正答率・スムージング付き） */
export function domainPriorFrom(attempts: Attempt[]): Partial<Record<Domain, number>> {
  const acc: Partial<Record<Domain, [number, number]>> = {};
  for (const a of attempts) {
    const v = acc[a.domain] ?? [0, 0];
    v[0] += a.isCorrect ? 1 : 0;
    v[1] += 1;
    acc[a.domain] = v;
  }
  const out: Partial<Record<Domain, number>> = {};
  for (const [d, [c, n]] of Object.entries(acc) as [Domain, [number, number]][]) out[d] = (c + 1) / (n + 2);
  return out;
}
