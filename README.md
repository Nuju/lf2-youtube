# LF2 YouTube — 視聴テスト v0.1.0

Panasonic TH-43LF2Yのブラウザで、GitHub Pages + Pipedによる視聴が成立するかを確認する最小クライアントです。

**検証版です。画面の公開・ビルド成功と、実際のYouTube動画・テレビ本体での再生成功は別です。Piped経由の実動画とテレビ本体での映像・音声は未確認です。** 既存の `Nuju/lf2-twitch` は変更しません。

公開先: https://nuju.github.io/lf2-youtube/

公開状態はリポジトリのActionsと `docs/VALIDATION.md` を確認してください。

## 使い方

1. テレビのブラウザで公開先を開き、最初に「テレビの基本再生テスト」を押します。
2. 10秒の合成映像と確認音が出ることを確認します。これはYouTube視聴とは別の確認です。
3. 通常の公開YouTube動画のURLを入力し、Piped APIを選びます。
4. 送信確認にチェックを入れ、「動画情報を取得」→「再生 / 一時停止」を押します。
5. 失敗時は「診断レポートを表示」で、API取得・形式・再生のどこで止まったかを確認します。

一覧の接続先は稼働保証ではありません。外部サーバーが動画を取得できなければ再生できません。接続先を自動巡回する機能はありません。

## 運用と機能

- 画面と再生プログラムはGitHub Pagesに置き、動画情報・配信は選択した外部Pipedサーバーから取得します。自宅PC・NASの常時起動、有料ホスティング、新しい機器は不要です。
- URLから1本を試す版です。検索・お気に入り・ログイン・ダウンロードは実装しません。
- 音声入りMP4、ネイティブHLS、Shaka PlayerによるHLS/DASHの読み込みを実装しています。映像と音声が別の場合、必要なバイト範囲などが揃っているときだけDASHを生成します。
- 通常MP4・生成DASHはH.264・720p以下・30fps以下を選びます。生成DASHの音声はAACです。提供マニフェストは再生エンジン側にも画質上限を設定しますが、ネイティブHLSの形式選択は同じようには制御できません。
- 再生・一時停止、10秒シーク、全画面、ポインター操作、補助的な方向キーフォーカス移動を用意しています。実機のリモコンは未確認です。

## ビルドと公開

Node.js 20以上とffmpegをビルド時だけ使います。GitHub Actionsが取得・生成・公開するため、視聴時にPCは不要です。

```sh
npm ci --ignore-scripts --no-audit --no-fund
npm test
npm run build
```

`dist/` が公開用ファイルです。Shaka Player 4.16.52を固定し、実行ファイルとApacheライセンスを `dist/vendor/` へ同梱します。バージョンとSHA-256を `dist/vendor/VERSION.json` に記録します。視聴時に外部CDNからJavaScriptを取得しません。

合成テスト動画は `scripts/generate-probe.mjs` がffmpegで生成します。生成済み動画と画面プレビューはGitに入れず、ビルド用ソースを管理します。元のZIPに付属したプレビューは会話添付に残しています。

`.github/workflows/pages.yml` はmainへのpushでテスト・ビルド・Pages配置を実行します。初回のみSettings → Pages → SourceをGitHub Actionsに設定します。

## 診断とデータ

API取得成功はJSON取得の成功、形式ありは読み込み候補の存在、進行検知は映像サイズと再生時刻の進行を表します。いずれもテレビから正常な映像・音声が出ることの証明ではありません。音声確認ボタンは本人が確かめてから押してください。

起動時に外部Pipedへ通信しません。動画IDは取得操作後だけ選択した接続先へ送信します。API・配信先にはIPアドレスや動画ID等が伝わり得ます。ログイン情報、Cookieの持ち込み、制限回避、保護された動画は扱いません。

診断レポートに動画ID・タイトル・署名付き再生URLは保存しません。レポートは自動送信されません。localStorageに保存するのはAPI接続先だけです。

## 続きの作業

- `docs/VALIDATION.md`: 確認済みと未確認。
- `docs/TV_CHECKLIST.md`: テレビでの確認項目。
- `docs/DEPLOY.md`: 公開手順。
- `AGENTS.md`: 引き継ぎ時の条件。

実機で1本を視聴できたことを確認してから、検索などの機能追加を検討します。

## 一次情報

- Piped API: https://docs.piped.video/docs/api-documentation/
- Piped公開接続先一覧: https://github.com/TeamPiped/documentation/blob/main/content/docs/public-instances/index.md
- Shaka Player: https://github.com/shaka-project/shaka-player
- GitHub Pages: https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages
