# PTA Private Viewer System

## 概要

このシステムは、PTA資料をスマホで見やすく配布するための簡易ビューアです。

- PDFを管理者が登録する
- PDFをページごとの `WebP` 画像に変換する
- 閲覧用URLとQRコードと4桁PINを発行する
- 閲覧者はURLまたはQRコードから開き、PINを入力して資料を見る

目的は、総会や委員会で「印刷資料を配らずに、各自のスマホで同じ資料を見られるようにする」ことです。

## 公開URL

- 公開一覧: [https://ku-pta-private-viewer.vercel.app/](https://ku-pta-private-viewer.vercel.app/)
- 管理画面: [https://ku-pta-private-viewer.vercel.app/admin.html](https://ku-pta-private-viewer.vercel.app/admin.html)

管理者パスワードは、コード内ではなく `Vercel` の環境変数 `ADMIN_PASSWORD` で管理します。

## 管理者の使い方

1. 管理画面にログインする
2. PDFを選ぶ
3. タイトル、説明、公開開始、公開終了を設定する
4. 登録する
5. 発行された `URL` `QRコード` `PIN` を保護者へ案内する

登録中は、変換やアップロードの途中でもキャンセルできます。

## 閲覧者の使い方

1. QRコードまたはURLから資料を開く
2. PINコードを入力する
3. 画像ビューアで資料を読む

閲覧画面では、左右フリックまたは `前へ` `次へ` ボタンで移動できます。

## 現在の主な機能

- 公開資料一覧表示
- PIN付き閲覧
- スマホ向けページ送り
- PDFから `WebP` 画像への変換
- URL発行
- QRコード発行
- 4桁PIN発行
- 登録中キャンセル
- 登録済み資料の非公開化
- 登録済み資料の再公開
- PIN再発行
- 資料削除

## データの持ち方

- 本番環境では `Vercel Blob` を使う
- ローカル確認では `D:\\PTA\\Codex\\data` を使う
- 資料1件ごとに状態ファイルとページ画像を保持する
- ページ画像は `documents/<docId>/pages/001.webp` のような形で保存する

## 公開制御

資料は次の条件で閲覧可否を判定します。

- 公開開始前なら未公開
- 公開終了後なら公開終了
- 管理者が非公開にしたら非公開
- PINが一致しない場合は閲覧不可

閲覧セッションには期限があります。

## セキュリティ上の考え方

この仕組みは「完全な秘匿」ではなく、「一般公開よりは絞る」ための実務向け運用です。

- URLを知っている人はアクセスを試せる
- ただし PIN が必要
- 公開期間でも絞れる
- ログイン必須の重い仕組みは使わず、保護者が開きやすいことを優先している

そのため、機密文書そのものの厳格管理用途には向きませんが、PTA総会資料や案内資料には使いやすい構成です。

## 主要ファイル

- [index.html](</D:/PTA/Codex/index.html>): 公開一覧画面
- [main.js](</D:/PTA/Codex/main.js>): 公開一覧の取得と表示
- [viewer.html](</D:/PTA/Codex/viewer.html>): 閲覧画面
- [viewer.js](</D:/PTA/Codex/viewer.js>): PIN認証後の表示制御
- [admin.html](</D:/PTA/Codex/admin.html>): 管理画面
- [admin.mjs](</D:/PTA/Codex/admin.mjs>): PDF登録、変換、アップロード、各種管理操作
- [styles.css](</D:/PTA/Codex/styles.css>): 画面共通スタイル
- [lib/documents-store.cjs](</D:/PTA/Codex/lib/documents-store.cjs>): 資料状態と保存処理
- [lib/storage.cjs](</D:/PTA/Codex/lib/storage.cjs>): ローカル保存とBlob保存の切り替え

## 補足

- ページ画像は現在 `WebP` で保存している
- PDFそのものを配るのではなく、ページ画像化して見せる設計
- そのため、スマホでの見やすさを優先しやすい

## 今後の候補

- 資料の並び順変更
- 登録済み資料の編集
- PDFアップロード後のタイトル自動整形
- 会ごとのカテゴリ分け
- 閲覧回数やアクセス時刻の記録
