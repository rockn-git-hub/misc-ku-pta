# Load Test Viewer

## 目的

このメモは、`PTA Private Viewer` が総会当日にどの程度の同時アクセスに耐えられるかを確認するための手順です。

今回は、特に次を見ます。

- `api/session`
- `api/document`
- `api/page`
- `api/page` の再検証時に `304` が返るか

## 前提

- 本番URL: `https://ku-pta-private-viewer.vercel.app`
- 公開中の資料 `docId`
- その資料の `PIN`

## 実行コマンド

```powershell
cd D:\PTA\Codex
node .\scripts\load-test-viewer.mjs --baseUrl=https://ku-pta-private-viewer.vercel.app --docId=資料ID --pin=4桁PIN --users=300 --rounds=1
```

## 見るポイント

- `login`
  - PIN入力からセッション開始までの速度
- `manifest`
  - 資料情報取得の速度
- `page`
  - 1ページ目画像の初回取得速度
- `page revalidate`
  - `If-None-Match` を付けた再取得速度
- `status counts`
  - `200` と `304` が中心で、`429` `500` `503` が出ていないか

## 合格の目安

総会用途なら、まずは次を目安にします。

- `429` が出ない
- `5xx` が出ない
- `page` の `p95` が `1000ms` 前後まで
- `page revalidate` の `p95` が初回取得より明確に速い

## 今回の改善点

`api/page` では、以下を有効にしています。

- `ETag` を返す
- `Cache-Control: private, no-cache` を返す
- `If-None-Match` が一致した場合は `304 Not Modified` を返す

これにより、同じページの再表示時に毎回画像本体を送り直さずに済むようにしています。

## 注意

- このスクリプトは「実際の保護者の全スマホ環境」を完全再現するものではありません。
- ただし、`Vercel Functions` と `Vercel Blob` に対して、同時アクセス時の大まかな傾向を見るには十分です。
- 本番前には、`users=50`、`users=100`、`users=300` の順で段階的に試すのが安全です。
