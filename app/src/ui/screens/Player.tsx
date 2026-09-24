import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { answer, finishSession, type AnswerResult } from '../../app/actions';
import { useStore } from '../../app/store';
import { conceptById, questionById } from '../../data/content';
import { db } from '../../data/db';
import { LABELS, REASON_NAME, type Confidence, type Label, type PlanItem, type Question, type Session } from '../../domain/types';

export default function Player() {
  const { sid } = useParams();
  const nav = useNavigate();
  const { refresh } = useStore();
  const [session, setSession] = useState<Session | null>(null);
  const [item, setItem] = useState<PlanItem | null>(null);
  const [selected, setSelected] = useState<Label | null>(null);
  const [result, setResult] = useState<AnswerResult | null>(null);
  const [detail, setDetail] = useState(false);
  const shownAt = useRef(Date.now());

  useEffect(() => {
    void db.sessions.get(sid!).then((s) => {
      if (!s) { nav('/'); return; }
      if (s.index >= s.plan.length) { nav(`/done/${s.id}`, { replace: true }); return; }
      setSession(s); setItem(s.plan[s.index]); shownAt.current = Date.now();
    });
  }, [sid, nav]);

  if (!session || !item) return null;
  const q = questionById.get(item.questionId);
  if (!q) return <div className="page"><p>問題が見つかりません。</p></div>;
  const position = result ? session.index : session.index + 1;

  const submit = async (confidence: Confidence) => {
    if (!selected) return;
    const r = await answer(session, item, selected, confidence, Date.now() - shownAt.current);
    setSession({ ...session });
    setResult(r);
    void refresh();
  };

  const next = () => {
    if (session.index >= session.plan.length) { nav(`/done/${session.id}`, { replace: true }); return; }
    setItem(session.plan[session.index]); setSelected(null); setResult(null); setDetail(false);
    shownAt.current = Date.now();
    try { window.scrollTo(0, 0); } catch { /* テスト環境など */ }
  };

  const quit = async () => {
    if (session.index > 0) await finishSession(session);
    nav(session.index > 0 ? `/done/${session.id}` : '/', { replace: true });
  };

  const answered = result !== null;
  const correct = result?.attempt.isCorrect;

  return (
    <div className="player">
      <div className="player-top">
        <button className="icon-btn" aria-label="学習を終える" onClick={quit}>✕</button>
        <span className="num">{position} / {session.plan.length}</span>
        <span className="muted small">{session.title}</span>
      </div>
      <div className="reason-chip"><b>{REASON_NAME[item.reason]}</b>{item.why}</div>

      <QuestionBody q={q} />

      <div className={`choices ${q.text_status === 'verified' ? 'with-text' : 'labels-only'}`}>
        {LABELS.filter((l) => q.text_status !== 'verified' || q.choices[l] !== undefined).map((l) => {
          let cls = 'choice';
          if (answered) {
            if (l === q.official_answer) cls += ' is-answer';
            else if (l === selected) cls += ' is-wrong';
          } else if (l === selected) cls += ' is-selected';
          return (
            <button key={l} className={cls} disabled={answered} onClick={() => setSelected(l)} aria-pressed={l === selected}>
              <span className="choice-label">{l}</span>
              {q.text_status === 'verified' && <span className="choice-text">{q.choices[l]}</span>}
            </button>
          );
        })}
      </div>

      {answered && (
        <div className="result">
          <div className={`verdict ${correct ? 'ok' : 'ng'}`}>
            {correct ? <><b>正解</b><span>{q.official_answer}</span></>
              : <><b>正解は {q.official_answer} でした</b><span className="small">あなたの回答: {selected}。ここで気づけたのは収穫です</span></>}
          </div>
          <Explanation q={q} selected={selected!} detail={detail} />
          {!detail && <button className="btn ghost" onClick={() => setDetail(true)}>詳しく理解する</button>}
          {result.followup && <p className="note">あとで同じテーマを別の問題で確認します。</p>}
        </div>
      )}

      <div className="bottom-bar">
        {!answered ? (
          selected ? (
            <div className="two">
              <button className="btn secondary" onClick={() => submit('unsure')}>迷って回答</button>
              <button className="btn primary" onClick={() => submit('sure')}>自信あり</button>
            </div>
          ) : <p className="hint">選択肢を選んでください</p>
        ) : (
          <button className="btn primary" onClick={next}>{session.index >= session.plan.length ? '結果を見る' : '次へ'}</button>
        )}
      </div>
    </div>
  );
}

