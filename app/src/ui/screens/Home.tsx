import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { startSession, unfinishedSession } from '../../app/actions';
import { useStore } from '../../app/store';
import { DOMAIN_NAME, DOMAINS, type Mode, type Session } from '../../domain/types';
import { answeredToday, targetCount } from '../../engine/session';
import { dashboard } from '../../engine/stats';
import { Bar, Card } from '../components';

export function useStart() {
  const nav = useNavigate();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const start = async (mode: Mode, opt?: Parameters<typeof startSession>[1]) => {
    setBusy(true); setMsg(null);
    const s = await startSession(mode, opt);
    setBusy(false);
    if (s) nav(`/play/${s.id}`);
    else setMsg(mode === 'mistakes' || mode === 'quick5' ? '今日復習が必要な問題はありません。' : '出題できる問題がありません。');
  };
  return { start, busy, msg };
}

export default function Home() {
  const { ctx, settings, ready } = useStore();
  const { start, busy, msg } = useStart();
  const nav = useNavigate();
  const [resume, setResume] = useState<Session | null>(null);
  useEffect(() => { void unfinishedSession().then(setResume); }, []);
  if (!ready) return null;

  const d = dashboard(ctx);
  const target = targetCount(settings.dailyMinutes);
  const done = answeredToday(ctx);

  if (!settings.diagnosticDone && ctx.attempts.length === 0) {
    return (
      <div className="page">
        <p className="countdown">試験まで あと <b>{ctx.days}</b> 日</p>
        <Card className="hero">
          <h2>はじめに、現在地を確認しましょう</h2>
          <p>3分野から代表的な15問を出します。<br />結果から、あなたに合った学習順をアプリが組み立てます。</p>
          <p className="muted small">約15分。わからない問題は「迷って回答」で大丈夫です。</p>
          <button className="btn primary big" disabled={busy} onClick={() => start('diagnostic')}>診断をはじめる</button>
        </Card>
        <button className="btn ghost" onClick={() => start('today')}>診断せずに学習をはじめる</button>
      </div>
    );
  }

  return (
    <div className="page">
      <p className="countdown">試験まで あと <b>{ctx.days}</b> 日</p>
      <p className="phase">いまは <b>{ctx.phase.name}</b> の時期 — {ctx.phase.goal}</p>

      <Card className="hero">
        <div className="today-row">
          <span>今日の学習</span>
          <span className="num"><b>{Math.min(done, target)}</b> / {target}問</span>
        </div>
        <div className="bar-track"><div className="bar-fill" style={{ width: `${Math.min(1, done / target) * 100}%` }} /></div>
        {resume ? (
          <button className="btn primary big" onClick={() => nav(`/play/${resume.id}`)}>続きから（{resume.index + 1}問目）</button>
        ) : (
          <button className="btn primary big" disabled={busy} onClick={() => start('today')}>
            {done >= target ? 'もう少し学習する' : '今日の学習をはじめる'}
          </button>
        )}
        <button className="btn secondary" disabled={busy} onClick={() => start('quick5')}>5分だけ復習</button>
        {msg && <p className="note">{msg}</p>}
      </Card>

      <Card>
        <h3>総合理解度 <span className="num big-num">{Math.round(d.overallMastery * 100)}<small>%</small></span></h3>
        <p className="muted small">よく出るテーマほど重く数えた理解度です（まだ解いていないテーマは0%）</p>
        {DOMAINS.map((dm) => <Bar key={dm} label={DOMAIN_NAME[dm]} value={d.domainMastery[dm]} />)}
      </Card>

      <Card>
        <h3>今週の重点</h3>
        <ol className="focus">
          {d.focusTop.map((f) => (
            <li key={f.conceptId}><b>{f.name}</b><span className="muted small">{f.why}</span></li>
          ))}
        </ol>
      </Card>
    </div>
  );
}
