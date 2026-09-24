import type { Confidence, QState } from '../domain/types';
import { DAY, examStart } from './time';

export function emptyQState(questionId: string): QState {
  return {
    questionId, seen: 0, streak: 0, lapses: 0, incorrectCount: 0, lastAt: 0, lastCorrect: false,
    lastIncorrectAt: null, intervalDays: 0, dueAt: null,
  };
}

/**
 * 回答結果から次回復習日を決める（問題単位）。
 * 不正解→1日 / 正解・迷い→短め / 正解・自信あり→延長 / 連続正解→大きく延長。
 * 次回日は試験前日を超えない。
 */
export function nextQState(
  prev: QState, isCorrect: boolean, confidence: Confidence, now: number,
  opts: { examDate: string; intervalFactor?: number; highFrequency?: boolean },
): QState {
  const s: QState = { ...prev, seen: prev.seen + 1, lastAt: now, lastCorrect: isCorrect };
  let interval: number;
  if (!isCorrect) {
    s.streak = 0;
    s.lapses = prev.seen > 0 && prev.lastCorrect ? prev.lapses + 1 : prev.lapses;
    s.incorrectCount = prev.incorrectCount + 1;
    s.lastIncorrectAt = now;
    interval = 1;
  } else if (confidence === 'unsure') {
    s.streak = prev.streak; // 迷っての正解は「定着」とみなさない
    interval = Math.min(3, Math.max(1, prev.intervalDays * 1.2));
  } else {
    s.streak = prev.streak + 1;
    interval = prev.intervalDays < 1 ? 3 : prev.intervalDays * (s.streak >= 3 ? 3.5 : 2.5);
  }
  interval = Math.max(1, interval * (opts.intervalFactor ?? 1));
  s.intervalDays = Math.round(interval * 10) / 10;

  const lastReview = examStart(opts.examDate) - DAY; // 試験前日
  let due = now + interval * DAY;
  if (due > lastReview) {
    // 頻出は前日に最終確認、そうでなければもう復習しない
    due = opts.highFrequency || !isCorrect ? Math.max(now + DAY / 2, lastReview) : Number.NaN;
  }
  s.dueAt = Number.isNaN(due) || due > examStart(opts.examDate) ? null : due;
  return s;
}
