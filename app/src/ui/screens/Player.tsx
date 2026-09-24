import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { answer, finishSession, markAchievement, seenAchievements, type AnswerResult } from '../../app/actions';
import { useStore } from '../../app/store';
import { conceptById, questionById } from '../../data/content';
import { db } from '../../data/db';
import { LABELS, REASON_NAME, type Confidence, type Label, type PlanItem, type Question, type Session } from '../../domain/types';
import { answerLevel } from '../../engine/celebration';
import { celebrate, confetti } from '../Celebrate';
import { CheckIcon, Skeleton } from '../components';
import { chime, haptic, useTween } from '../motion';

interface Verdict { isCorrect: boolean; selected: Label }

export default function Player() {
  const { sid } = useParams();
  const nav = useNavigate();
  const { refresh } = useStore();
  const [session, setSession] = useState<Session | null>(null);
  const [idx, setIdx] = useState(0);
  const [selected, setSelected] = useState<Label | null>(null);
  const [verdict, setVerdict] = useState<Verdict | null>(null);
  const [result, setResult] = useState<AnswerResult | null>(null);
  const [detail, setDetail] = useState(false);
  const [streak, setStreak] = useState(0);
  const shownAt = useRef(Date.now());
  const pending = useRef<Promise<unknown> | null>(null);

  useEffect(() => {
    void db.sessions.get(sid!).then((s) => {
      if (!s) { nav('/'); return; }
      if (s.index >= s.plan.length) { nav(`/done/${s.id}`, { replace: true }); return; }
      setSession(s); setIdx(s.index); shownAt.current = Date.now();
    });
  }, [sid, nav]);

  const total = session?.plan.length ?? 1;
  const progress = useTween((verdict ? idx + 1 : idx) / total, 0, 320);

  if (!session) return <Skeleton lines={4} />;
  const item: PlanItem = session.plan[idx];
  const q = questionById.get(item.questionId);
  if (!q) return <div className="page"><p>問題が見つかりません。</p></div>;

  const submit = (confidence: Confidence) => {
    if (!selected || verdict) return;
    const isCorrect = selected === q.official_answer;
    // 押した瞬間に結果を出す（保存は裏で行う）
    setVerdict({ isCorrect, selected });
    const nextStreak = isCorrect ? streak + 1 : 0;
    setStreak(nextStreak);
    if (isCorrect) { haptic('correct'); chime('correct'); }
    const lvl = answerLevel(isCorrect, nextStreak);
    if (lvl === 2) celebrate({ kind: 'streak', title: '3問連続で正解' });
    if (lvl === 3) { confetti('small'); celebrate({ kind: 'streak', title: `${nextStreak}問連続で正解` }); }

    pending.current = answer(session, item, selected, confidence, Date.now() - shownAt.current).then(async (r) => {
      setResult(r);
      setSession({ ...session });
      const seen = await seenAchievements();
      for (const id of r.overcome) {
        if (seen.has(`overcome:${id}`)) continue;
        await markAchievement(`overcome:${id}`);
        celebrate({ kind: 'achievement', title: `「${conceptById.get(id)?.concept_name}」を習得しました`, body: '苦手だったテーマを克服しました。' });
      }
      void refresh();
    });
  };

  const next = async () => {
    await pending.current;
    const s = (await db.sessions.get(session.id))!;
    if (s.index >= s.plan.length) { nav(`/done/${s.id}`, { replace: true }); return; }
    setSession(s); setIdx(s.index);
    setSelected(null); setVerdict(null); setResult(null); setDetail(false);
    shownAt.current = Date.now();
    try { window.scrollTo({ top: 0 }); } catch { /* テスト環境など */ }
  };

  const quit = async () => {
    await pending.current;
    const s = (await db.sessions.get(session.id))!;
    if (s.index > 0) await finishSession(s);
    nav(s.index > 0 ? `/done/${s.id}` : '/', { replace: true });
  };

  const answered = verdict !== null;
  const lastNow = answered && idx + 1 >= session.plan.length && !(result?.followup);

  return (
    <div className="player">
      <div className="player-top">
        <button className="icon-btn press" aria-label="学習を終える" onClick={quit}>✕</button>
        <div className="player-progress" aria-hidden><div style={{ transform: `scaleX(${progress})` }} /></div>
        <span className="num counter">{idx + 1}<small> / {session.plan.length}</small></span>
      </div>

      <div key={item.questionId} className="q-enter">
        <div className="reason-chip"><b>{REASON_NAME[item.reason]}</b><span>{item.why}</span></div>

        <QuestionBody q={q} />

        <div className={`choices ${q.text_status === 'verified' ? 'with-text' : 'labels-only'}`} role="radiogroup" aria-label="選択肢">
          {LABELS.filter((l) => q.text_status !== 'verified' || q.choices[l] !== undefined).map((l) => {
            const isAns = answered && l === q.official_answer;
            const isMine = answered && l === verdict!.selected && !verdict!.isCorrect;
            const cls = ['choice', 'press',
              !answered && l === selected ? 'is-selected' : '',
              isAns ? 'is-answer' : '', isMine ? 'is-mine' : '', answered && !isAns && !isMine ? 'is-dim' : ''].join(' ');
            return (
              <button key={l} role="radio" aria-checked={l === selected} className={cls} disabled={answered}
                onClick={() => { setSelected(l); haptic('tap'); }}>
                <span className="choice-label">{l}</span>
                {q.text_status === 'verified' && <span className="choice-text">{q.choices[l]}</span>}
                {isAns && <span className="choice-tag ok"><CheckIcon />正解</span>}
                {isMine && <span className="choice-tag mine">あなたの回答</span>}
              </button>
            );
          })}
        </div>

        {answered && <Feedback q={q} verdict={verdict} result={result} detail={detail} onDetail={() => setDetail(true)} />}
      </div>

      <div className="bottom-bar">
        {!answered ? (
          selected ? (
            <div className="two fade-in">
              <button className="btn secondary press" onClick={() => submit('unsure')}>迷って回答</button>
              <button className="btn primary press" onClick={() => submit('sure')}>自信あり</button>
            </div>
          ) : <p className="hint">選択肢を選んでください</p>
        ) : (
          <button className="btn primary press fade-in" onClick={next}>{lastNow ? '結果を見る' : '次へ'}</button>
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
      {q.text_status === 'verified' && <p className="q-text">{q.question_text}</p>}
      {showImage && (
        <button className={`q-image ${zoom ? 'zoom' : ''}`} onClick={() => setZoom(!zoom)} aria-label="問題の原本画像（タップで拡大）">
          <img src={`${import.meta.env.BASE_URL}${q.image}`} alt={q.text_status === 'verified' ? '図表' : `問${q.question_number}の問題文（原本）`} />
        </button>
      )}
      <p className="source">
        {q.source_type === 'IPA_OFFICIAL' ? q.citation : `AI生成問題（${q.citation}）`}
        {q.modified && <span className="tag">一部改変</span>}
      </p>
    </article>
  );
}

/** 正解は短く気持ちよく。不正解は「なぜ違うか → 正解の要点」の順で「なるほど」へ */
function Feedback({ q, verdict, result, detail, onDetail }: {
  q: Question; verdict: Verdict; result: AnswerResult | null; detail: boolean; onDetail: () => void;
}) {
  const main = q.concept_ids.map((id) => conceptById.get(id)).find(Boolean);
  const mineWhy = q.wrong_choice_explanations?.[verdict.selected];
  return (
    <div className="feedback fade-up">
      {verdict.isCorrect ? (
        <div className="verdict ok"><CheckIcon className="pop" /><div><b>正解</b>{q.short_explanation && <p>{q.short_explanation}</p>}</div></div>
      ) : (
        <div className="verdict ng">
          <b>ここは混同しやすいポイントです</b>
          <p className="small">あなたの回答 {verdict.selected} ／ 正解 {q.official_answer}</p>
        </div>
      )}

      <div className="explain">
        {!verdict.isCorrect && mineWhy && <section><h4>{verdict.selected} を選んだ場合</h4><p>{mineWhy}</p></section>}
        {!verdict.isCorrect && q.short_explanation && <section><h4>正解 {q.official_answer} のポイント</h4><p>{q.short_explanation}</p></section>}
        {q.reason && (verdict.isCorrect ? detail : true) && <section><h4>理由</h4><p>{q.reason}</p></section>}
        {q.trap_point && (!verdict.isCorrect || detail) && <section><h4>違いの整理</h4><p>{q.trap_point}</p></section>}
        {q.memory_tip && <section className="memo"><h4>一言記憶</h4><p>{q.memory_tip}</p></section>}
        {!q.short_explanation && <p className="muted small">この問題の解説は準備中です。下のテーマの要点で確認しましょう。</p>}

        {(detail || !q.short_explanation) && main && (
          <section className="concept-card">
            <h4>テーマ：{main.concept_name}</h4>
            <p className="muted small">{main.large_name} › {main.middle_name} › {main.small_name}</p>
            {main.points.slice(0, 3).map((p, i) => <p key={i} className="small">・{p}</p>)}
            {main.terms.length > 0 && <p className="terms">{main.terms.slice(0, 12).join(' / ')}</p>}
            <p className="muted small">本試験で1回あたり平均 {main.recency_weighted_per_exam.toFixed(1)} 問（過去15回の分析・自動分類を含む）</p>
          </section>
        )}

        {detail && (
          <>
            {q.wrong_choice_explanations && (
              <section>
                <h4>各選択肢</h4>
                {LABELS.filter((l) => q.wrong_choice_explanations![l]).map((l) => (
                  <p key={l} className={`wrong-choice ${l === verdict.selected ? 'mine' : ''}`}><b>{l}</b> {q.wrong_choice_explanations![l]}</p>
                ))}
              </section>
            )}
            {q.detailed_explanation && <section><h4>詳しく</h4><p className="pre">{q.detailed_explanation}</p></section>}
            <p className="muted small">
              <a href={q.source_url} target="_blank" rel="noreferrer">出典PDF（IPA）</a>
              {q.explanation_source === 'AI_GENERATED' && '・解説はAIが作成（公式正答と照合済み）'}
            </p>
          </>
        )}
        {!detail && <button className="btn text press" onClick={onDetail}>詳しく理解する</button>}
      </div>
      {result?.followup && <p className="note">このテーマは、あとで別の問題でもう一度出題します。</p>}
    </div>
  );
}
