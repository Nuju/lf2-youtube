# GitHub Pagesへの公開

作業先は作成済みの `Nuju/lf2-youtube` です。既存Twitch版は変更しません。

## 初回の設定

1. https://github.com/Nuju/lf2-youtube/settings/pages を開きます。
2. Build and deployment → Sourceを **GitHub Actions** にします。
3. Actions → **Build and deploy LF2 YouTube** を開きます。初回がPages未設定で停止していれば、設定後に失敗したジョブを再実行します。
4. `build` と `deploy` の両方の成功、および実際のページ表示を確認します。

公開先は https://nuju.github.io/lf2-youtube/ です。URLが決まっていることと、公開が完了していることは別です。正確な状態はActionsを確認してください。

## 自動処理

mainへのpushで処理テスト、固定バージョンの再生ライブラリ取得、合成テスト動画生成、静的サイトのビルド、同梱物検査、模擬ブラウザテスト、Pages公開を実行します。Pull Requestではテストとビルドだけ行い、公開しません。

公開するのはdistです。リポジトリのルートをそのまま公開すると、ライブラリとテスト動画が不足します。SourceをDeploy from a branchにはしません。

ビルド時にNode.js 22、Python、ffmpeg、Playwrightを使います。テレビで視聴する際にPCやこれらのプログラムを起動する必要はありません。

## 開発環境での再現

```sh
npm ci --ignore-scripts --no-audit --no-fund
npm test
npm run build
node scripts/verify-build.mjs
python -m pip install playwright==1.57.0
python -m playwright install chromium
python tests/browser_smoke.py
```

初回でpackage-lock.jsonがまだない場合のみ、npm ciの代わりにnpm install --ignore-scripts --no-audit --no-fundを使います。

ブラウザテストは許可されたローカルHTTP環境で実行してください。管理制限を変更してはいけません。別のChromiumを使うときはCHROMIUM_PATHに実行ファイルを指定します。

Actionsのbuild-recordsには依存ロック・処理テスト結果・ビルド識別・ライブラリのハッシュを保存します。ブラウザテストの結果とプレビューはbrowser-test-recordsに保存します。外部Pipedや本人の動画を自動取得する処理はありません。
