import { chromium, type Browser, type BrowserContext, type Page } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

export const OUT_DIR = path.resolve('out');

export interface Session {
  browser: Browser;
  context: BrowserContext;
  page: Page;
  close(): Promise<void>;
}

/** 共通のブラウザ起動。HEADFUL=1 でローカル確認用に画面を出す */
export async function openBrowser(): Promise<Session> {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const browser = await chromium.launch({
    headless: !process.env.HEADFUL,
    slowMo: process.env.HEADFUL ? 150 : 0,
    executablePath: process.env.CHROMIUM_PATH || undefined, // 既存の Chromium を使いたいときだけ
  });
  const context = await browser.newContext({
    locale: 'ja-JP',
    timezoneId: 'Asia/Tokyo',
    viewport: { width: 1280, height: 900 },
    userAgent:
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
  });
  const page = await context.newPage();
  page.setDefaultTimeout(30_000);
  return { browser, context, page, close: () => browser.close() };
}

/** 失敗時のスクリーンショット。パスを返す */
export async function snap(page: Page, name: string): Promise<string> {
  const file = path.join(OUT_DIR, `${name}-${Date.now()}.png`);
  await page.screenshot({ path: file, fullPage: true }).catch(() => {});
  return file;
}

export function env(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`環境変数 ${name} が設定されていません`);
  return v;
}
