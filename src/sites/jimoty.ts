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
  await page.goto(`${BASE}/users/sign_in`, { waitUntil: 'domcontentloaded' });
  // フォームの name/id に依存せず、「メールアドレスでログイン」側の email / password 入力欄を探す
  const email = page.locator('input[type="email"], input[name*="email" i], input[placeholder*="@"]').first();
  const password = page.locator('input[type="password"]').first();
  await email.waitFor({ timeout: 20_000 }).catch(async () => {
    const forms = await page.locator('form').evaluateAll(fs => fs.map(f => (f as HTMLFormElement).action + ' :: ' + [...f.querySelectorAll('input')].map(i => `${i.type}/${i.name}`).join(',')));
    throw new Error(`ログインフォームが見つかりません url=${page.url()} forms=${JSON.stringify(forms).slice(0, 500)}`);
  });
  await email.fill(env('JMTY_EMAIL'));
  await password.fill(env('JMTY_PASSWORD'));
  // password 欄と同じ form の送信ボタンを押す（d アカウント／Google 等の別ボタンを避ける）
  const form = password.locator('xpath=ancestor::form[1]');
  await Promise.all([
    page.waitForURL(u => !u.pathname.includes('/users/sign_in'), { timeout: 30_000 }).catch(() => {}),
    form.locator('input[type=submit], button[type=submit], button:has-text("ログイン")').first().click(),
  ]);
  await page.waitForLoadState('domcontentloaded');
  if (page.url().includes('/users/sign_in')) {
    const msg = await page.locator('.alert, .error, [class*="flash"]').first().textContent().catch(() => '');
    throw new Error(`ジモティーにログインできませんでした（メール／パスワードを確認）${msg ? ': ' + msg.trim() : ''}`);
  }
}

type JimotyArea = RecruitRequest['place']['jimoty'];

async function readArea(page: Page) {
  return page.evaluate(() => {
    const t = (id: string) => (document.getElementById(id) as HTMLSelectElement | null)?.selectedOptions[0]?.text.trim() || '';
    return {
      city: t('article_city_id'), town: t('article_town_id'), line: t('article_line_id1'), station: t('article_station_master_id1'),
      address: (document.getElementById('article_address') as HTMLInputElement).value,
    };
  });
}

async function ensureArea(page: Page, j: JimotyArea) {
  for (let attempt = 1; attempt <= 3; attempt++) {
    await page.waitForTimeout(1500); // 非同期の書き換えが終わるのを待つ
    const a = await readArea(page);
    console.log(`[jimoty] area(${attempt}) ${JSON.stringify(a)}`);
    const ok = a.city === j.city && a.line === j.line && a.station === j.station && (!j.town || a.town === j.town) && a.address === j.activityPlace;
    if (ok) return;
    if (a.city !== j.city) await selectByLabel(page, '#article_city_id', j.city);
    if (j.town && a.town !== j.town) await selectByLabel(page, '#article_town_id', j.town);
    if (a.line !== j.line) await selectByLabel(page, '#article_line_id1', j.line);
    if (a.station !== j.station) await selectByLabel(page, '#article_station_master_id1', j.station);
    await page.waitForTimeout(800);
    await page.fill('#article_address', j.activityPlace);
  }
  const a = await readArea(page);
  throw new Error(`地域・活動場所を指定どおりにできませんでした: ${JSON.stringify(a)}`);
}

/** 案内ポップアップ・半透明の幕が出ていれば閉じる */
async function dismissOverlays(page: Page) {
  const modal = page.locator('.inquiry-condition-explain-modal:visible');
  if (await modal.count()) {
    await modal.locator('.js-modal-close').first().click().catch(() => {});
  }
  // それでも幕が残っていれば非表示にする
  await page.evaluate(() => {
    document.querySelectorAll('#alpha_screen, .inquiry-condition-explain-modal').forEach(el => {
      (el as HTMLElement).style.display = 'none';
    });
  });
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
    // 初回だけ出る「募集条件を設定すると〜」の案内（#alpha_screen が送信ボタンを覆う）を出さないための cookie
    await s.context.addCookies([{ name: 'show_community_announce', value: 'show_community_announce', domain: 'jmty.jp', path: '/' }]);
    await page.goto(NEW_ARTICLE_URL);
    await page.waitForSelector('#article_title');
    await dismissOverlays(page);

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

    // 地域・活動場所は、駅の選択などをきっかけにページ側の処理で後から上書きされることがあるので、送信直前に確認して入れ直す
    await ensureArea(page, j);

    await dismissOverlays(page);
    // 送信ボタンが実際に押せる状態か（何かに覆われていないか）を、押さずに確認する
    await page.locator('#article_submit_button').click({ trial: true, timeout: 10_000 })
      .catch(() => { throw new Error('投稿ボタンが押せない状態です（ポップアップ等に覆われている）'); });

    if (dryRun) {
      const shot = await snap(page, 'jimoty-dryrun');
      return { site: 'jimoty', ok: true, screenshot: shot, error: 'dry-run: 送信前で停止' };
    }

    // 投稿後は「完了ページ」(/articles/complete?...&id=xxxx) か記事ページ (/article-xxxx) に遷移する
    await Promise.all([
      page.waitForURL(u => /\/articles\/complete/.test(u.pathname) || /\/article-[a-z0-9]+/.test(u.pathname), { timeout: 60_000 }),
      page.click('#article_submit_button'),
    ]);
    const url = articleUrlFrom(page.url());
    if (!url) throw new Error(`投稿後のURLから記事を特定できません: ${page.url()}`);
    return { site: 'jimoty', ok: true, url };
  } catch (e) {
    const shot = await snap(page, 'jimoty-error');
    return { site: 'jimoty', ok: false, error: String((e as Error).message || e), screenshot: shot };
  } finally {
    await s.close();
  }
}

/**
 * 投稿後のURL → 公開記事のURL
 *   https://jmty.jp/articles/complete?category_group_name=com&category_name=spo&id=1sz9sh&prefecture_name=tokyo
 *     → https://jmty.jp/tokyo/com-spo/article-1sz9sh
 *   https://jmty.jp/tokyo/com-spo/article-1sz9sh?x=y → クエリを除いたもの
 */
export function articleUrlFrom(current: string): string | null {
  const u = new URL(current);
  if (/\/article-[a-z0-9]+/.test(u.pathname)) return `${u.origin}${u.pathname}`;
  const q = u.searchParams;
  const id = q.get('id');
  if (!id) return null;
  return `${BASE}/${q.get('prefecture_name') || 'tokyo'}/${q.get('category_group_name') || 'com'}-${q.get('category_name') || 'spo'}/article-${id}`;
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
    await page.waitForSelector('table, tr.list, .no-posts, body', { timeout: 20_000 });
    const row = page.locator(`#tr_refe_${key}`);
    if (!(await row.count())) {
      // 受付中の一覧に無い → すでに受付終了済みなら成功扱い
      await page.goto(`${BASE}/my/closed_posts`);
      await page.waitForSelector('table, tr.list, .no-posts, body', { timeout: 20_000 });
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
