const documentsModule = require("../lib/documents.cjs");
const documentsStoreModule = require("../lib/documents-store.cjs");
const storageModule = require("../lib/storage.cjs");
const authModule = require("../lib/auth.cjs");
const httpUtilsModule = require("../lib/http-utils.cjs");
const { getAvailability } = documentsModule.default || documentsModule;
const { getReadyDocumentById } = documentsStoreModule.default || documentsStoreModule;
const storage = storageModule.default || storageModule;
const {
  VIEWER_COOKIE_NAME,
  parseCookies,
  verifyViewerSessionToken,
  buildExpiredCookie
} = authModule.default || authModule;
const { handleBlobStoreUnavailable, sendJson } = httpUtilsModule.default || httpUtilsModule;

module.exports = async function handler(req, res) {
  if (req.method !== "GET") {
    sendJson(res, 405, { ok: false, message: "GET only" }, { Allow: "GET" });
    return;
  }

  try {
    const url = new URL(req.url, "http://localhost");
    const docId = url.searchParams.get("doc") || "";
    const pageNumber = Number.parseInt(url.searchParams.get("page") || "", 10);
    const doc = await getReadyDocumentById(docId);

    if (!doc) {
      sendJson(res, 404, { ok: false, message: "資料が見つかりません。" });
      return;
    }
    if (!Number.isInteger(pageNumber) || pageNumber < 1) {
      sendJson(res, 400, { ok: false, message: "ページ番号が正しくありません。" });
      return;
    }

    const cookies = parseCookies(req.headers.cookie);
    const session = verifyViewerSessionToken(cookies[VIEWER_COOKIE_NAME]);
    if (!session.valid || session.docId !== doc.id) {
      sendJson(res, 401, { ok: false, message: "PINコードの入力が必要です。" });
      return;
    }

    const availability = getAvailability(doc);
    if (availability.status !== "live") {
      sendJson(
        res,
        403,
        { ok: false, message: `この資料は現在「${availability.label}」です。` },
        { "Set-Cookie": buildExpiredCookie(VIEWER_COOKIE_NAME) }
      );
      return;
    }

    const page = doc.pages.find((item) => item.pageNumber === pageNumber);
    if (!page) {
      sendJson(res, 404, { ok: false, message: "ページ画像が見つかりません。" });
      return;
    }

    const signed = storage.createSignedUrl(page.pathname);
    if (signed) {
      sendJson(res, 200, {
        ok: true,
        imageUrl: signed.url,
        expiresAt: signed.expiresAt
      });
      return;
    }

    sendJson(res, 200, {
      ok: true,
      imageUrl: page.publicUrl || `/api/page?doc=${encodeURIComponent(doc.id)}&page=${page.pageNumber}`,
      expiresAt: null
    });
  } catch (error) {
    if (handleBlobStoreUnavailable(res, error)) {
      return;
    }
    throw error;
  }
};
