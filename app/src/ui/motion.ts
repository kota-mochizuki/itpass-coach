import { useEffect, useRef, useState } from 'react';

/** OS の「視差効果を減らす」設定 */
export function reducedMotion(): boolean {
  try { return window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { return false; }
}

// ---- 触覚・音（設定で切替。未対応環境では何もしない） ----
let prefs = { haptics: true, sound: false };
export function setFeedbackPrefs(p: { haptics: boolean; sound: boolean }) { prefs = p; }

type Feedback = 'tap' | 'correct' | 'achievement' | 'complete';

export function haptic(kind: Feedback) {
  if (!prefs.haptics) return;
  const pattern = { tap: 4, correct: 8, achievement: [12, 40, 18], complete: [14, 50, 14, 50, 22] }[kind];
  try { navigator.vibrate?.(pattern); } catch { /* 未対応 */ }
}

let audio: AudioContext | null = null;
/** 小さく心地よい音。不正解の音は鳴らさない */
export function chime(kind: Exclude<Feedback, 'tap'>) {
  if (!prefs.sound) return;
  try {
    audio ??= new AudioContext();
    const notes = { correct: [880], achievement: [660, 880, 1320], complete: [523, 659, 784, 1047] }[kind];
    notes.forEach((f, i) => {
      const o = audio!.createOscillator(), g = audio!.createGain();
      const t = audio!.currentTime + i * 0.09;
      o.type = 'sine'; o.frequency.value = f;
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(0.06, t + 0.015);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.35);
      o.connect(g).connect(audio!.destination);
      o.start(t); o.stop(t + 0.4);
    });
  } catch { /* 未対応 */ }
}

// ---- 数値・進捗のアニメーション ----
const raf = (cb: FrameRequestCallback) => (typeof requestAnimationFrame === 'function' ? requestAnimationFrame(cb) : (setTimeout(() => cb(performance.now()), 16) as unknown as number));
const caf = (id: number) => (typeof cancelAnimationFrame === 'function' ? cancelAnimationFrame(id) : clearTimeout(id));
const easeOut = (t: number) => 1 - Math.pow(1 - t, 3);

/** from → to を duration(ms) で滑らかに変化させる。reduced-motion では即座に to */
export function useTween(to: number, from = to, duration = 480): number {
  const [v, setV] = useState(reducedMotion() ? to : from);
  const cur = useRef(v);
  useEffect(() => {
    if (reducedMotion() || cur.current === to) { cur.current = to; setV(to); return; }
    const start = performance.now(), a = cur.current;
    let id = 0;
    const step = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      cur.current = a + (to - a) * easeOut(t);
      setV(cur.current);
      if (t < 1) id = raf(step);
    };
    id = raf(step);
    return () => caf(id);
  }, [to, duration]);
  return v;
}

/** 前回見た値を覚えておき、次に開いたときそこから伸ばす（端末内の表示用メモ） */
const recent = new Map<string, { prev: number; value: number; at: number }>();
export function rememberedFrom(key: string, current: number): number {
  // StrictMode の二重実行・同じ画面での再描画では同じ起点を返す
  const r = recent.get(key);
  if (r && r.value === current && Date.now() - r.at < 1500) return r.prev;
  let prev = current;
  try {
    const raw = localStorage.getItem(`seen:${key}`);
    if (raw !== null) prev = Number(raw);
    localStorage.setItem(`seen:${key}`, String(current));
  } catch { /* プライベートモード等 */ }
  if (!Number.isFinite(prev)) prev = current;
  recent.set(key, { prev, value: current, at: Date.now() });
  return prev;
}
