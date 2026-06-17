const QRCode = require("qrcode");
const documentsModule = require("../lib/documents.cjs");
const documentsStoreModule = require("../lib/documents-store.cjs");
const authModule = require("../lib/auth.cjs");
const httpUtilsModule = require("../lib/http-utils.cjs");
const { buildViewerPath } = documentsModule.default || documentsModule;
const { updateDocumentVisibility, reissueDocumentPin, backfillDocumentPublicPageUrls } = documentsStoreModule.default || documentsStoreModule;
const {
  ADMIN_COOKIE_NAME,
  parseCookies,
  verifyAdminSessionToken
} = authModule.default || authModule;
const { buildAbsoluteUrl, handleBlobStoreUnavailable, readJsonBody, sendJson } = httpUtilsModule.default || httpUtilsModule;

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

  let body;
  try {
    body = await readJsonBody(req);
  } catch {
    sendJson(res, 400, { ok: false, message: "JSON の形式が正しくありません。" });
    return;
  }

  const docId = typeof body.docId === "string" ? body.docId.trim() : "";
  const action = typeof body.action === "string" ? body.action.trim() : "";

  if (!docId) {
    sendJson(res, 400, { ok: false, message: "資料IDがありません。" });
    return;
  }

  try {
    if (action === "set-visibility") {
      const manualVisibility = body.manualVisibility === "private" ? "private" : "public";
      const document = await updateDocumentVisibility(docId, manualVisibility);
      sendJson(res, 200, {
        ok: true,
        document: {
          ...document,
          viewerUrl: buildViewerPath(docId)
        }
      });
      return;
    }

    if (action === "reissue-pin") {
      const payload = await reissueDocumentPin(docId);
      const viewerPath = buildViewerPath(docId);
      const viewerUrl = buildAbsoluteUrl(req, viewerPath);
      const qrDataUrl = await QRCode.toDataURL(viewerUrl, {
        errorCorrectionLevel: "M",
        margin: 1,
        scale: 8
      });

      sendJson(res, 200, {
        ok: true,
        pin: payload.pin,
        document: {
          ...payload.document,
          viewerPath,
          viewerUrl,
          qrDataUrl
        }
      });
      return;
    }

    if (action === "backfill-public-pages") {
      const payload = await backfillDocumentPublicPageUrls(docId);
      sendJson(res, 200, {
        ok: true,
        updatedPages: payload.updatedPages,
        document: {
          ...payload.document,
          viewerUrl: buildViewerPath(docId)
        }
      });
      return;
    }

    sendJson(res, 400, { ok: false, message: "未対応の操作です。" });
  } catch (error) {
    if (error.message === "document-not-found") {
      sendJson(res, 404, { ok: false, message: "資料が見つかりません。" });
      return;
    }
    if (error.message.startsWith("missing-page:")) {
      sendJson(res, 400, { ok: false, message: `${error.message.split(":")[1]}ページ目の画像が見つかりません。` });
      return;
    }
    if (handleBlobStoreUnavailable(res, error)) {
      return;
    }
    sendJson(res, 500, { ok: false, message: error.message || "内部エラーが発生しました。" });
  }
};
