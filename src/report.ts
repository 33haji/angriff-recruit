import type { RecruitRequest, SiteResult } from './types.js';

/**
 * 結果を運営アプリ（GAS Web アプリ）に書き戻す。
 * GAS 側の doPost が body.recruit_result を見て practices シートを更新し、管理者に LINE 通知する。
 * URL が未設定（ローカル実行）のときは何もしない。
 */
export async function reportToGas(req: RecruitRequest, results: SiteResult[]): Promise<void> {
  const url = process.env.GAS_WEBAPP_URL;
  const secret = process.env.RECRUIT_CALLBACK_SECRET;
  if (!url || !secret) {
    console.log('[report] GAS_WEBAPP_URL が未設定のため書き戻しをスキップ');
    return;
  }
  const body = {
    recruit_result: {
      secret,
      action: req.action,
      practice_id: req.practice_id,
      run_url: process.env.GITHUB_SERVER_URL && process.env.GITHUB_RUN_ID
        ? `${process.env.GITHUB_SERVER_URL}/${process.env.GITHUB_REPOSITORY}/actions/runs/${process.env.GITHUB_RUN_ID}`
        : undefined,
      results: results.map(({ screenshot: _s, ...r }) => r),
    },
  };
  // GAS の Web アプリは POST → 302 → GET でレスポンスが返る。redirect: 'follow' で追う
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' }, // CORS プリフライトを避けるため text/plain
    body: JSON.stringify(body),
    redirect: 'follow',
  });
  const text = await res.text();
  console.log(`[report] ${res.status} ${text.slice(0, 200)}`);
  if (!res.ok) throw new Error(`GAS への書き戻しに失敗: ${res.status}`);
}
