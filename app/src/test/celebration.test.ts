import { describe, expect, it } from 'vitest';
import { STUDY_QUESTIONS, primaryConcept, questionById } from '../data/content';
import { DEFAULT_SETTINGS, type Attempt } from '../domain/types';
import { answerLevel, isOvercome, milestones, overcomeConcepts, sessionGrowth, studyStreakDays } from '../engine/celebration';
import type { ConceptState } from '../engine/mastery';
import { DAY } from '../engine/time';

const NOW = Date.parse('2026-09-25T20:00:00+09:00');
function att(qid: string, ok: boolean, at: number, extra: Partial<Attempt> = {}): Attempt {
  const q = questionById.get(qid)!;
  return {
    questionId: qid, conceptIds: q.concept_ids.length ? q.concept_ids : [primaryConcept(q)], domain: q.domain, answeredAt: at,
    selected: 'ア', isCorrect: ok, responseMs: 20_000, confidence: 'sure', attemptNumber: 1, kind: 'first', sessionId: 's', mode: 'today', ...extra,
  };
}

describe('Celebration Hierarchy', () => {
  it('正解はLv1、3連続でLv2、5・10連続でLv3。不正解は0（演出なし）', () => {
    expect(answerLevel(false, 0)).toBe(0);
    expect(answerLevel(true, 1)).toBe(1);
    expect(answerLevel(true, 3)).toBe(2);
    expect(answerLevel(true, 4)).toBe(1);
    expect(answerLevel(true, 5)).toBe(3);
    expect(answerLevel(true, 7)).toBe(1); // 毎回は出さない
    expect(answerLevel(true, 10)).toBe(3);
  });

  it('苦手克服: かつて苦手だったテーマが 65% を初めて超えたときだけ', () => {
    const st = (attempts: number, raw: number) => ({ attempts, rawMastery: raw } as ConceptState);
    expect(isOvercome(st(5, 0.62), st(6, 0.67), true)).toBe(true);
    expect(isOvercome(st(5, 0.62), st(6, 0.67), false)).toBe(false); // 苦手だったことがない
    expect(isOvercome(st(5, 0.7), st(6, 0.75), true)).toBe(false);   // すでに超えている（二度目は出さない）
    expect(isOvercome(st(5, 0.5), st(6, 0.6), true)).toBe(false);
  });

  it('同じテーマの別問題で連続正解すると、苦手克服が検出される', () => {
    const single = STUDY_QUESTIONS.filter((q) => q.concept_ids.length === 1);
    const cid = single.find((q) => single.filter((x) => x.concept_ids[0] === q.concept_ids[0]).length >= 8)!.concept_ids[0];
    const qs = STUDY_QUESTIONS.filter((q) => q.concept_ids[0] === cid && q.concept_ids.length === 1).slice(0, 8);
    const prior: Attempt[] = [att(qs[0].question_id, false, NOW - 5 * DAY), att(qs[1].question_id, false, NOW - 4 * DAY)];
    let found: string[] = [];
    for (let i = 2; i < qs.length && !found.length; i++) {
      const a = att(qs[i].question_id, true, NOW - (8 - i) * 3600_000);
      found = overcomeConcepts(prior, a, a.answeredAt);
      prior.push(a);
    }
    expect(found).toContain(cid);
  });

  it('連続学習日数', () => {
    const q = STUDY_QUESTIONS[0].question_id;
    const days = [0, 1, 2, 3, 5].map((d) => att(q, true, NOW - d * DAY));
    expect(studyStreakDays(days, NOW)).toBe(4);
    expect(studyStreakDays(days.slice(1), NOW)).toBe(3); // 今日まだでも昨日まで続いていれば数える
  });

  it('節目は一度だけ（見たものは返さない）', () => {
    const q = STUDY_QUESTIONS[0].question_id;
    const week = Array.from({ length: 7 }, (_, d) => att(q, true, NOW - d * DAY));
    const later = Date.parse('2026-10-12T09:00:00+09:00'); // 残り27日 → フェーズ2・30日以内
    const first = milestones(week.map((a) => ({ ...a, answeredAt: a.answeredAt + (later - NOW) })), DEFAULT_SETTINGS, later, new Set());
    const ids = first.map((m) => m.id);
    expect(ids).toEqual(expect.arrayContaining(['phase:2', 'streak:7', 'days:30']));
    const again = milestones(week, DEFAULT_SETTINGS, later, new Set(ids));
    expect(again.map((m) => m.id)).not.toEqual(expect.arrayContaining(['phase:2']));
  });

  it('セッション前後の理解度の変化（昨日→今日）', () => {
    const q = STUDY_QUESTIONS.find((x) => x.concept_ids.length)!;
    const before = att(q.question_id, false, NOW - 2 * DAY);
    const s = [att(STUDY_QUESTIONS.find((x) => x.concept_ids[0] === q.concept_ids[0] && x.question_id !== q.question_id)!.question_id, true, NOW - 60_000)];
    const g = sessionGrowth([before, ...s], s, NOW - 10 * 60_000, NOW);
    expect(g[0].conceptId).toBe(q.concept_ids[0]);
    expect(g[0].after).toBeGreaterThan(g[0].before);
  });
});
