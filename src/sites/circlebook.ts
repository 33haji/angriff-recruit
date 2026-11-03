/**
 * サークルブック（https://circle-book.com）
 *   post : 主催者管理画面でイベント（スケジュール）を新規作成
 *   close: そのイベントの「募集状況」を「募集終了」にして保存
 *
 * 画面構造（2026-11 調査）:
 *   作成: GET /users/<circle>/schedules/new → form POST /users/<circle>/schedules
 *     #schedule_title, #schedule_day(date), #schedule_time_s/#schedule_time_e(time), #schedule_venue（活動エリア）,
 *     #schedule_recruitment_numbers(select), #schedule_cost(text), 説明は Trix（#schedule_note ↔ hidden #event-description）,
 *     input[type=submit][value="イベントを作成する"]
 *   編集: GET /users/<circle>/schedules/<id>/edit → form PATCH、#schedule_recruitment（募集中/募集終了/中止）, submit「変更を保存する」
 *   公開URL: /users/<circle>/schedules/<id>
 *
 * 本文は他サイトと少し違う（サークルページ内なのでチーム紹介なし、場所は問い合わせ時に案内、返信メールの注意書きあり）
 */
import type { Page } from 'playwright';
import { env, openBrowser, snap } from '../browser.js';
import { buildBody, toHtml } from '../template.js';
import type { RecruitRequest, SiteResult } from '../types.js';

const BASE = 'https://circle-book.com';
const CIRCLE_ID = process.env.CIRCLEBOOK_CIRCLE_ID || '5426';
const TITLE = 'バレー経験者 + 楽しくバレーがやりたい人（ブランクある人もOK）募集中！';
const REPLY_NOTE = '※ 返信はサークルブックに登録済みのメールアドレスに対して、"angriff.20220701@gmail.com"のメールアドレスからメール送信しますので見逃さないようお気をつけください';

async function login(page: Page) {
  await page.goto(`${BASE}/users/${CIRCLE_ID}/mypage`, { waitUntil: 'domcontentloaded' });
  if (page.url().includes('/mypage')) return; // すでにログイン済み
  const email = page.locator('input[type="email"], input[name*="email" i]').first();
  const password = page.locator('input[type="password"]').first();
  await email.waitFor({ timeout: 20_000 }).catch(async () => {
    const forms = await page.locator('form').evaluateAll(fs => fs.map(f => (f as HTMLFormElement).action + ' :: ' + [...f.querySelectorAll('input')].map(i => `${i.type}/${i.name}`).join(',')));
    throw new Error(`ログインフォームが見つかりません url=${page.url()} forms=${JSON.stringify(forms).slice(0, 500)}`);
  });
  await email.fill(env('CIRCLEBOOK_EMAIL'));
  await password.fill(env('CIRCLEBOOK_PASSWORD'));
  const form = password.locator('xpath=ancestor::form[1]');
  await Promise.all([
    page.waitForURL(u => !/sign_in|login/.test(u.pathname), { timeout: 30_000 }).catch(() => {}),
    form.locator('input[type=submit], button[type=submit]').first().click(),
  ]);
  await page.goto(`${BASE}/users/${CIRCLE_ID}/mypage`, { waitUntil: 'domcontentloaded' });
  if (!page.url().includes('/mypage')) throw new Error('サークルブックにログインできませんでした（メール／パスワードを確認）');
}

/** Trix エディタに HTML を流し込む（hidden input も同期される） */
async function setNote(page: Page, html: string) {
  await page.waitForSelector('trix-editor#schedule_note');
  await page.evaluate(h => {
    const ed = document.querySelector('trix-editor#schedule_note') as any;
    ed.editor.loadHTML(h);
  }, html);
  const synced = await page.inputValue('#event-description');
  if (!synced.includes('【日程】')) throw new Error('説明文（Trix）の入力が反映されませんでした');
}

export async function post(req: RecruitRequest, { dryRun }: { dryRun: boolean }): Promise<SiteResult> {
  const s = await openBrowser();
  const { page } = s;
  try {
    await login(page);
    await page.goto(`${BASE}/users/${CIRCLE_ID}/schedules/new`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#schedule_title');

    await page.fill('#schedule_title', TITLE);
    await page.fill('#schedule_day', req.date);
    await page.fill('#schedule_time_s', req.start);
    await page.fill('#schedule_time_e', req.end);
    await page.fill('#schedule_venue', req.place.label);
    await page.selectOption('#schedule_recruitment_numbers', '0'); // 人数制限なし
    await page.fill('#schedule_cost', `${req.fee}円`);
    await setNote(page, toHtml(buildBody(req, { intro: false, placeOnRequest: true, replyNote: REPLY_NOTE })));

    if (dryRun) {
      const shot = await snap(page, 'circlebook-dryrun');
      return { site: 'circlebook', ok: true, screenshot: shot, error: 'dry-run: 送信前で停止' };
    }

    await Promise.all([
      page.waitForURL(/\/schedules\/\d+/, { timeout: 60_000 }),
      page.click('input[type=submit][value="イベントを作成する"]'),
    ]);
    const m = page.url().match(/\/schedules\/(\d+)/);
    if (!m) throw new Error(`作成後のURLが想定外です: ${page.url()}`);
    return { site: 'circlebook', ok: true, url: `${BASE}/users/${CIRCLE_ID}/schedules/${m[1]}` };
  } catch (e) {
    const shot = await snap(page, 'circlebook-error');
    return { site: 'circlebook', ok: false, error: String((e as Error).message || e), screenshot: shot };
  } finally {
    await s.close();
  }
}

export async function close(req: RecruitRequest): Promise<SiteResult> {
  const url = req.urls?.circlebook;
  const m = url && url.match(/\/schedules\/(\d+)/);
  if (!m) return { site: 'circlebook', ok: false, error: '募集終了にするイベントURLがありません' };
  const s = await openBrowser();
  const { page } = s;
  try {
    await login(page);
    await page.goto(`${BASE}/users/${CIRCLE_ID}/schedules/${m[1]}/edit`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#schedule_recruitment');
    await page.selectOption('#schedule_recruitment', '募集終了');
    await Promise.all([
      page.waitForLoadState('domcontentloaded'),
      page.click('input[type=submit][value="変更を保存する"]'),
    ]);
    await page.goto(`${BASE}/users/${CIRCLE_ID}/schedules/${m[1]}/edit`, { waitUntil: 'domcontentloaded' });
    const v = await page.inputValue('#schedule_recruitment');
    if (v !== '募集終了') throw new Error(`募集状況が更新されていません: ${v}`);
    return { site: 'circlebook', ok: true, url: url! };
  } catch (e) {
    const shot = await snap(page, 'circlebook-close-error');
    return { site: 'circlebook', ok: false, error: String((e as Error).message || e), screenshot: shot };
  } finally {
    await s.close();
  }
}
