import { useRef, useState } from 'react';
import { exportBackup, importBackup, resetAll } from '../../app/actions';
import { useStore } from '../../app/store';
import { ALL_QUESTIONS, CONCEPTS, META, STUDY_QUESTIONS } from '../../data/content';
import { Card, PageHead } from '../components';

export default function Settings() {
  const { settings, saveSettings, refresh } = useStore();
  const [msg, setMsg] = useState<string | null>(null);
  const file = useRef<HTMLInputElement>(null);

  const download = async () => {
    const blob = new Blob([await exportBackup()], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `itpass-coach-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    setMsg('バックアップを書き出しました。');
  };
  const restore = async (f: File) => {
    try { await importBackup(await f.text()); await refresh(); setMsg('復元しました。'); }
    catch (e) { setMsg(`復元できませんでした: ${(e as Error).message}`); }
  };

  const verified = ALL_QUESTIONS.filter((q) => q.text_status === 'verified').length;
  const explained = ALL_QUESTIONS.filter((q) => q.short_explanation).length;
  const review = ALL_QUESTIONS.filter((q) => q.validity_status === 'REVIEW_REQUIRED').length;

  return (
    <div className="page">
      <PageHead title="設定" />
      {msg && <p className="note">{msg}</p>}
      <Card>
        <label className="field">試験日
          <input type="date" value={settings.examDate} onChange={(e) => e.target.value && saveSettings({ examDate: e.target.value })} />
        </label>
        <label className="field">1日の学習時間
          <select value={settings.dailyMinutes} onChange={(e) => saveSettings({ dailyMinutes: Number(e.target.value) })}>
            {[10, 20, 30, 45].map((m) => <option key={m} value={m}>{m}分</option>)}
          </select>
        </label>
      </Card>

      <Card>
        <h3>学習データ</h3>
        <p className="muted small">記録はこの端末の中だけに保存されます。機種変更の前に書き出してください。</p>
        <button className="btn secondary" onClick={download}>バックアップを書き出す</button>
        <button className="btn ghost" onClick={() => file.current?.click()}>バックアップから復元</button>
        <input ref={file} type="file" accept="application/json" hidden onChange={(e) => e.target.files?.[0] && restore(e.target.files[0])} />
        <button className="btn ghost danger" onClick={async () => {
          if (confirm('すべての学習記録を消去します。よろしいですか？')) { await resetAll(); await refresh(); setMsg('消去しました。'); }
        }}>学習記録をリセット</button>
      </Card>

      <Card>
        <h3>問題データ</h3>
        <ul className="small plain">
          <li>公式問題 {ALL_QUESTIONS.length}問（{META.exams.length}回分）／出題対象 {STUDY_QUESTIONS.length}問</li>
          <li>要確認のため出題除外 {review}問（法改正・抽出エラーの可能性など）</li>
          <li>校正済み本文 {verified}問／解説あり {explained}問（その他は原本画像＋テーマ要点）</li>
          <li>テーマ {CONCEPTS.length}（{META.syllabus.title}）</li>
          <li className="muted">データ作成 {META.built_at}</li>
        </ul>
      </Card>

      <Card>
        <h3>出典・利用について</h3>
        <p className="small">
          問題はIPA（独立行政法人情報処理推進機構）が公開するITパスポート試験の公開問題・解答例です。各問題に出典を表示しています。
          IPAの案内に従い、過去問題は出典を明記して利用しています（一部改変した場合はその旨を表示）。
          テーマ体系は「ITパスポート試験 シラバス Ver.6.5」に基づきます。解説のうち「AIが作成」と表示したものは、公式正答と照合したうえで掲載しています。
        </p>
        <p className="small"><a href="https://www.ipa.go.jp/shiken/faq.html" target="_blank" rel="noreferrer">IPA 試験に関するよくある質問（過去問題の使用）</a></p>
        <p className="small"><a href={META.syllabus.url} target="_blank" rel="noreferrer">シラバス（IPA）</a></p>
      </Card>
    </div>
  );
}
