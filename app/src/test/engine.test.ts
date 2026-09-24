import { describe, expect, it } from 'vitest';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { ALL_QUESTIONS, CONCEPTS, STUDY_QUESTIONS, conceptById, primaryConcept, questionById } from '../data/content';
import { DEFAULT_SETTINGS, LABELS, type Attempt, type QState } from '../domain/types';
import { computeConceptStates, evidenceValue } from '../engine/mastery';
import { buildCtx, conceptPriority } from '../engine/priority';
import { buildPlan, diagnosticPlan, followupFor } from '../engine/session';
import { emptyQState, nextQState } from '../engine/srs';
import { dashboard } from '../engine/stats';
import { DAY, daysLeft, examStart, phaseOf } from '../engine/time';

const NOW = Date.parse('2026-09-25T09:00:00+09:00');
const settings = DEFAULT_SETTINGS;

function attempt(qid: string, isCorrect: boolean, at: number, extra: Partial<Attempt> = {}): Attempt {
  const q = questionById.get(qid)!;
  return {
    questionId: qid, conceptIds: q.concept_ids.length ? q.concept_ids : [primaryConcept(q)], domain: q.domain,
    answeredAt: at, selected: isCorrect ? (q.official_answer as 'ア') : 'ア', isCorrect, responseMs: 30_000,
    confidence: 'sure', attemptNumber: 1, kind: 'first', sessionId: 's', mode: 'today', ...extra,
  };
}

