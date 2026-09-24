// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import App from '../app/App';
import { questionById } from '../data/content';
import { db } from '../data/db';
import { LABELS } from '../domain/types';

beforeEach(async () => {
  await Promise.all([db.attempts.clear(), db.qstates.clear(), db.sessions.clear(), db.kv.clear(), db.logs.clear()]);
  window.location.hash = '#/';
});
afterEach(cleanup);

/** 現在表示中の問題を解く。correct=true なら公式正答を選ぶ */
async function answerCurrent(correct: boolean, sure = true) {
  const s = (await db.sessions.orderBy('startedAt').last())!;
  const q = questionById.get(s.plan[s.index].questionId)!;
  const pick = correct ? q.official_answer : LABELS.find((l) => l !== q.official_answer)!;
  const btn = await screen.findByRole('button', { name: new RegExp(`^${pick}`) });
  fireEvent.click(btn);
  fireEvent.click(await screen.findByRole('button', { name: sure ? '自信あり' : '迷って回答' }));
  await screen.findByText(correct ? '正解' : `正解は ${q.official_answer} でした`);
  return q;
}

describe('E2E: 初回起動 → 診断 → 今日の学習 → 間違いノート', () => {
  it('一連の学習ループが動く', async () => {
    render(<App />);
    // 初回はホームに診断カードだけ
    fireEvent.click(await screen.findByRole('button', { name: '診断をはじめる' }));

    // 診断15問（交互に正解・不正解）
    for (let i = 0; i < 15; i++) {
      await screen.findByText(`${i + 1} / 15`);
      const q = await answerCurrent(i % 2 === 0);
      // 出典表示
      expect(screen.getByText(new RegExp(`問${q.question_number}`))).toBeTruthy();
      // 解説（校正済みの診断問題には結論がある）
      if (q.short_explanation) expect(screen.getByText(q.short_explanation)).toBeTruthy();
      fireEvent.click(screen.getByRole('button', { name: i === 14 ? '結果を見る' : '次へ' }));
    }
    await screen.findByText('初回診断 完了');
    expect(screen.getByText('分野ごとの現在地')).toBeTruthy();
    expect(screen.getByText('今日もお疲れさまでした。')).toBeTruthy();
    expect(await db.attempts.count()).toBe(15);

    // ホーム: カウントダウン・今日の学習・重点TOP3
    fireEvent.click(screen.getByRole('button', { name: 'ホームへ' }));
    await screen.findByText('今週の重点');
    expect(screen.getByText(/試験まで/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /今日の学習をはじめる|もう少し学習する/ }));

    // 今日の学習: 1問目をまちがえる → 「別の問題で確認」が差し込まれる
    await screen.findByText(/^1 \/ \d+$/);
    await answerCurrent(false, false);
    const s = (await db.sessions.orderBy('startedAt').last())!;
    const hasFollowup = s.plan.some((p) => p.reason === 'followup');
    if (hasFollowup) expect(screen.getByText('あとで同じテーマを別の問題で確認します。')).toBeTruthy();
    // 詳しく理解する → テーマの要点
    fireEvent.click(screen.getByRole('button', { name: '詳しく理解する' }));
    expect(screen.getAllByText(/テーマ：/).length).toBeGreaterThan(0);

    // 途中で終える → 終了画面に重点復習
    fireEvent.click(screen.getByRole('button', { name: '学習を終える' }));
    await screen.findByText('重点復習');

    // 間違いノートに自動で入っている
    const wrong = (await db.qstates.toArray()).filter((x) => x.incorrectCount > 0);
    expect(wrong.length).toBe(8); // 診断7問 + 今日1問
    fireEvent.click(screen.getByRole('button', { name: 'ホームへ' }));
    fireEvent.click(await screen.findByRole('link', { name: /復習/ }));
    await screen.findByText('テーマ別の間違い');
    fireEvent.click(screen.getByRole('button', { name: /間違えた問題を解き直す|今日の間違いを復習する/ }));
    await screen.findByText(/これまでに\d回まちがえた問題/);
  }, 30_000);
});
