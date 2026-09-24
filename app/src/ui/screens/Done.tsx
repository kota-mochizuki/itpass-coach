import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { markAchievement, seenAchievements } from '../../app/actions';
import { useStore } from '../../app/store';
import { conceptShort } from '../../data/content';
import { db } from '../../data/db';
import { DOMAIN_NAME, type Attempt, type Session } from '../../domain/types';
import { sessionGrowth } from '../../engine/celebration';
import { answeredToday, targetCount } from '../../engine/session';
import { diagnosticSummary } from '../../engine/stats';
import { dayKey } from '../../engine/time';
import { confetti } from '../Celebrate';
import { Bar, CheckIcon, Num } from '../components';
import { chime, haptic } from '../motion';

export default function Done() {
  const { sid } = useParams();
  const nav = useNavigate();
  const { saveSettings, refresh, ctx, attempts, settings } = useStore();
  const [session, setSession] = useState<Session | null>(null);
  const [list, setList] = useState<Attempt[]>([]);
  const [dailyDone, setDailyDone] = useState(false);
  const fired = useRef(false);

  useEffect(() => {
    void (async () => {
      const s = await db.sessions.get(sid!);
      if (!s) return;
      const a = await db.attempts.where('sessionId').equals(s.id).toArray();
      setSession(s); setList(a);
      if (s.mode === 'diagnostic') await saveSettings({ diagnosticDone: true });
      await refresh();
    })();
  }, [sid, saveSettings, refresh]);

  // 今日の目標を達成した最初の完了画面でだけ、最大の演出（Lv5）
  useEffect(() => {
    if (!session || !list.length) return;
    const reached = answeredToday(ctx) >= targetCount(settings.dailyMinutes);
    setDailyDone(reached);
    const key = `daily:${dayKey(ctx.now)}`;
    if (fired.current || !ctx.attempts.some((a) => a.sessionId === session.id)) return;
    fired.current = true;
    void seenAchievements().then(async (seen) => {
      if (reached && !seen.has(key)) {
        await markAchievement(key);
        setTimeout(() => { confetti('large'); haptic('complete'); chime('complete'); }, 250);
      } else if (session.mode === 'diagnostic' && !seen.has('diagnostic')) {
        await markAchievement('diagnostic');
        setTimeout(() => confetti('medium'), 250);
      }
    });
  }, [session, list, ctx, settings.dailyMinutes]);

  const growth = useMemo(() => (session && list.length
    ? sessionGrowth(attempts, list, session.startedAt, ctx.now) : []), [session, list, attempts, ctx.now]);

  if (!session) return null;
  const correct = list.filter((a) => a.isCorrect).length;
  const wrongConcepts = [...new Set(list.filter((a) => !a.isCorrect).map((a) => a.conceptIds[0]))].filter((id) => !id.startsWith('D:'));
  const learned = growth.filter((g) => g.after >= 0.6 && g.after > g.before && !wrongConcepts.includes(g.conceptId)).slice(0, 3);
  const rising = growth.filter((g) => g.after - g.before >= 0.02).slice(0, 4);
  const title = dailyDone && session.mode === 'today' ? '今日の学習 完了' : `${session.title} 完了`;

  return (
    <div className="page done">
      <header className="done-head fade-up">
        <CheckIcon className="pop big-check" />
        <h1>{title}</h1>
        <p className="score"><b><Num value={list.length} /></b>問　<b><Num value={correct} /></b>問正解</p>
      </header>

      {session.mode === 'diagnostic' ? <DiagnosticResult attempts={list} /> : (
        <>
          {learned.length > 0 && (
            <section className="block fade-up d1">
              <h3>今日習得したテーマ</h3>
              <ul className="checks">{learned.map((g) => <li key={g.conceptId}><CheckIcon />{g.name}</li>)}</ul>
            </section>
          )}
          {rising.length > 0 && (
            <section className="block fade-up d2">
              <h3>理解度の変化</h3>
              {rising.map((g) => (
                <div key={g.conceptId} className="growth-row">
                  <span className="g-name">{g.name}</span>
                  <span className="g-from num">{Math.round(g.before * 100)}%</span>
                  <span aria-hidden>→</span>
                  <span className="g-to"><Num value={Math.round(g.after * 100)} suffix="%" /> <span className="up">↑</span></span>
                  <Bar value={g.after} memo={undefined} />
                </div>
              ))}
            </section>
          )}
          {wrongConcepts.length > 0 && (
            <section className="block fade-up d3">
              <h3>重点復習</h3>
              <ul className="plain-list">{wrongConcepts.slice(0, 3).map((id) => <li key={id}>{conceptShort(id)}</li>)}</ul>
              <p className="muted small">11月8日に向けて学習計画を調整しました。{conceptShort(wrongConcepts[0])}は、次回もう一度出題します。</p>
            </section>
          )}
          {wrongConcepts.length === 0 && (
            <p className="muted fade-up d3">次回は、よく出るテーマの中から次に効果の大きいものに進みます。</p>
          )}
        </>
      )}

      <p className="countdown small-count fade-up d3">試験まで あと <b className="num">{ctx.days}</b> 日</p>
      <p className="closing">{dailyDone ? '今日はここまで。お疲れさまでした。' : '今日もお疲れさまでした。'}</p>
      <div className="bottom-bar static">
        <button className="btn primary big press" onClick={() => nav('/', { replace: true })}>ホームへ</button>
      </div>
    </div>
  );
}

function DiagnosticResult({ attempts }: { attempts: Attempt[] }) {
  const s = diagnosticSummary(attempts);
  return (
    <>
      <section className="block fade-up d1">
        <h3>分野ごとの現在地</h3>
        <ul className="levels">
          {s.byDomain.map((d) => (
            <li key={d.domain}><span>{DOMAIN_NAME[d.domain]}</span><span className="num">{d.correct}/{d.total}</span><span className={`level ${d.level}`}>{d.level ?? '—'}</span></li>
          ))}
        </ul>
      </section>
      <section className="block fade-up d2">
        <h3>分類ごと</h3>
        <ul className="levels">
          {s.byLarge.map((d) => (
            <li key={d.name}><span>{d.name}</span><span className="num">{d.correct}/{d.total}</span><span className={`level ${d.level}`}>{d.level}</span></li>
          ))}
        </ul>
        <p className="muted small">この結果をもとに、明日からの出題順を組み立てます。問題数が少ないので、目安として見てください。</p>
      </section>
    </>
  );
}
