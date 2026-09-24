import { useMemo, type ReactNode } from 'react';
import { rememberedFrom, useTween } from './motion';

/** 意味のあるまとまりだけに使う面 */
export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <section className={`card ${className}`}>{children}</section>;
}

/** 数値のカウントアップ（前回表示した値から、500ms以内） */
export function Num({ value, memo, suffix, decimals = 0 }: { value: number; memo?: string; suffix?: ReactNode; decimals?: number }) {
  const from = useMemo(() => (memo ? rememberedFrom(memo, value) : value), [memo, value]);
  const v = useTween(value, from, 450);
  return <span className="num">{v.toFixed(decimals)}{suffix}</span>;
}

/** 進捗バー。瞬間移動させず、前回の値から伸ばす（transform: scaleX） */
export function Bar({ value, label, sub, memo, delta }: { value: number; label?: string; sub?: ReactNode; memo?: string; delta?: number }) {
  const v = Math.max(0, Math.min(1, value));
  const from = useMemo(() => (memo ? Math.max(0, Math.min(1, rememberedFrom(memo, v))) : 0), [memo, v]);
  const t = useTween(v, from, 480);
  return (
    <div className="bar">
      {label && (
        <div className="bar-head">
          <span>{label}</span>
          <span className="bar-val">
            {delta !== undefined && delta >= 0.005 && <span className="up" aria-label={`前回より${Math.round(delta * 100)}ポイント上昇`}>↑{Math.round(delta * 100)}</span>}
            <span className="num">{Math.round(t * 100)}<small>%</small></span>
            {sub && <small className="muted"> {sub}</small>}
          </span>
        </div>
      )}
      <div className="bar-track" role="progressbar" aria-valuenow={Math.round(v * 100)} aria-valuemin={0} aria-valuemax={100} aria-label={label}>
        <div className="bar-fill" style={{ transform: `scaleX(${t})` }} />
      </div>
    </div>
  );
}

export function Stat({ label, value, note }: { label: string; value: ReactNode; note?: string }) {
  return (
    <div className="stat">
      <div className="stat-value">{value}</div>
      <div className="stat-label">{label}</div>
      {note && <div className="stat-note">{note}</div>}
    </div>
  );
}

export const fmtPct = (x: number | null | undefined) => (x == null ? '—' : `${Math.round(x * 100)}%`);

export function PageHead({ title, sub, right }: { title: string; sub?: string; right?: ReactNode }) {
  return (
    <header className="page-head">
      <div><h1>{title}</h1>{sub && <p className="muted">{sub}</p>}</div>
      {right}
    </header>
  );
}

export function CheckIcon({ className = '' }: { className?: string }) {
  return (
    <svg className={`check ${className}`} viewBox="0 0 24 24" aria-hidden>
      <circle cx="12" cy="12" r="11" />
      <path d="M7 12.5l3.2 3.2L17 9" />
    </svg>
  );
}

/** 読み込み中の骨組み（スピナーは使わない） */
export function Skeleton({ lines = 3, hero = true }: { lines?: number; hero?: boolean }) {
  return (
    <div className="page" aria-busy="true" aria-label="読み込み中">
      {hero && <div className="sk sk-hero" />}
      {Array.from({ length: lines }, (_, i) => <div key={i} className="sk sk-line" style={{ width: `${90 - i * 12}%` }} />)}
    </div>
  );
}
