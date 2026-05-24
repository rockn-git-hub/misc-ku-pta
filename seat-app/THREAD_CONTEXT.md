# seat-app 現状メモ（新スレッド用）

## 1. どこを見ればよいか

- 実装本体: `seat-app/`
- ユーザー向け操作説明: [USER_GUIDE.md](C:/Codex/Git/Private/misc-ku-pta/seat-app/USER_GUIDE.md)
- 参加者インポート仕様: [CSV_IMPORT_FORMAT.md](C:/Codex/Git/Private/misc-ku-pta/seat-app/CSV_IMPORT_FORMAT.md)

## 2. 公開先

- メイン認識の公開 URL: `https://seat-app-six.vercel.app/`
- 参考（GitHub Pages 側）: `https://rockn-git-hub.github.io/misc-ku-pta/seat-app/`

補足:
- `seat-app-six.vercel.app` は Vercel 応答を返している（`Server: Vercel`）。
- GitHub Pages 側 URL も 200 応答。

## 3. リポジトリ状態

- Repository: `rockn-git-hub/misc-ku-pta`
- Branch: `main`
- 最新 push 済みコミット: `4f950b7`（`seat-app の表示とガイドを更新`）

## 4. seat-app の主要設定（コード上）

- Build: `npm run build` (`tsc -b && vite build`)
- Framework: Vite + React
- Vite base: `./`（サブパス配信対応）
  - 参照: [vite.config.ts](C:/Codex/Git/Private/misc-ku-pta/seat-app/vite.config.ts)

## 5. 直近で入った変更

- ツールバーの見出し文字（`用紙` / `追加` / `操作` / `データ`）のコントラスト改善
  - 対象: [Toolbar.tsx](C:/Codex/Git/Private/misc-ku-pta/seat-app/src/components/Toolbar.tsx)
- ユーザー向けドキュメント追加
  - [USER_GUIDE.md](C:/Codex/Git/Private/misc-ku-pta/seat-app/USER_GUIDE.md)
  - [CSV_IMPORT_FORMAT.md](C:/Codex/Git/Private/misc-ku-pta/seat-app/CSV_IMPORT_FORMAT.md)

## 6. デプロイ系の構成

- GitHub Actions workflow あり（Pages 向け）
  - [deploy-pages.yml](C:/Codex/Git/Private/misc-ku-pta/.github/workflows/deploy-pages.yml)
  - `seat-app` をビルドして `_site/seat-app` に配置する構成
- Vercel 設定ファイル（`vercel.json`）は repo には置いていない
  - Vercel 側の Project 設定で管理されている想定

## 7. 注意点（作業開始前に見る）

- `class-ninzuu-count/index.html` に未コミットのローカル変更がある
  - seat-app 作業とは別件扱いにすること
  - seat-app の commit/push 時に巻き込まないこと

## 8. 次スレで最初に確認すると速い項目

1. Vercel の対象 Project が引き続き `seat-app-six.vercel.app` か
2. Root Directory が `seat-app` になっているか
3. 最新 commit (`4f950b7` 以降) が Vercel に反映済みか
