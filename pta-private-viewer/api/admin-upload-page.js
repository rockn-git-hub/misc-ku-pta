const documentsStoreModule = require("../lib/documents-store.cjs");
const authModule = require("../lib/auth.cjs");
const httpUtilsModule = require("../lib/http-utils.cjs");
const { uploadDocumentPage } = documentsStoreModule.default || documentsStoreModule;
const {
  ADMIN_COOKIE_NAME,
  parseCookies,
  verifyAdminSessionToken
} = authModule.default || authModule;
const { handleBlobStoreUnavailable, readBufferBody, sendJson } = httpUtilsModule.default || httpUtilsModule;

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    sendJson(res, 405, { ok: false, message: "POST only" }, { Allow: "POST" });
    return;
  }

  const cookies = parseCookies(req.headers.cookie);
  const session = verifyAdminSessionToken(cookies[ADMIN_COOKIE_NAME]);
  if (!session.valid) {
    sendJson(res, 401, { ok: false, message: "管理者ログインが必要です。" });
    return;
  }

  const url = new URL(req.url, "http://localhost");
  const docId = url.searchParams.get("doc") || "";
  const pageNumber = Number.parseInt(url.searchParams.get("page") || "", 10);
  const contentType = req.headers["content-type"] || "image/webp";

  if (!docId) {
    sendJson(res, 400, { ok: false, message: "資料IDがありません。" });
    return;
  }
  if (!Number.isInteger(pageNumber) || pageNumber < 1) {
    sendJson(res, 400, { ok: false, message: "ページ番号が正しくありません。" });
    return;
  }

  const buffer = await readBufferBody(req);
  if (!buffer.length) {
    sendJson(res, 400, { ok: false, message: "画像データが空です。" });
    return;
  }

  try {
    await uploadDocumentPage(docId, pageNumber, buffer, contentType);
  } catch (error) {
    if (error.message === "document-not-found") {
      sendJson(res, 404, { ok: false, message: "資料が見つかりません。" });
      return;
    }
    if (error.message === "page-not-found") {
      sendJson(res, 404, { ok: false, message: "ページ設定が見つかりません。" });
      return;
    }
    if (handleBlobStoreUnavailable(res, error)) {
      return;
    }
    throw error;
  }

  sendJson(res, 200, { ok: true, pageNumber });
};
