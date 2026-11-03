/** 募集1件ぶんの入力。GAS（運営アプリ）から repository_dispatch の client_payload として渡される */
export interface RecruitRequest {
  /** 'post' = 募集を出す / 'close' = 募集を締める */
  action: 'post' | 'close';
  /** 運営アプリの practice_id（例: p002）。結果の書き戻しに使う */
  practice_id: string;
  /** YYYY-MM-DD */
  date: string;
  /** HH:MM */
  start: string;
  /** HH:MM */
  end: string;
  /** 参加費（円） */
  fee: number;
  /** 場所。施設名はそのまま載せない方針なので、募集用に変換済みの表現を受け取る */
  place: RecruitPlace;
  /** 対象サイト。省略時は全部 */
  sites?: SiteId[];
  /** close 時に使う既存の投稿URL */
  urls?: Partial<Record<SiteId, string>>;
}

export type SiteId = 'jimoty' | 'sportsyaroyo' | 'circlebook';

export interface RecruitPlace {
  /** 本文・スポやろ等に載せる公開表記（例: 四ツ谷駅周辺） */
  label: string;
  /** ジモティーの「地域」選択に使う。選択肢の表示名で指定する（ID はスクリプト側で解決） */
  jimoty: {
    /** 市区郡（例: 新宿区） */
    city: string;
    /** 区町村（例: 四谷）。任意 */
    town?: string;
    /** 路線（例: JR中央線(快速)）。選択肢の表示名と完全一致させる */
    line: string;
    /** 駅（例: 四ツ谷） */
    station: string;
    /** 活動場所（例: 東京都新宿区四谷） */
    activityPlace: string;
  };
}

export interface SiteResult {
  site: SiteId;
  ok: boolean;
  /** 投稿URL（post 成功時） */
  url?: string;
  error?: string;
  /** 失敗時のスクリーンショットのパス（Actions の artifact 用） */
  screenshot?: string;
}
