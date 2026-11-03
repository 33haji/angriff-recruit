/**
 * ジモティー（https://jmty.jp）
 *   post : メンバー募集 > スポーツ > バレーボール に新規投稿（画像3枚つき）
 *   close: 既存投稿を「受付終了」にする（マイページの「受付終了」ボタン）
 *
 * フォーム構造（2026-11 調査）:
 *   POST /articles
 *   #article_category_id (スポーツ=67) → #article_large_genre_id (バレーボール=199)   ※ change で動的に読み込む
 *   #article_prefecture_id (東京都=13) → #article_city_id → #article_town_id
 *   #article_line_id1 (路線) → #article_station_master_id1 (駅)
 *   #article_title, #article_text, #article_address
 *   画像: #upload_tag (file, multiple) の change → /async_images に非同期アップロード → hidden async_file[<id>] が追加される
 *   #article_restrict_same_sex_false, #article_restrict_age_min/max
 *   #article_submit_button (value="投稿")  確認画面なしで article-xxxx に遷移
 */
import path from 'node:path';
import type { Page } from 'playwright';
import { env, openBrowser, snap } from '../browser.js';
import { buildBody, buildTitle } from '../template.js';
import type { RecruitRequest, SiteResult } from '../types.js';

const BASE = 'https://jmty.jp';
const NEW_ARTICLE_URL = `${BASE}/articles/new?category_group_id=6&prefecture_id=13`; // メンバー募集 / 東京都
const IMAGES = ['1.jpg', '2.jpg', '3.jpg'].map(f => path.resolve('images', f));
const CATEGORY_SPORTS = '67';
const GENRE_VOLLEYBALL = '199';

async function login(page: Page) {
  await page.goto(`${BASE}/users/sign_in`);
  await page.locator('#user_email, input[name="user[email]"]').first().fill(env('JMTY_EMAIL'));
  await page.locator('#user_password, input[name="user[password]"]').first().fill(env('JMTY_PASSWORD'));
  await page.locator('input[type=submit][value="ログイン"], button:has-text("ログイン")').first().click();
  await page.waitForLoadState('networkidle');
  if (page.url().includes('/users/sign_in')) throw new Error('ジモティーにログインできませんでした（メール／パスワードを確認）');
}

/** <select> を表示名で選ぶ。選択肢が動的に増えるので、候補が出るまで待つ */
async function selectByLabel(page: Page, selector: string, label: string) {
  const sel = page.locator(selector);
  await page.waitForFunction(
    ([s, l]) => [...(document.querySelector(s) as HTMLSelectElement | null)?.options ?? []].some(o => o.text.trim() === l),
    [selector, label] as const,
    { timeout: 15_000 },
  ).catch(() => { throw new Error(`${selector} に「${label}」という選択肢がありません`); });
  await sel.selectOption({ label });
}

export async function post(req: RecruitRequest, { dryRun }: { dryRun: boolean }): Promise<SiteResult> {
  const s = await openBrowser();
  const { page } = s;
  try {
    await login(page);
    await page.goto(NEW_ARTICLE_URL);
    await page.waitForSelector('#article_title');

    // カテゴリ → ジャンル（ジャンルはカテゴリ選択後に動的に入る）
    await page.selectOption('#article_category_id', CATEGORY_SPORTS);
    await page.waitForFunction(() => [...(document.querySelector('#article_large_genre_id') as HTMLSelectElement).options].some(o => o.value === '199'));
    await page.selectOption('#article_large_genre_id', GENRE_VOLLEYBALL);

    // 地域: 東京都 → 市区郡 → 区町村 / 路線 → 駅
    const j = req.place.jimoty;
    if ((await page.inputValue('#article_prefecture_id')) !== '13') await page.selectOption('#article_prefecture_id', '13');
    await selectByLabel(page, '#article_city_id', j.city);
    if (j.town) await selectByLabel(page, '#article_town_id', j.town).catch(e => console.warn(`[jimoty] 区町村をスキップ: ${e.message}`));
    await selectByLabel(page, '#article_line_id1', j.line);
    await selectByLabel(page, '#article_station_master_id1', j.station);

    // タイトル・本文・活動場所
    await page.fill('#article_title', buildTitle(req));
    await page.fill('#article_text', buildBody(req));
    await page.fill('#article_address', j.activityPlace);

    // 画像3枚（非同期アップロード → hidden async_file[...] が3つ揃うまで待つ）
    await page.setInputFiles('#upload_tag', IMAGES);
    await page.waitForFunction(
      n => document.querySelectorAll('input[type=hidden][name^="async_file["]').length >= n,
      IMAGES.length,
      { timeout: 60_000 },
    ).catch(() => { throw new Error('画像のアップロードが完了しませんでした'); });

    // 募集条件: 性別は設定しない、年齢 20〜35
    await page.check('#article_restrict_same_sex_false');
    await page.selectOption('#article_restrict_age_min', '20');
    await page.selectOption('#article_restrict_age_max', '35');

    if (dryRun) {
      const shot = await snap(page, 'jimoty-dryrun');
      return { site: 'jimoty', ok: true, screenshot: shot, error: 'dry-run: 送信前で停止' };
    }

    await Promise.all([
      page.waitForURL(/\/article-[a-z0-9]+/, { timeout: 60_000 }),
      page.click('#article_submit_button'),
    ]);
    const url = page.url().split('?')[0];
    return { site: 'jimoty', ok: true, url };
  } catch (e) {
    const shot = await snap(page, 'jimoty-error');
    return { site: 'jimoty', ok: false, error: String((e as Error).message || e), screenshot: shot };
  } finally {
    await s.close();
  }
}

/** URL から投稿キー（article-1sjw20 → 1sjw20）を取り出す */
function articleKey(url: string): string {
  const m = url.match(/article[-_]([a-z0-9]+)/i);
  if (!m) throw new Error(`ジモティーの投稿URLとして解釈できません: ${url}`);
  return m[1];
}

export async function close(req: RecruitRequest): Promise<SiteResult> {
  const url = req.urls?.jimoty;
  if (!url) return { site: 'jimoty', ok: false, error: '受付終了にする投稿URLがありません' };
  const s = await openBrowser();
  const { page } = s;
  try {
    const key = articleKey(url);
    await login(page);
    await page.goto(`${BASE}/my/posts`);
    await page.waitForLoadState('networkidle');
    const row = page.locator(`#tr_refe_${key}`);
    if (!(await row.count())) {
      // 受付中の一覧に無い → すでに受付終了済みなら成功扱い
      await page.goto(`${BASE}/my/closed_posts`);
      await page.waitForLoadState('networkidle');
      if (await page.locator(`#tr_refe_${key}`).count()) return { site: 'jimoty', ok: true, url, error: 'すでに受付終了でした' };
      throw new Error(`マイページに投稿 ${key} が見つかりません`);
    }
    page.once('dialog', d => d.accept()); // 確認ダイアログが出れば OK
    await row.locator('button.article_close, button:has-text("受付終了")').first().click();
    // 行が受付中一覧から消える（or ボタンが「受付中に戻す」に変わる）まで待つ
    await page.waitForFunction(
      k => { const tr = document.querySelector(`#tr_refe_${k}`); return !tr || /受付中に戻す/.test(tr.textContent || ''); },
      key,
      { timeout: 20_000 },
    );
    return { site: 'jimoty', ok: true, url };
  } catch (e) {
    const shot = await snap(page, 'jimoty-close-error');
    return { site: 'jimoty', ok: false, error: String((e as Error).message || e), screenshot: shot };
  } finally {
    await s.close();
  }
}
