import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useStore } from '../../app/store';
import { conceptShort } from '../../data/content';
import { db } from '../../data/db';
import { DOMAIN_NAME, type Attempt, type Session } from '../../domain/types';
import { diagnosticSummary } from '../../engine/stats';
import { Card } from '../components';

export default function Done() {
  const { sid } = useParams();
  const nav = useNavigate();
  const { saveSettings, refresh } = useStore();
  const [session, setSession] = useState<Session | null>(null);
  const [list, setList] = useState<Attempt[]>([]);

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

  if (!session) return null;
  const correct = list.filter((a) => a.isCorrect).length;
  const uniq = (ids: string[]) => [...new Set(ids)].filter((id) => !id.startsWith('D:'));
  const wrongConcepts = uniq(list.filter((a) => !a.isCorrect).map((a) => a.conceptIds[0]));
  const solid = uniq(list.filter((a) => a.isCorrect && a.confidence === 'sure').map((a) => a.conceptIds[0]))
    .filter((id) => !wrongConcepts.includes(id)).slice(0, 3);
  const minutes = list.length ? Math.max(1, Math.round((Math.max(...list.map((a) => a.answeredAt)) - session.startedAt) / 60000)) : 0;

  return (
    <div className="page done">
      <h1>{session.title} 完了</h1>
      <Card>
        <p className="score"><b className="num">{list.length}</b>問　<b className="num">{correct}</b>問正解<span className="muted small">　{minutes}分</span></p>
      </Card>

      {session.mode === 'diagnostic' ? <DiagnosticResult attempts={list} /> : (
        <>
          {solid.length > 0 && (
            <Card><h3>今日定着したテーマ</h3><ul>{solid.map((id) => <li key={id}>{conceptShort(id)}</li>)}</ul></Card>
          )}
          {wrongConcepts.length > 0 && (
            <Card><h3>重点復習</h3><ul>{wrongConcepts.slice(0, 3).map((id) => <li key={id}>{conceptShort(id)}</li>)}</ul></Card>
          )}
          <Card>
            <h3>次回</h3>
            <p>{wrongConcepts.length ? `${conceptShort(wrongConcepts[0])}をもう一度確認します。` : 'よく出るテーマの中から、次に効果の大きいものに進みます。'}</p>
          </Card>
        </>
      )}
      <p className="closing">今日もお疲れさまでした。</p>
      <button className="btn primary big" onClick={() => nav('/', { replace: true })}>ホームへ</button>
    </div>
  );
}

function DiagnosticResult({ attempts }: { attempts: Attempt[] }) {
  const s = diagnosticSummary(attempts);
  return (
    <>
      <Card>
        <h3>分野ごとの現在地</h3>
        <ul className="levels">
          {s.byDomain.map((d) => (
            <li key={d.domain}><span>{DOMAIN_NAME[d.domain]}</span><span className="num">{d.correct}/{d.total}</span><span className={`level ${d.level}`}>{d.level ?? '—'}</span></li>
          ))}
        </ul>
      </Card>
      <Card>
        <h3>分類ごと</h3>
        <ul className="levels">
          {s.byLarge.map((d) => (
            <li key={d.name}><span>{d.name}</span><span className="num">{d.correct}/{d.total}</span><span className={`level ${d.level}`}>{d.level}</span></li>
          ))}
        </ul>
        <p className="muted small">この結果をもとに、明日からの出題順を組み立てます。問題数が少ないので、目安として見てください。</p>
      </Card>
    </>
  );
}
