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

export function buildBody(r: RecruitRequest): string {
  return `6人制男女混合バレーボールチームの"Angriff（アングリフ）"です！

以下の日程で練習があるのですが、人数を増やしたいので助っ人を募集中です🙋‍♂️
参加希望の方は「募集条件」を必ず確認した上で「メッセージ内容」を添えてメッセージください！
※ チーム加入のメンバー募集ではなくあくまで単発の練習参加となりますので、他のチームに所属している方でもお気軽にご連絡ください

【日程】
・${fmtDate(r.date)}: ${r.start}-${r.end}
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
・バレー歴（例：高校部活動3年）`;
}
