import { useEffect, useRef, useState } from 'react';
import { haptic, chime, reducedMotion } from './motion';

// ---- 紙吹雪（canvas・transform相当の描画のみ・終わったら停止） ----
type Burst = 'small' | 'medium' | 'large';
const confettiListeners = new Set<(b: Burst) => void>();
export function confetti(size: Burst) { confettiListeners.forEach((f) => f(size)); }

const COLORS = ['#24406b', '#6f8fbf', '#2f6f5e', '#b88a2e', '#e3c77d', '#c9d6ea'];

interface P { x: number; y: number; vx: number; vy: number; r: number; vr: number; w: number; h: number; c: string; life: number }

export function ConfettiLayer() {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    let parts: P[] = [];
    let id = 0;
    const tick = () => {
      const cv = ref.current;
      const ctx = cv?.getContext?.('2d');
      if (!cv || !ctx) { parts = []; return; }
      ctx.clearRect(0, 0, cv.width, cv.height);
      parts = parts.filter((p) => p.life > 0 && p.y < cv.height + 20);
      for (const p of parts) {
        p.vy += 0.12; p.vx *= 0.99; p.x += p.vx; p.y += p.vy; p.r += p.vr; p.life -= 1;
        ctx.save();
        ctx.globalAlpha = Math.min(1, p.life / 40);
        ctx.translate(p.x, p.y); ctx.rotate(p.r);
        ctx.fillStyle = p.c; ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h * Math.abs(Math.cos(p.r * 2)));
        ctx.restore();
      }
      if (parts.length) id = requestAnimationFrame(tick);
    };
    const fire = (size: Burst) => {
      const cv = ref.current;
      if (!cv || !cv.getContext || reducedMotion()) return;
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      cv.width = innerWidth * dpr; cv.height = innerHeight * dpr;
      const n = { small: 24, medium: 60, large: 140 }[size];
      const origins = size === 'large' ? [0.2, 0.5, 0.8] : [0.5];
      for (let i = 0; i < n; i++) {
        const ox = origins[i % origins.length] * cv.width;
        const ang = -Math.PI / 2 + (Math.random() - 0.5) * (size === 'small' ? 0.9 : 1.4);
        const sp = (6 + Math.random() * 7) * dpr * (size === 'small' ? 0.8 : 1);
        parts.push({
          x: ox, y: cv.height * (size === 'small' ? 0.45 : 0.55), vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp,
          r: Math.random() * 6, vr: (Math.random() - 0.5) * 0.3, w: 7 * dpr, h: 11 * dpr,
          c: COLORS[i % COLORS.length], life: 110 + Math.random() * 50,
        });
      }
      cancelAnimationFrame(id);
      id = requestAnimationFrame(tick);
    };
    confettiListeners.add(fire);
    return () => { confettiListeners.delete(fire); cancelAnimationFrame(id); };
  }, []);
  return <canvas ref={ref} className="confetti" aria-hidden />;
}

// ---- 実績表示（トースト） ----
export interface Toast { id: number; title: string; body?: string; kind: 'streak' | 'achievement' | 'phase' }
const toastListeners = new Set<(t: Toast) => void>();
let seq = 0;

/** 実績を表示（Lv4以上は紙吹雪と少し強い触覚を伴う） */
export function celebrate(t: Omit<Toast, 'id'>) {
  const toast = { ...t, id: ++seq };
  toastListeners.forEach((f) => f(toast));
  if (t.kind !== 'streak') {
    haptic('achievement'); chime('achievement');
    confetti(t.kind === 'phase' ? 'large' : 'medium');
  }
}

export function ToastLayer() {
  const [list, setList] = useState<Toast[]>([]);
  useEffect(() => {
    const on = (t: Toast) => {
      setList((l) => [...l.slice(-1), t]);
      setTimeout(() => setList((l) => l.filter((x) => x.id !== t.id)), t.kind === 'streak' ? 1800 : 3600);
    };
    toastListeners.add(on);
    return () => { toastListeners.delete(on); };
  }, []);
  return (
    <div className="toasts" role="status" aria-live="polite">
      {list.map((t) => (
        <div key={t.id} className={`toast toast-${t.kind}`}>
          <span className="toast-icon" aria-hidden>{t.kind === 'streak' ? '✦' : t.kind === 'phase' ? '◆' : '★'}</span>
          <div><b>{t.title}</b>{t.body && <p>{t.body}</p>}</div>
        </div>
      ))}
    </div>
  );
}
