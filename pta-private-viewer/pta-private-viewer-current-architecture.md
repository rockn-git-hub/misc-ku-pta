# PTA Private Viewer Current Architecture

更新日: 2026-04-13

## 目的

このファイルは、現在の `PTA Private Viewer` の構成と動作を、別スレッドで引き継ぐためのメモです。

主な用途は次のとおりです。

- PDF 資料を管理画面から登録する
- PDF をページごとの `WebP` 画像に変換する
- 閲覧用 URL、QR コード、PIN を発行する
- 閲覧者は PIN 認証後にスマホ向け画像ビューアで閲覧する

## 現在の構成

現在の構成は 4 層です。

1. 画面配信
- `Vercel`
- `public/` 配下の静的ファイルを配信する

2. アプリ API
- `Vercel Functions`
- 認証、資料メタデータ取得、signed URL 発行を担当する

3. メタデータ保存
- `AWS S3`
- 資料情報、公開状態、PIN ハッシュ、ページ一覧などの JSON を保存する

4. 画像配信
- `CloudFront`
- ページ画像 `WebP` を signed URL 付きで配信する

## 重要な前提

- 実際に本番で配信されている静的ファイルは、リポジトリ直下ではなく `public/` 配下である
- そのため、画面文言やフロント側の挙動を直すときは、まず `public/` 配下を優先して確認する
- リポジトリ直下の `index.html` `viewer.html` `admin.html` `main.js` `viewer.js` などは、古い複製が残っている可能性がある
- 現在の本番運用上の正本は `public/` 側と API / lib 側である

## 主なファイル

### 画面

- `D:\PTA\Codex\public\index.html`
- `D:\PTA\Codex\public\main.js`
- `D:\PTA\Codex\public\viewer.html`
- `D:\PTA\Codex\public\viewer.js`
- `D:\PTA\Codex\public\admin.html`
- `D:\PTA\Codex\public\admin.mjs`
- `D:\PTA\Codex\public\styles.css`

### API

- `D:\PTA\Codex\api\public-docs.js`
- `D:\PTA\Codex\api\session.js`
- `D:\PTA\Codex\api\document.js`
- `D:\PTA\Codex\api\page-url.js`
- `D:\PTA\Codex\api\logout.js`
- `D:\PTA\Codex\api\admin-session.js`
- `D:\PTA\Codex\api\admin-docs.js`
- `D:\PTA\Codex\api\admin-create-document.js`
- `D:\PTA\Codex\api\admin-upload-page.js`
- `D:\PTA\Codex\api\admin-finalize-document.js`
- `D:\PTA\Codex\api\admin-update-document.js`
- `D:\PTA\Codex\api\admin-delete-document.js`

### データ層

- `D:\PTA\Codex\lib\documents-store.cjs`
- `D:\PTA\Codex\lib\documents.cjs`
- `D:\PTA\Codex\lib\storage.cjs`
- `D:\PTA\Codex\lib\s3-cloudfront.cjs`
- `D:\PTA\Codex\lib\auth.cjs`
- `D:\PTA\Codex\lib\http-utils.cjs`

## AWS / CloudFront

### 現在の保存先

- S3 bucket: `kandai1-pta-docs`
- CloudFront domain: `d1l7odpizv91ci.cloudfront.net`

### S3 上の役割

- `tmp/`
  - JSON メタデータ
- `images/`
  - ページ画像 `WebP`
- `pdf/`
  - 将来の PDF 保存用

### CloudFront の役割

- `/images/*` は署名必須
- `/pdf/*` は署名必須
- `signed URL` を使って画像を直接配信する

## 環境変数

現在の実装で使う主な環境変数は次のとおりです。

- `S3_BUCKET_NAME`
- `CLOUDFRONT_DOMAIN`
- `CLOUDFRONT_KEY_PAIR_ID`
- `CLOUDFRONT_PRIVATE_KEY`
- `SIGNED_URL_EXPIRE_SECONDS`
- `AWS_REGION`
- `AWS_ACCESS_KEY_ID`
- `AWS_SECRET_ACCESS_KEY`
- `VIEWER_SECRET`
- `ADMIN_PASSWORD`

## 閲覧者の動作フロー

### 1. 一覧画面

1. 端末が `/` を開く
2. `public/index.html` `public/main.js` `public/styles.css` を取得する
3. `GET /api/public-docs`
4. 公開中の資料一覧 JSON を取得する

この一覧では画像は取らず、次の情報だけを使う。

- タイトル
- 説明
- 公開期間
- ページ数
- viewer URL

### 2. PIN 認証

1. 閲覧 URL `viewer.html?doc=...` を開く
2. `GET /api/document?doc=...`
3. 未認証なら `401` になる
4. PIN 入力後に `POST /api/session`
5. 成功すると閲覧セッション Cookie が発行される

