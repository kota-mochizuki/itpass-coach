import type { ReactNode } from 'react';

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <section className={`card ${className}`}>{children}</section>;
}

export function Bar({ value, label, sub }: { value: number; label: string; sub?: string }) {
  const v = Math.max(0, Math.min(1, value));
  return (
    <div className="bar">
      <div className="bar-head">
        <span>{label}</span>
        <span className="num">{Math.round(v * 100)}<small>%</small>{sub && <small className="muted"> {sub}</small>}</span>
      </div>
      <div className="bar-track" role="progressbar" aria-valuenow={Math.round(v * 100)} aria-valuemin={0} aria-valuemax={100} aria-label={label}>
        <div className="bar-fill" style={{ width: `${v * 100}%` }} />
      </div>
    </div>
  );
}

export function Stat({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="stat">
      <div className="stat-value">{value}</div>
      <div className="stat-label">{label}</div>
      {note && <div className="stat-note">{note}</div>}
    </div>
  );
}

export const fmtPct = (x: number | null | undefined) => (x == null ? '—' : `${Math.round(x * 100)}%`);

export function PageHead({ title, sub }: { title: string; sub?: string }) {
  return (
    <header className="page-head">
      <h1>{title}</h1>
      {sub && <p className="muted">{sub}</p>}
    </header>
  );
}
