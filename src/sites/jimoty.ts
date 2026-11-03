/**
 * ジモティー（https://jmty.jp）
 *   post : メンバー募集 > スポーツ > バレーボール に新規投稿（画像3枚つき）
 *   close: 既存投稿を「受付終了」にする
 *
 * ※ セレクタは実フォームを確認して確定する（TODO 箇所）
 */
import path from 'node:path';
import type { Page } from 'playwright';
import { env, openBrowser, snap } from '../browser.js';
import { buildBody, buildTitle } from '../template.js';
import type { RecruitRequest, SiteResult } from '../types.js';

const BASE = 'https://jmty.jp';
const NEW_ARTICLE_URL = `${BASE}/articles/new?category_group_id=6&prefecture_id=13`; // メンバー募集 / 東京都
const IMAGES = ['1.jpg', '2.jpg', '3.jpg'].map(f => path.resolve('images', f));

async function login(page: Page) {
  await page.goto(`${BASE}/users/sign_in`);
  await page.getByLabel(/メールアドレス/).fill(env('JMTY_EMAIL'));
  await page.getByLabel(/パスワード/).fill(env('JMTY_PASSWORD'));
  await page.getByRole('button', { name: 'ログイン' }).click();
  await page.waitForLoadState('networkidle');
  if (page.url().includes('/users/sign_in')) throw new Error('ジモティーにログインできませんでした（メール／パスワードを確認）');
}

export async function post(req: RecruitRequest, { dryRun }: { dryRun: boolean }): Promise<SiteResult> {
  const s = await openBrowser();
  const { page } = s;
  try {
    await login(page);
    await page.goto(NEW_ARTICLE_URL);
    await page.waitForLoadState('networkidle');

    // ---- TODO: 以下は実フォーム確認後に確定 ----
    // カテゴリ: スポーツ / ジャンル: バレーボール
    await page.getByLabel(/カテゴリ/).selectOption({ label: 'スポーツ' });
    await page.getByLabel(/ジャンル/).selectOption({ label: 'バレーボール' });

    // タイトル・本文
    await page.getByLabel(/タイトル/).fill(buildTitle(req));
    await page.getByLabel(/本文|説明/).fill(buildBody(req));

    // 画像3枚
    await page.locator('input[type=file]').first().setInputFiles(IMAGES);

    // 地域（市区郡町村 → 町名 → 最寄駅）・活動場所
    const j = req.place.jimoty;
    await page.getByLabel(/市区郡町村/).selectOption({ label: j.city });
    await page.getByLabel(/町名/).selectOption({ label: j.town }).catch(() => {});
    await page.getByLabel(/最寄駅|駅/).fill(j.station).catch(() => {});
    await page.getByLabel(/活動場所/).fill(j.activityPlace);

    // 募集年齢 20〜35、直接
    await page.getByLabel(/年齢.*下限|募集年齢/).first().selectOption('20').catch(() => {});
    await page.getByLabel(/年齢.*上限/).selectOption('35').catch(() => {});
    // ---- TODO ここまで ----

    if (dryRun) {
      const shot = await snap(page, 'jimoty-dryrun');
      return { site: 'jimoty', ok: true, screenshot: shot, error: 'dry-run: 送信前で停止' };
    }

    await page.getByRole('button', { name: /確認|投稿/ }).click();
    await page.waitForLoadState('networkidle');
    // 確認画面があれば最終送信
    const submit = page.getByRole('button', { name: /投稿する|送信/ });
    if (await submit.count()) { await submit.first().click(); await page.waitForLoadState('networkidle'); }

    const url = page.url();
    if (!/\/article-/.test(url)) throw new Error(`投稿後のURLが想定外です: ${url}`);
    return { site: 'jimoty', ok: true, url };
  } catch (e) {
    const shot = await snap(page, 'jimoty-error');
    return { site: 'jimoty', ok: false, error: String((e as Error).message || e), screenshot: shot };
  } finally {
    await s.close();
  }
}

export async function close(req: RecruitRequest): Promise<SiteResult> {
  const url = req.urls?.jimoty;
  if (!url) return { site: 'jimoty', ok: false, error: '受付終了にする投稿URLがありません' };
  const s = await openBrowser();
  const { page } = s;
  try {
    await login(page);
    // TODO: マイページ（/my/posts）から該当投稿の「受付終了」を押す。実画面確認後に確定
    await page.goto(`${BASE}/my/posts`);
    await page.waitForLoadState('networkidle');
    const id = url.split('/article-')[1];
    const row = page.locator(`a[href*="article-${id}"]`).first();
    await row.waitFor();
    await page.locator(`[href*="article-${id}"]`).locator('xpath=ancestor::*[self::li or self::tr or self::div][1]').getByText(/受付終了/).first().click();
    await page.waitForLoadState('networkidle');
    return { site: 'jimoty', ok: true, url };
  } catch (e) {
    const shot = await snap(page, 'jimoty-close-error');
    return { site: 'jimoty', ok: false, error: String((e as Error).message || e), screenshot: shot };
  } finally {
    await s.close();
  }
}
