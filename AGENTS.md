# LF2 YouTube: 引き継ぎと作業条件

## 本人の希望

- Panasonic TH-43LF2Y向け。過去のブラウザ実測はChromium 83。今回、実機の再測定はしていません。
- GitHub Pages + 外部Piped API/配信中継を使います。PC・NASの常時起動、有料ホスティング、新しい機器の購入へ変更しません。
- `Nuju/lf2-twitch` とそのPages設定は変更しません。
- 作業先は `Nuju/lf2-youtube`。既存ファイルと最新のコミットを読んでから差分を反映し、他の作業を上書きしません。
- まずURLから1本をテレビで視聴できることを確認します。検索・お気に入り・ログインはその後です。

## ビルドとテスト

固定したShaka Playerをnpmから取得します。ライフサイクルスクリプトは実行しません。視聴時に外部CDNからJavaScriptを取得せず、ライセンスと実体をdistへ同梱します。合成動画はffmpegで生成します。公開するのはdistだけです。

```sh
# package-lock.jsonがある場合
npm ci --ignore-scripts --no-audit --no-fund
# ロックファイル未導入の初回だけ: npm install --ignore-scripts --no-audit --no-fund
npm test
npm run build
node scripts/verify-build.mjs
```

ブラウザテストは `tests/browser_smoke.py`、メモリ内の限定テストは `tests/browser_in_memory.py` です。PlaywrightのChromiumを利用します。既存のブラウザを使う場合はCHROMIUM_PATHを明示します。distがあればdistを対象にします。メモリ内テストのCSP除去や模擬APIはテストの中だけで、配布ファイルへ混入させません。

GitHub Actionsがビルド・同梱物確認・模擬ブラウザテスト・Pages公開を実施します。Pagesの初回有効化にはSettings → Pages → SourceでGitHub Actionsの指定が必要です。認証情報を探索したり、管理制限や承認を迂回したりしません。

## 判定と安全性

- 正確な現状は `docs/VALIDATION.md` とActionsの実行結果で確認します。画面公開、ライブラリ取得、合成MP4の再生、本物のYouTube視聴、テレビの音声確認を混同しません。
- 実Piped・実動画・Chromium 83・テレビは、実測するまで未確認です。Shakaの設定確認も、DASH/HLS再生の証明ではありません。
- API応答は信頼せず、表示にはtextContentを使います。ログイン情報やCookieの持ち込み、保護動画へのアクセス、制限回避、接続先の自動巡回は行いません。
- API・配信URLはHTTPS。認証情報入りURLとIP直書きを拒否します。ただし、この検証だけでDNS再バインディングを防げるとは説明しません。
- 映像のみのURLを音声入りとみなさず、DASHの必須情報は推測で補いません。
- 通常の視聴で得た動画ID・タイトル・署名付き配信URL・本人の診断内容を公開リポジトリやCIログへ残しません。診断は自動送信しません。
- 本人が明示的に事前登録を依頼したテスト動画に限り、公開ページの初期入力値と、その値を確認するテストへの掲載を認めます。この例外は閲覧履歴や診断の公開を認めるものではありません。自動取得・自動再生は追加せず、CIでは実動画を取得しません。
- テレビで映像・音声・数分の継続再生・シークを確認してから機能を広げます。
