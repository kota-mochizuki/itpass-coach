import { useState } from 'react';
import { useStore } from '../../app/store';
import { DOMAIN_NAME, DOMAINS, type Domain } from '../../domain/types';
import { EXAM_OPTIONS } from '../../engine/session';
import { Card, PageHead } from '../components';
import { useStart } from './Home';

export default function Learn() {
  const { start, busy, msg } = useStart();
  const { ctx } = useStore();
  const [domain, setDomain] = useState<Domain | ''>('');
  const [exam, setExam] = useState('');

  return (
    <div className="page">
      <PageHead title="学習" sub="迷ったら「今日の学習」だけで大丈夫です。" />
      {msg && <p className="note">{msg}</p>}

      <button className="mode" disabled={busy} onClick={() => start('today')}>
        <b>今日の学習</b><span>いま最も得点につながる問題を自動で選びます</span>
      </button>
      <button className="mode" disabled={busy} onClick={() => start('weak')}>
        <b>弱点克服</b><span>正答率の低いテーマと、まちがえた問題を集中して</span>
      </button>
      <button className="mode" disabled={busy} onClick={() => start('quick5')}>
        <b>5分だけ復習</b><span>忘れかけと間違いを5問だけ</span>
      </button>
      <button className="mode" disabled={busy} onClick={() => start('final')}>
        <b>直前対策</b><span>頻出 × 苦手 × 忘れかけに絞った20問{ctx.days > 7 && '（試験1週間前からがおすすめ）'}</span>
      </button>

      <Card>
        <h3>自由演習</h3>
        <label className="field">分野
          <select value={domain} onChange={(e) => setDomain(e.target.value as Domain | '')}>
            <option value="">すべて</option>
            {DOMAINS.map((d) => <option key={d} value={d}>{DOMAIN_NAME[d]}</option>)}
          </select>
        </label>
        <button className="btn secondary" disabled={busy} onClick={() => start('free', { free: { domain: domain || undefined }, title: domain ? `${DOMAIN_NAME[domain]}の演習` : '自由演習' })}>10問はじめる</button>
        <label className="field">年度別（本試験の順番どおり・通常は非推奨）
          <select value={exam} onChange={(e) => setExam(e.target.value)}>
            <option value="">選択してください</option>
            {EXAM_OPTIONS.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
          </select>
        </label>
        <button className="btn ghost" disabled={busy || !exam} onClick={() => start('free', { free: { examId: exam }, title: EXAM_OPTIONS.find((o) => o.id === exam)?.name })}>この年度を解く</button>
      </Card>

      <button className="btn ghost" disabled={busy} onClick={() => start('diagnostic')}>初回診断をやり直す</button>
    </div>
  );
}
