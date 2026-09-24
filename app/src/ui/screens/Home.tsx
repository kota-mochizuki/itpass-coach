import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { markAchievement, seenAchievements, startSession, unfinishedSession } from '../../app/actions';
import { useStore } from '../../app/store';
import { DOMAIN_NAME, DOMAINS, type Mode, type Session } from '../../domain/types';
import { milestones, startOfDay } from '../../engine/celebration';
import { buildCtx } from '../../engine/priority';
import { answeredToday, buildPlan, targetCount } from '../../engine/session';
import { dashboard } from '../../engine/stats';
import { celebrate } from '../Celebrate';
import { Bar, CheckIcon, Num, Skeleton } from '../components';

export function useStart() {
  const nav = useNavigate();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const start = async (mode: Mode, opt?: Parameters<typeof startSession>[1]) => {
    setBusy(true); setMsg(null);
    const s = await startSession(mode, opt);
    setBusy(false);
    if (s) nav(`/play/${s.id}`);
    else setMsg(mode === 'mistakes' || mode === 'quick5' ? '今日復習が必要な問題はありません。いい状態です。' : '出題できる問題がありません。');
  };
  return { start, busy, msg };
}

export default function Home() {
  const { ctx, settings, ready, attempts } = useStore();
  const { start, busy, msg } = useStart();
  const nav = useNavigate();
  const [resume, setResume] = useState<Session | null>(null);
  useEffect(() => { void unfinishedSession().then(setResume); }, []);

  // 節目（フェーズ移行・7日継続・試験30日前・頻出全習得）は一度だけ
  const checking = useRef(false);
  useEffect(() => {
    if (!ready || attempts.length === 0 || checking.current) return;
    checking.current = true;
    void (async () => {
      const seen = await seenAchievements();
      const list = milestones(attempts, settings, Date.now(), seen);
      for (const [i, m] of list.entries()) {
        await markAchievement(m.id);
        setTimeout(() => celebrate({ kind: m.level === 6 ? 'phase' : 'achievement', title: m.title, body: m.body }), 500 + i * 3800);
      }
      checking.current = false;
    })();
  }, [ready, attempts, settings]);

  const d = useMemo(() => dashboard(ctx), [ctx]);
  const yesterday = useMemo(() => {
    const t = startOfDay(ctx.now);
    const before = attempts.filter((a) => a.answeredAt < t);
    return before.length ? dashboard(buildCtx(before, [], settings, t)) : null;
  }, [attempts, settings, ctx.now]);
  const menu = useMemo(() => {
    const plan = buildPlan('today', ctx);
    const c = { review: 0, frequent: 0, forgetting: 0, fresh: 0 };
    for (const p of plan) {
      if (p.reason === 'mistake' || p.reason === 'weak') c.review++;
      else if (p.reason === 'forgetting') c.forgetting++;
      else if (p.reason === 'new') c.fresh++;
      else c.frequent++;
    }
    return c;
  }, [ctx]);

  if (!ready) return <Skeleton />;

  const target = targetCount(settings.dailyMinutes);
  const done = answeredToday(ctx);
  const complete = done >= target;

  const header = (
    <header className="home-head">
      <p className="countdown">試験まで<b className="num">{ctx.days}</b>日</p>
      <Link to="/settings" className="icon-btn press" aria-label="設定">⚙</Link>
    </header>
  );

  if (!settings.diagnosticDone && ctx.attempts.length === 0) {
    return (
      <div className="page">
        {header}
        <section className="hero">
          <p className="eyebrow">はじめに</p>
          <h2>いまの現在地を確認しましょう</h2>
          <p>3分野から代表的な15問を出します。結果をもとに、あなた専用の学習順をアプリが組み立てます。</p>
          <p className="muted small">約15分。わからない問題は「迷って回答」で大丈夫です。</p>
          <button className="btn primary big press" disabled={busy} onClick={() => start('diagnostic')}>診断をはじめる</button>
        </section>
        <button className="btn text press" onClick={() => start('today')}>診断せずに学習をはじめる</button>
      </div>
    );
  }

  const parts = [
    menu.review && `弱点復習 ${menu.review}`,
    menu.frequent && `頻出 ${menu.frequent}`,
    menu.forgetting && `忘却防止 ${menu.forgetting}`,
    menu.fresh && `新しいテーマ ${menu.fresh}`,
  ].filter(Boolean);
  const delta = yesterday ? d.overallMastery - yesterday.overallMastery : 0;

  return (
    <div className="page">
      {header}

      <section className={`hero ${complete ? 'is-complete' : ''}`}>
        <div className="hero-top">
          <span className="eyebrow">今日の学習</span>
          <span className="phase-chip">{ctx.phase.name}</span>
        </div>
        <div className="today-count">
          {complete && <CheckIcon className="pop" />}
          <Num value={Math.min(done, target)} memo="today-done" />
          <span className="of">/ {target}問</span>
          {complete && <span className="done-label">今日の目標は完了</span>}
        </div>
        <Bar value={done / target} memo="today-progress" />
        {!complete && parts.length > 0 && <p className="menu">{parts.join('・')}<span className="muted">　約{settings.dailyMinutes}分</span></p>}
        {resume ? (
          <button className="btn primary big press" onClick={() => nav(`/play/${resume.id}`)}>続きから（{resume.index + 1}問目）</button>
        ) : (
          <button className={`btn big press ${complete ? 'secondary' : 'primary'}`} disabled={busy} onClick={() => start('today')}>
            {complete ? 'もう少し学習する' : '今日の学習をはじめる'}
          </button>
        )}
        <button className="btn text press" disabled={busy} onClick={() => start('quick5')}>忙しい日は 5分だけ復習</button>
        {msg && <p className="note">{msg}</p>}
      </section>

      <section className="block">
        <div className="block-head">
          <h3>総合理解度</h3>
          <span className="big-num"><Num value={Math.round(d.overallMastery * 100)} memo="overall" suffix={<small>%</small>} /></span>
        </div>
        {delta >= 0.005 && <p className="growth">↑ 昨日より {Math.round(delta * 100)}ポイント伸びました</p>}
        {DOMAINS.map((dm) => (
          <Bar key={dm} label={DOMAIN_NAME[dm]} value={d.domainMastery[dm]} memo={`dom:${dm}`}
            delta={yesterday ? d.domainMastery[dm] - yesterday.domainMastery[dm] : undefined} />
        ))}
      </section>

      <section className="block">
        <h3>今週の重点</h3>
        <ol className="focus">
          {d.focusTop.map((f) => (
            <li key={f.conceptId}><b>{f.name}</b><span className="muted small">{f.why}</span></li>
          ))}
        </ol>
      </section>
    </div>
  );
}