describe('データ整合性（公式問題）', () => {
  it('15回×100問、全問に公式正答・出典・原本画像がある', () => {
    expect(ALL_QUESTIONS.length).toBe(1500);
    for (const q of ALL_QUESTIONS) {
      expect(LABELS).toContain(q.official_answer);
      expect(q.citation).toMatch(/^出典：.+ITパスポート試験.* 問\d+$/);
      expect(q.source_type).toBe('IPA_OFFICIAL');
      expect(q.source_url).toMatch(/^https:\/\/www3\.jitec\.ipa\.go\.jp\//);
      expect(existsSync(resolve(__dirname, '../../public', q.image))).toBe(true);
    }
  });
  it('出題対象は現行試験範囲かつ要確認でない問題だけ', () => {
    expect(STUDY_QUESTIONS.length).toBeGreaterThan(1300);
    for (const q of STUDY_QUESTIONS) {
      expect(q.exam_scope).toBe('CURRENT_2026');
      expect(['CURRENT', 'LEGACY_BUT_USEFUL']).toContain(q.validity_status);
    }
  });
  it('解説がある問題は、解説の前提が公式正答と一致している（ビルド時検証済み）', () => {
    for (const q of ALL_QUESTIONS.filter((x) => x.short_explanation)) {
      expect(q.short_explanation!.length).toBeGreaterThan(5);
      if (q.wrong_choice_explanations) expect(q.wrong_choice_explanations[q.official_answer as 'ア']).toBeTruthy();
    }
  });
  it('Concept はシラバスの階層を持ち、頻度スコアは0〜1', () => {
    expect(CONCEPTS.length).toBe(180);
    for (const c of CONCEPTS) {
      expect(c.frequency_score).toBeGreaterThanOrEqual(0);
      expect(c.frequency_score).toBeLessThanOrEqual(1);
      expect(c.small_name).toBeTruthy();
    }
  });
});

describe('時間とフェーズ', () => {
  it('9/25 → 11/8 は44日、フェーズ1', () => {
    expect(daysLeft('2026-11-08', NOW)).toBe(44);
    expect(phaseOf(44).id).toBe(1);
    expect(phaseOf(20).id).toBe(2);
    expect(phaseOf(10).id).toBe(3);
    expect(phaseOf(7).id).toBe(4);
  });
});

describe('Spaced Repetition', () => {
  const opts = { examDate: '2026-11-08' };
  it('不正解→1日、正解・迷い→短め、自信あり→延長、連続→大きく延長', () => {
    const s0 = emptyQState('x');
    expect(nextQState(s0, false, 'sure', NOW, opts).intervalDays).toBe(1);
    expect(nextQState(s0, true, 'unsure', NOW, opts).intervalDays).toBeLessThanOrEqual(3);
    const s1 = nextQState(s0, true, 'sure', NOW, opts);
    expect(s1.intervalDays).toBe(3);
    const s2 = nextQState(s1, true, 'sure', NOW + 3 * DAY, opts);
    expect(s2.intervalDays).toBe(7.5);
    const s3 = nextQState(s2, true, 'sure', NOW + 11 * DAY, opts);
    expect(s3.intervalDays).toBeGreaterThan(20);
  });
  it('次回復習日は試験日を超えない', () => {
    let s = emptyQState('x');
    for (let i = 0; i < 6; i++) s = nextQState(s, true, 'sure', NOW + i * 5 * DAY, { ...opts, highFrequency: true });
    expect(s.dueAt === null || s.dueAt < examStart('2026-11-08')).toBe(true);
  });
  it('低頻度で正解済みなら、試験後にはみ出す復習は打ち切る', () => {
    const late = examStart('2026-11-08') - 3 * DAY;
    const s = nextQState({ ...emptyQState('x'), intervalDays: 10, streak: 2, seen: 2 }, true, 'sure', late, opts);
    expect(s.dueAt).toBeNull();
  });
});

describe('Concept Mastery', () => {
  const q = STUDY_QUESTIONS.find((x) => x.concept_ids.length)!;
  const cid = q.concept_ids[0];
  it('迷っての正解は自信ありより低い証拠', () => {
    expect(evidenceValue({ isCorrect: true, confidence: 'unsure', responseMs: 1 })).toBeLessThan(evidenceValue({ isCorrect: true, confidence: 'sure', responseMs: 1 }));
  });
  it('同一問題の短期再正解（丸暗記の可能性）は、別問題での正解より寄与が小さい', () => {
    const base = [attempt(q.question_id, false, NOW - 2 * DAY)];
    const repeat = computeConceptStates([...base, attempt(q.question_id, true, NOW - DAY, { kind: 'repeat' })], NOW).get(cid)!;
    const other = STUDY_QUESTIONS.find((x) => x.concept_ids[0] === cid && x.question_id !== q.question_id)!;
    const fresh = computeConceptStates([...base, attempt(other.question_id, true, NOW - DAY)], NOW).get(cid)!;
    expect(repeat.rawMastery).toBeLessThan(fresh.rawMastery);
  });
  it('時間がたつと忘却で理解度が下がる', () => {
    const a = [attempt(q.question_id, true, NOW)];
    const now = computeConceptStates(a, NOW).get(cid)!.mastery;
    const later = computeConceptStates(a, NOW + 20 * DAY).get(cid)!.mastery;
    expect(later).toBeLessThan(now);
  });
});

describe('Learning Priority と出題', () => {
  it('頻出で苦手なConceptは、低頻度で得意なConceptより優先される', () => {
    const freq = CONCEPTS[0]; // 頻度1位
    const rare = [...CONCEPTS].reverse().find((c) => STUDY_QUESTIONS.some((q) => q.concept_ids[0] === c.concept_id))!;
    const qf = STUDY_QUESTIONS.filter((q) => q.concept_ids[0] === freq.concept_id).slice(0, 2);
    const qr = STUDY_QUESTIONS.filter((q) => q.concept_ids[0] === rare.concept_id).slice(0, 2);
    const attempts = [
      ...qf.map((q) => attempt(q.question_id, false, NOW - 3 * DAY)),
      ...qr.map((q) => attempt(q.question_id, true, NOW - 3 * DAY)),
    ];
    const ctx = buildCtx(attempts, [], settings, NOW);
    expect(conceptPriority(freq.concept_id, ctx).total).toBeGreaterThan(conceptPriority(rare.concept_id, ctx).total);
  });

  it('今日の学習: 20分で18問、同一Concept最大2問・連続なし・重複なし', () => {
    const ctx = buildCtx([], [], settings, NOW);
    const plan = buildPlan('today', ctx);
    expect(plan.length).toBe(18);
    expect(new Set(plan.map((p) => p.questionId)).size).toBe(plan.length);
    const counts = new Map<string, number>();
    plan.forEach((p, i) => {
      counts.set(p.conceptId!, (counts.get(p.conceptId!) ?? 0) + 1);
      if (i > 0) expect(p.conceptId).not.toBe(plan[i - 1].conceptId);
    });
    expect(Math.max(...counts.values())).toBeLessThanOrEqual(2);
    for (const p of plan) expect(p.why).toBeTruthy();
  });

  it('期限が来た間違いは今日の学習に入る。2日以内に解いた問題は出ない', () => {
    const wrongQ = STUDY_QUESTIONS[10], recentQ = STUDY_QUESTIONS[20];
    const qs: QState[] = [
      { ...emptyQState(wrongQ.question_id), seen: 1, incorrectCount: 1, lastAt: NOW - 1.5 * DAY, lastCorrect: false, intervalDays: 1, dueAt: NOW - DAY / 2 },
      { ...emptyQState(recentQ.question_id), seen: 1, lastAt: NOW - DAY, lastCorrect: true, intervalDays: 3, dueAt: NOW + 2 * DAY },
    ];
    const ctx = buildCtx([attempt(wrongQ.question_id, false, NOW - 1.5 * DAY), attempt(recentQ.question_id, true, NOW - DAY)], qs, settings, NOW);
    const plan = buildPlan('today', ctx);
    expect(plan.find((p) => p.questionId === wrongQ.question_id)?.reason).toBe('mistake');
    expect(plan.some((p) => p.questionId === recentQ.question_id)).toBe(false);
    expect(buildPlan('mistakes', ctx).map((p) => p.questionId)).toContain(wrongQ.question_id);
  });

  it('不正解のあとは同じConceptの別の公式問題で確認する', () => {
    const q = STUDY_QUESTIONS.find((x) => x.concept_ids.length && (STUDY_QUESTIONS.filter((y) => y.concept_ids[0] === x.concept_ids[0]).length > 3))!;
    const ctx = buildCtx([], [], settings, NOW);
    const f = followupFor(q, [{ questionId: q.question_id, reason: 'new', why: '' }], ctx)!;
    expect(f.questionId).not.toBe(q.question_id);
    expect(questionById.get(f.questionId)!.concept_ids).toContain(q.concept_ids[0]);
  });

  it('初回診断は15問・3分野を 5:4:6 で', () => {
    const plan = diagnosticPlan();
    expect(plan.length).toBe(15);
    const dom = plan.map((p) => questionById.get(p.questionId)!.domain);
    expect(dom.filter((d) => d === 'strategy').length).toBe(5);
    expect(dom.filter((d) => d === 'management').length).toBe(4);
    expect(dom.filter((d) => d === 'technology').length).toBe(6);
  });

  it('直前対策は頻出Conceptだけから出す', () => {
    const ctx = buildCtx([], [], settings, NOW);
    for (const p of buildPlan('final', ctx)) expect(conceptById.get(p.conceptId!)!.frequency_score).toBeGreaterThanOrEqual(0.2);
  });

  it('ダッシュボードは未学習で0%、合格確率は持たない', () => {
    const d = dashboard(buildCtx([], [], settings, NOW));
    expect(d.overallMastery).toBe(0);
    expect(d.focusTop.length).toBe(3);
    expect(Object.keys(d)).not.toContain('passProbability');
  });
});
