# angriff-recruit

Angriff（社会人バレーサークル）の助っ人募集を、各掲示板に自動投稿する Playwright スクリプト。
運営アプリ（[angriff-app](https://github.com/33haji/angriff-app) / [angriff-gas](https://github.com/33haji/angriff-gas)）の「助っ人を募集する」ボタンから GitHub Actions 経由で起動される。

```
LIFF「助っ人を募集する」 → GAS → repository_dispatch → GitHub Actions(Playwright) → 各サイトに投稿
                                                        └→ 結果を GAS に POST → practices シート更新 + LINE 通知
```

## 対応サイト

| サイト | 投稿の形 | 状態 |
|---|---|---|
| ジモティー | 日程ごとに新規投稿（画像3枚）、close で受付終了 | 実装済み |
| スポーツやろうよ | チーム1件の活動場所・活動時間・本文を更新＋募集を再開（close で停止） | 実装済み |
| サークルブック | 日程ごとにイベントを新規作成、close で募集終了 | 実装済み |

## 本文の違い

| サイト | タイトル | 本文 |
|---|---|---|
| ジモティー | `男女混合バレーの参加者募集！（11/14(土) 18:30-21:30）` | チーム紹介あり |
| スポーツやろうよ | （固定） | チーム紹介あり。活動場所＝公開表記、活動時間＝`11/14(土) 18:30-21:30` |
| サークルブック | `バレー経験者 + 楽しくバレーがやりたい人（ブランクある人もOK）募集中！`（固定） | チーム紹介なし、「場所はご連絡いただいた際にお教えします」、返信メールの注意書き |

テンプレは `src/template.ts`。

## ローカル実行

```sh
npm ci && npx playwright install chromium
cp .env.example .env   # ログイン情報を記入
npm run preview -- --date 2026-11-14 --start 18:30 --end 21:30 --fee 500      # 文面の確認
HEADFUL=1 npm run post -- --date 2026-11-14 --start 18:30 --end 21:30 --place yotsuya --site jimoty --dry-run
```

`--dry-run` は送信直前で止めて `out/` にスクショを残す。`HEADFUL=1` でブラウザを表示。

## GitHub Actions

- `repository_dispatch`（`recruit_post` / `recruit_close`）: GAS から。`client_payload` は `src/types.ts` の `RecruitRequest`
- `workflow_dispatch`: 手動。GitHub アプリ（スマホ）からも実行できる
- 実行環境は **自宅 Mac の self-hosted runner**（GitHub ホストの IP はジモティーに 403 でブロックされるため）。Mac がスリープ中はジョブがキューで待つ

### Secrets

| 名前 | 内容 |
|---|---|
| `JMTY_EMAIL` / `JMTY_PASSWORD` | ジモティーのログイン |
| `SPOYARO_EMAIL` / `SPOYARO_PASSWORD` | スポーツやろうよ |
| `CIRCLEBOOK_EMAIL` / `CIRCLEBOOK_PASSWORD` | サークルブック |
| `GAS_WEBAPP_URL` | 結果を書き戻す GAS Web アプリの URL |
| `RECRUIT_CALLBACK_SECRET` | GAS 側 config の `recruit_callback_secret` と同じ値 |

## 場所の扱い

募集には施設名を載せず「四ツ谷駅周辺」のような表現にする。本番は GAS が `recruit_places` シートから変換して渡す。手動実行用のプリセットは `src/places.ts`。
