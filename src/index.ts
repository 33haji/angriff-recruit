/**
 * エントリポイント
 *
 *   npm run post    -- --date 2026-11-14 --start 18:30 --end 21:30 --fee 500 --place yotsuya [--site jimoty] [--dry-run]
 *   npm run close   -- --site jimoty --url https://jmty.jp/tokyo/com-spo/article-xxxx
 *   npm run preview -- --date 2026-11-14 --start 18:30 --end 21:30 --fee 500   （タイトルと本文を表示するだけ）
 *
 * GitHub Actions からは環境変数 RECRUIT_PAYLOAD（JSON, RecruitRequest 型）で受け取る。
 */
import fs from 'node:fs';
import path from 'node:path';
import { PLACES } from './places.js';
import { buildBody, buildTitle } from './template.js';
import { reportToGas } from './report.js';
import { OUT_DIR } from './browser.js';
import type { RecruitRequest, SiteId, SiteResult } from './types.js';
import * as jimoty from './sites/jimoty.js';

type Site = { post(req: RecruitRequest, opts: { dryRun: boolean }): Promise<SiteResult>; close(req: RecruitRequest): Promise<SiteResult> };
const SITES: Record<SiteId, Site | null> = { jimoty, sportsyaroyo: null, circlebook: null };

function parseArgs(argv: string[]): Record<string, string | boolean> {
  const out: Record<string, string | boolean> = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) continue;
    const key = a.slice(2);
    const next = argv[i + 1];
    if (next && !next.startsWith('--')) { out[key] = next; i++; } else out[key] = true;
  }
  return out;
}

function requestFromArgs(action: 'post' | 'close', a: Record<string, string | boolean>): RecruitRequest {
  if (process.env.RECRUIT_PAYLOAD) return { ...(JSON.parse(process.env.RECRUIT_PAYLOAD) as RecruitRequest), action };
  const placeKey = String(a.place || 'yotsuya');
  const place = PLACES[placeKey];
  if (!place) throw new Error(`場所プリセット "${placeKey}" がありません（${Object.keys(PLACES).join(', ')}）`);
  const req: RecruitRequest = {
    action,
    practice_id: String(a.practice || 'manual'),
    date: String(a.date || ''),
    start: String(a.start || ''),
    end: String(a.end || ''),
    fee: Number(a.fee || 500),
    place,
    sites: a.site ? [String(a.site) as SiteId] : undefined,
    urls: a.url ? { [String(a.site || 'jimoty')]: String(a.url) } : undefined,
  };
  if (action === 'post' && (!req.date || !req.start || !req.end)) throw new Error('--date --start --end は必須です');
  return req;
}

async function main() {
  const [cmd, ...rest] = process.argv.slice(2);
  const a = parseArgs(rest);

  if (cmd === 'preview') {
    const req = requestFromArgs('post', a);
    console.log(buildTitle(req));
    console.log('----');
    console.log(buildBody(req));
    return;
  }
  if (cmd !== 'post' && cmd !== 'close') {
    console.error('usage: post | close | preview');
    process.exit(2);
  }

  const req = requestFromArgs(cmd, a);
  const dryRun = !!a['dry-run'] || !!req.dry_run;
  const targets = (req.sites && req.sites.length ? req.sites : (Object.keys(SITES) as SiteId[])).filter(s => {
    if (!SITES[s]) { console.log(`[${s}] 未対応のためスキップ`); return false; }
    return true;
  });

  const results: SiteResult[] = [];
  for (const s of targets) {
    const site = SITES[s]!;
    console.log(`\n==== ${s}: ${cmd} ====`);
    try {
      results.push(cmd === 'post' ? await site.post(req, { dryRun }) : await site.close(req));
    } catch (e) {
      results.push({ site: s, ok: false, error: String((e as Error).message || e) });
    }
    console.log(JSON.stringify(results[results.length - 1], null, 2));
  }

  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(path.join(OUT_DIR, 'results.json'), JSON.stringify({ request: req, results }, null, 2));

  await reportToGas(req, results, dryRun);
  if (results.some(r => !r.ok)) process.exit(1);
}

main().catch(e => { console.error(e); process.exit(1); });
