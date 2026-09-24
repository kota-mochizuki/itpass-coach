export const DAY = 86_400_000;

/** 日本時間の 0:00 を基準にした日付キー（YYYY-MM-DD） */
export function dayKey(t: number): string {
  const d = new Date(t + 9 * 3_600_000);
  return d.toISOString().slice(0, 10);
}

/** 試験日当日の 0:00 JST（ms） */
export function examStart(examDate: string): number {
  return Date.parse(`${examDate}T00:00:00+09:00`);
}

/** 試験まであと何日（当日=0） */
export function daysLeft(examDate: string, now: number): number {
  const today = Date.parse(`${dayKey(now)}T00:00:00+09:00`);
  return Math.max(0, Math.round((examStart(examDate) - today) / DAY));
}

export type PhaseId = 1 | 2 | 3 | 4;
export interface Phase {
  id: PhaseId;
  name: string;
  goal: string;
  /** Frequency Score の効き（大きいほど頻出に集中） */
  focus: number;
  /** 未学習Conceptへの係数 */
  newFactor: number;
  /** SRS間隔の係数 */
  intervalFactor: number;
}

export const PHASES: Record<PhaseId, Phase> = {
  1: { id: 1, name: '全体把握', goal: '3分野を広く触れる。完璧でなくて大丈夫', focus: 0.6, newFactor: 1.3, intervalFactor: 1 },
  2: { id: 2, name: '頻出テーマ習得', goal: '本試験でよく出るテーマを固める', focus: 1.0, newFactor: 1.0, intervalFactor: 1 },
  3: { id: 3, name: '弱点圧縮', goal: 'よく出る苦手テーマを重点的に', focus: 1.3, newFactor: 0.7, intervalFactor: 1 },
  4: { id: 4, name: '直前対策', goal: '頻出×苦手×忘れかけを総仕上げ', focus: 1.8, newFactor: 0.3, intervalFactor: 0.5 },
};

export function phaseOf(days: number): Phase {
  if (days <= 7) return PHASES[4];
  if (days <= 17) return PHASES[3];
  if (days <= 32) return PHASES[2];
  return PHASES[1];
}
