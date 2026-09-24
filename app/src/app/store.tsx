import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { db } from '../data/db';
import { DEFAULT_SETTINGS, type Attempt, type QState, type Settings } from '../domain/types';
import { buildCtx, type Ctx } from '../engine/priority';

interface StoreValue {
  ready: boolean;
  attempts: Attempt[];
  qstates: QState[];
  settings: Settings;
  ctx: Ctx;
  refresh: () => Promise<void>;
  saveSettings: (s: Partial<Settings>) => Promise<void>;
}

const Store = createContext<StoreValue | null>(null);

export async function loadSettings(): Promise<Settings> {
  const row = await db.kv.get('settings');
  return { ...DEFAULT_SETTINGS, ...((row?.value as Partial<Settings>) ?? {}) };
}

export function StoreProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [attempts, setAttempts] = useState<Attempt[]>([]);
  const [qstates, setQstates] = useState<QState[]>([]);
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [tick, setTick] = useState(0);

  const refresh = useCallback(async () => {
    const [a, q, s] = await Promise.all([db.attempts.orderBy('answeredAt').toArray(), db.qstates.toArray(), loadSettings()]);
    setAttempts(a); setQstates(q); setSettings(s); setTick((t) => t + 1); setReady(true);
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  const saveSettings = useCallback(async (patch: Partial<Settings>) => {
    const next = { ...(await loadSettings()), ...patch };
    await db.kv.put({ key: 'settings', value: next });
    setSettings(next);
  }, []);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const ctx = useMemo(() => buildCtx(attempts, qstates, settings, Date.now()), [attempts, qstates, settings, tick]);

  return <Store.Provider value={{ ready, attempts, qstates, settings, ctx, refresh, saveSettings }}>{children}</Store.Provider>;
}

export function useStore(): StoreValue {
  const v = useContext(Store);
  if (!v) throw new Error('StoreProvider missing');
  return v;
}
