# PTA Private Viewer

このディレクトリには、PTA 資料を PIN 認証つきで閲覧するための Vercel 向けツール一式を置いています。

## 役割

- `public/`
  - 本番で配信している画面ファイルです
- `api/`
  - Vercel Functions です
- `lib/`
  - 資料メタデータ、認証、S3 / CloudFront 連携の共通処理です
- `vendor/`
  - PDF.js の配布ファイルです
- `scripts/`
  - 補助スクリプトです

## 重要な前提

- 実行環境は GitHub Pages ではなく Vercel です
- 画面修正時は `public/` 側を優先して見てください
- リポジトリ直下の `index.html` `viewer.html` `admin.html` などは、互換のために残っている複製を含みます

## 本番 URL

- [https://ku-pta-private-viewer.vercel.app/](https://ku-pta-private-viewer.vercel.app/)

## ローカル実行

```powershell
cd C:\Codex\Git\Private\misc-ku-pta\pta-private-viewer
npm.cmd install
npm.cmd run dev
```

## 主なファイル

- `pta-private-viewer-current-architecture.md`
  - 現在構成の引き継ぎメモです
- `pta-private-viewer-system.md`
  - システム概要メモです
- `server.cjs`
  - ローカル開発用の簡易サーバーです
- `vercel.json`
  - Vercel 設定です

## 含めていないもの

- `.vercel/`
- `.vercel-global/`
- `.vercel-env.production`
- `node_modules/`
- `data/`

環境依存のファイルや秘密情報、ローカルの一時データはこの repo には入れていません。
