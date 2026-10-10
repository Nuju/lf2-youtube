# 検証記録

対象: LF2 YouTube v0.1.0。2026-10-10（日本時間）。

## ローカルで確認済み

- JavaScriptの構文確認。
- Nodeの処理テスト45件が成功。URL検証、形式選択、DASH XML生成、エラー分類、診断の情報除外など。
- Chromiumのメモリ内テスト11件が成功。模擬API、合成MP4のBlob再生、画面操作、中止、エラー表示、390px幅のレイアウト。
- ffmpegによる10秒の合成テスト動画生成。ffprobeでH.264 Constrained Baseline、640×360、24fps、AAC音声を確認。

メモリ内テストはHTTP、CORS、実Piped、Shaka、テレビ実機を検証していません。音声確認ボタンは自動テストが押しただけで、人が実際に音を聞いたという意味ではありません。

## GitHub上で確認する項目

`.github/workflows/pages.yml` は以下を実行します。登録しただけでは成功扱いにしません。最新のActions結果を確認してください。

- 固定したShaka Player 4.16.52の取得とdistの完全ビルド。
- ライブラリ実体、Apacheライセンス、SHA-256、合成MP4の同梱物検査。
- 実HTTPの画面と模擬APIによるブラウザテスト。
- 同梱Shakaの読込・attach・設定受理・destroy。これはDASH/HLS再生テストではありません。
- Pagesへの配置。公開URLからの実表示は別に確認します。

ローカル作成環境ではnpmレジストリの名前解決が完了しませんでした。ネットワークやブラウザの管理設定は変更していません。

## 未確認・成功と主張しないこと

- 公開Piped APIの現在の稼働と、本物のYouTube動画の取得。
- GitHub Pagesから実API・実配信データへのCORS。
- 本物のMP4/HLS/DASHストリーム再生。
- Panasonic TH-43LF2Yの映像・音声・リモコン・全画面。
- Chromium 83そのものの動作。
- 数分以上の継続視聴、長時間のメモリ使用、動画切り替え。
- 広告なしYouTube視聴の成立。

## 次の判定

`docs/TV_CHECKLIST.md` に従い、基本再生と実際のYouTube視聴を分けて確認します。動画IDや署名付きURLを公開ログへ残さず、接続先origin・方式・エラー番号・実機の結果を記録します。
