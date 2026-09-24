import Dexie, { type Table } from 'dexie';
import type { Attempt, QState, Session } from '../domain/types';

export interface KV { key: string; value: unknown }
export interface LogEntry { id?: number; at: number; type: string; detail: unknown }

export class CoachDB extends Dexie {
  attempts!: Table<Attempt, number>;
  qstates!: Table<QState, string>;
  sessions!: Table<Session, string>;
  kv!: Table<KV, string>;
  logs!: Table<LogEntry, number>;

  constructor(name = 'itpass-coach') {
    super(name);
    this.version(1).stores({
      attempts: '++id, questionId, answeredAt, sessionId',
      qstates: 'questionId, dueAt',
      sessions: 'id, startedAt, endedAt',
      kv: 'key',
      logs: '++id, at, type',
    });
  }
}

export const db = new CoachDB();
export const TABLES = ['attempts', 'qstates', 'sessions', 'kv', 'logs'] as const;
