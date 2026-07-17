# AWS S3 + CloudFront signed URL 実装メモ

## 目的

- PTA資料のページ画像を `AWS S3` に保存する
- 閲覧時は `CloudFront signed URL` で画像を配信する
- 既存の `PIN認証` と `公開期間` の考え方は維持する

## 今回の実装方針

- 画像URLは `api/page-url.js` で 1 ページずつ signed URL を発行する
- signed URL の有効期限は `SIGNED_URL_EXPIRE_SECONDS` を使う
- 既定値は `600` 秒
- `S3_BUCKET_NAME` が設定されている場合は、既存の `storage.cjs` が `S3` を優先して使う
- `CloudFront` の署名設定がない場合は、既存の `/api/page` にフォールバックする

## S3 のキー配置

- JSON メタデータ: `tmp/documents/...`
- 画像: `images/documents/...`
- PDF: `pdf/...`

アプリ内部では従来どおり `documents/...` の論理パスを使い、`storage.cjs` 側で S3 の実キーへ変換する。

## 必要な環境変数

### アプリ固有

- `S3_BUCKET_NAME`
- `CLOUDFRONT_DOMAIN`
- `CLOUDFRONT_KEY_PAIR_ID`
- `CLOUDFRONT_PRIVATE_KEY`
- `SIGNED_URL_EXPIRE_SECONDS`

### AWS SDK 標準

- `AWS_REGION`
- `AWS_ACCESS_KEY_ID`
- `AWS_SECRET_ACCESS_KEY`
- 必要なら `AWS_SESSION_TOKEN`

## 環境変数の値

- `S3_BUCKET_NAME`
  - `kandai1-pta-docs`
- `CLOUDFRONT_DOMAIN`
  - `d1l7odpizv91ci.cloudfront.net`
- `CLOUDFRONT_KEY_PAIR_ID`
  - `K3UZX1XDYULW7X`
- `SIGNED_URL_EXPIRE_SECONDS`
  - まずは `600`

`CLOUDFRONT_PRIVATE_KEY` は複数行の秘密鍵をそのまま入れるか、`\n` を含む 1 行文字列として入れる。
実装側で `\n` は改行に戻す。

## ローカル確認手順

1. PowerShell で `D:\PTA\Codex` に移動する
2. 必要な環境変数を設定する
3. `npm.cmd run check` を実行する
4. `npm.cmd run dev` を実行する
5. 管理画面で PDF を登録する
6. 閲覧画面で PIN を入れる
7. 開発者ツールの Network で `api/page-url` が `200` を返し、応答に signed URL が含まれることを確認する
8. 返された画像 URL が `CloudFront-Signature` などを含み、実際に画像表示できることを確認する

## Vercel 反映時の注意

- `CLOUDFRONT_PRIVATE_KEY` を Git に保存しない
- Vercel の Environment Variables にのみ設定する
- `S3_BUCKET_NAME` を設定すると、保存先は `S3` 優先になる
- 既存の `BLOB_READ_WRITE_TOKEN` は残っていてもよいが、`S3_BUCKET_NAME` があると S3 を優先する
- 既存の Blob 上のメタデータは自動移行しない

## 残課題

- Blob 上にある既存資料の移行
- PDF 本体を `pdf/` 配下に保存する処理
- signed cookie 方式への切り替え
- 既存の文字化けコメントや文言の整理
