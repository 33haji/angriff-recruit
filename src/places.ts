import type { RecruitPlace } from './types.js';

/**
 * ローカル／手動実行用の場所プリセット。
 * 本番では GAS が recruit_places シートから同じ形で渡してくるので、ここは使わない。
 * jimoty.* はジモティーの投稿フォームの選択肢の表示名と一致させること。
 */
export const PLACES: Record<string, RecruitPlace> = {
  yotsuya: {
    label: '四ツ谷駅周辺',
    jimoty: { city: '新宿区', town: '四谷', line: 'JR中央線(快速)', station: '四ツ谷', activityPlace: '東京都新宿区四谷' },
  },
  oji: {
    label: '王子駅周辺',
    jimoty: { city: '北区', town: '堀船', line: 'JR京浜東北線', station: '王子', activityPlace: '東京都北区堀船' },
  },
};
