import { useMemo, useState } from 'react';
import { useStore } from '../../app/store';
import { CONCEPTS, META } from '../../data/content';
import { DOMAIN_NAME, DOMAINS, type Domain } from '../../domain/types';
import { conceptPriority } from '../../engine/priority';
import { dashboard } from '../../engine/stats';
import { Bar, Card, Num, PageHead, Stat, fmtPct } from '../components';

export default function Analysis() {
  const { ctx } = useStore();
  const d = useMemo(() => dashboard(ctx), [ctx]);
  const [domain, setDomain] = useState<Domain>('technology');

  const larges = [...new Set(CONCEPTS.filter((c) => c.domain === domain).map((c) => c.large_name))];
  const ranked = CONCEPTS.filter((c) => c.domain === domain)
    .map((c) => ({ c, p: conceptPriority(c.concept_id, ctx).total, st: ctx.concepts.get(c.concept_id) }))
    .sort((a, b) => b.p - a.p);

  return (
    <div className="page">
      <PageHead title="分析" sub="合格確率は出しません。根拠のある数字だけを表示します。" />
      <div className="stats">
        <Stat label="初見正答率" value={fmtPct(d.firstTryRate)} note="初めて解いた問題" />
        <Stat label="最近100問" value={fmtPct(d.recent100Rate)} />
        <Stat label="総合理解度" value={fmtPct(d.overallMastery)} note="頻度で重み付け" />
        <Stat label="苦手テーマ" value={`${d.weakConceptCount}`} note="2問以上で理解度50%未満" />
        <Stat label="頻出テーマ習得" value={`${d.frequentMastered.mastered}/${d.frequentMastered.total}`} note="重要度S・Aで理解度70%以上" />
        <Stat label="解いた問題" value={<Num value={d.totalAnswered} memo="an-total" />} />
      </div>

      <Card>
        <h3>分野別</h3>
        {DOMAINS.map((dm) => <Bar key={dm} label={DOMAIN_NAME[dm]} value={d.domainMastery[dm]} memo={`an-dom:${dm}`} sub={`正答率 ${fmtPct(d.domainRate[dm])}`} />)}
        <p className="muted small">本試験は総合600点以上かつ各分野300点以上（1000点満点）で合格です。</p>
      </Card>

      <div className="tabs" role="tablist">
        {DOMAINS.map((dm) => <button key={dm} role="tab" aria-selected={dm === domain} className={`press ${dm === domain ? 'on' : ''}`} onClick={() => setDomain(dm)}>{DOMAIN_NAME[dm]}</button>)}
      </div>

      <Card>
        <h3>大分類ごとの理解度</h3>
        {larges.map((name) => {
          const cs = CONCEPTS.filter((c) => c.large_name === name);
          const w = cs.reduce((s, c) => s + c.frequency_score, 0) || 1;
          const m = cs.reduce((s, c) => s + c.frequency_score * (ctx.concepts.get(c.concept_id)?.mastery ?? 0), 0) / w;
          return <Bar key={name} label={name} value={m} memo={`an-large:${name}`} />;
        })}
      </Card>

      <Card>
        <h3>テーマ一覧（学習優先度順）</h3>
        <table className="concepts">
          <thead><tr><th>テーマ</th><th>出題/回</th><th>理解度</th></tr></thead>
          <tbody>
            {ranked.slice(0, 40).map(({ c, st }) => (
              <tr key={c.concept_id}>
                <td><span className={`imp imp-${c.importance}`}>{c.importance}</span>{c.concept_name}<div className="muted small">{c.small_name}</div></td>
                <td className="num">{c.recency_weighted_per_exam.toFixed(1)}</td>
                <td className="num">{st ? `${Math.round(st.mastery * 100)}%` : '未'}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="muted small">
          出題/回 = 過去{META.exams.length}回（{META.exams[0]?.year}〜{META.exams[META.exams.length - 1]?.year}年）の公開問題を、
          新しい回ほど重く数えた1回あたりの平均出題数。テーマ分類はシラバス用語による自動分類を含みます。
        </p>
      </Card>
    </div>
  );
}
