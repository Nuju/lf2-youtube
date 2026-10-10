# 再生ライブラリ

ソース管理にはライブラリ本体を含めません。ビルド時にpackage.jsonで固定したShaka Player 4.16.52をnpmから取得し、`dist/vendor/shaka-player.compiled.js` と `SHAKA-LICENSE.txt` を生成します。

`dist/vendor/VERSION.json` に実際のバージョンとSHA-256を保存します。視聴時に外部CDNからJavaScriptを取得しません。Pagesはdistを公開します。
