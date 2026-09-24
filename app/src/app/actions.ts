import { conceptById, primaryConcept, questionById } from '../data/content';
import { db } from '../data/db';
import type { Attempt, AttemptKind, Confidence, Label, Mode, PlanItem, Session } from '../domain/types';
import { overcomeConcepts } from '../engine/celebration';
import { buildCtx } from '../engine/priority';
import { buildPlan, followupFor, type FreeFilter } from '../engine/session';
import { emptyQState, nextQState } from '../engine/srs';
import { DAY } from '../engine/time';
import { loadSettings } from './store';

export const MODE_TITLE: Record<Mode, string> = {
  today: '今日の学習',
  quick5: '5分だけ復習',
  weak: '弱点克服',
  free: '自由演習',
  final: '直前対策',
  diagnostic: '初回診断',
  mistakes: '間違いの復習',
};

async function currentCtx(now = Date.now()) {
  const [a, q, s] = await Promise.all([db.attempts.orderBy('answeredAt').toArray(), db.qstates.toArray(), loadSettings()]);
  return buildCtx(a, q, s, now);
}

export async function startSession(mode: Mode, opt: { free?: FreeFilter; title?: string } = {}): Promise<Session | null> {
  const ctx = await currentCtx();
  const plan = buildPlan(mode, ctx, { free: opt.free });
  if (!plan.length) return null;
  const s: Session = {
    id: `s${Date.now().toString(36)}`, mode, startedAt: Date.now(), endedAt: null, plan, index: 0,
    title: opt.title ?? MODE_TITLE[mode],
  };
  await db.sessions.put(s);
  return s;
}

/** 途中のセッション（今日開始・未完了）があれば返す */
export async function unfinishedSession(): Promise<Session | null> {
  const list = await db.sessions.orderBy('startedAt').reverse().limit(1).toArray();
  const s = list[0];
  if (!s || s.endedAt || s.index >= s.plan.length || Date.now() - s.startedAt > DAY / 2) return null;
  return s;
}

/** overcome: この回答で苦手を克服したテーマ（演出用。学習ロジックには影響しない） */
export interface AnswerResult { attempt: Attempt; followup: PlanItem | null; overcome: string[] }

export async function answer(
  session: Session, item: PlanItem, selected: Label, confidence: Confidence, responseMs: number, now = Date.now(),
): Promise<AnswerResult> {
  const q = questionById.get(item.questionId)!;
  const settings = await loadSettings();
  const prev = (await db.qstates.get(q.question_id)) ?? emptyQState(q.question_id);
  const kind: AttemptKind = prev.seen === 0 ? 'first' : now - prev.lastAt < 7 * DAY ? 'repeat' : 'review';
  const isCorrect = selected === q.official_answer;
  const attempt: Attempt = {
    questionId: q.question_id,
    conceptIds: q.concept_ids.length ? q.concept_ids : [primaryConcept(q)],
    domain: q.domain,
    answeredAt: now,
    selected, isCorrect, responseMs, confidence,
    attemptNumber: prev.seen + 1,
    kind, sessionId: session.id, mode: session.mode,
  };
  const ctx = await currentCtx(now);
  const high = (conceptById.get(primaryConcept(q))?.frequency_score ?? 0) >= 0.25;
  const next = nextQState(prev, isCorrect, confidence, now, {
    examDate: settings.examDate, intervalFactor: ctx.phase.intervalFactor, highFrequency: high,
  });
  let followup: PlanItem | null = null;
  await db.transaction('rw', db.attempts, db.qstates, db.sessions, async () => {
    attempt.id = await db.attempts.add(attempt);
    await db.qstates.put(next);
    const plan = [...session.plan];
    if (!isCorrect && session.mode !== 'diagnostic' && session.mode !== 'free') {
      followup = followupFor(q, plan, ctx);
      if (followup) plan.splice(Math.min(plan.length, session.index + 4), 0, followup);
    }
    session.plan = plan;
    session.index += 1;
    if (session.index >= plan.length) session.endedAt = now;
    await db.sessions.put(session);
  });
  return { attempt, followup, overcome: overcomeConcepts(ctx.attempts, attempt, now) };
}

export async function finishSession(session: Session) {
  session.endedAt = Date.now();
  await db.sessions.put(session);
}

/** 一度だけ見せる実績・演出の記録 */
export async function seenAchievements(): Promise<Set<string>> {
  const row = await db.kv.get('achievements');
  return new Set((row?.value as string[]) ?? []);
}
export async function markAchievement(id: string) {
  const s = await seenAchievements();
  s.add(id);
  await db.kv.put({ key: 'achievements', value: [...s] });
}

export async function logError(type: string, detail: unknown) {
  await db.logs.add({ at: Date.now(), type, detail });
}

export async function exportBackup(): Promise<string> {
  const [attempts, qstates, sessions, kv] = await Promise.all([
    db.attempts.toArray(), db.qstates.toArray(), db.sessions.toArray(), db.kv.toArray(),
  ]);
  return JSON.stringify({ app: 'itpass-coach', version: 1, exportedAt: new Date().toISOString(), attempts, qstates, sessions, kv });
}

export async function importBackup(json: string) {
  const d = JSON.parse(json);
  if (d.app !== 'itpass-coach') throw new Error('このアプリのバックアップではありません');
  await db.transaction('rw', db.attempts, db.qstates, db.sessions, db.kv, async () => {
    await Promise.all([db.attempts.clear(), db.qstates.clear(), db.sessions.clear(), db.kv.clear()]);
    await db.attempts.bulkAdd(d.attempts);
    await db.qstates.bulkPut(d.qstates);
    await db.sessions.bulkPut(d.sessions);
    await db.kv.bulkPut(d.kv);
  });
}

export async function resetAll() {
  await Promise.all([db.attempts.clear(), db.qstates.clear(), db.sessions.clear(), db.kv.clear(), db.logs.clear()]);
}