### 3. 資料表示

1. 再度 `GET /api/document?doc=...`
2. 資料タイトル、公開終了、セッション期限、ページ一覧を取得する
3. 各ページには画像本体ではなく `imageUrlEndpoint` が入る
4. 表示したいページごとに `GET /api/page-url?doc=...&page=n`
5. API が CloudFront signed URL を返す
6. ブラウザがその signed URL に直接アクセスして画像を表示する

## 管理者の動作フロー

### 1. 管理画面

1. `/admin.html` を開く
2. `public/admin.html` `public/admin.mjs` `public/styles.css` を取得する
3. `POST /api/admin-session` で管理者ログインする

### 2. PDF 登録

1. PDF を選択する
2. `admin.mjs` がブラウザ内で PDF.js を使って PDF を開く
3. 各ページを `canvas` に描画する
4. `canvas.toBlob(..., "image/webp")` でページ画像 `WebP` を作る

### 3. 登録 API

1. `POST /api/admin-create-document`
2. `docId` と `PIN` を受け取る
3. 各ページを `POST /api/admin-upload-page?doc=...&page=n`
4. 最後に `POST /api/admin-finalize-document`
5. URL と QR 用情報を返す

### 4. 状態変更

管理画面から次ができる。

- `public / private` 切替
- PIN 再発行
- 削除

## 負荷軽減の考え方

現在の負荷軽減ポイントは次のとおりです。

### 1. 重い画像本体を Vercel から返していない

- `api/page-url.js` は短い JSON を返すだけ
- 実際の `WebP` は CloudFront が直接返す
- これが最大の軽量化ポイント

### 2. PDF 変換をブラウザで行っている

- サーバーで PDF を画像化しない
- 登録時の重い処理を管理者端末に寄せている

### 3. ページごとに signed URL を発行している

- 最初に全ページ分を発行しない
- 実際に開くページだけ URL を作る

### 4. ブラウザ側でページ URL を短時間キャッシュしている

- `public/viewer.js` の `pageUrlCache` を利用している
- 同じページへ戻るときは API 呼び出しを減らせる

### 5. 一覧画面は画像を持たない

- 一覧取得は軽い JSON のみ
- サムネイル一覧にしていない

## 現在の資料サンプル

現在、次の資料が本番に登録済み。

- 資料 ID: `doc-20260412225033-500aaa4e`
- タイトル: `2025年度 第1回PTA総会資料`
- PIN: `9407`

この資料は動作確認用も兼ねている。

## 既知の注意点

### 1. 文字化け履歴がある

- 一部ファイルは過去に Shift-JIS / UTF-8 混在のような壊れ方をした
- 特に `public/` 側が古い文字化け版のまま残っていたことがある
- 画面の日本語が壊れていたら、まず `public/` 側を確認する

### 2. ルート直下と public 配下に重複ファイルがある

- `index.html`
- `viewer.html`
- `admin.html`
- `main.js`
- `viewer.js`

これらはリポジトリ直下と `public/` の両方にある

本番挙動の確認・修正では `public/` を優先すること

### 3. 管理画面の JS にはまだ文字化け文言が残っている可能性がある

- `public/admin.mjs` は未整理の文言が残っている可能性がある
- ただし主要機能自体は動作している

### 4. Blob 時代の後方互換コードがまだ残っている

- `lib/storage.cjs` に Blob / local のフォールバックが残っている
- 現在の本番は `S3_BUCKET_NAME` があるので S3 を使う

## 最近修正したこと

- CloudFront signed URL 対応を実装
- `manualVisibility` の `private/public` 切替が S3 上の state JSON に正しく効くよう修正
- 閲覧画面で signed URL が失効または失敗したとき、1回だけ再取得する保険を追加
- 本番資料タイトルの文字化けを S3 メタデータ上で修正

## 別スレッドで見るべきポイント

別スレッドで作業を再開する場合は、まず次を確認すると早い。

1. `public/` 側の HTML / JS が本番で使われていること
2. `api/page-url.js` が CloudFront signed URL を返すこと
3. `lib/s3-cloudfront.cjs` の S3 キー変換と signed URL 発行
4. `lib/documents-store.cjs` の metadata / state / index の扱い
5. 文字化けが見えたら、画面文言ファイルと S3 上の metadata のどちらが壊れているか切り分けること

## 補足

別スレッドへ引き継ぐだけなら、このファイルを読ませれば十分です。

「フォークしたほうが早いか」という点では、コード作業そのものはフォークしなくても進められます。
ただし、会話の混線を避けたいなら、別スレッドでこのファイルを最初に読み込ませるやり方はかなり有効です。
