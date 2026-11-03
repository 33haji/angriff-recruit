/**
 * スポーツやろうよ！（https://www.net-menber.com）
 *   日程ごとの投稿ではなく、チーム1件（team_id=158562）を編集する。
 *   post : 編集画面で 活動場所・活動時間・本文 を更新して保存 → 「募集を再開する」
 *   close: 「募集を停止する」
 *
 * 画面構造（2026-11 調査）:
 *   編集: GET /myp/team/edit?team_id=<id> → form POST /myp/team/edit
 *         input[name=katudo_basho]（活動場所）, input[name=katudo_time]（活動時間）, textarea[name=message]（本文）, input[type=submit][name=add]
 *   募集状態: GET /myp/team/open?team_id=<id>&open_flg=1（再開） / 0（停止）
 *   管理一覧: /myp/team/list に「募集を再開する」or「募集を停止する」リンク
 */
import type { Page } from 'playwright';
import { env, openBrowser, snap } from '../browser.js';
import { buildBody, fmtWhen } from '../template.js';
import type { RecruitRequest, SiteResult } from '../types.js';

const BASE = 'https://www.net-menber.com';
const TEAM_ID = process.env.SPOYARO_TEAM_ID || '158562';
export const PUBLIC_URL = `${BASE}/look/data/${TEAM_ID}.html`;

async function login(page: Page) {
  await page.goto(`${BASE}/myp/card_use/login`, { waitUntil: 'domcontentloaded' });
  if (page.url().includes('/myp/top')) return; // すでにログイン済み
  const email = page.locator('input[type="email"], input[name*="mail" i]').first();
  const password = page.locator('input[type="password"]').first();
  await email.waitFor({ timeout: 20_000 }).catch(async () => {
    const forms = await page.locator('form').evaluateAll(fs => fs.map(f => (f as HTMLFormElement).action + ' :: ' + [...f.querySelectorAll('input')].map(i => `${i.type}/${i.name}`).join(',')));
    throw new Error(`ログインフォームが見つかりません url=${page.url()} forms=${JSON.stringify(forms).slice(0, 500)}`);
  });
  await email.fill(env('SPOYARO_EMAIL'));
  await password.fill(env('SPOYARO_PASSWORD'));
  const form = password.locator('xpath=ancestor::form[1]');
  await Promise.all([
    page.waitForURL(u => !u.pathname.includes('/card_use/login'), { timeout: 30_000 }).catch(() => {}),
    form.locator('input[type=submit], button[type=submit], button:has-text("ログイン")').first().click(),
  ]);
  await page.waitForLoadState('domcontentloaded');
  if (page.url().includes('/card_use/login')) throw new Error('スポーツやろうよにログインできませんでした（メール／パスワードを確認）');
}

/** 募集の再開(1)/停止(0)。管理一覧のリンクを踏む形で実行し、トグル表示で確認する */
async function setOpen(page: Page, open: boolean) {
  await page.goto(`${BASE}/myp/team/open?team_id=${TEAM_ID}&open_flg=${open ? 1 : 0}`, { waitUntil: 'domcontentloaded' });
  await page.goto(`${BASE}/myp/team/list`, { waitUntil: 'domcontentloaded' });
  const text = await page.locator('body').innerText();
  // 一覧には「募集中」or「募集停止中」のトグルと、「募集を停止する」or「募集を再開する」のリンクが出る
  const isOpen = /募集停止中|募集を再開する/.test(text) ? false : /募集中|募集を停止する/.test(text);
  if (isOpen !== open) throw new Error(`募集状態を${open ? '再開' : '停止'}にできませんでした（画面: ${text.replace(/\s+/g, ' ').slice(0, 200)}）`);
}

export async function post(req: RecruitRequest, { dryRun }: { dryRun: boolean }): Promise<SiteResult> {
  const s = await openBrowser();
  const { page } = s;
  try {
    await login(page);
    await page.goto(`${BASE}/myp/team/edit?team_id=${TEAM_ID}`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('input[name="katudo_time"]');

    await page.fill('input[name="katudo_basho"]', req.place.label);
    await page.fill('input[name="katudo_time"]', fmtWhen(req));
    await page.fill('textarea[name="message"]', buildBody(req));

    if (dryRun) {
      const shot = await snap(page, 'sportsyaroyo-dryrun');
      return { site: 'sportsyaroyo', ok: true, url: PUBLIC_URL, screenshot: shot, error: 'dry-run: 送信前で停止' };
    }

    await Promise.all([
      page.waitForLoadState('domcontentloaded'),
      page.click('input[type=submit][name="add"]'),
    ]);
    // 保存後に編集画面を開き直して反映を確認
    await page.goto(`${BASE}/myp/team/edit?team_id=${TEAM_ID}`, { waitUntil: 'domcontentloaded' });
    const saved = await page.inputValue('input[name="katudo_time"]');
    if (saved !== fmtWhen(req)) throw new Error(`保存後の活動時間が一致しません: "${saved}"`);

    await setOpen(page, true);
    return { site: 'sportsyaroyo', ok: true, url: PUBLIC_URL };
  } catch (e) {
    const shot = await snap(page, 'sportsyaroyo-error');
    return { site: 'sportsyaroyo', ok: false, error: String((e as Error).message || e), screenshot: shot };
  } finally {
    await s.close();
  }
}

export async function close(_req: RecruitRequest): Promise<SiteResult> {
  const s = await openBrowser();
  const { page } = s;
  try {
    await login(page);
    await setOpen(page, false);
    return { site: 'sportsyaroyo', ok: true, url: PUBLIC_URL };
  } catch (e) {
    const shot = await snap(page, 'sportsyaroyo-close-error');
    return { site: 'sportsyaroyo', ok: false, error: String((e as Error).message || e), screenshot: shot };
  } finally {
    await s.close();
  }
}
