import { CONCEPTS, conceptById } from '../data/content';
import type { Attempt, Settings } from '../domain/types';
import { computeConceptStates, domainPriorFrom, type ConceptState } from './mastery';
import { buildCtx } from './priority';
import { dashboard } from './stats';
import { DAY, dayKey, daysLeft, phaseOf } from './time';

/**
 * 報酬の階層。褒めるのは「問題数」ではなく、理解・苦手克服・継続・必要な学習の完了。
 * 1 正解 / 2 3連続 / 3 5・10連続 / 4 苦手克服 / 5 今日の学習完了 / 6 フェーズ移行
 */
export type CelebrationLevel = 0 | 1 | 2 | 3 | 4 | 5 | 6;

/** 1問回答したときの演出レベル（苦手克服は別途判定） */
export function answerLevel(isCorrect: boolean, streak: number): CelebrationLevel {
  if (!isCorrect) return 0;
  if (streak === 5 || streak === 10) return 3;
  if (streak === 3) return 2;
  return 1;
}

export const OVERCOME_FROM = 0.5;
export const OVERCOME_TO = 0.65;

/**
 * 苦手克服: かつて苦手（2問以上で理解度50%未満）だったテーマが、今回の回答で 65% を初めて超えた。
 */
export function isOvercome(before: ConceptState | undefined, after: ConceptState | undefined, wasWeak: boolean): boolean {
  return Boolean(wasWeak && after && after.rawMastery >= OVERCOME_TO && (!before || before.rawMastery < OVERCOME_TO));
}

/** そのテーマが過去のどこかで「苦手」だったか（回答を順にたどる。忘却の減衰は入れない） */
export function wasWeakAt(attempts: Attempt[], conceptId: string): boolean {
  let n = 0, c = 0;
  for (const a of attempts) {
    if (!a.conceptIds.includes(conceptId)) continue;
    n++; if (a.isCorrect) c += a.confidence === 'sure' ? 1 : 0.6;
    if (n >= 2 && (2 + c) / (4 + n) < OVERCOME_FROM) return true;
  }
  return false;
}

/** 1回の回答の前後で克服したテーマ */
export function overcomeConcepts(prior: Attempt[], added: Attempt, now: number): string[] {
  const conceptDomain = (id: string) => conceptById.get(id)?.domain;
  const prior0 = domainPriorFrom(prior.filter((a) => a.mode === 'diagnostic'));
  const before = computeConceptStates(prior, now, prior0, conceptDomain);
  const after = computeConceptStates([...prior, added], now, prior0, conceptDomain);
  return added.conceptIds.filter((id) => !id.startsWith('D:') && isOvercome(before.get(id), after.get(id), wasWeakAt(prior, id)));
}

/** 連続学習日数（今日または昨日まで続いているもの） */
export function studyStreakDays(attempts: Attempt[], now: number): number {
  const days = new Set(attempts.map((a) => dayKey(a.answeredAt)));
  let d = now;
  if (!days.has(dayKey(d))) d -= DAY;
  let n = 0;
  while (days.has(dayKey(d))) { n++; d -= DAY; }
  return n;
}

/** ある時点までの回答だけで見た Concept 状態（「昨日の自分」との比較用） */
export function statesAt(attempts: Attempt[], at: number): Map<string, ConceptState> {
  const before = attempts.filter((a) => a.answeredAt < at);
  return computeConceptStates(before, at, domainPriorFrom(before.filter((a) => a.mode === 'diagnostic')), (id) => conceptById.get(id)?.domain);
}

export const startOfDay = (t: number) => Date.parse(`${dayKey(t)}T00:00:00+09:00`);

export interface Growth { conceptId: string; name: string; before: number; after: number }

/** セッションで触れたテーマの理解度の変化（上がったもの優先） */
export function sessionGrowth(all: Attempt[], sessionAttempts: Attempt[], sessionStart: number, now: number): Growth[] {
  const ids = [...new Set(sessionAttempts.flatMap((a) => a.conceptIds.slice(0, 1)))].filter((id) => !id.startsWith('D:'));
  const before = statesAt(all, sessionStart);
  const after = statesAt(all, now + 1);
  return ids
    .map((id) => ({ conceptId: id, name: conceptById.get(id)?.concept_name ?? id, before: before.get(id)?.mastery ?? 0, after: after.get(id)?.mastery ?? 0 }))
    .sort((a, b) => (b.after - b.before) - (a.after - a.before));
}

export interface Achievement { id: string; title: string; body: string; level: CelebrationLevel }

/**
 * ホームを開いたときに一度だけ出す節目（フェーズ移行・継続・試験30日前・頻出全習得）。
 * seen に含まれるものは返さない。
 */
export function milestones(attempts: Attempt[], settings: Settings, now: number, seen: Set<string>): Achievement[] {
  const out: Achievement[] = [];
  const days = daysLeft(settings.examDate, now);
  const phase = phaseOf(days);
  if (attempts.length > 0 && phase.id > 1) {
    const id = `phase:${phase.id}`;
    if (!seen.has(id)) out.push({ id, level: 6, title: `「${phase.name}」の時期に入りました`, body: `ここからは、${phase.goal}。11月8日に向けて学習計画を調整しました。` });
  }
  const streak = studyStreakDays(attempts, now);
  if (streak >= 7 && !seen.has('streak:7')) out.push({ id: 'streak:7', level: 4, title: '7日間続けて学習しました', body: '毎日の積み重ねが、いちばん確実な得点源です。' });
  if (days <= 30 && attempts.length > 0 && !seen.has('days:30')) out.push({ id: 'days:30', level: 4, title: '試験まで30日になりました', body: 'ここからは、よく出るテーマを固める時期です。出題もそれに合わせて調整します。' });
  const ctx = buildCtx(attempts, [], settings, now);
  const d = dashboard(ctx);
  if (d.frequentMastered.total > 0 && d.frequentMastered.mastered === d.frequentMastered.total && !seen.has('frequent:all')) {
    out.push({ id: 'frequent:all', level: 4, title: '頻出テーマを一通り習得しました', body: `重要度の高い${d.frequentMastered.total}テーマすべてで理解度70%を超えました。` });
  }
  return out;
}

/** 頻出テーマ数（表示用） */
export const FREQUENT_COUNT = CONCEPTS.filter((c) => c.importance === 'S' || c.importance === 'A').length;
