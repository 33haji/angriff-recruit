import type { RecruitRequest } from './types.js';

const DOW = ['日', '月', '火', '水', '木', '金', '土'];

/** 練習風景の動画（本文に載せる） */
export const VIDEO_URL = 'https://youtu.be/tmoaywLjgH8?si=apPahCppcjKH4Bkq';

/** '2026-11-14' → '11/14(土)' */
export function fmtDate(ymd: string): string {
  const [y, m, d] = ymd.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  return `${m}/${d}(${DOW[dt.getDay()]})`;
}

/** '11/14(土) 18:30-21:30' */
export function fmtWhen(r: Pick<RecruitRequest, 'date' | 'start' | 'end'>): string {
  return `${fmtDate(r.date)} ${r.start}-${r.end}`;
}

export function buildTitle(r: RecruitRequest): string {
  return `男女混合バレーの参加者募集！（${fmtWhen(r)}）`;
}

/** 本文のバリエーション。サイトによって冒頭・補足が少し違う */
export interface BodyOptions {
  /** 冒頭にチーム紹介を入れる（サークルブックはサークルページ内なので不要） */
  intro?: boolean;
  /** 【日程】に「場所はご連絡いただいた際にお教えします」を入れる */
  placeOnRequest?: boolean;
  /** 末尾に返信メールの注意書きを入れる（サークルブック） */
  replyNote?: string;
}

export function buildBody(r: RecruitRequest, o: BodyOptions = { intro: true }): string {
  const head = o.intro
    ? `6人制男女混合バレーボールチームの"Angriff（アングリフ）"です！

以下の日程で練習があるのですが、人数を増やしたいので助っ人を募集中です🙋‍♂️`
    : `この日に練習があるのですが、人数が足りないので助っ人を募集中です🙋‍♂️`;
  return `${head}

参加希望の方は「募集条件」を必ず確認した上で「メッセージ内容」を添えてメッセージください！
※ チーム加入のメンバー募集ではなくあくまで単発の練習参加となりますので、他のチームに所属している方でもお気軽にご連絡ください

【日程】
・${fmtDate(r.date)}: ${r.start}-${r.end}${o.placeOnRequest ? '\n※ 場所はご連絡いただいた際にお教えします' : ''}
※ 参加費: ${r.fee}円

【募集条件】
※ 下記を全て満たす人のみ
・20歳~35歳
・バレー部活動歴2年以上（ブランク問わず） or 大学のサークルや社会人で3年以上のバレーボール経験者
・フォーメーションを理解している
（学校の体育でやるようなぐるぐる回るローテーションのことではなく、レフト・センター・ライトのポジションを固定するもの）

【その他】
・経験者メインではありますが、あくまで男女混合なので男子ネットでバリバリ打てるような方は合わないと思いますのでご遠慮ください
・以下の動画はある日の練習風景になりますので、レベル感の参考に見てみてください
　・ ${VIDEO_URL}

【メッセージ内容】
以下を添えてご連絡ください
・氏名
・年齢
・性別
・バレー歴（例：高校部活動3年）${o.replyNote ? '\n' + o.replyNote : ''}

何かわからないことや不安なことがありましたら、お気軽にご質問ください！`;
}

/** 改行区切りのテキスト → Trix 等のリッチテキスト用 HTML */
export function toHtml(text: string): string {
  const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return `<div>${text.split('\n').map(esc).join('<br>')}</div>`;
}
