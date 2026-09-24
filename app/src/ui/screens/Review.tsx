import { useStore } from '../../app/store';
import { conceptShort, primaryConcept, questionById } from '../../data/content';
import { dayKey } from '../../engine/time';
import { Card, PageHead, fmtPct } from '../components';
import { useStart } from './Home';

/** 間違いノート（自動生成） */
export default function Review() {
  const { ctx, qstates } = useStore();
  const { start, busy, msg } = useStart();
  const wrong = qstates.filter((s) => s.incorrectCount > 0 && questionById.has(s.questionId));
  const due = wrong.filter((s) => s.dueAt != null && s.dueAt <= ctx.now);

  const groups = new Map<string, typeof wrong>();
  for (const s of wrong) {
    const cid = primaryConcept(questionById.get(s.questionId)!);
    groups.set(cid, [...(groups.get(cid) ?? []), s]);
  }
  const sorted = [...groups.entries()].sort((a, b) => b[1].length - a[1].length);

  return (
    <div className="page">
      <PageHead title="復習" sub="まちがえた問題は自動でここに集まります。" />
      <Card className="hero">
        <p>今日復習すべき間違い <b className="num">{due.length}</b> 問</p>
        <button className="btn primary big" disabled={busy || wrong.length === 0} onClick={() => start('mistakes')}>
          {due.length ? '今日の間違いを復習する' : '間違えた問題を解き直す'}
        </button>
        {msg && <p className="note">{msg}</p>}
      </Card>

      {sorted.length === 0 ? <p className="muted">まだ間違えた問題はありません。</p> : (
        <Card>
          <h3>テーマ別の間違い</h3>
          <ul className="mistakes">
            {sorted.map(([cid, list]) => {
              const st = ctx.concepts.get(cid);
              return (
                <li key={cid}>
                  <div><b>{conceptShort(cid)}</b><span className="muted small">理解度 {fmtPct(st?.mastery)}</span></div>
                  {list.map((s) => {
                    const q = questionById.get(s.questionId)!;
                    return (
                      <p key={s.questionId} className="small">
                        {q.citation.replace('出典：', '')}・{s.incorrectCount}回
                        <span className="muted">　次回 {s.dueAt ? dayKey(s.dueAt).slice(5).replace('-', '/') : '—'}</span>
                      </p>
                    );
                  })}
                </li>
              );
            })}
          </ul>
        </Card>
      )}
    </div>
  );
}