function QuestionBody({ q }: { q: Question }) {
  const [zoom, setZoom] = useState(false);
  const showImage = q.text_status !== 'verified' || q.has_figure;
  return (
    <article className="question">
      <p className="source">
        {q.source_type === 'IPA_OFFICIAL' ? q.citation : `AI生成問題（${q.citation}）`}
        {q.modified && <span className="tag">一部改変</span>}
      </p>
      {q.text_status === 'verified' && <p className="q-text">{q.question_text}</p>}
      {showImage && (
        <button className={`q-image ${zoom ? 'zoom' : ''}`} onClick={() => setZoom(!zoom)} aria-label="問題の原本画像（タップで拡大）">
          <img src={`${import.meta.env.BASE_URL}${q.image}`} alt={q.text_status === 'verified' ? '図表' : `問${q.question_number}の問題文（原本）`} loading="eager" />
        </button>
      )}
    </article>
  );
}

function Explanation({ q, selected, detail }: { q: Question; selected: Label; detail: boolean }) {
  const concepts = (q.concept_ids.length ? q.concept_ids : []).map((id) => conceptById.get(id)).filter(Boolean);
  const main = concepts[0];
  return (
    <div className="explain">
      {q.short_explanation ? (
        <>
          <section><h4>結論</h4><p>{q.short_explanation}</p></section>
          {q.reason && <section><h4>理由</h4><p>{q.reason}</p></section>}
          {q.trap_point && <section><h4>ひっかけポイント</h4><p>{q.trap_point}</p></section>}
          {q.memory_tip && <section className="memo"><h4>一言記憶</h4><p>{q.memory_tip}</p></section>}
        </>
      ) : (
        <p className="muted small">この問題の解説は準備中です。下のテーマの要点で確認しましょう。</p>
      )}

      {(detail || !q.short_explanation) && main && (
        <section className="concept-card">
          <h4>テーマ：{main.concept_name}</h4>
          <p className="muted small">{main.large_name} › {main.middle_name} › {main.small_name}</p>
          {main.points.slice(0, 3).map((p, i) => <p key={i} className="small">・{p}</p>)}
          {main.terms.length > 0 && <p className="terms">{main.terms.slice(0, 12).join(' / ')}</p>}
          <p className="muted small">本試験で1回あたり平均 {main.recency_weighted_per_exam.toFixed(1)} 問（過去15回の分析・自動分類）</p>
        </section>
      )}

      {detail && (
        <>
          {q.wrong_choice_explanations && (
            <section>
              <h4>各選択肢</h4>
              {LABELS.filter((l) => q.wrong_choice_explanations![l]).map((l) => (
                <p key={l} className={`wrong-choice ${l === selected ? 'mine' : ''}`}><b>{l}</b> {q.wrong_choice_explanations![l]}</p>
              ))}
            </section>
          )}
          {q.detailed_explanation && <section><h4>詳しく</h4><p className="pre">{q.detailed_explanation}</p></section>}
          <p className="muted small">
            <a href={q.source_url} target="_blank" rel="noreferrer">出典PDF（IPA）</a>
            {q.explanation_source === 'AI_GENERATED' && ' ・解説はAIが作成（公式正答と照合済み）'}
          </p>
        </>
      )}
    </div>
  );
}
